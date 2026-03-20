import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Menu,
	Modal,
	Setting,
	setIcon,
} from 'obsidian';
import type KanbanPlugin from './main';
import {
	KanbanBoard,
	KanbanLane,
	KanbanItem,
} from './types';
import {
	parseMarkdown,
	boardToMarkdown,
	createItem,
	createLane,
	extractTags,
	extractDate,
} from './parser';
import { t } from './lang';

export const KANBAN_VIEW_TYPE = 'kanban-matsuo-view';

export class KanbanView extends ItemView {
	private plugin: KanbanPlugin;
	private board: KanbanBoard | null = null;
	private file: TFile | null = null;
	private saveTimeout: number | null = null;
	private boardEl: HTMLElement | null = null;

	// Drag state
	private draggedItem: KanbanItem | null = null;
	private draggedFromLane: KanbanLane | null = null;
	private dragPlaceholder: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: KanbanPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return KANBAN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : t('board.kanban-board');
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('kanban-matsuo-container');
	}

	async onClose(): Promise<void> {
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
	}

	async loadFile(file: TFile): Promise<void> {
		this.file = file;
		const content = await this.app.vault.read(file);
		this.board = parseMarkdown(content);
		this.render();
	}

	private scheduleSave(): void {
		if (this.saveTimeout !== null) {
			window.clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = window.setTimeout(() => {
			this.save();
		}, this.plugin.settings.autoSaveDelay);
	}

	private async save(): Promise<void> {
		if (!this.board || !this.file) return;
		const board = this.board;
		await this.app.vault.process(this.file, () => boardToMarkdown(board));
	}

	private render(): void {
		if (!this.board) return;

		this.contentEl.empty();
		this.contentEl.addClass('kanban-matsuo-container');

		const toolbar = this.contentEl.createDiv({ cls: 'kanban-matsuo-toolbar' });
		this.renderToolbar(toolbar);

		this.boardEl = this.contentEl.createDiv({ cls: 'kanban-matsuo-board' });

		for (const lane of this.board.lanes) {
			this.renderLane(this.boardEl, lane);
		}

		this.renderAddLaneButton(this.boardEl);
	}

	private renderToolbar(container: HTMLElement): void {
		const searchInput = container.createEl('input', {
			cls: 'kanban-matsuo-search',
			attr: {
				type: 'text',
				placeholder: t('board.search-cards'),
				'aria-label': t('board.search-cards'),
			},
		});

		searchInput.addEventListener('input', () => {
			this.filterCards(searchInput.value);
		});
	}

	private renderLane(container: HTMLElement, lane: KanbanLane): void {
		const laneEl = container.createDiv({
			cls: 'kanban-matsuo-lane',
			attr: {
				'data-lane-id': lane.id,
				role: 'region',
				'aria-label': `${lane.title}`,
			},
		});
		laneEl.style.setProperty('--lane-width', `${this.board!.settings.laneWidth}px`);

		const headerEl = laneEl.createDiv({ cls: 'kanban-matsuo-lane-header' });

		const collapseBtn = headerEl.createEl('button', {
			cls: 'kanban-matsuo-collapse-btn clickable-icon',
			attr: {
				'aria-label': lane.collapsed ? t('lane.expand') : t('lane.collapse'),
				'data-tooltip-position': 'top',
			},
		});
		setIcon(collapseBtn, lane.collapsed ? 'chevron-right' : 'chevron-down');
		collapseBtn.addEventListener('click', () => {
			lane.collapsed = !lane.collapsed;
			this.render();
			this.scheduleSave();
		});

		const titleEl = headerEl.createEl('h3', {
			cls: 'kanban-matsuo-lane-title',
			text: lane.title,
			attr: {
				'aria-label': t('lane.edit-title'),
				contenteditable: 'true',
			},
		});
		titleEl.addEventListener('blur', () => {
			const newTitle = titleEl.textContent?.trim() || lane.title;
			if (newTitle !== lane.title) {
				lane.title = newTitle;
				this.scheduleSave();
			}
		});
		titleEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				titleEl.blur();
			}
		});

		const countEl = headerEl.createSpan({
			cls: 'kanban-matsuo-lane-count',
			text: `${lane.items.filter((i) => !i.archived).length}`,
		});

		if (lane.wipLimit > 0) {
			const activeCount = lane.items.filter((i) => !i.archived).length;
			if (activeCount >= lane.wipLimit) {
				countEl.addClass('kanban-matsuo-wip-exceeded');
			}
			countEl.setText(`${activeCount}/${lane.wipLimit}`);
		}

		const menuBtn = headerEl.createEl('button', {
			cls: 'kanban-matsuo-lane-menu clickable-icon',
			attr: {
				'aria-label': t('lane.options'),
				'data-tooltip-position': 'top',
			},
		});
		setIcon(menuBtn, 'more-vertical');
		menuBtn.addEventListener('click', (e) => {
			this.showLaneMenu(e, lane);
		});

		if (!lane.collapsed) {
			const listEl = laneEl.createDiv({
				cls: 'kanban-matsuo-card-list',
				attr: {
					'data-lane-id': lane.id,
					role: 'list',
				},
			});

			listEl.addEventListener('dragover', (e) => {
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
				this.handleDragOver(e, listEl);
			});

			listEl.addEventListener('dragleave', () => {
				this.removePlaceholder();
			});

			listEl.addEventListener('drop', (e) => {
				e.preventDefault();
				this.handleDrop(lane, listEl);
			});

			for (const item of lane.items) {
				if (!item.archived) {
					this.renderCard(listEl, item, lane);
				}
			}

			this.renderAddCardInput(laneEl, lane);
		}
	}

	private renderCard(container: HTMLElement, item: KanbanItem, lane: KanbanLane): void {
		const cardEl = container.createDiv({
			cls: 'kanban-matsuo-card',
			attr: {
				'data-item-id': item.id,
				draggable: 'true',
				role: 'listitem',
				tabindex: '0',
				'aria-label': item.title,
			},
		});

		if (item.checked) {
			cardEl.addClass('kanban-matsuo-card-checked');
		}

		cardEl.addEventListener('dragstart', (e) => {
			this.draggedItem = item;
			this.draggedFromLane = lane;
			cardEl.addClass('kanban-matsuo-card-dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', item.id);
			}
		});

		cardEl.addEventListener('dragend', () => {
			cardEl.removeClass('kanban-matsuo-card-dragging');
			this.draggedItem = null;
			this.draggedFromLane = null;
			this.removePlaceholder();
		});

		cardEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.startInlineEdit(cardEl, item);
			} else if (e.key === 'Delete' || e.key === 'Backspace') {
				if (e.shiftKey) {
					e.preventDefault();
					this.deleteItem(item, lane);
				}
			}
		});

		cardEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this.showCardMenu(e, item, lane);
		});

		if (this.board!.settings.showCheckboxes) {
			const checkboxEl = cardEl.createEl('input', {
				cls: 'kanban-matsuo-card-checkbox task-list-item-checkbox',
				attr: {
					type: 'checkbox',
					'aria-label': item.checked
						? t('card.mark-as-incomplete', { title: item.title })
						: t('card.mark-as-complete', { title: item.title }),
				},
			});
			(checkboxEl as HTMLInputElement).checked = item.checked;
			checkboxEl.addEventListener('change', () => {
				item.checked = (checkboxEl as HTMLInputElement).checked;
				cardEl.toggleClass('kanban-matsuo-card-checked', item.checked);
				this.scheduleSave();
			});
		}

		const bodyEl = cardEl.createDiv({ cls: 'kanban-matsuo-card-body' });

		const titleEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-title' });
		const displayTitle = item.title
			.replace(/#[^\s#]+/g, '')
			.replace(/@\{\d{4}-\d{2}-\d{2}\}/g, '')
			.trim();
		titleEl.setText(displayTitle || item.title);

		titleEl.addEventListener('dblclick', () => {
			this.startInlineEdit(cardEl, item);
		});

		if (this.board!.settings.showTags && item.tags.length > 0) {
			const tagsEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-tags' });
			for (const tag of item.tags) {
				tagsEl.createSpan({
					cls: 'kanban-matsuo-tag',
					text: `#${tag}`,
				});
			}
		}

		if (this.board!.settings.showDates && item.dueDate) {
			const dateEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-date' });
			const today = new Date().toISOString().slice(0, 10);
			if (item.dueDate < today) {
				dateEl.addClass('kanban-matsuo-date-overdue');
			} else if (item.dueDate === today) {
				dateEl.addClass('kanban-matsuo-date-today');
			}
			dateEl.setText(`📅 ${item.dueDate}`);
		}
	}

	private renderAddCardInput(laneEl: HTMLElement, lane: KanbanLane): void {
		const inputContainer = laneEl.createDiv({ cls: 'kanban-matsuo-add-card' });

		const input = inputContainer.createEl('input', {
			cls: 'kanban-matsuo-add-card-input',
			attr: {
				type: 'text',
				placeholder: t('card.add'),
				'aria-label': t('card.add-to', { lane: lane.title }),
			},
		});

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				const value = (input as HTMLInputElement).value.trim();
				if (value) {
					const item = createItem(value);
					lane.items.push(item);
					(input as HTMLInputElement).value = '';
					this.render();
					this.scheduleSave();
				}
			}
		});
	}

	private renderAddLaneButton(container: HTMLElement): void {
		const addLaneEl = container.createDiv({ cls: 'kanban-matsuo-add-lane' });
		const addBtn = addLaneEl.createEl('button', {
			cls: 'kanban-matsuo-add-lane-btn',
			text: t('board.add-lane'),
			attr: {
				'aria-label': t('board.add-lane'),
				'data-tooltip-position': 'top',
			},
		});

		addBtn.addEventListener('click', () => {
			const newLane = createLane(t('board.new-lane'));
			this.board!.lanes.push(newLane);
			this.render();
			this.scheduleSave();

			const laneEls = this.boardEl!.querySelectorAll('.kanban-matsuo-lane-title');
			const lastTitle = laneEls[laneEls.length - 1] as HTMLElement;
			if (lastTitle) {
				lastTitle.focus();
				const range = document.createRange();
				range.selectNodeContents(lastTitle);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
		});
	}

	private startInlineEdit(cardEl: HTMLElement, item: KanbanItem): void {
		const titleEl = cardEl.querySelector('.kanban-matsuo-card-title') as HTMLElement;
		if (!titleEl) return;

		const parent = titleEl.parentElement;
		if (!parent) return;

		const input = parent.createEl('input', {
			cls: 'kanban-matsuo-inline-edit',
			attr: {
				type: 'text',
				value: item.title,
				'aria-label': t('card.edit-title'),
			},
		});
		(input as HTMLInputElement).value = item.title;

		titleEl.replaceWith(input);
		input.focus();
		(input as HTMLInputElement).select();

		const finishEdit = () => {
			const newTitle = (input as HTMLInputElement).value.trim();
			if (newTitle && newTitle !== item.title) {
				item.title = newTitle;
				item.tags = extractTags(newTitle);
				item.dueDate = extractDate(newTitle);
				this.scheduleSave();
			}
			this.render();
		};

		input.addEventListener('blur', finishEdit);
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				(input as HTMLInputElement).blur();
			} else if (e.key === 'Escape') {
				(input as HTMLInputElement).value = item.title;
				(input as HTMLInputElement).blur();
			}
		});
	}

	private handleDragOver(e: DragEvent, listEl: HTMLElement): void {
		if (!this.draggedItem) return;

		this.removePlaceholder();

		this.dragPlaceholder = listEl.createDiv({ cls: 'kanban-matsuo-drop-placeholder' });
		this.dragPlaceholder.remove();

		const afterEl = this.getDragAfterElement(listEl, e.clientY);

		if (afterEl) {
			listEl.insertBefore(this.dragPlaceholder, afterEl);
		} else {
			listEl.appendChild(this.dragPlaceholder);
		}
	}

	private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
		const cards = Array.from(
			container.querySelectorAll('.kanban-matsuo-card:not(.kanban-matsuo-card-dragging)')
		) as HTMLElement[];

		let closest: { offset: number; element: HTMLElement | null } = {
			offset: Number.POSITIVE_INFINITY,
			element: null,
		};

		for (const card of cards) {
			const box = card.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;
			if (offset < 0 && offset > -closest.offset) {
				closest = { offset: -offset, element: card };
			}
		}

		return closest.element;
	}

	private handleDrop(targetLane: KanbanLane, listEl: HTMLElement): void {
		if (!this.draggedItem || !this.draggedFromLane || !this.board) return;

		const sourceIndex = this.draggedFromLane.items.indexOf(this.draggedItem);
		if (sourceIndex >= 0) {
			this.draggedFromLane.items.splice(sourceIndex, 1);
		}

		let targetIndex = targetLane.items.filter((i) => !i.archived).length;
		if (this.dragPlaceholder) {
			const placeholderIndex = Array.from(listEl.children).indexOf(this.dragPlaceholder);
			if (placeholderIndex >= 0) {
				targetIndex = placeholderIndex;
			}
		}

		targetLane.items.splice(targetIndex, 0, this.draggedItem);

		this.removePlaceholder();
		this.render();
		this.scheduleSave();
	}

	private removePlaceholder(): void {
		if (this.dragPlaceholder) {
			this.dragPlaceholder.remove();
			this.dragPlaceholder = null;
		}
	}

	private deleteItem(item: KanbanItem, lane: KanbanLane): void {
		const index = lane.items.indexOf(item);
		if (index >= 0) {
			lane.items.splice(index, 1);
			this.render();
			this.scheduleSave();
		}
	}

	private showMenuAtEvent(menu: Menu, e: MouseEvent | Event): void {
		if (e instanceof MouseEvent) {
			menu.showAtMouseEvent(e);
		} else if (e.target instanceof HTMLElement) {
			const rect = e.target.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		}
	}

	private showCardMenu(e: MouseEvent | Event, item: KanbanItem, lane: KanbanLane): void {
		const menu = new Menu();

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(t('card.edit'))
				.setIcon('pencil')
				.onClick(() => {
					const cardEl = this.boardEl?.querySelector(
						`[data-item-id="${item.id}"]`
					) as HTMLElement;
					if (cardEl) {
						this.startInlineEdit(cardEl, item);
					}
				});
		});

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(item.checked ? t('card.mark-incomplete') : t('card.mark-complete'))
				.setIcon(item.checked ? 'square' : 'check-square')
				.onClick(() => {
					item.checked = !item.checked;
					this.render();
					this.scheduleSave();
				});
		});

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(t('card.archive'))
				.setIcon('archive')
				.onClick(() => {
					item.archived = true;
					this.render();
					this.scheduleSave();
				});
		});

		menu.addSeparator();

		if (this.board) {
			for (const targetLane of this.board.lanes) {
				if (targetLane.id === lane.id) continue;
				menu.addItem((menuItem) => {
					menuItem
						.setTitle(t('card.move-to', { lane: targetLane.title }))
						.setIcon('arrow-right')
						.onClick(() => {
							const index = lane.items.indexOf(item);
							if (index >= 0) {
								lane.items.splice(index, 1);
								targetLane.items.push(item);
								this.render();
								this.scheduleSave();
							}
						});
				});
			}
		}

		menu.addSeparator();

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(t('card.delete'))
				.setIcon('trash')
				.onClick(() => {
					this.deleteItem(item, lane);
				});
		});

		this.showMenuAtEvent(menu, e);
	}

	private showLaneMenu(e: MouseEvent | Event, lane: KanbanLane): void {
		const menu = new Menu();

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(t('lane.set-wip-limit'))
				.setIcon('alert-circle')
				.onClick(() => {
					new WipLimitModal(this.app, lane, (limit) => {
						lane.wipLimit = limit;
						this.render();
						this.scheduleSave();
					}).open();
				});
		});

		menu.addSeparator();

		menu.addItem((menuItem) => {
			menuItem
				.setTitle(t('lane.delete'))
				.setIcon('trash')
				.onClick(() => {
					const activeItems = lane.items.filter((i) => !i.archived).length;
					if (activeItems > 0) {
						new ConfirmDeleteModal(this.app, lane.title, activeItems, () => {
							this.performLaneDelete(lane);
						}).open();
					} else {
						this.performLaneDelete(lane);
					}
				});
		});

		this.showMenuAtEvent(menu, e);
	}

	private performLaneDelete(lane: KanbanLane): void {
		if (!this.board) return;
		const index = this.board.lanes.indexOf(lane);
		if (index >= 0) {
			this.board.lanes.splice(index, 1);
			this.render();
			this.scheduleSave();
		}
	}

	private filterCards(query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		const cards = this.boardEl?.querySelectorAll('.kanban-matsuo-card') as NodeListOf<HTMLElement>;

		if (!cards) return;

		cards.forEach((cardEl) => {
			const text = cardEl.textContent?.toLowerCase() || '';
			const match = !normalizedQuery || text.includes(normalizedQuery);
			cardEl.toggleClass('kanban-matsuo-card-hidden', !match);
		});
	}
}

class WipLimitModal extends Modal {
	private lane: KanbanLane;
	private onSubmit: (limit: number) => void;

	constructor(app: import('obsidian').App, lane: KanbanLane, onSubmit: (limit: number) => void) {
		super(app);
		this.lane = lane;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: t('modal.wip-limit-title') });

		new Setting(contentEl)
			.setName(t('modal.wip-limit-name'))
			.setDesc(t('modal.wip-limit-desc'))
			.addText((text) => {
				text.setValue(String(this.lane.wipLimit || ''));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.inputEl.setAttribute('aria-label', t('modal.wip-limit-label'));
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						this.submit(text.getValue());
					}
				});
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText(t('modal.save'))
					.setCta()
					.onClick(() => {
						const input = contentEl.querySelector('input') as HTMLInputElement;
						this.submit(input?.value || '0');
					});
			})
			.addButton((btn) => {
				btn.setButtonText(t('modal.cancel')).onClick(() => this.close());
			});
	}

	private submit(value: string): void {
		const limit = parseInt(value, 10) || 0;
		this.onSubmit(limit);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ConfirmDeleteModal extends Modal {
	private cardCount: number;
	private onConfirm: () => void;

	constructor(app: import('obsidian').App, _laneTitle: string, cardCount: number, onConfirm: () => void) {
		super(app);
		this.cardCount = cardCount;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: t('modal.delete-lane-title') });
		contentEl.createEl('p', {
			text: t('lane.delete-confirm', { count: this.cardCount }),
		});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText(t('modal.delete'))
					.setWarning()
					.onClick(() => {
						this.onConfirm();
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText(t('modal.cancel')).onClick(() => this.close());
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
