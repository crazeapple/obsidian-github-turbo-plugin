/**
 * GitHub 访问加速核心（P-001 引擎 + P-002 镜像目录/被动健康观测/自动切换）。
 *
 * 机制（spike 实证）：Obsidian 桌面端内置市场的全部 GitHub 请求经
 * `ipcRenderer.send('request-url', id, { url, ... })` 过桥且 URL 明文，
 * 响应经同名请求 ID 频道回达且载荷含 `status`；renderer 侧改写请求参数
 * 并观测响应即可实现镜像加速与健康记账。
 */

/** 镜像目录条目：替换方式以 `type` 判别，预留未来非前缀型替换（如域名映射）。 */
export interface MirrorCandidate {
	/** 替换方式：`prefix` = 镜像前缀拼接（当前唯一实现）。 */
	type: 'prefix';
	/** 镜像前缀，如 `https://gh-proxy.com/`。 */
	base: string;
	/** 显示名。 */
	label: string;
}

/**
 * 内置镜像目录：有序（最优在前），顺序即偏好与回退顺序；
 * 录入与排序随插件版本发布更新（spec P-002 范围内）。
 */
export const MIRROR_CATALOG: MirrorCandidate[] = [
	{ type: 'prefix', base: 'https://gh-proxy.com/', label: 'gh-proxy.com' },
	{ type: 'prefix', base: 'https://ghproxy.net/', label: 'ghproxy.net' },
	{ type: 'prefix', base: 'https://ghfast.top/', label: 'ghfast.top' },
	{
		type: 'prefix',
		base: 'https://github.moeyy.xyz/',
		label: 'github.moeyy.xyz',
	},
];

/** 镜像池状态快照条目（设置页只读展示用）。 */
export interface MirrorStatus {
	/** 显示名。 */
	label: string;
	/** 是否为当前 active 镜像。 */
	active: boolean;
	/** 是否处于本会话拉黑状态。 */
	blacklisted: boolean;
}

/** 改写引擎读取的配置。 */
export interface AcceleratorConfig {
	/** 总开关：关闭后全部请求直连。 */
	enabled: boolean;
}

export const DEFAULT_ACCELERATOR_CONFIG: AcceleratorConfig = {
	enabled: true,
};

/** 仅命中这两个前缀的 URL 会被改写（spec 范围内，其余域名一律不触碰）。 */
const GITHUB_PREFIXES = [
	'https://github.com/',
	'https://raw.githubusercontent.com/',
];

/** 内置市场请求过桥频道（spike 实证）。 */
const REQUEST_URL_CHANNEL = 'request-url';

/** 会话拉黑阈值：同一镜像连续失败达到该次数后，本会话不再使用。 */
const BLACKLIST_THRESHOLD = 3;

/** 拉黑冷却时长：期满自动解除并清零连败，重新进入轮转。 */
const BLACKLIST_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * 观测窗口：超时兜底自摘监听并记一次失败；取宽超时以覆盖
 * release 大文件下载（spec：大文件设宽超时）。
 */
const OBSERVE_TIMEOUT_MS = 120_000;

/**
 * 判定响应状态是否为镜像故障（404 按路径语义二分）：
 * - `/releases/download/` 路径 404 = 镜像覆盖缺失（版本号源自市场数据，上游应存在）→ 计失败；
 * - 其余路径 404 = 上游真值（如插件下架）→ 不计失败；
 * - 403/429（限流）与 5xx 计失败；2xx/3xx 计成功。
 */
export function isMirrorFailure(status: number, url: string): boolean {
	if (status === 404) {
		return url.includes('/releases/download/');
	}
	return status === 403 || status === 429 || status >= 500;
}

/**
 * 回复记账判定（T-008 实测补充）：返回 true/false 为成败；
 * 返回 undefined = 结构无从判定，静默跳过。
 * - 含 `error` 字段（网络层失败：DNS 解析失败/连接拒绝/超时等，
 *   实测载荷为 `{"error":{}}` 形态）→ 计失败；
 * - 含数字 `status` → 交 `isMirrorFailure` 按 HTTP 语义判定。
 */
export function judgeReply(
	response: unknown,
	url: string,
): boolean | undefined {
	if (!response || typeof response !== 'object') {
		return undefined;
	}
	const slot = response as { status?: unknown; error?: unknown };
	if ('error' in slot) {
		return true;
	}
	if (typeof slot.status !== 'number') {
		return undefined;
	}
	return isMirrorFailure(slot.status, url);
}

/** 规范化镜像前缀：确保以单个 `/` 结尾；空串原样返回表示不加速。 */
function normalizeMirrorBase(mirrorBase: string): string {
	if (!mirrorBase) {
		return '';
	}
	return mirrorBase.endsWith('/') ? mirrorBase : `${mirrorBase}/`;
}

/** `prefix` 型改写：非 GitHub 前缀原样返回；已带镜像前缀原样返回（幂等）。 */
function rewriteByPrefix(url: string, base: string): string {
	const normalized = normalizeMirrorBase(base);
	if (!normalized) {
		return url;
	}
	if (!GITHUB_PREFIXES.some((prefix) => url.startsWith(prefix))) {
		return url;
	}
	if (url.startsWith(normalized)) {
		return url;
	}
	return normalized + url;
}

/**
 * 纯改写函数：按候选的替换方式分发（当前仅 `prefix`；
 * 未知 `type` 一律不改写，未来 `host-map` 等以新 `type` 接入）。
 */
export function rewriteUrl(url: string, candidate: MirrorCandidate): string {
	switch (candidate.type) {
		case 'prefix':
			return rewriteByPrefix(url, candidate.base);
		default:
			return url;
	}
}

/** 对参数列表就地改写：遍历对象形态的参数，命中其字符串 `url` 字段。 */
function rewriteArgsInPlace(args: unknown[], candidate: MirrorCandidate): void {
	for (const arg of args) {
		if (arg && typeof arg === 'object') {
			const slot = arg as { url?: unknown };
			if (typeof slot.url === 'string') {
				slot.url = rewriteUrl(slot.url, candidate);
			}
		}
	}
}

/** 提取参数中对象形态的原始 `url`（须在改写前调用，供 404 路径判定）。 */
function extractUrl(args: unknown[]): string | undefined {
	for (const arg of args) {
		if (arg && typeof arg === 'object') {
			const slot = arg as { url?: unknown };
			if (typeof slot.url === 'string') {
				return slot.url;
			}
		}
	}
	return undefined;
}

/**
 * 镜像游标与健康记账（会话内存状态）：失败推进游标、
 * 同一候选累计 3 败本会话拉黑（带 30 分钟冷却自动解除）、
 * 成功稳定 active 并清零计数。
 * 状态按候选身份（`base`）键控：目录重排/增删不会张冠李戴，
 * 为用户排序持久化与自定义候选等扩展预留正确语义。
 */
export class MirrorCursor {
	private activeBase: string;
	private streaks = new Map<string, number>();
	private blacklist = new Map<string, number>();

	constructor(
		private catalog: readonly MirrorCandidate[],
		private now: () => number = () => Date.now(),
	) {
		this.activeBase = this.catalog[0]?.base ?? '';
	}

	/** 候选身份键：`prefix` 型以 base 为天然稳定键（未来其他替换方式在此外扩展）。 */
	private key(candidate: MirrorCandidate): string {
		return candidate.base;
	}

	/** 当前 active 候选（按身份回查目录，异常时回退目录首项）。 */
	active(): MirrorCandidate | undefined {
		return (
			this.catalog.find((c) => c.base === this.activeBase) ??
			this.catalog[0]
		);
	}

	/**
	 * 查询候选是否处于拉黑状态：冷却期满（30 分钟）自动解除
	 * 并清零连败——给镜像完整的重新预算，重新进入轮转。
	 */
	isBlacklisted(candidate: MirrorCandidate): boolean {
		const at = this.blacklist.get(this.key(candidate));
		if (at === undefined) {
			return false;
		}
		if (this.now() - at >= BLACKLIST_COOLDOWN_MS) {
			this.blacklist.delete(this.key(candidate));
			this.streaks.delete(this.key(candidate));
			return false;
		}
		return true;
	}

	/** 记一次请求结果（candidate 为发送时的候选）。 */
	record(candidate: MirrorCandidate, failed: boolean): void {
		// 拉黑冷却期内的迟回复不计成败、不推游标（该候选本会话已停用）。
		if (this.isBlacklisted(candidate)) {
			return;
		}
		const key = this.key(candidate);
		if (!failed) {
			this.streaks.delete(key);
			this.activeBase = key;
			return;
		}
		const next = (this.streaks.get(key) ?? 0) + 1;
		this.streaks.set(key, next);
		if (next >= BLACKLIST_THRESHOLD) {
			this.blacklist.set(key, this.now());
		}
		this.advance(candidate);
	}

	/** 会话复位（onload / 设置页重置调用）：游标回目录首项，清空连败与拉黑。 */
	reset(): void {
		this.activeBase = this.catalog[0]?.base ?? '';
		this.streaks.clear();
		this.blacklist.clear();
	}

	/** 失败后推进：跳过拉黑（含冷却中）项；全部拉黑时停留原地（失败如实呈现）。 */
	private advance(from: MirrorCandidate): void {
		const length = this.catalog.length;
		const fromIndex = this.catalog.indexOf(from);
		for (let step = 1; step <= length; step++) {
			const candidate = this.catalog[(fromIndex + step) % length];
			if (candidate && !this.isBlacklisted(candidate)) {
				this.activeBase = this.key(candidate);
				return;
			}
		}
	}
}

/** renderer 侧 electron ipcRenderer 的最小结构类型。 */
interface IpcLike {
	send: (channel: string, ...args: unknown[]) => void;
	/** 回复观测所需；缺失时仅改写、静默降级。 */
	on?: (channel: string, listener: (...args: unknown[]) => void) => unknown;
	removeListener?: (
		channel: string,
		listener: (...args: unknown[]) => void,
	) => unknown;
}

/**
 * 探测当前环境可否挂载：桌面端 renderer 暴露 Node require 与 electron
 * ipcRenderer；移动端或未来版本结构变化时返回 null（静默不挂载）。
 */
function requireIpcRenderer(): IpcLike | null {
	try {
		const nodeRequire = (window as unknown as {
			require?: (id: string) => unknown;
		}).require;
		if (typeof nodeRequire !== 'function') {
			return null;
		}
		const electron = nodeRequire('electron') as { ipcRenderer?: IpcLike };
		const ipc = electron?.ipcRenderer;
		if (!ipc || typeof ipc.send !== 'function') {
			return null;
		}
		return ipc;
	} catch {
		return null;
	}
}

/**
 * `request-url` 频道改写与健康观测器：install() 挂载、restore() 还原；
 * 重复 install 幂等；探测失败时静默跳过，不抛错、不破坏原生功能。
 */
export class RequestUrlAccelerator {
	private ipc: IpcLike | null = null;
	private originalSend: IpcLike['send'] | null = null;
	private cursor = new MirrorCursor(MIRROR_CATALOG);

	get mounted(): boolean {
		return this.originalSend !== null;
	}

	/** 镜像池状态快照（设置页只读展示用）。 */
	getStatus(): MirrorStatus[] {
		const active = this.cursor.active();
		return MIRROR_CATALOG.map((candidate) => ({
			label: candidate.label,
			active: candidate.base === active?.base,
			blacklisted: this.cursor.isBlacklisted(candidate),
		}));
	}

	/** 复位镜像切换状态：游标回首项、清空连败与拉黑（设置页按钮调用）。 */
	resetCursor(): void {
		this.cursor.reset();
	}

	/** 挂载改写与观测。返回是否挂载成功；false 为环境不满足（静默跳过）。 */
	install(getConfig: () => AcceleratorConfig): boolean {
		if (this.mounted) {
			return true;
		}
		const ipc = requireIpcRenderer();
		if (!ipc) {
			return false;
		}
		// onload 重建游标与拉黑：曾拉黑镜像重新获得机会（spec AC7）。
		this.cursor.reset();
		const original = ipc.send;
		ipc.send = (channel: string, ...args: unknown[]) => {
			if (channel === REQUEST_URL_CHANNEL) {
				const config = getConfig();
				if (config.enabled) {
					const candidate = this.cursor.active();
					if (candidate) {
						const url = extractUrl(args);
						rewriteArgsInPlace(args, candidate);
						if (candidate.type === 'prefix' && url) {
							const requestId = args[0];
							if (typeof requestId === 'string') {
								this.observe(ipc, candidate, requestId, url);
							}
						}
					}
				}
			}
			original.apply(ipc, [channel, ...args]);
		};
		this.ipc = ipc;
		this.originalSend = original;
		return true;
	}

	/** 还原原始 `send`；未挂载时为空操作。 */
	restore(): void {
		if (!this.mounted || !this.ipc || !this.originalSend) {
			return;
		}
		this.ipc.send = this.originalSend;
		this.originalSend = null;
		this.ipc = null;
	}

	/**
	 * 被动观测：在请求 ID 频道挂一次性监听，按响应 `status` 对该候选记账；
	 * 回复结构变化（无 `status`）静默跳过；超时兜底自摘并记一次失败。
	 */
	private observe(
		ipc: IpcLike,
		candidate: MirrorCandidate,
		requestId: string,
		url: string,
	): void {
		if (typeof ipc.on !== 'function' || typeof ipc.removeListener !== 'function') {
			return;
		}
		let done = false;
		const onReply = (...replyArgs: unknown[]) => {
			if (done) {
				return;
			}
			done = true;
			cleanup();
			const verdict = judgeReply(replyArgs[1], url);
			if (verdict !== undefined) {
				this.cursor.record(candidate, verdict);
			}
		};
		const cleanup = () => {
			window.clearTimeout(timer);
			ipc.removeListener?.(requestId, onReply);
		};
		const timer = window.setTimeout(() => {
			if (done) {
				return;
			}
			done = true;
			cleanup();
			this.cursor.record(candidate, true); // 观测超时：按失败记账
		}, OBSERVE_TIMEOUT_MS);
		ipc.on(requestId, onReply);
	}
}
