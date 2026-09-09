import {
  App,
  ExtraButtonComponent,
  Menu,
  PluginSettingTab,
  Setting,
  SettingGroup,
  TextComponent,
} from 'obsidian';
import {
  AcceleratorConfig,
  DEFAULT_ACCELERATOR_CONFIG,
  displayEndpoint,
  MirrorStatus,
} from './accelerator';
import GitHubTurbo from './main';

export interface TurboSettings {
  /** GitHub 加速配置。 */
  accelerator: AcceleratorConfig;
}

export const DEFAULT_SETTINGS: TurboSettings = {
  accelerator: DEFAULT_ACCELERATOR_CONFIG,
};

/** 添加表单操作引导文案（合法态提示）。 */
const ADD_HINT =
  'Fill in both mappings, then add — a health test runs automatically.';

/** 添加镜像表单草稿。 */
interface AddDraft {
  name: string;
  toGithub: string;
  toRaw: string;
}

/** 池条目行记录（行级增量渲染的跟踪单元）。 */
interface PoolRowRecord {
  setting: Setting;
  chevron: ExtraButtonComponent;
  /** 名称前状态点（当前=绿 / 拉黑=红 / 普通=灰）。 */
  dot: HTMLElement;
  /** 展开的详情块（以兄弟节点挂在条目行正下方）。 */
  detail?: HTMLElement;
  /** 上次 desc 渲染的键（无变化则跳过 patch）。 */
  descKey: string;
}

/** 添加表单字段引用（提交后清空复用，不重建表单）。 */
interface AddFormRefs {
  nameText: TextComponent;
  githubText: TextComponent;
  rawText: TextComponent;
}

/**
 * 设置页：SettingGroup 四区聚合（基础 / 镜像池 / 添加镜像 / 恢复初始状态）。
 * 池条目 = 名称前状态点 + `···` 菜单 + chevron（展开映射详情，兄弟节点插入
 * 正下方）；Switch 在镜像池说明行（组首行）desc 右侧；desc 测试结果与详情均
 * 对齐镜像名文本；刷新为行级增量更新（1s 轮询 + 池操作即时）；添加表单点击时
 * 集中校验。
 * 声明式设置 API（Obsidian 1.13+ 搜索索引用）暂缓：dev typings 1.12.3 尚无该
 * API，且动态池管理 UI 的采纳属功能级变更（如需另立提案）。
 */
export class TurboSettingTab extends PluginSettingTab {
  plugin: GitHubTurbo;
  /** 未覆盖警示行（基础区内，条件显示）。 */
  private uncoveredRow?: Setting;
  /** 未覆盖警示文本容器（= 警示行 descEl）。 */
  private uncoveredEl?: HTMLElement;
  /** 镜像池组（条目行的宿主）。 */
  private poolGroup?: SettingGroup;
  /** 池条目行跟踪表（名字 → 行记录）。 */
  private poolRows = new Map<string, PoolRowRecord>();
  /** 池条目插入锚点（说明行的 settingEl）。 */
  private poolAnchorEl?: HTMLElement;
  /** 空池提示行。 */
  private emptyRow?: Setting;
  /** 添加表单字段引用。 */
  private addForm?: AddFormRefs;
  /** 表单提示行容器（= 提示行 descEl）。 */
  private addErrorEl?: HTMLElement;
  private addDraft: AddDraft = { name: '', toGithub: '', toRaw: '' };
  /** 展开态（名字集合，会话内保持）。 */
  private expanded = new Set<string>();

  constructor(app: App, plugin: GitHubTurbo) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.poolGroup = undefined;
    this.poolRows.clear();
    this.poolAnchorEl = undefined;
    this.emptyRow = undefined;
    this.addForm = undefined;
    this.addErrorEl = undefined;
    this.uncoveredRow = undefined;
    this.uncoveredEl = undefined;

    // —— 基础区（当前镜像无独立行：由池条目状态点标识） ——
    const base = new SettingGroup(containerEl);
    base.setHeading('GitHub Turbo');
    base.addSetting((s) => {
      // 版本信息作为介绍行的 name，介绍文字作 desc
      s.setName(`Version: ${this.plugin.manifest.version}`).setDesc(
        'Rewrites GitHub URLs through mirrors to speed up the built-in community plugin & theme marketplace.',
      );
    });
    base.addSetting((s) => {
      s.setName('Enable GitHub acceleration').setDesc(
        'When off, all GitHub requests go direct.',
      );
      s.addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.accelerator.enabled)
          .onChange(async (value) => {
            this.plugin.settings.accelerator.enabled = value;
            await this.plugin.saveSettings();
            if (value) {
              this.plugin.ensureSessionTest();
            }
          }),
      );
    });
    base.addSetting((s) => {
      s.settingEl.addClass('turbo-warning-row');
      s.settingEl.hide();
      this.uncoveredRow = s;
      this.uncoveredEl = s.descEl;
    });

    // —— 镜像池区 ——
    const pool = new SettingGroup(containerEl);
    this.poolGroup = pool;
    pool.setHeading('Mirror pool');
    pool.addSetting((s) => {
      s.setDesc('Ordered by failover priority. Expand a mirror to inspect its mappings.');
      // Switch（原「当前镜像」行迁移）：位于池说明行（组首行）desc 右侧，位置恒定
      s.addButton((button) =>
        button
          .setButtonText('Switch')
          .setTooltip('Switch to next mirror')
          .onClick(() => {
            this.plugin.switchToNextMirror();
            this.refresh();
          }),
      );
      this.poolAnchorEl = s.settingEl;
    });

    // —— 添加镜像区（点击 Add mirror 时集中校验，输入不打扰） ——
    const addGroup = new SettingGroup(containerEl);
    addGroup.setHeading('Add mirror');
    let nameText!: TextComponent;
    let githubText!: TextComponent;
    let rawText!: TextComponent;
    addGroup.addSetting((s) => {
      s.setName('Mirror name').setDesc('Unique identifier; duplicates are rejected.');
      s.addText((text) => {
        text.setPlaceholder('e.g. gh-proxy.com');
        text.onChange((value) => {
          this.addDraft.name = value;
        });
        nameText = text;
      });
    });
    addGroup.addSetting((s) => {
      s.setName('github.com maps to')
        .setDesc(
          'Prefix style: mirror prefix + https://github.com/ · Domain style: mirror domain replaces github.com',
        )
        .addText((text) => {
          text.setPlaceholder('https://gh-proxy.com/https://github.com/');
          text.onChange((value) => {
            this.addDraft.toGithub = value;
          });
          githubText = text;
        });
    });
    addGroup.addSetting((s) => {
      s.setName('raw.githubusercontent.com maps to')
        .setDesc('Rewrites the https://raw.githubusercontent.com/ prefix.')
        .addText((text) => {
          text.setPlaceholder(
            'https://gh-proxy.com/https://raw.githubusercontent.com/',
          );
          text.onChange((value) => {
            this.addDraft.toRaw = value;
          });
          rawText = text;
        });
    });
    // 校验提示行（P-003 缺陷修复：此前 addErrorEl 从未赋值，提示从不显示）
    addGroup.addSetting((s) => {
      this.addErrorEl = s.descEl;
    });
    addGroup.addSetting((s) => {
      s.setName('Confirm').addButton((button) => {
        button.setButtonText('Add mirror').setCta().onClick(() => this.submitAdd());
      });
    });
    this.addForm = { nameText, githubText, rawText };
    this.setAddHint(ADD_HINT, false);

    // —— 调试区（恢复初始状态上方；P-005） ——
    const debugGroup = new SettingGroup(containerEl);
    debugGroup.setHeading('Debug logs');
    debugGroup.addSetting((s) => {
      s.setName('Debug logging').setDesc(
        'Log GitHub requests to the developer console: [REWRITE] origin → rewritten, or [DIRECT] when uncovered.',
      );
      s.addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.accelerator.debug)
          .onChange(async (value) => {
            this.plugin.settings.accelerator.debug = value;
            await this.plugin.saveSettings();
          }),
      );
    });

    // —— 恢复初始状态区（独立区，置于最后） ——
    const resetGroup = new SettingGroup(containerEl);
    resetGroup.setHeading('Restore defaults');
    resetGroup.addSetting((s) => {
      s.setDesc(
        'Restore the built-in mirror list, clear test failures and blacklist, and run a full health test.',
      );
      s.addButton((button) =>
        button.setButtonText('Reset').onClick(() => {
          void this.plugin.resetToInitialState();
          this.refresh();
        }),
      );
    });

    this.refresh();
  }

  /** 刷新：单次状态快照驱动警示行与池条目行级更新。 */
  refresh(): void {
    if (!this.containerEl.isConnected) {
      return;
    }
    const statuses = this.plugin.mirrorStatus;
    this.syncUncovered();
    this.syncPoolRows(statuses);
  }

  private syncUncovered(): void {
    if (!this.uncoveredRow || !this.uncoveredEl) {
      return;
    }
    const uncovered = this.plugin.uncovered;
    if (!uncovered.length) {
      this.uncoveredRow.settingEl.hide();
      return;
    }
    this.uncoveredEl.setText(
      `⚠ Uncovered GitHub domains, going direct: ${uncovered
        .map((u) => `${u.host} (not covered by ${u.mirror})`)
        .join(', ')}`,
    );
    this.uncoveredRow.settingEl.show();
  }

  /**
   * 池条目行级增量同步：按池顺序遍历——缺行创建、在行 patch、孤儿行删除；
   * DOM 顺序以锚点链重排（详情随行携带），守卫避免无谓搬移。
   */
  private syncPoolRows(statuses: MirrorStatus[]): void {
    const pool = this.poolGroup;
    if (!pool) {
      return;
    }
    this.syncEmptyRow(statuses.length === 0);
    let anchor: Element | null = this.poolAnchorEl ?? null;
    const seen = new Set<string>();
    for (const status of statuses) {
      seen.add(status.label);
      let row = this.poolRows.get(status.label);
      if (!row) {
        row = this.createPoolRow(status);
        this.poolRows.set(status.label, row);
      }
      this.patchPoolRow(row, status);
      if (anchor) {
        if (anchor.nextElementSibling !== row.setting.settingEl) {
          anchor.after(row.setting.settingEl);
        }
        anchor = row.setting.settingEl;
        if (row.detail) {
          if (anchor.nextElementSibling !== row.detail) {
            anchor.after(row.detail);
          }
          anchor = row.detail;
        }
      }
    }
    for (const [name, row] of [...this.poolRows]) {
      if (!seen.has(name)) {
        row.detail?.remove();
        row.setting.settingEl.remove();
        this.poolRows.delete(name);
        this.expanded.delete(name);
      }
    }
  }

  private syncEmptyRow(empty: boolean): void {
    const pool = this.poolGroup;
    if (!pool) {
      return;
    }
    if (empty && !this.emptyRow) {
      pool.addSetting((s) => {
        s.setName('No mirrors').setDesc(
          'Requests go direct. Add a mirror or restore defaults.',
        );
        this.emptyRow = s;
      });
    }
    if (this.emptyRow) {
      this.emptyRow.settingEl.toggle(empty);
      if (empty && this.poolAnchorEl) {
        const anchor: Element = this.poolAnchorEl;
        if (anchor.nextElementSibling !== this.emptyRow.settingEl) {
          anchor.after(this.emptyRow.settingEl);
        }
      }
    }
  }

  private createPoolRow(status: MirrorStatus): PoolRowRecord {
    const pool = this.poolGroup;
    if (!pool) {
      throw new Error('Mirror pool group is not initialized');
    }
    let setting!: Setting;
    let chevron!: ExtraButtonComponent;
    let dot!: HTMLElement;
    pool.addSetting((s) => {
      setting = s;
      s.setName(status.label);
      // 名称前状态点：占位保证各行等宽缩进，颜色由 patchPoolRow 按状态刷新
      dot = createSpan('turbo-dot');
      s.nameEl.prepend(dot);
      // desc 测试结果左缩进（状态点占位宽），与镜像名文本对齐
      s.descEl.addClass('turbo-status');
      s.addExtraButton((button) => {
        button.setIcon('lucide-more-vertical').setTooltip('Actions');
        button.extraSettingsEl.addEventListener('click', (evt) =>
          this.openEntryMenu(evt as MouseEvent, status.label),
        );
      });
      // 展开按钮置于行尾最右
      s.addExtraButton((button) => {
        chevron = button;
        button.setIcon('lucide-chevron-right').setTooltip('Details');
        button.extraSettingsEl.addEventListener('click', () => {
          this.toggleDetail(status.label, record);
        });
      });
    });
    const record: PoolRowRecord = { setting, chevron, dot, descKey: '' };
    if (this.expanded.has(status.label)) {
      this.attachDetail(record, status.label);
    }
    return record;
  }

  private patchPoolRow(record: PoolRowRecord, status: MirrorStatus): void {
    const test = this.plugin.getTestResult(status.label);
    const key = `${status.active}|${status.blacklisted}|${test?.detail ?? ''}`;
    if (record.descKey === key) {
      return;
    }
    record.descKey = key;
    // 状态点分色：当前=绿 / 已拉黑=红 / 普通（含未测试与测试中）=灰
    const dot = record.dot;
    dot.removeClass('turbo-dot-active', 'turbo-dot-blacklisted', 'turbo-dot-idle');
    if (status.active) {
      dot.addClass('turbo-dot-active');
    } else if (status.blacklisted) {
      dot.addClass('turbo-dot-blacklisted');
    } else {
      dot.addClass('turbo-dot-idle');
    }
    // desc 仅测试结果：符号绑定颜色（✓ 绿 / ✗ 红），其余默认色
    const descEl = record.setting.descEl;
    descEl.empty();
    if (test) {
      this.renderTestStatus(descEl, test.detail);
    } else {
      descEl.setText('Not tested');
    }
  }

  /** 测试结果文本：逐符号拆分着色（✓ 绿 / ✗ 红），其余保持默认色。 */
  private renderTestStatus(descEl: HTMLElement, detail: string): void {
    for (const part of detail.split(/(✓|✗)/)) {
      if (part === '✓') {
        descEl.createSpan({ text: part, cls: 'turbo-test-ok' });
      } else if (part === '✗') {
        descEl.createSpan({ text: part, cls: 'turbo-test-error' });
      } else if (part) {
        descEl.appendText(part);
      }
    }
  }

  private toggleDetail(label: string, record: PoolRowRecord): void {
    if (record.detail) {
      record.detail.remove();
      record.detail = undefined;
      this.expanded.delete(label);
      record.chevron.setIcon('lucide-chevron-right');
      return;
    }
    this.attachDetail(record, label);
    this.expanded.add(label);
  }

  /** 详情以兄弟节点插入条目行正下方（映射单行、去协议前缀与尾斜杠）；缩进对齐镜像名文本。 */
  private attachDetail(record: PoolRowRecord, label: string): void {
    const candidate = this.plugin.pool.find((m) => m.name === label);
    const detail = createDiv('turbo-detail');
    for (const pair of candidate?.mappings ?? []) {
      detail.createDiv({
        cls: 'turbo-map',
        text: `${displayEndpoint(pair.from)} → ${displayEndpoint(pair.to)}`,
      });
    }
    // 左缩进 = 条目行内容左缘（实测，随主题内边距）+ 状态点占位，与镜像名文本对齐
    const itemLeft = record.setting.settingEl.getBoundingClientRect().left;
    const nameLeft = record.setting.nameEl.getBoundingClientRect().left;
    detail.style.paddingLeft = `${Math.max(nameLeft - itemLeft, 0) + 14}px`;
    record.setting.settingEl.insertAdjacentElement('afterend', detail);
    record.detail = detail;
    record.chevron.setIcon('lucide-chevron-down');
  }

  private openEntryMenu(evt: MouseEvent, label: string): void {
    const pool = this.plugin.pool;
    const index = pool.findIndex((m) => m.name === label);
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle('Test health').onClick(() => {
        this.plugin.testMirror(label);
        this.refresh();
      }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Move up')
        .setDisabled(index === 0)
        .onClick(() => {
          this.plugin.moveMirror(label, -1);
          this.refresh();
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle('Move down')
        .setDisabled(index === pool.length - 1)
        .onClick(() => {
          this.plugin.moveMirror(label, 1);
          this.refresh();
        }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Delete')
        .setDisabled(pool.length <= 1)
        .onClick(() => {
          this.plugin.removeMirror(label);
          this.refresh();
        }),
    );
    menu.showAtMouseEvent(evt);
  }

  /** 表单提示行：操作引导（灰）或点击校验的全部失败原因（红）。 */
  private setAddHint(text: string, isError: boolean): void {
    if (!this.addErrorEl) {
      return;
    }
    this.addErrorEl.setText(text);
    this.addErrorEl.addClass(isError ? 'turbo-form-error' : 'turbo-form-hint');
    this.addErrorEl.removeClass(isError ? 'turbo-form-hint' : 'turbo-form-error');
  }

  /** 点击时集中校验：返回全部错误原因（空数组 = 合法）。 */
  private validateAdd(): string[] {
    const errors: string[] = [];
    const name = this.addDraft.name.trim();
    const toGithub = this.addDraft.toGithub.trim();
    const toRaw = this.addDraft.toRaw.trim();
    if (!name) {
      errors.push('Mirror name cannot be empty');
    } else if (this.plugin.pool.some((m) => m.name === name)) {
      errors.push('Mirror name already exists');
    }
    if (!toGithub.startsWith('https://')) {
      errors.push('"github.com maps to" must start with https://');
    }
    if (!toRaw.startsWith('https://')) {
      errors.push('"raw.githubusercontent.com maps to" must start with https://');
    }
    return errors;
  }

  private submitAdd(): void {
    const errors = this.validateAdd();
    if (errors.length > 0) {
      this.setAddHint(errors.join(' · '), true);
      return;
    }
    const name = this.addDraft.name.trim();
    // 尾斜杠归一：剥全部尾斜杠后补单个，杜绝 to// 双斜杠改写
    const norm = (s: string): string => `${s.trim().replace(/\/+$/, '')}/`;
    const ok = this.plugin.addMirror({
      name,
      mappings: [
        { from: 'https://github.com/', to: norm(this.addDraft.toGithub) },
        { from: 'https://raw.githubusercontent.com/', to: norm(this.addDraft.toRaw) },
      ],
    });
    if (ok) {
      this.addDraft = { name: '', toGithub: '', toRaw: '' };
      this.addForm?.nameText.setValue('');
      this.addForm?.githubText.setValue('');
      this.addForm?.rawText.setValue('');
      this.setAddHint(ADD_HINT, false);
      this.refresh();
    }
  }
}
