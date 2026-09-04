import { Plugin } from 'obsidian';
import {
	DEFAULT_ACCELERATOR_CONFIG,
	MirrorStatus,
	RequestUrlAccelerator,
} from './accelerator';
import {
	DEFAULT_SETTINGS,
	TurboSettings,
	TurboSettingTab,
} from './settings';

/** GitHub Turbo：加速 Obsidian 内置社区插件/主题市场的 GitHub 访问（P-001/P-002）。 */
export default class GitHubTurbo extends Plugin {
	settings!: TurboSettings;
	private accelerator = new RequestUrlAccelerator();
	private settingTab?: TurboSettingTab;

	/** 镜像池状态快照（设置页只读展示用）。 */
	get mirrorStatus(): MirrorStatus[] {
		return this.accelerator.getStatus();
	}

	/** 复位镜像切换状态（游标回首项、清空连败与拉黑）。 */
	resetMirrorCursor(): void {
		this.accelerator.resetCursor();
	}

	async onload() {
		await this.loadSettings();

		// 挂载 request-url 频道改写与健康观测；环境不满足时静默跳过。
		this.accelerator.install(() => this.settings.accelerator);

		this.settingTab = new TurboSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		// 设置页镜像状态实时跟随（容器不在文档中时刷新为空操作）。
		this.registerInterval(
			window.setInterval(() => this.settingTab?.refresh(), 1000),
		);
	}

	onunload() {
		this.accelerator.restore();
	}

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<TurboSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// 显式取字段：旧数据的多余键（如已废弃的 mirrorBase）自然忽略（P-002 AC6）。
		this.settings.accelerator = {
			enabled:
				loaded?.accelerator?.enabled ?? DEFAULT_ACCELERATOR_CONFIG.enabled,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
