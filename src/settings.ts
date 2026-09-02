import { App, PluginSettingTab, Setting } from 'obsidian';
import {
	AcceleratorConfig,
	DEFAULT_ACCELERATOR_CONFIG,
	normalizeMirrorBase,
} from './accelerator';
import GitHubTurbo from './main';

export interface TurboSettings {
	/** GitHub 加速配置。 */
	accelerator: AcceleratorConfig;
}

export const DEFAULT_SETTINGS: TurboSettings = {
	accelerator: DEFAULT_ACCELERATOR_CONFIG,
};

/** 设置页（P-001 / T-002）：总开关与镜像源两项，均即时生效（引擎读活配置）。 */
export class TurboSettingTab extends PluginSettingTab {
	plugin: GitHubTurbo;

	constructor(app: App, plugin: GitHubTurbo) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
			.setName('镜像源地址')
			.setDesc(
				'前缀型镜像服务（ghproxy 风格）：改写后 URL = 前缀 + 原始地址，保存时自动补全末尾斜杠',
			)
			.addText((text) =>
				text
					.setPlaceholder('https://gh-proxy.com/')
					.setValue(this.plugin.settings.accelerator.mirrorBase)
					.onChange(async (value) => {
						this.plugin.settings.accelerator.mirrorBase =
							normalizeMirrorBase(value.trim());
						await this.plugin.saveSettings();
					}),
			);
	}
}
