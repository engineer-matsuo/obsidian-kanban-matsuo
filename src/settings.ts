import { App, PluginSettingTab, Setting } from 'obsidian';
import type KanbanPlugin from './main';
import { t } from './lang';

export class KanbanSettingTab extends PluginSettingTab {
	plugin: KanbanPlugin;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Language setting (first, so user can switch before reading the rest)
		new Setting(containerEl).setName(t('settings.language')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.language-desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('auto', t('settings.language-auto'))
					.addOption('en', 'English')
					.addOption('ja', '日本語')
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as 'auto' | 'en' | 'ja';
						await this.plugin.saveSettings();
						// Re-render settings to apply new language
						this.display();
					})
			);

		// Board defaults
		new Setting(containerEl).setName(t('settings.board-defaults')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.default-lanes'))
			.setDesc(t('settings.default-lanes-desc'))
			.addText((text) =>
				text
					.setPlaceholder('To Do, In Progress, Done')
					.setValue(this.plugin.settings.defaultLanes.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.defaultLanes = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.lane-width'))
			.setDesc(t('settings.lane-width-desc'))
			.addText((text) =>
				text
					.setPlaceholder('272')
					.setValue(String(this.plugin.settings.laneWidth))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (num > 0) {
							this.plugin.settings.laneWidth = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// Display
		new Setting(containerEl).setName(t('settings.display')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.show-tags'))
			.setDesc(t('settings.show-tags-desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTags)
					.onChange(async (value) => {
						this.plugin.settings.showTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.show-dates'))
			.setDesc(t('settings.show-dates-desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDates)
					.onChange(async (value) => {
						this.plugin.settings.showDates = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t('settings.show-checkboxes'))
			.setDesc(t('settings.show-checkboxes-desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCheckboxes)
					.onChange(async (value) => {
						this.plugin.settings.showCheckboxes = value;
						await this.plugin.saveSettings();
					})
			);

		// Performance
		new Setting(containerEl).setName(t('settings.performance')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.auto-save-delay'))
			.setDesc(t('settings.auto-save-delay-desc'))
			.addText((text) =>
				text
					.setPlaceholder('500')
					.setValue(String(this.plugin.settings.autoSaveDelay))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (num >= 100) {
							this.plugin.settings.autoSaveDelay = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// Timezone
		new Setting(containerEl)
			.setName(t('settings.timezone'))
			.setDesc(t('settings.timezone-desc'))
			.addDropdown((dropdown) => {
				const zones: [string, string][] = [
					['local', t('settings.timezone-local')],
					['UTC', 'UTC (±0:00)'],
					['Asia/Tokyo', 'JST - 日本標準時 (UTC+9)'],
					['Asia/Shanghai', 'CST - 中国標準時 (UTC+8)'],
					['Asia/Kolkata', 'IST - インド標準時 (UTC+5:30)'],
					['Asia/Seoul', 'KST - 韓国標準時 (UTC+9)'],
					['Asia/Singapore', 'SGT - シンガポール (UTC+8)'],
					['Asia/Bangkok', 'ICT - インドシナ (UTC+7)'],
					['Australia/Sydney', 'AEST - オーストラリア東部 (UTC+10/11)'],
					['Pacific/Auckland', 'NZST - ニュージーランド (UTC+12/13)'],
					['Europe/London', 'GMT/BST - ロンドン (UTC+0/1)'],
					['Europe/Paris', 'CET/CEST - 中央ヨーロッパ (UTC+1/2)'],
					['Europe/Berlin', 'CET/CEST - ベルリン (UTC+1/2)'],
					['Europe/Moscow', 'MSK - モスクワ (UTC+3)'],
					['America/New_York', 'EST/EDT - 米国東部 (UTC-5/-4)'],
					['America/Chicago', 'CST/CDT - 米国中部 (UTC-6/-5)'],
					['America/Denver', 'MST/MDT - 米国山岳部 (UTC-7/-6)'],
					['America/Los_Angeles', 'PST/PDT - 米国太平洋 (UTC-8/-7)'],
					['America/Sao_Paulo', 'BRT - ブラジル (UTC-3)'],
					['Pacific/Honolulu', 'HST - ハワイ (UTC-10)'],
				];
				for (const [value, label] of zones) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(this.plugin.settings.timezone)
					.onChange(async (value) => {
						this.plugin.settings.timezone = value;
						await this.plugin.saveSettings();
					});
			});

		// Input
		new Setting(containerEl).setName(t('settings.input')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.newline-key'))
			.setDesc(t('settings.newline-key-desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('shift+enter', 'Shift + Enter')
					.addOption('ctrl+enter', 'Ctrl + Enter')
					.addOption('alt+enter', 'Alt + Enter')
					.setValue(this.plugin.settings.newlineKey)
					.onChange(async (value) => {
						this.plugin.settings.newlineKey = value as 'shift+enter' | 'ctrl+enter' | 'alt+enter';
						await this.plugin.saveSettings();
					})
			);

		// Templates
		new Setting(containerEl).setName(t('settings.templates')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.board-template'))
			.setDesc(t('settings.board-template-desc'))
			.addText((text) =>
				text
					.setPlaceholder('templates/kanban-template.md')
					.setValue(this.plugin.settings.boardTemplatePath)
					.onChange(async (value) => {
						this.plugin.settings.boardTemplatePath = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
