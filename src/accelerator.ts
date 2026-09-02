/**
 * GitHub 访问加速核心（P-001 / T-001）。
 *
 * 机制（spike V1-V4 实证，2026-09-02）：Obsidian 桌面端内置市场的全部 GitHub
 * 请求经 `ipcRenderer.send('request-url', id, { url, ... })` 过桥且 URL 明文；
 * 在 renderer 侧改写该参数即可令主进程实际访问镜像地址。
 */

/** 改写引擎读取的配置（T-002 的设置页提供编辑界面与持久化）。 */
export interface AcceleratorConfig {
	/** 总开关：关闭后全部请求直连。 */
	enabled: boolean;
	/** 镜像前缀，如 `https://gh-proxy.com/`；改写后 URL = 前缀 + 原地址。 */
	mirrorBase: string;
}

export const DEFAULT_ACCELERATOR_CONFIG: AcceleratorConfig = {
	enabled: true,
	mirrorBase: 'https://gh-proxy.com/',
};

/** 仅命中这两个前缀的 URL 会被改写（spec 范围内，其余域名一律不触碰）。 */
const GITHUB_PREFIXES = [
	'https://github.com/',
	'https://raw.githubusercontent.com/',
];

/** 内置市场请求过桥频道（spike 实证）。 */
const REQUEST_URL_CHANNEL = 'request-url';

/** 规范化镜像前缀：确保以单个 `/` 结尾；空串原样返回表示不加速。 */
export function normalizeMirrorBase(mirrorBase: string): string {
	if (!mirrorBase) {
		return '';
	}
	return mirrorBase.endsWith('/') ? mirrorBase : `${mirrorBase}/`;
}

/**
 * 纯改写函数：非 GitHub 前缀原样返回；已带镜像前缀的原样返回（幂等，
 * 防止重复挂载或镜像互套导致二次改写）；否则返回 `镜像前缀 + 原地址`。
 */
export function rewriteUrl(url: string, mirrorBase: string): string {
	const base = normalizeMirrorBase(mirrorBase);
	if (!base) {
		return url;
	}
	if (!GITHUB_PREFIXES.some((prefix) => url.startsWith(prefix))) {
		return url;
	}
	if (url.startsWith(base)) {
		return url;
	}
	return base + url;
}

/** 对参数列表就地改写：遍历对象形态的参数，命中其字符串 `url` 字段。 */
function rewriteArgsInPlace(args: unknown[], config: AcceleratorConfig): void {
	for (const arg of args) {
		if (arg && typeof arg === 'object') {
			const candidate = arg as { url?: unknown };
			if (typeof candidate.url === 'string') {
				candidate.url = rewriteUrl(candidate.url, config.mirrorBase);
			}
		}
	}
}

/** renderer 侧 electron ipcRenderer 的最小结构类型。 */
interface IpcLike {
	send: (channel: string, ...args: unknown[]) => void;
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
 * `request-url` 频道改写器：install() 挂载、restore() 还原；
 * 重复 install 幂等；探测失败时静默跳过，不抛错、不破坏原生功能。
 */
export class RequestUrlAccelerator {
	private ipc: IpcLike | null = null;
	private originalSend: IpcLike['send'] | null = null;

	get mounted(): boolean {
		return this.originalSend !== null;
	}

	/** 挂载改写。返回是否挂载成功；false 为环境不满足（静默跳过）。 */
	install(getConfig: () => AcceleratorConfig): boolean {
		if (this.mounted) {
			return true;
		}
		const ipc = requireIpcRenderer();
		if (!ipc) {
			return false;
		}
		const original = ipc.send;
		ipc.send = (channel: string, ...args: unknown[]) => {
			if (channel === REQUEST_URL_CHANNEL) {
				const config = getConfig();
				if (config.enabled) {
					rewriteArgsInPlace(args, config);
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
}
