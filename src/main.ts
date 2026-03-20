import {
	Plugin,
	TFile,
	normalizePath,
} from 'obsidian';
import { KanbanPluginSettings, DEFAULT_PLUGIN_SETTINGS } from './types';
import { KanbanView, KANBAN_VIEW_TYPE } from './kanban-view';
import { KanbanSettingTab } from './settings';
import { createBoard, boardToMarkdown } from './parser';
import { setLocale, t } from './lang';

export default class KanbanPlugin extends Plugin {
	settings: KanbanPluginSettings = DEFAULT_PLUGIN_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		setLocale(this.settings.language);

		// Register the kanban view
		this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));

		// Register markdown post processor to detect kanban files
		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (file instanceof TFile && await this.isKanbanFile(file)) {
					await this.openKanbanView(file);
				}
			})
		);

		// Command: create new board
		this.addCommand({
			id: 'create-new-board',
			name: t('command.create-new-board'),
			callback: async () => {
				await this.createNewBoard();
			},
		});

		// Command: toggle board view
		this.addCommand({
			id: 'toggle-board-view',
			name: t('command.toggle-board-view'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (file instanceof TFile && file.extension === 'md') {
					if (!checking) {
						this.toggleKanbanView(file);
					}
					return true;
				}
				return false;
			},
		});

		// Ribbon icon (left sidebar)
		this.addRibbonIcon('layout-dashboard', t('command.create-new-board'), async () => {
			await this.createNewBoard();
		});

		// Settings tab
		this.addSettingTab(new KanbanSettingTab(this.app, this));

		// Register extensions for .kanban.md files
		this.registerExtensions(['kanban'], KANBAN_VIEW_TYPE);
	}

	async onunload(): Promise<void> {
		// Views are automatically cleaned up by Obsidian
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		setLocale(this.settings.language);
	}

	/**
	 * Check if a file is a kanban board by reading its frontmatter.
	 */
	private async isKanbanFile(file: TFile): Promise<boolean> {
		if (file.extension !== 'md') return false;
		const content = await this.app.vault.read(file);
		return content.includes('kanban-plugin: kanban-matsuo');
	}

	/**
	 * Open the kanban view for a given file.
	 */
	async openKanbanView(file: TFile): Promise<void> {
		const existingLeaves = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
		for (const leaf of existingLeaves) {
			const view = leaf.view;
			if (view instanceof KanbanView) {
				await view.loadFile(file);
				this.app.workspace.revealLeaf(leaf);
				return;
			}
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: KANBAN_VIEW_TYPE,
			active: true,
		});

		const view = leaf.view;
		if (view instanceof KanbanView) {
			await view.loadFile(file);
		}
	}

	/**
	 * Toggle between markdown and kanban view.
	 */
	private async toggleKanbanView(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (!leaf) return;

		if (leaf.view instanceof KanbanView) {
			// Switch to markdown view
			await leaf.setViewState({
				type: 'markdown',
				state: { file: file.path },
			});
		} else {
			// Switch to kanban view
			await this.openKanbanView(file);
		}
	}

	/**
	 * Create a new kanban board file.
	 */
	private async createNewBoard(): Promise<void> {
		const board = createBoard(this.settings.defaultLanes);
		const content = boardToMarkdown(board);

		const activeFile = this.app.workspace.getActiveFile();
		const folder = activeFile ? activeFile.parent?.path || '' : '';
		const baseName = t('board.kanban-board');
		let fileName = `${baseName}.md`;
		let counter = 1;

		// Avoid name collision
		while (this.app.vault.getAbstractFileByPath(normalizePath(`${folder}/${fileName}`))) {
			fileName = `${baseName} ${counter}.md`;
			counter++;
		}

		const filePath = normalizePath(folder ? `${folder}/${fileName}` : fileName);
		const file = await this.app.vault.create(filePath, content);

		if (file instanceof TFile) {
			await this.openKanbanView(file);
		}
	}
}
