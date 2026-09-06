import { App, ButtonComponent, Menu, PluginSettingTab, Setting } from 'obsidian';
import {
  AcceleratorConfig,
  DEFAULT_ACCELERATOR_CONFIG,
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

/** 添加镜像表单草稿。 */
interface AddDraft {
  name: string;
  toGithub: string;
  toRaw: string;
}

/**
 * 设置页：总开关 + 当前镜像（控件内只读）+ 手动切换 + 镜像池管理
 * （添加/删除/排序/行级测试/未覆盖提示/恢复初始状态）；状态 1s 轮询实时跟随。
 * 声明式设置 API（Obsidian 1.13+ 搜索索引用）暂缓：dev typings 1.12.3 尚无该
 * API，且动态池管理 UI 的采纳属功能级变更（如需另立提案）。
 */
export class TurboSettingTab extends PluginSettingTab {
  plugin: GitHubTurbo;
  private activeInput?: HTMLInputElement;
  private uncoveredEl?: HTMLElement;
  private poolListEl?: HTMLElement;
  private addFormEl?: HTMLElement;
  private addErrorEl?: HTMLElement;
  private addDraft: AddDraft = { name: '', toGithub: '', toRaw: '' };
  private addButton?: ButtonComponent;
  private expanded = new Set<string>();
  private lastRenderKey = '';

  constructor(app: App, plugin: GitHubTurbo) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.poolListEl = undefined;
    this.addFormEl = undefined;

    new Setting(containerEl).setName('GitHub 加速').setHeading();
    containerEl.createEl('p', {
      text: '改写 GitHub 仓库地址为镜像地址，加速内置社区插件与主题市场。',
    });
    this.uncoveredEl = containerEl.createEl('p');
    this.uncoveredEl.hide();

    new Setting(containerEl)
      .setName('启用 GitHub 加速')
      .setDesc('关闭后所有 GitHub 请求恢复直连')
      .addToggle((toggle) =>
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

    new Setting(containerEl)
      .setName('当前镜像')
      .setDesc('故障时自动切换到下一可用镜像，也可手动切换；禁用再启用本插件可重置')
      .addButton((button) =>
        button
          .setButtonText('切换下一个')
          .onClick(() => this.plugin.switchToNextMirror()),
      )
      .addText((text) => {
        const active = this.plugin.mirrorStatus.find((s) => s.active);
        text.setValue(active?.label ?? '—');
        text.inputEl.readOnly = true;
        this.activeInput = text.inputEl;
      });

    new Setting(containerEl).setName('镜像池').setHeading();
    containerEl.createEl('p', {
      text: '按优先级排序，失败自动按序回退；点击条目名可展开映射详情。修改镜像 = 删除后重新添加。',
    });
    this.poolListEl = containerEl.createDiv();
    this.renderPool(this.plugin.mirrorStatus);

    this.addFormEl = containerEl.createDiv();
    this.renderAddForm();

    new Setting(containerEl)
      .setName('恢复初始状态')
      .setDesc(
        '清理插件的拉黑、失败次数，游标回到第一行主镜像；池重建为种子镜像并自动全池测试',
      )
      .addButton((button) =>
        button.setButtonText('重置').onClick(() => {
          void this.plugin.resetToInitialState();
          this.refresh();
        }),
      );
    this.refresh();
  }

  /** 轮询刷新：单次状态快照同时驱动输入框、池列表与未覆盖提示。 */
  refresh(): void {
    if (!this.containerEl.isConnected) {
      return;
    }
    const statuses = this.plugin.mirrorStatus;
    const uncovered = this.plugin.uncovered;
    if (this.uncoveredEl) {
      if (uncovered.length) {
        const active = statuses.find((s) => s.active);
        this.uncoveredEl.setText(
          `⚠ 以下 GitHub 域未被任何映射覆盖，当前直连：${uncovered
            .map((u) => `${u.host}（经 ${u.mirror}）`)
            .join('、')}；当前镜像：${active?.label ?? '—'}`,
        );
        this.uncoveredEl.show();
      } else {
        this.uncoveredEl.hide();
      }
    }
    const key = JSON.stringify(statuses);
    if (key !== this.lastRenderKey) {
      this.lastRenderKey = key;
      this.renderPool(statuses);
    }
    const active = statuses.find((s) => s.active);
    if (this.activeInput && active) {
      this.activeInput.value = active.label;
    }
  }

  private renderPool(statuses: MirrorStatus[]): void {
    const list = this.poolListEl;
    if (!list) {
      return;
    }
    list.empty();
    if (!this.plugin.pool.length) {
      list.createEl('p', {
        text: '镜像池为空，请求将直连。请添加镜像或恢复初始状态。',
      });
      return;
    }
    statuses.forEach((status, index) => {
      const candidate = this.plugin.pool.find(
        (m) => m.name === status.label,
      );
      const mappings = candidate?.mappings ?? [];
      const entry = list.createDiv();
      const row = new Setting(entry)
        .setName(status.label)
        .setDesc(this.entryDesc(index, status));
      row.nameEl.addClass('turbo-clickable');
      row.nameEl.onClickEvent(() => this.toggleExpand(status.label));
      row.addExtraButton((button) => {
        button.setIcon('lucide-more-vertical').setTooltip('操作');
        button.extraSettingsEl.addEventListener('click', (evt) =>
          this.openEntryMenu(evt as MouseEvent, status.label, index),
        );
      });
      if (this.expanded.has(status.label)) {
        const detail = entry.createDiv('turbo-detail');
        for (const pair of mappings) {
          detail.createDiv({ text: `${pair.from} → ${pair.to}` });
        }
      }
    });
  }

  private toggleExpand(label: string): void {
    if (this.expanded.has(label)) {
      this.expanded.delete(label);
    } else {
      this.expanded.add(label);
    }
    this.renderPool(this.plugin.mirrorStatus);
  }

  private openEntryMenu(
    evt: MouseEvent,
    label: string,
    index: number,
  ): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle('测试健康（可达性）')
        .onClick(() => this.plugin.testMirror(label)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('上移')
        .setDisabled(index === 0)
        .onClick(() => this.plugin.moveMirror(label, -1)),
    );
    menu.addItem((item) =>
      item
        .setTitle('下移')
        .setDisabled(index === this.plugin.pool.length - 1)
        .onClick(() => this.plugin.moveMirror(label, 1)),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('删除')
        .setDisabled(this.plugin.pool.length <= 1)
        .onClick(() => this.plugin.removeMirror(label)),
    );
    menu.showAtMouseEvent(evt);
  }

  private entryDesc(index: number, status: MirrorStatus): string {
    const parts: string[] = [];
    if (status.active) {
      parts.push('当前使用');
    }
    if (status.blacklisted) {
      parts.push('本会话已拉黑');
    }
    const test = this.plugin.getTestResult(status.label);
    parts.push(`镜像 ${index + 1} · ${test?.detail ?? '未测试'}`);
    return parts.join(' · ');
  }

  private renderAddForm(): void {
    if (!this.addFormEl) {
      return;
    }
    this.addFormEl.empty();
    new Setting(this.addFormEl).setName('添加镜像').setHeading();
    new Setting(this.addFormEl)
      .setName('镜像名')
      .setDesc('唯一标识，同名视为重复')
      .addText((text) =>
        text
          .setPlaceholder('如 gh-proxy.com')
          .setValue(this.addDraft.name)
          .onChange((value) => {
            this.addDraft.name = value;
            this.syncAddForm();
          }),
      );
    new Setting(this.addFormEl)
      .setName('github.com 映射到')
      .setDesc('前缀型：镜像前缀 + https://github.com/；域名替换型：替换后域名/')
      .addText((text) =>
        text
          .setPlaceholder('https://gh-proxy.com/https://github.com/')
          .setValue(this.addDraft.toGithub)
          .onChange((value) => {
            this.addDraft.toGithub = value;
            this.syncAddForm();
          }),
      );
    new Setting(this.addFormEl)
      .setName('Raw 域映射到')
      .setDesc('改写 https://raw.githubusercontent.com/ 前缀')
      .addText((text) =>
        text
          .setPlaceholder('https://gh-proxy.com/https://raw.githubusercontent.com/')
          .setValue(this.addDraft.toRaw)
          .onChange((value) => {
            this.addDraft.toRaw = value;
            this.syncAddForm();
          }),
      );
    new Setting(this.addFormEl)
      .setName('确认添加')
      .addButton((button) => {
        this.addButton = button;
        button
          .setButtonText('添加镜像')
          .setCta()
          .onClick(() => this.submitAdd());
        this.syncAddForm();
      });
  }

  private addError(): string | null {
    const name = this.addDraft.name.trim();
    const toGithub = this.addDraft.toGithub.trim();
    const toRaw = this.addDraft.toRaw.trim();
    if (!name) {
      return '请填写镜像名';
    }
    if (this.plugin.pool.some((m) => m.name === name)) {
      return '镜像名与池内条目重复';
    }
    if (!toGithub.startsWith('https://') || !toRaw.startsWith('https://')) {
      return '映射地址需以 https:// 开头';
    }
    return null;
  }

  private syncAddForm(): void {
    const error = this.addError();
    this.addErrorEl?.setText(error ?? '两条映射填写完整后即可添加，入池后自动测试可达性');
    this.addButton?.setDisabled(error !== null);
  }

  private submitAdd(): void {
    const error = this.addError();
    if (error !== null) {
      this.addErrorEl?.setText(`⚠ ${error}`);
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
      this.renderAddForm();
    }
  }
}
