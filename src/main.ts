import { Notice, Plugin } from 'obsidian';
import { RequestUrlAccelerator } from './accelerator/accelerator';
import { DEFAULT_SETTINGS, TurboSettingTab, TurboSettings } from './settings';

/**
 * GitHub Turbo — accelerate GitHub access for Obsidian's built-in community
 * plugin & theme marketplace (mirror URL rewriting).
 */
export default class GitHubTurbo extends Plugin {
  settings!: TurboSettings;
  private accelerator = new RequestUrlAccelerator();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TurboSettingTab(this.app, this));
    // Mount the channel wrapper; an environment without the IPC bridge (or a
    // changed structure) stays unmounted silently — every request direct.
    this.accelerator.install();
    // Session reset: cursor to the first mirror, streaks and blacklists
    // cleared so a blacklisted mirror gets a fresh chance.
    this.accelerator.reset();
    this.addCommand({
      id: 'switch-next-mirror',
      // Obsidian prefixes the plugin name in the palette automatically, so
      // the name field carries only the command part.
      name: 'Switch to next GitHub mirror',
      callback: () => {
        const mirror = this.accelerator.switchNext();
        new Notice(
          mirror ? `Switched to ${mirror}` : 'All mirrors are blacklisted',
        );
      },
    });
  }

  onunload() {
    this.accelerator.restore();
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<TurboSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
