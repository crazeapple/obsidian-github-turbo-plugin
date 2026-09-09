import { Plugin } from 'obsidian';
import {
  DEFAULT_ACCELERATOR_CONFIG,
  DEFAULT_POOL,
  MirrorCandidate,
  MirrorStatus,
  RequestUrlAccelerator,
} from './accelerator';
import {
  DEFAULT_SETTINGS,
  TurboSettings,
  TurboSettingTab,
} from './settings';

/** GitHub Turbo：加速 Obsidian 内置社区插件/主题市场的 GitHub 访问（P-001~P-003）。 */
export default class GitHubTurbo extends Plugin {
  settings!: TurboSettings;
  private accelerator = new RequestUrlAccelerator();
  private settingTab?: TurboSettingTab;

  /** 镜像池状态快照（设置页只读展示用）。 */
  get mirrorStatus(): MirrorStatus[] {
    return this.accelerator.getStatus();
  }

  /** 用户镜像池（设置页只读展示用）。 */
  get pool(): readonly MirrorCandidate[] {
    return this.settings.accelerator.pool;
  }

  /** 未被映射覆盖的 GitHub 已知域（host + 未覆盖时经由的镜像名）。 */
  get uncovered(): { host: string; mirror: string }[] {
    return this.accelerator.getUncovered();
  }

  /** 复位镜像切换状态（游标回首项、清空连败与拉黑）。 */
  resetMirrorCursor(): void {
    this.accelerator.resetCursor();
  }

  /** 加速会话开始时的全池首测（每会话至多一轮；已测则跳过）。 */
  ensureSessionTest(): void {
    this.accelerator.ensureSessionTest();
  }

  /** 查询镜像的最近测试结果（设置页展示用）。 */
  getTestResult(
    name: string,
  ): { ok: boolean; detail: string } | undefined {
    return this.accelerator.getTestResult(name);
  }

  /** 手动切换到下一个未拉黑候选（设置页按钮）。 */
  switchToNextMirror(): void {
    this.accelerator.switchNext();
  }

  /** 对指定镜像发起可达性测试（结果经 1s 轮询展示）。 */
  testMirror(name: string): void {
    const candidate = this.settings.accelerator.pool.find(
      (m) => m.name === name,
    );
    if (candidate) {
      void this.accelerator.testMirror(candidate);
    }
  }

  /** 添加镜像（名字唯一；入池后自动首测）。 */
  addMirror(candidate: MirrorCandidate): boolean {
    const pool = this.settings.accelerator.pool;
    if (pool.some((m) => m.name === candidate.name)) {
      return false;
    }
    pool.push({
      name: candidate.name,
      mappings: candidate.mappings.map((p) => ({
        from: p.from,
        to: p.to,
      })),
    });
    this.syncPool();
    const added = pool[pool.length - 1];
    if (added) {
      void this.accelerator.testMirror(added);
    }
    return true;
  }

  /** 删除镜像（最后一条禁删，设置页菜单已禁用，此处兜底）。 */
  removeMirror(name: string): boolean {
    const pool = this.settings.accelerator.pool;
    if (pool.length <= 1) {
      return false;
    }
    const index = pool.findIndex((m) => m.name === name);
    if (index === -1) {
      return false;
    }
    pool.splice(index, 1);
    this.syncPool();
    return true;
  }

  /** 上移/下移镜像（delta -1 或 1；越界为空操作）。 */
  moveMirror(name: string, delta: -1 | 1): boolean {
    const pool = this.settings.accelerator.pool;
    const index = pool.findIndex((m) => m.name === name);
    const current = pool[index];
    const neighbour = pool[index + delta];
    if (!current || !neighbour) {
      return false;
    }
    pool[index] = neighbour;
    pool[index + delta] = current;
    this.syncPool();
    return true;
  }

  /** 恢复初始状态：池重建为种子镜像 + 运行态清空 + 全池首测。 */
  async resetToInitialState(): Promise<void> {
    this.settings.accelerator.pool = DEFAULT_POOL.map((m) => ({
      name: m.name,
      mappings: m.mappings.map((p) => ({ from: p.from, to: p.to })),
    }));
    this.accelerator.setPool(this.settings.accelerator.pool);
    this.accelerator.resetCursor();
    await this.saveSettings();
    await this.accelerator.testAll();
  }

  private syncPool(): void {
    void this.saveSettings();
    this.accelerator.setPool(this.settings.accelerator.pool);
  }

  async onload() {
    await this.loadSettings();

    // 同步用户镜像池（游标状态按镜像名保留），再挂载改写与观测。
    this.accelerator.setPool(this.settings.accelerator.pool);
    this.accelerator.install(() => this.settings.accelerator);

    this.settingTab = new TurboSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    // 设置页镜像状态实时跟随（容器不在文档中时刷新为空操作）。
    this.registerInterval(
      window.setInterval(() => this.settingTab?.refresh(), 1000),
    );
    // 全池首测跟随加速会话边界：插件启用且开关开（新会话）→ 一轮；
    // 首次播种的池建立亦在此触发（testAll 内标记会话已测）。
    if (this.settings.accelerator.enabled) {
      this.accelerator.ensureSessionTest();
    }
  }

  onunload() {
    this.accelerator.restore();
  }

  async loadSettings(): Promise<boolean> {
    const loaded = (await this.loadData()) as Partial<TurboSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    // 显式取字段：旧数据的多余键（如已废弃的 mirrorBase）自然忽略（P-002 AC6）。
    const stored = loaded?.accelerator;
    // 播种迁移（P-003 AC8）：无 pool 键或 pool 为空（首装/存量数据/历史空池）
    // → 播种默认种子池并落盘；此后 pool 非空，不再重复播种。
    // 深拷贝种子，避免 UI 就地修改污染常量。
    const seeded = !stored?.pool?.length;
    this.settings.accelerator = {
      enabled: stored?.enabled ?? DEFAULT_ACCELERATOR_CONFIG.enabled,
      pool:
        stored?.pool?.length ? stored.pool : DEFAULT_POOL.map((m) => ({
          name: m.name,
          mappings: m.mappings.map((p) => ({ from: p.from, to: p.to })),
        })),
      debug: stored?.debug ?? DEFAULT_ACCELERATOR_CONFIG.debug,
    };
    if (seeded) {
      await this.saveSettings();
    }
    return seeded;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
