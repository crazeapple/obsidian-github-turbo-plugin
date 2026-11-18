import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, TurboSettingTab, TurboSettings } from './settings';

/**
 * GitHub Turbo — accelerate GitHub access for Obsidian's built-in community
 * plugin & theme marketplace (mirror URL rewriting).
 */
export default class GitHubTurbo extends Plugin {
  settings!: TurboSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TurboSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<TurboSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
