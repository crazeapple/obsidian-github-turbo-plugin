import { App, PluginSettingTab, Setting } from 'obsidian';
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

/**
 * 设置页：总开关 + 当前镜像（控件内只读）+ 镜像池有序展示；
 * 镜像运行状态由 1s 轮询实时跟随切换（P-002 / T-007）。
 */
export class TurboSettingTab extends PluginSettingTab {
	plugin: GitHubTurbo;
	private activeInput?: HTMLInputElement;
	private poolNameEls: HTMLElement[] = [];
	private poolDescEls: HTMLElement[] = [];

	constructor(app: App, plugin: GitHubTurbo) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.poolNameEls = [];
		this.poolDescEls = [];

		new Setting(containerEl).setName('GitHub 加速').setHeading();
		containerEl.createEl('p', {
			text: '改写 GitHub 仓库地址为镜像地址，加速内置社区插件与主题市场。',
		});

		new Setting(containerEl)
			.setName('启用 GitHub 加速')
			.setDesc('关闭后所有 GitHub 请求恢复直连')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.accelerator.enabled)
					.onChange(async (value) => {
						this.plugin.settings.accelerator.enabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('当前镜像')
			.setDesc('故障时自动切换到下一可用镜像；禁用再启用本插件可重置')
			.addText((text) => {
				const active = this.plugin.mirrorStatus.find((s) => s.active);
				text.setValue(active?.label ?? '—');
				text.inputEl.readOnly = true;
				this.activeInput = text.inputEl;
			});

		new Setting(containerEl).setName('镜像池').setHeading();
		containerEl.createEl('p', {
			text: '内置候选按优先级排序，失败时自动按序回退（只读）。',
		});
		this.plugin.mirrorStatus.forEach((status, index) => {
			const setting = new Setting(containerEl)
				.setName(this.poolName(index, status))
				.setDesc(this.poolDesc(status));
			this.poolNameEls.push(setting.nameEl);
			this.poolDescEls.push(setting.descEl);
		});

		new Setting(containerEl)
			.setName('恢复初始状态')
			.setDesc('清理插件的拉黑、失败次数，游标回到第一行主镜像')
			.addButton((button) =>
				button.setButtonText('重置').onClick(() => {
					this.plugin.resetMirrorCursor();
					this.refresh();
				}),
			);
	}

	/** 轮询刷新：仅更新文本节点；设置页不在文档中时跳过。 */
	refresh(): void {
		if (!this.containerEl.isConnected) {
			return;
		}
		const statuses = this.plugin.mirrorStatus;
		const active = statuses.find((s) => s.active);
		if (this.activeInput && active) {
			this.activeInput.value = active.label;
		}
		statuses.forEach((status, index) => {
			this.poolNameEls[index]?.setText(this.poolName(index, status));
			this.poolDescEls[index]?.setText(this.poolDesc(status));
		});
	}

	private poolName(index: number, status: MirrorStatus): string {
		return `镜像 ${index + 1} · ${status.label}`;
	}

	private poolDesc(status: MirrorStatus): string {
		return status.active
			? '当前使用'
			: status.blacklisted
				? '本会话已拉黑'
				: '候选（按顺序回退）';
	}
}
