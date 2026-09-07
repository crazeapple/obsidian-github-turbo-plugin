/**
 * GitHub 访问加速核心（P-001 引擎 + P-002 镜像目录/被动健康观测/自动切换
 * + P-003 纯用户池/统一映射/可达性验证）。
 *
 * 机制（spike 实证）：Obsidian 桌面端内置市场的全部 GitHub 请求经
 * `ipcRenderer.send('request-url', id, { url, ... })` 过桥且 URL 明文，
 * 响应经同名请求 ID 频道回达且载荷含 `status`；renderer 侧改写请求参数
 * 并观测响应即可实现镜像加速与健康记账。
 */

import { requestUrl } from 'obsidian';

/**
 * 可达性双探针（均取自 Obsidian 官方仓库 obsidianmd/obsidian-releases）：
 * github 探针走 github.com 域 raw 路径（302 重定向链与 release 下载同构，
 * 顺带验证镜像跟随重定向的能力）；raw 探针走 raw 域 README。
 * 按候选映射分别改写后并发请求——两条映射各自得到验证（单探针会漏检另一条）。
 */
const PROBE_GITHUB_URL =
  'https://github.com/obsidianmd/obsidian-releases/raw/HEAD/README.md';
const PROBE_GITHUB_MARKER = 'Obsidian';
const PROBE_RAW_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/README.md';
const PROBE_RAW_MARKER = 'Obsidian';

/** 映射对：原始地址前缀 → 镜像地址前缀。 */
export interface MappingPair {
  /** 被改写的原始地址前缀（含尾斜杠），如 `https://github.com/`。 */
  from: string;
  /** 改写后的地址前缀（含尾斜杠），如前缀型为 镜像前缀 + from。 */
  to: string;
}

/** 镜像条目：名字即唯一身份与显示名，加速行为由映射对列表描述。 */
export interface MirrorCandidate {
  /** 镜像名：唯一身份（同名即重复），如 `gh-proxy.com`。 */
  name: string;
  /** 映射对列表（有序，至少含 github 与 raw 两条）。 */
  mappings: MappingPair[];
}

/**
 * 默认种子池：首次使用（无 pool 键）时播种；有序（最优在前），顺序即回退顺序。
 * 种子集合为实现期实测筛选（2026-09-06 双探针实测，14 候选 → 4 可用，
 * 按耗时排序）；ghfast.top / github.moeyy.xyz 本轮失联淘汰，
 * 公共镜像波动剧烈，失效项由被动观测自动拉黑回退。
 */
export const DEFAULT_POOL: MirrorCandidate[] = [
  {
    name: 'gh-proxy.com',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://gh-proxy.com/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://gh-proxy.com/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'cors.isteed.cc',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://cors.isteed.cc/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://cors.isteed.cc/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'ghproxy.net',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://ghproxy.net/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://ghproxy.net/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'gh.ddlc.top',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://gh.ddlc.top/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://gh.ddlc.top/https://raw.githubusercontent.com/',
      },
    ],
  },
];

/** 可达性测试结果（设置页条目展示用）。 */
export interface MirrorTestResult {
  /** 是否可达。 */
  ok: boolean;
  /** 结果描述：逐映射分段「✓/✗ 名称 耗时/原因」拼接。 */
  detail: string;
}

/** 镜像池状态快照条目（设置页只读展示用）。 */
export interface MirrorStatus {
  /** 显示名（即镜像名）。 */
  label: string;
  /** 是否为当前 active 镜像。 */
  active: boolean;
  /** 是否处于本会话拉黑状态。 */
  blacklisted: boolean;
  /** 最近一次可达性测试结果。 */
  testResult?: string;
}

/** 改写引擎读取的配置。 */
export interface AcceleratorConfig {
  /** 总开关：关闭后全部请求直连。 */
  enabled: boolean;
  /** 用户镜像池（有序）：条目 = 名字 + 映射对列表，纯用户池模型。 */
  pool: MirrorCandidate[];
}

export const DEFAULT_ACCELERATOR_CONFIG: AcceleratorConfig = {
  enabled: true,
  pool: [],
};

/**
 * GitHub 已知域：加速范畴的基准集合——命中的请求应被映射覆盖，
 * 未覆盖则触发未覆盖告知（P-003 / T-012）。
 */
export const GITHUB_PREFIXES = [
  'https://github.com/',
  'https://raw.githubusercontent.com/',
];

/** 判定 url 是否属于 GitHub 已知域。 */
export function isKnownGithubUrl(url: string): boolean {
  return GITHUB_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** 提取 url 的 host（解析失败时返回原串）。 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

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

/** 规范化映射 to 前缀：确保以单个 `/` 结尾。 */
function normalizeTo(to: string): string {
  return to.endsWith('/') ? to : `${to}/`;
}

/**
 * 统一映射改写：url 已是任一映射的产物（以 to 开头）则原样返回（幂等）；
 * 命中某映射的 from 前缀 → to + 剩余路径；均未命中 → 原样直连。
 * 前缀拼接与域名替换两形态由映射对的写法自然承载，无需分派。
 */
export function rewriteUrl(url: string, candidate: MirrorCandidate): string {
  const pairs = candidate.mappings.filter((p) => p.from && p.to);
  if (pairs.some((p) => url.startsWith(normalizeTo(p.to)))) {
    return url; // 幂等：已是该候选任一映射的产物
  }
  const hit = pairs.find((p) => url.startsWith(p.from));
  return hit ? normalizeTo(hit.to) + url.slice(hit.from.length) : url;
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
 * 镜像游标与健康记账（镜像名键控，会话内存）：失败推进游标、
 * 同一候选累计 3 败本会话拉黑（带 30 分钟冷却自动解除）、
 * 成功稳定 active 并清零计数。
 * 身份 = 镜像名（用户填写，唯一稳定）；游标（active）独立于目录顺序，
 * 仅在「active 候选自身失败」时按池顺序推进——非 active 候选的失败
 * 只累积其自身连败与拉黑，绝不拖动游标。
 */
export class MirrorCursor {
  private current = '';
  private order: string[] = [];
  private streaks = new Map<string, number>();
  private blacklist = new Map<string, number>();
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** 同步池顺序（池管理操作后调用）；状态按名字保留，孤儿清理。 */
  setOrder(names: string[]): void {
    this.order = names;
    const alive = new Set(names);
    for (const key of [...this.streaks.keys()]) {
      if (!alive.has(key)) {
        this.streaks.delete(key);
      }
    }
    for (const key of [...this.blacklist.keys()]) {
      if (!alive.has(key)) {
        this.blacklist.delete(key);
      }
    }
    if (!names.includes(this.current) && names.length) {
      this.current = names[0] ?? '';
    }
    if (this.current && this.isBlacklisted(this.current)) {
      this.advanceActive();
    }
  }

  /** 当前 active 镜像名。 */
  get activeName(): string {
    return this.current;
  }

  /** 显式定位 active（播种/恢复初始状态/全池首测预定位）。 */
  setActive(name: string): void {
    if (this.order.includes(name)) {
      this.current = name;
    }
  }

  /** 显式稳定指定候选为 active（全池首测后的确定性预定位）。 */
  stabilize(name: string): void {
    if (this.order.includes(name)) {
      this.current = name;
    }
  }

  /**
   * 查询候选是否处于拉黑状态：冷却期满（30 分钟）自动解除
   * 并清零连败——给镜像完整的重新预算，重新进入轮转。
   */
  isBlacklisted(name: string): boolean {
    const at = this.blacklist.get(name);
    if (at === undefined) {
      return false;
    }
    if (this.now() - at >= BLACKLIST_COOLDOWN_MS) {
      this.blacklist.delete(name);
      this.streaks.delete(name);
      return false;
    }
    return true;
  }

  /** 记一次请求结果（name 为实际发送时所用的镜像名）。 */
  record(name: string, failed: boolean): void {
    if (this.isBlacklisted(name)) {
      return; // 冷却期内的迟回复不计成败
    }
    if (!failed) {
      this.streaks.delete(name);
      return;
    }
    const next = (this.streaks.get(name) ?? 0) + 1;
    this.streaks.set(name, next);
    if (next >= BLACKLIST_THRESHOLD) {
      this.blacklist.set(name, this.now());
    }
    if (name === this.current) {
      this.advanceActive();
    }
  }

  /** 会话复位（onload / 设置页重置调用）：游标回首项，清空连败与拉黑。 */
  reset(): void {
    this.current = this.order[0] ?? '';
    this.streaks.clear();
    this.blacklist.clear();
  }

  /** 手动切换到下一个未拉黑候选（设置页按钮）。 */
  switchNext(): void {
    this.advanceActive();
  }

  /** 失败后推进：从 active 起按池顺序找下一个未拉黑候选；全拉黑停留原地。 */
  private advanceActive(): void {
    const from = this.order.indexOf(this.current);
    const length = this.order.length;
    if (from === -1 || length === 0) {
      return;
    }
    for (let step = 1; step <= length; step++) {
      const name = this.order[(from + step) % length];
      if (name !== undefined && !this.isBlacklisted(name)) {
        this.current = name;
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
  private cursor = new MirrorCursor();
  private pool: MirrorCandidate[] = DEFAULT_POOL;
  /** 最近一次可达性测试结果（按镜像名键控）。 */
  private testResults = new Map<string, MirrorTestResult>();
  /** 未被任何映射覆盖的 GitHub 已知域 host → 未覆盖时经由的镜像名。 */
  private uncovered = new Map<string, string>();
  /** 上次池首项名（引擎自持快照）：首项变更检测依据，见 setPool。 */
  private lastFirst = DEFAULT_POOL[0]?.name ?? '';
  /** 本加速会话是否已做过全池首测（会话 = 插件启用至卸载）。 */
  private sessionTested = false;

  get mounted(): boolean {
    return this.originalSend !== null;
  }

  /** 查询镜像的最近测试结果（设置页展示用）。 */
  getTestResult(name: string): MirrorTestResult | undefined {
    return this.testResults.get(name);
  }

  /** 未覆盖的 GitHub 已知域（host + 未覆盖时经由的镜像名，按 host 字典序）。 */
  getUncovered(): { host: string; mirror: string }[] {
    return [...this.uncovered.entries()]
      .map(([host, mirror]) => ({ host, mirror }))
      .sort((a, b) => a.host.localeCompare(b.host));
  }

  /** 镜像池状态快照（设置页只读展示用）。 */
  getStatus(): MirrorStatus[] {
    const active = this.cursor.activeName;
    return this.pool.map((candidate) => ({
      label: candidate.name,
      active: candidate.name === active,
      blacklisted: this.cursor.isBlacklisted(candidate.name),
      testResult: this.testResults.get(candidate.name)?.detail,
    }));
  }

  /** 同步用户镜像池（池管理操作后调用；游标状态按镜像名保留与清理）。 */
  setPool(pool: MirrorCandidate[]): void {
    // 目录即偏好：首项变更（重排/删首项）= 重新声明优先级，游标跟随新首项。
    // 对比对象须为引擎自持快照而非 this.pool——调用方（main.ts 池管理）
    // 原地变更后传同一数组引用，引用别名会使首项对比恒等、游标滞留。
    const firstChanged = this.lastFirst !== (pool[0]?.name ?? '');
    this.lastFirst = pool[0]?.name ?? '';
    this.cursor.setOrder(
      pool.map((m) => m.name),
    );
    this.pool = pool;
    if (firstChanged) {
      this.cursor.setActive(pool[0]?.name ?? '');
    }
    this.uncovered.clear(); // 池变更后重新由真实流量评估
    const names = new Set(pool.map((c) => c.name));
    for (const key of [...this.testResults.keys()]) {
      if (!names.has(key)) {
        this.testResults.delete(key);
      }
    }
  }

  /** 复位镜像切换状态：游标回首项、清空连败与拉黑（设置页按钮调用）。 */
  resetCursor(): void {
    this.cursor.reset();
    this.uncovered.clear();
    this.testResults.clear();
  }

  /** 手动切换到下一个未拉黑候选（设置页按钮调用）。 */
  switchNext(): void {
    this.cursor.switchNext();
  }

  /**
   * 可达性测试：github 与 raw 双探针按候选映射分别改写后并发 GET，
   * 任一探针失败即记 1 败；结果逐映射分段展示（符号 + 名称 + 耗时/原因）。
   */
  async testMirror(candidate: MirrorCandidate): Promise<MirrorTestResult> {
    const name = candidate.name;
    this.testResults.set(name, { ok: false, detail: 'Testing…' });
    const [github, raw] = await Promise.all([
      this.probeOne(PROBE_GITHUB_URL, PROBE_GITHUB_MARKER, candidate),
      this.probeOne(PROBE_RAW_URL, PROBE_RAW_MARKER, candidate),
    ]);
    const ok = github.ok && raw.ok;
    // 每映射一段「符号 + 名称 + 耗时/原因」：一映射一状态，一状态一符号
    const mark = (probe: { ok: boolean }): string => (probe.ok ? '✓' : '✗');
    const result: MirrorTestResult = {
      ok,
      detail: `${mark(github)} github ${github.detail} · ${mark(raw)} raw ${raw.detail}`,
    };
    this.testResults.set(name, result);
    this.cursor.record(name, !ok);
    return result;
  }

  /** 全池首测：并发测试池内全部镜像，完成后确定性稳定到首个可用候选。 */
  async testAll(): Promise<void> {
    this.sessionTested = true;
    await Promise.all(this.pool.map((c) => this.testMirror(c)));
    const firstUsable = this.pool.find((c) => {
      const r = this.testResults.get(c.name);
      return r?.ok && !this.cursor.isBlacklisted(c.name);
    });
    if (firstUsable) {
      this.cursor.setActive(firstUsable.name);
    }
  }

  /**
   * 加速会话开始时全池首测（每会话至多一轮）：统一各行测试状态，
   * 并把游标预定位到首个可用镜像。池重建（恢复初始状态）的重测不受此限。
   */
  ensureSessionTest(): void {
    if (this.sessionTested) {
      return;
    }
    this.sessionTested = true;
    void this.testAll();
  }

  /** 挂载 request-url 频道改写与健康观测。返回是否挂载成功；false 为环境不满足（静默跳过）。 */
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
          const name = this.cursor.activeName;
          const candidate = this.pool.find((m) => m.name === name);
          if (candidate) {
            const url = extractUrl(args);
            // 经由判定：仅「命中本 active 映射」的流量才改写 + 被动记账。
            // 探针流量已被 testMirror 预改写为目标镜像（rewriteUrl 幂等，
            // 二次改写不变）→ 落未命中分支，其成败由 testMirror 主动记账，
            // 绝不拖动 active；市场直连（未覆盖）流量同样不记账。
            const target =
              url !== undefined ? rewriteUrl(url, candidate) : undefined;
            if (url !== undefined && target !== url) {
              rewriteArgsInPlace(args, candidate);
              this.uncovered.delete(hostOf(url));
              const requestId = args[0];
              if (typeof requestId === 'string') {
                this.observe(ipc, name, requestId, url);
              }
            } else if (url !== undefined && isKnownGithubUrl(url)) {
              // 未覆盖告知：未命中映射且属已知域 → 记录 host（连同当时的镜像名）
              this.uncovered.set(hostOf(url), name);
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
   * 回复到达或超时后移除监听，防止监听泄漏。
   */
  private observe(
    ipc: IpcLike,
    name: string,
    requestId: string,
    url: string,
  ): void {
    let done = false;
    const onReply = (...replyArgs: unknown[]) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      const verdict = judgeReply(replyArgs[1], url);
      if (verdict !== undefined) {
        this.cursor.record(name, verdict);
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
      this.cursor.record(name, true); // 观测超时：按失败记账
    }, OBSERVE_TIMEOUT_MS);
    ipc.on?.(requestId, onReply);
  }


  /** 单探针：按候选映射改写后 GET，双层判定（HTTP 语义 + 2xx 内容指纹）；detail 不含符号。 */
  private async probeOne(
    url: string,
    marker: string,
    candidate: MirrorCandidate,
  ): Promise<{ ok: boolean; detail: string }> {
    const start = Date.now();
    try {
      const target = rewriteUrl(url, candidate);
      const res = await requestUrl({
        url: target,
        method: 'GET',
        throw: false,
      });
      const ms = Date.now() - start;
      const text = res.text;
      const statusFailed = isMirrorFailure(res.status, url);
      const contentFailed =
        !statusFailed &&
        res.status >= 200 &&
        res.status < 300 &&
        !text.includes(marker);
      if (statusFailed) {
        return { ok: false, detail: `HTTP ${res.status} (${ms} ms)` };
      }
      if (contentFailed) {
        return {
          ok: false,
          detail: `HTTP ${res.status} unexpected content (${text.length} B, likely not a mirror response)`,
        };
      }
      return { ok: true, detail: `${ms} ms` };
    } catch (err) {
      return {
        ok: false,
        detail: `${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}