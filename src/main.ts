import { Plugin } from 'obsidian';
import {
	DEFAULT_ACCELERATOR_CONFIG,
	RequestUrlAccelerator,
} from './accelerator';
import {
	DEFAULT_SETTINGS,
	TurboSettings,
	TurboSettingTab,
} from './settings';

/** GitHub Turbo：加速 Obsidian 内置社区插件/主题市场的 GitHub 访问（P-001）。 */
export default class GitHubTurbo extends Plugin {
	settings!: TurboSettings;
	private accelerator = new RequestUrlAccelerator();

	async onload() {
		await this.loadSettings();

		// 挂载 request-url 频道改写；环境不满足时静默跳过，不破坏原生功能。
		this.accelerator.install(() => this.settings.accelerator);

		this.addSettingTab(new TurboSettingTab(this.app, this));
	}

	onunload() {
		this.accelerator.restore();
	}

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<TurboSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// 嵌套配置做防御性合并，避免旧数据缺键时丢默认值。
		this.settings.accelerator = Object.assign(
			{},
			DEFAULT_ACCELERATOR_CONFIG,
			loaded?.accelerator,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
