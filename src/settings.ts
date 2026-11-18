import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import GitHubTurbo from './main';

/** Stored settings shape — no configurable items yet; the rewrite fills this in. */
export type TurboSettings = Record<string, unknown>;

export const DEFAULT_SETTINGS: TurboSettings = {};

/**
 * Plugin settings page via the declarative settings API (1.13+): Obsidian
 * renders the tab from these definitions — no display() override. Real
 * settings come with the rewrite.
 */
export class TurboSettingTab extends PluginSettingTab {
  plugin: GitHubTurbo;

  constructor(app: App, plugin: GitHubTurbo) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }
}
