import {
	Plugin,
	TFile,
	normalizePath,
	FuzzySuggestModal,
	App,
	Notice,
} from 'obsidian';
import { KanbanPluginSettings, DEFAULT_PLUGIN_SETTINGS } from './types';
import { KanbanView, KANBAN_VIEW_TYPE } from './kanban-view';
import { KanbanSettingTab } from './settings';
import { createBoard, boardToMarkdown, createItem } from './parser';
import { setLocale, t } from './lang';

// ---------------------------------------------------------------------------
// Suggest modals
// ---------------------------------------------------------------------------

/**
 * Modal that lets the user pick a lane by name.
 */
class LaneSuggestModal extends FuzzySuggestModal<string> {
	private lanes: string[];
	private onChoose: (lane: string) => void;

	constructor(app: App, lanes: string[], onChoose: (lane: string) => void) {
		super(app);
		this.lanes = lanes;
		this.onChoose = onChoose;
		this.setPlaceholder(t('modal.select-lane'));
	}

	getItems(): string[] {
		return this.lanes;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item);
	}
}

/**
 * Modal that lets the user pick a card by title, across all lanes.
 */
class CardSuggestModal extends FuzzySuggestModal<{ lane: string; card: string }> {
	private items: { lane: string; card: string }[];
	private onChoose: (lane: string, card: string) => void;

	constructor(
		app: App,
		items: { lane: string; card: string }[],
		onChoose: (lane: string, card: string) => void,
	) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder(t('modal.select-card'));
	}

	getItems(): { lane: string; card: string }[] {
		return this.items;
	}

	getItemText(item: { lane: string; card: string }): string {
		return `[${item.lane}] ${item.card}`;
	}

	onChooseItem(item: { lane: string; card: string }): void {
		this.onChoose(item.lane, item.card);
	}
}

/**
 * Simple text-input modal for entering a card title.
 */
class CardTitleModal extends FuzzySuggestModal<string> {
	private onChoose: (title: string) => void;

	constructor(app: App, onChoose: (title: string) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder(t('modal.card-title'));
	}

	getItems(): string[] {
		// No suggestions – user types freely and presses Enter
		return [];
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item);
	}

	// Override to allow submitting a free-form query
	selectSuggestion(): void {
		const value = (this as unknown as { inputEl: HTMLInputElement }).inputEl?.value ?? '';
		if (value.trim()) {
			this.close();
			this.onChoose(value.trim());
		}
	}
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

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
				if (file instanceof TFile && (await this.isKanbanFile(file))) {
					await this.openKanbanView(file);
				}
			}),
		);

		// Command: create new board
		this.addCommand({
			id: 'create-new-board',
			name: t('command.create-new-board'),
			callback: async () => {
				await this.createNewBoard();
			},
		});

		// Command: create board from template
		this.addCommand({
			id: 'create-from-template',
			name: t('command.create-from-template'),
			callback: async () => {
				await this.createNewBoard(true);
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

		// Command: add card to lane
		this.addCommand({
			id: 'add-card-to-lane',
			name: t('command.add-card'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !(file instanceof TFile)) return false;

				const leaves = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
				const activeView = leaves.find(
					(l) => l.view instanceof KanbanView && (l.view as KanbanView).file?.path === file.path,
				)?.view as KanbanView | undefined;

				if (!activeView) return false;

				if (!checking) {
					this.commandAddCardToLane(activeView);
				}
				return true;
			},
		});

		// Command: move card
		this.addCommand({
			id: 'move-card',
			name: t('command.move-card'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !(file instanceof TFile)) return false;

				const leaves = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
				const activeView = leaves.find(
					(l) => l.view instanceof KanbanView && (l.view as KanbanView).file?.path === file.path,
				)?.view as KanbanView | undefined;

				if (!activeView) return false;

				if (!checking) {
					this.commandMoveCard(activeView);
				}
				return true;
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

		// File explorer context menu: "Create kanban board here"
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				menu.addItem((item) => {
					item
						.setTitle(t('command.create-new-board'))
						.setIcon('layout-dashboard')
						.onClick(async () => {
							await this.createNewBoardInFolder(
								file instanceof TFile ? file.parent?.path ?? '' : (file as { path: string }).path,
							);
						});
				});
			}),
		);

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

		// Refresh all open kanban views to apply new settings
		const leaves = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof KanbanView) {
				// Apply plugin settings to the board's own settings
				const board = view.getBoard();
				if (board) {
					board.settings.laneWidth = this.settings.laneWidth;
					board.settings.showTags = this.settings.showTags;
					board.settings.showDates = this.settings.showDates;
					board.settings.showCheckboxes = this.settings.showCheckboxes;
					await view.saveBoard(board);
				}
				view.refresh();
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

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
	 * Build the initial content for a new board.
	 * If `useTemplate` is true and `boardTemplatePath` is configured, reads that
	 * file as the template. Falls back to generating a default board.
	 */
	private async buildNewBoardContent(useTemplate: boolean): Promise<string> {
		if (useTemplate && this.settings.boardTemplatePath) {
			const templatePath = normalizePath(this.settings.boardTemplatePath);
			const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
			if (templateFile instanceof TFile) {
				return await this.app.vault.read(templateFile);
			}
			new Notice(`Template not found: ${templatePath}`);
		}
		const board = createBoard(this.settings.defaultLanes);
		return boardToMarkdown(board);
	}

	/**
	 * Create a new kanban board file, optionally using the configured template.
	 */
	private async createNewBoard(useTemplate = false): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const folder = activeFile ? (activeFile.parent?.path ?? '') : '';
		await this.createNewBoardInFolder(folder, useTemplate);
	}

	/**
	 * Create a new kanban board in a specific folder path.
	 */
	private async createNewBoardInFolder(folder: string, useTemplate = false): Promise<void> {
		const content = await this.buildNewBoardContent(useTemplate);

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

	/**
	 * "Add card to lane" command implementation.
	 * Opens a lane picker, then prompts for card title.
	 */
	private commandAddCardToLane(view: KanbanView): void {
		const board = view.getBoard();
		if (!board) {
			new Notice(t('modal.select-lane'));
			return;
		}

		const laneNames = board.lanes.map((l) => l.title);
		if (laneNames.length === 0) return;

		new LaneSuggestModal(this.app, laneNames, (selectedLane) => {
			// After the lane is chosen, ask for the card title
			const cardModal = new CardTitleModal(this.app, async (cardTitle) => {
				if (!cardTitle) return;
				const lane = board.lanes.find((l) => l.title === selectedLane);
				if (!lane) return;

				const item = createItem(cardTitle);
				lane.items.push(item);
				await view.saveBoard(board);
				view.refresh();
			});
			cardModal.open();
		}).open();
	}

	/**
	 * "Move card" command implementation.
	 * Opens a card picker across all lanes, then a target lane picker.
	 */
	private commandMoveCard(view: KanbanView): void {
		const board = view.getBoard();
		if (!board) return;

		// Build flat list of all cards
		const cardItems: { lane: string; card: string }[] = [];
		for (const lane of board.lanes) {
			for (const item of lane.items) {
				if (!item.archived) {
					cardItems.push({ lane: lane.title, card: item.title });
				}
			}
		}
		if (cardItems.length === 0) return;

		new CardSuggestModal(this.app, cardItems, (sourceLaneName, cardTitle) => {
			const laneNames = board.lanes.map((l) => l.title);
			new LaneSuggestModal(this.app, laneNames, async (targetLaneName) => {
				if (sourceLaneName === targetLaneName) return;

				const sourceLane = board.lanes.find((l) => l.title === sourceLaneName);
				const targetLane = board.lanes.find((l) => l.title === targetLaneName);
				if (!sourceLane || !targetLane) return;

				const cardIndex = sourceLane.items.findIndex((i) => i.title === cardTitle);
				if (cardIndex === -1) return;

				const [movedCard] = sourceLane.items.splice(cardIndex, 1);
				targetLane.items.push(movedCard);

				await view.saveBoard(board);
				view.refresh();
			}).open();
		}).open();
	}
}
