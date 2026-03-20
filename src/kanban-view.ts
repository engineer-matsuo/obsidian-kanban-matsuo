import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Menu,
	Modal,
	Setting,
	setIcon,
	MarkdownRenderer,
	normalizePath,
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

type FilterMode = 'none' | 'tag' | 'date';

export class KanbanView extends ItemView {
	private plugin: KanbanPlugin;
	private board: KanbanBoard | null = null;
	file: TFile | null = null;
	private saveTimeout: number | null = null;
	private boardEl: HTMLElement | null = null;

	// Drag state (cards)
	private draggedItem: KanbanItem | null = null;
	private draggedFromLane: KanbanLane | null = null;
	private dragPlaceholder: HTMLElement | null = null;

	// Drag state (lanes)
	private draggedLane: KanbanLane | null = null;

	// Touch drag state
	private touchStartY = 0;
	private touchStartX = 0;

	// Filter state
	private filterMode: FilterMode = 'none';
	private filterValue = '';

	// External change detection
	private ignoreNextModify = false;

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

		// File change detection via registerEvent (auto-cleanup on view close)
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				if (this.ignoreNextModify) {
					this.ignoreNextModify = false;
					return;
				}
				if (file instanceof TFile && this.file && file.path === this.file.path) {
					await this.loadFile(file);
				}
			})
		);
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

	/** Public accessor for commands in main.ts */
	getBoard(): KanbanBoard | null {
		return this.board;
	}

	/** Public accessor for commands in main.ts */
	getFile(): TFile | null {
		return this.file;
	}

	/** Save a board state and re-render (for use by commands in main.ts) */
	async saveBoard(board: KanbanBoard): Promise<void> {
		this.board = board;
		if (!this.file) return;
		this.ignoreNextModify = true;
		await this.app.vault.process(this.file, () => boardToMarkdown(board));
	}

	/** Re-render the view (for use by commands in main.ts) */
	refresh(): void {
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
		this.ignoreNextModify = true;
		const board = this.board;
		await this.app.vault.process(this.file, () => boardToMarkdown(board));
	}

	private render(): void {
		if (!this.board) return;

		this.contentEl.empty();
		this.contentEl.addClass('kanban-matsuo-container');
		this.contentEl.setAttribute('role', 'application');
		this.contentEl.setAttribute('aria-label', t('board.kanban-board'));

		const toolbar = this.contentEl.createDiv({ cls: 'kanban-matsuo-toolbar' });
		this.renderToolbar(toolbar);

		this.boardEl = this.contentEl.createDiv({
			cls: 'kanban-matsuo-board',
			attr: { 'aria-live': 'polite' },
		});

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
			this.filterMode = 'none';
			this.filterValue = '';
			this.filterCards(searchInput.value);
		});

		// Tag filter
		const tagFilterBtn = container.createEl('button', {
			cls: 'kanban-matsuo-filter-btn clickable-icon',
			attr: { 'aria-label': t('filter.by-tag'), 'data-tooltip-position': 'top' },
		});
		setIcon(tagFilterBtn, 'tag');
		tagFilterBtn.addEventListener('click', (e) => this.showTagFilterMenu(e));

		// Date filter
		const dateFilterBtn = container.createEl('button', {
			cls: 'kanban-matsuo-filter-btn clickable-icon',
			attr: { 'aria-label': t('filter.by-date'), 'data-tooltip-position': 'top' },
		});
		setIcon(dateFilterBtn, 'calendar');
		dateFilterBtn.addEventListener('click', (e) => this.showDateFilterMenu(e));

		// Clear filter button
		if (this.filterMode !== 'none') {
			const clearBtn = container.createEl('button', {
				cls: 'kanban-matsuo-filter-clear clickable-icon',
				attr: { 'aria-label': t('filter.clear'), 'data-tooltip-position': 'top' },
			});
			setIcon(clearBtn, 'x');
			clearBtn.addEventListener('click', () => {
				this.filterMode = 'none';
				this.filterValue = '';
				this.render();
			});
		}
	}

	private showTagFilterMenu(e: MouseEvent | Event): void {
		if (!this.board) return;
		const menu = new Menu();
		const allTags = new Set<string>();
		for (const lane of this.board.lanes) {
			for (const item of lane.items) {
				if (!item.archived) item.tags.forEach((tag) => allTags.add(tag));
			}
		}

		menu.addItem((mi) => mi.setTitle(t('filter.all')).setIcon('list').onClick(() => {
			this.filterMode = 'none'; this.filterValue = ''; this.render();
		}));
		for (const tag of allTags) {
			menu.addItem((mi) => mi.setTitle(`#${tag}`).setIcon('tag').onClick(() => {
				this.filterMode = 'tag'; this.filterValue = tag; this.render();
			}));
		}
		this.showMenuAtEvent(menu, e);
	}

	private showDateFilterMenu(e: MouseEvent | Event): void {
		const menu = new Menu();
		const items: [string, string, string][] = [
			[t('filter.all'), 'list', ''],
			[t('filter.overdue'), 'alert-circle', 'overdue'],
			[t('filter.today'), 'calendar', 'today'],
			[t('filter.this-week'), 'calendar-range', 'week'],
			[t('filter.no-date'), 'calendar-off', 'none'],
		];
		for (const [title, icon, val] of items) {
			menu.addItem((mi) => mi.setTitle(title).setIcon(icon).onClick(() => {
				this.filterMode = val ? 'date' : 'none';
				this.filterValue = val;
				this.render();
			}));
		}
		this.showMenuAtEvent(menu, e);
	}

	private isItemVisible(item: KanbanItem): boolean {
		if (item.archived) return false;
		if (this.filterMode === 'none') return true;
		if (this.filterMode === 'tag') return item.tags.includes(this.filterValue);
		if (this.filterMode === 'date') {
			const today = new Date().toISOString().slice(0, 10);
			switch (this.filterValue) {
				case 'overdue': return item.dueDate !== null && item.dueDate < today;
				case 'today': return item.dueDate === today;
				case 'week': {
					if (!item.dueDate) return false;
					const d = new Date(today); d.setDate(d.getDate() + 7);
					return item.dueDate >= today && item.dueDate <= d.toISOString().slice(0, 10);
				}
				case 'none': return item.dueDate === null;
			}
		}
		return true;
	}

	private renderLane(container: HTMLElement, lane: KanbanLane): void {
		const laneEl = container.createDiv({
			cls: 'kanban-matsuo-lane',
			attr: { 'data-lane-id': lane.id, role: 'region', 'aria-label': lane.title },
		});
		laneEl.style.setProperty('--lane-width', `${this.board!.settings.laneWidth}px`);

		const headerEl = laneEl.createDiv({ cls: 'kanban-matsuo-lane-header' });

		// Lane drag handle
		const dragHandle = headerEl.createEl('button', {
			cls: 'kanban-matsuo-lane-drag-handle clickable-icon',
			attr: { 'aria-label': t('lane.drag-handle'), draggable: 'true', 'data-tooltip-position': 'top' },
		});
		setIcon(dragHandle, 'grip-vertical');

		dragHandle.addEventListener('dragstart', (e) => {
			this.draggedLane = lane;
			laneEl.addClass('kanban-matsuo-lane-dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', lane.id);
			}
		});
		dragHandle.addEventListener('dragend', () => {
			laneEl.removeClass('kanban-matsuo-lane-dragging');
			this.draggedLane = null;
		});

		laneEl.addEventListener('dragover', (e) => {
			if (this.draggedLane && this.draggedLane.id !== lane.id) {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			}
		});
		laneEl.addEventListener('drop', (e) => {
			if (this.draggedLane && this.board) {
				e.preventDefault();
				const fromIdx = this.board.lanes.indexOf(this.draggedLane);
				const toIdx = this.board.lanes.indexOf(lane);
				if (fromIdx >= 0 && toIdx >= 0) {
					this.board.lanes.splice(fromIdx, 1);
					this.board.lanes.splice(toIdx, 0, this.draggedLane);
					this.render();
					this.scheduleSave();
				}
			}
		});

		// Touch drag for lane reorder
		this.setupTouchDrag(dragHandle, laneEl, lane);

		const collapseBtn = headerEl.createEl('button', {
			cls: 'kanban-matsuo-collapse-btn clickable-icon',
			attr: { 'aria-label': lane.collapsed ? t('lane.expand') : t('lane.collapse'), 'data-tooltip-position': 'top' },
		});
		setIcon(collapseBtn, lane.collapsed ? 'chevron-right' : 'chevron-down');
		collapseBtn.addEventListener('click', () => { lane.collapsed = !lane.collapsed; this.render(); this.scheduleSave(); });

		const titleEl = headerEl.createEl('h3', {
			cls: 'kanban-matsuo-lane-title', text: lane.title,
			attr: { 'aria-label': t('lane.edit-title'), contenteditable: 'true' },
		});
		titleEl.addEventListener('blur', () => {
			const newTitle = titleEl.textContent?.trim() || lane.title;
			if (newTitle !== lane.title) { lane.title = newTitle; this.scheduleSave(); }
		});
		titleEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); titleEl.blur(); } });

		const countEl = headerEl.createSpan({
			cls: 'kanban-matsuo-lane-count',
			text: `${lane.items.filter((i) => !i.archived).length}`,
		});
		if (lane.wipLimit > 0) {
			const activeCount = lane.items.filter((i) => !i.archived).length;
			if (activeCount >= lane.wipLimit) countEl.addClass('kanban-matsuo-wip-exceeded');
			countEl.setText(`${activeCount}/${lane.wipLimit}`);
		}

		const menuBtn = headerEl.createEl('button', {
			cls: 'kanban-matsuo-lane-menu clickable-icon',
			attr: { 'aria-label': t('lane.options'), 'data-tooltip-position': 'top' },
		});
		setIcon(menuBtn, 'more-vertical');
		menuBtn.addEventListener('click', (e) => this.showLaneMenu(e, lane));

		if (!lane.collapsed) {
			const listEl = laneEl.createDiv({
				cls: 'kanban-matsuo-card-list',
				attr: { 'data-lane-id': lane.id, role: 'list' },
			});

			listEl.addEventListener('dragover', (e) => {
				if (!this.draggedItem) return;
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
				this.handleDragOver(e, listEl);
			});
			listEl.addEventListener('dragleave', () => this.removePlaceholder());
			listEl.addEventListener('drop', (e) => {
				if (!this.draggedItem) return;
				e.preventDefault();
				this.handleDrop(lane, listEl);
			});

			for (const item of lane.items) {
				if (this.isItemVisible(item)) this.renderCard(listEl, item, lane);
			}
			this.renderAddCardInput(laneEl, lane);
		}
	}

	private renderCard(container: HTMLElement, item: KanbanItem, lane: KanbanLane): void {
		const cardEl = container.createDiv({
			cls: 'kanban-matsuo-card',
			attr: { 'data-item-id': item.id, draggable: 'true', role: 'listitem', tabindex: '0', 'aria-label': item.title },
		});

		if (item.checked) cardEl.addClass('kanban-matsuo-card-checked');

		cardEl.addEventListener('dragstart', (e) => {
			this.draggedItem = item; this.draggedFromLane = lane;
			cardEl.addClass('kanban-matsuo-card-dragging');
			if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); }
		});
		cardEl.addEventListener('dragend', () => {
			cardEl.removeClass('kanban-matsuo-card-dragging');
			this.draggedItem = null; this.draggedFromLane = null; this.removePlaceholder();
		});

		// Touch drag for card
		this.setupTouchDragCard(cardEl, item, lane);

		// Keyboard
		cardEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.startInlineEdit(cardEl, item); }
			else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) { e.preventDefault(); this.deleteItem(item, lane); }
		});
		cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showCardMenu(e, item, lane); });

		// Checkbox
		if (this.board!.settings.showCheckboxes) {
			const checkboxEl = cardEl.createEl('input', {
				cls: 'kanban-matsuo-card-checkbox task-list-item-checkbox',
				attr: { type: 'checkbox', 'aria-label': item.checked ? t('card.mark-as-incomplete', { title: item.title }) : t('card.mark-as-complete', { title: item.title }) },
			});
			(checkboxEl as HTMLInputElement).checked = item.checked;
			checkboxEl.addEventListener('change', () => {
				item.checked = (checkboxEl as HTMLInputElement).checked;
				cardEl.toggleClass('kanban-matsuo-card-checked', item.checked);
				this.scheduleSave();
			});
		}

		const bodyEl = cardEl.createDiv({ cls: 'kanban-matsuo-card-body' });

		// Title with Markdown rendering (wikilinks)
		const titleEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-title' });
		const displayTitle = item.title.replace(/#[^\s#]+/g, '').replace(/@\{\d{4}-\d{2}-\d{2}\}/g, '').trim() || item.title;
		MarkdownRenderer.render(this.app, displayTitle, titleEl, this.file?.path || '', this);

		// Hover preview for wikilinks
		titleEl.querySelectorAll('a.internal-link').forEach((linkEl) => {
			linkEl.addEventListener('mouseover', (e) => {
				const href = linkEl.getAttribute('href');
				if (href) {
					this.app.workspace.trigger('hover-link', {
						event: e, source: KANBAN_VIEW_TYPE, hoverParent: this,
						targetEl: linkEl, linktext: href, sourcePath: this.file?.path || '',
					});
				}
			});
		});

		titleEl.addEventListener('dblclick', () => this.startInlineEdit(cardEl, item));

		// Tags (clickable for filter)
		if (this.board!.settings.showTags && item.tags.length > 0) {
			const tagsEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-tags' });
			for (const tag of item.tags) {
				const tagSpan = tagsEl.createSpan({ cls: 'kanban-matsuo-tag', text: `#${tag}` });
				tagSpan.addEventListener('click', (e) => { e.stopPropagation(); this.filterMode = 'tag'; this.filterValue = tag; this.render(); });
			}
		}

		// Due date
		if (this.board!.settings.showDates && item.dueDate) {
			const dateEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-date' });
			const today = new Date().toISOString().slice(0, 10);
			if (item.dueDate < today) dateEl.addClass('kanban-matsuo-date-overdue');
			else if (item.dueDate === today) dateEl.addClass('kanban-matsuo-date-today');
			dateEl.setText(`📅 ${item.dueDate}`);
		}
	}

	/** Setup touch drag for lane reorder (mobile) */
	private setupTouchDrag(handle: HTMLElement, el: HTMLElement, lane: KanbanLane): void {
		let longPressTimer: number | null = null;
		let isDragging = false;

		handle.addEventListener('touchstart', (e) => {
			const touch = e.touches[0];
			this.touchStartX = touch.clientX; this.touchStartY = touch.clientY;
			longPressTimer = window.setTimeout(() => { isDragging = true; el.addClass('kanban-matsuo-touch-dragging'); this.draggedLane = lane; }, 300);
		}, { passive: true });

		handle.addEventListener('touchmove', (e) => {
			if (!isDragging) {
				const touch = e.touches[0];
				if (Math.abs(touch.clientX - this.touchStartX) > 10 || Math.abs(touch.clientY - this.touchStartY) > 10) {
					if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
				}
				return;
			}
			e.preventDefault();
		});

		handle.addEventListener('touchend', () => {
			if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
			if (isDragging) { isDragging = false; el.removeClass('kanban-matsuo-touch-dragging'); this.draggedLane = null; }
		}, { passive: true });
	}

	/** Setup touch drag for card (mobile) */
	private setupTouchDragCard(cardEl: HTMLElement, item: KanbanItem, lane: KanbanLane): void {
		let longPressTimer: number | null = null;
		let isDragging = false;

		cardEl.addEventListener('touchstart', (e) => {
			const touch = e.touches[0];
			this.touchStartX = touch.clientX; this.touchStartY = touch.clientY;
			longPressTimer = window.setTimeout(() => { isDragging = true; cardEl.addClass('kanban-matsuo-touch-dragging'); this.draggedItem = item; this.draggedFromLane = lane; }, 300);
		}, { passive: true });

		cardEl.addEventListener('touchmove', (e) => {
			if (!isDragging) {
				const touch = e.touches[0];
				if (Math.abs(touch.clientX - this.touchStartX) > 10 || Math.abs(touch.clientY - this.touchStartY) > 10) {
					if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
				}
				return;
			}
			e.preventDefault();
		});

		cardEl.addEventListener('touchend', () => {
			if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
			if (isDragging) { isDragging = false; cardEl.removeClass('kanban-matsuo-touch-dragging'); this.draggedItem = null; this.draggedFromLane = null; }
		}, { passive: true });
	}

	private isNewlineKey(e: KeyboardEvent): boolean {
		const key = this.plugin.settings.newlineKey;
		if (key === 'shift+enter') return e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
		if (key === 'ctrl+enter') return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
		if (key === 'alt+enter') return e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
		return false;
	}

	private renderAddCardInput(laneEl: HTMLElement, lane: KanbanLane): void {
		const inputContainer = laneEl.createDiv({ cls: 'kanban-matsuo-add-card' });
		const textarea = inputContainer.createEl('textarea', {
			cls: 'kanban-matsuo-add-card-input',
			attr: { placeholder: t('card.add'), 'aria-label': t('card.add-to', { lane: lane.title }), rows: '1' },
		});
		// Auto-resize
		textarea.addEventListener('input', () => {
			textarea.style.setProperty('--textarea-rows', '1');
			const scrollH = textarea.scrollHeight;
			textarea.style.setProperty('--textarea-height', `${scrollH}px`);
		});
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				if (this.isNewlineKey(e)) {
					// Insert newline
					return;
				}
				e.preventDefault();
				const value = textarea.value.trim();
				if (value) { lane.items.push(createItem(value)); textarea.value = ''; this.render(); this.scheduleSave(); }
			}
		});
	}

	private renderAddLaneButton(container: HTMLElement): void {
		const addLaneEl = container.createDiv({ cls: 'kanban-matsuo-add-lane' });
		const addBtn = addLaneEl.createEl('button', {
			cls: 'kanban-matsuo-add-lane-btn', text: t('board.add-lane'),
			attr: { 'aria-label': t('board.add-lane'), 'data-tooltip-position': 'top' },
		});
		addBtn.addEventListener('click', () => {
			this.board!.lanes.push(createLane(t('board.new-lane')));
			this.render(); this.scheduleSave();
			const laneEls = this.boardEl!.querySelectorAll('.kanban-matsuo-lane-title');
			const lastTitle = laneEls[laneEls.length - 1] as HTMLElement;
			if (lastTitle) { lastTitle.focus(); const range = document.createRange(); range.selectNodeContents(lastTitle); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); }
		});
	}

	private startInlineEdit(cardEl: HTMLElement, item: KanbanItem): void {
		const titleEl = cardEl.querySelector('.kanban-matsuo-card-title') as HTMLElement;
		if (!titleEl) return;
		const parent = titleEl.parentElement;
		if (!parent) return;

		const textarea = parent.createEl('textarea', {
			cls: 'kanban-matsuo-inline-edit',
			attr: { 'aria-label': t('card.edit-title'), rows: '1' },
		});
		textarea.value = item.title;
		titleEl.replaceWith(textarea);
		textarea.focus();
		textarea.select();

		// Auto-resize to content
		const autoResize = () => {
			textarea.style.setProperty('--textarea-height', 'auto');
			textarea.style.setProperty('--textarea-height', `${textarea.scrollHeight}px`);
		};
		autoResize();
		textarea.addEventListener('input', autoResize);

		const finishEdit = () => {
			const newTitle = textarea.value.trim();
			if (newTitle && newTitle !== item.title) { item.title = newTitle; item.tags = extractTags(newTitle); item.dueDate = extractDate(newTitle); this.scheduleSave(); }
			this.render();
		};
		textarea.addEventListener('blur', finishEdit);
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				if (this.isNewlineKey(e)) return; // Allow newline
				e.preventDefault();
				textarea.blur();
			} else if (e.key === 'Escape') {
				textarea.value = item.title;
				textarea.blur();
			}
		});
	}

	private handleDragOver(e: DragEvent, listEl: HTMLElement): void {
		if (!this.draggedItem) return;
		this.removePlaceholder();
		this.dragPlaceholder = listEl.createDiv({ cls: 'kanban-matsuo-drop-placeholder' });
		this.dragPlaceholder.remove();
		const afterEl = this.getDragAfterElement(listEl, e.clientY);
		if (afterEl) listEl.insertBefore(this.dragPlaceholder, afterEl);
		else listEl.appendChild(this.dragPlaceholder);
	}

	private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
		const cards = Array.from(container.querySelectorAll('.kanban-matsuo-card:not(.kanban-matsuo-card-dragging)')) as HTMLElement[];
		let closest: { offset: number; element: HTMLElement | null } = { offset: Number.POSITIVE_INFINITY, element: null };
		for (const card of cards) {
			const box = card.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;
			if (offset < 0 && offset > -closest.offset) closest = { offset: -offset, element: card };
		}
		return closest.element;
	}

	private handleDrop(targetLane: KanbanLane, listEl: HTMLElement): void {
		if (!this.draggedItem || !this.draggedFromLane || !this.board) return;
		const sourceIndex = this.draggedFromLane.items.indexOf(this.draggedItem);
		if (sourceIndex >= 0) this.draggedFromLane.items.splice(sourceIndex, 1);
		let targetIndex = targetLane.items.filter((i) => !i.archived).length;
		if (this.dragPlaceholder) {
			const pi = Array.from(listEl.children).indexOf(this.dragPlaceholder);
			if (pi >= 0) targetIndex = pi;
		}
		targetLane.items.splice(targetIndex, 0, this.draggedItem);
		this.removePlaceholder(); this.render(); this.scheduleSave();
	}

	private removePlaceholder(): void {
		if (this.dragPlaceholder) { this.dragPlaceholder.remove(); this.dragPlaceholder = null; }
	}

	private deleteItem(item: KanbanItem, lane: KanbanLane): void {
		const index = lane.items.indexOf(item);
		if (index >= 0) { lane.items.splice(index, 1); this.render(); this.scheduleSave(); }
	}

	private showMenuAtEvent(menu: Menu, e: MouseEvent | Event): void {
		if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
		else if (e.target instanceof HTMLElement) { const rect = e.target.getBoundingClientRect(); menu.showAtPosition({ x: rect.left, y: rect.bottom }); }
	}

	private showCardMenu(e: MouseEvent | Event, item: KanbanItem, lane: KanbanLane): void {
		const menu = new Menu();

		menu.addItem((mi) => mi.setTitle(t('card.edit')).setIcon('pencil').onClick(() => {
			const cardEl = this.boardEl?.querySelector(`[data-item-id="${item.id}"]`) as HTMLElement;
			if (cardEl) this.startInlineEdit(cardEl, item);
		}));

		menu.addItem((mi) => mi.setTitle(item.checked ? t('card.mark-incomplete') : t('card.mark-complete'))
			.setIcon(item.checked ? 'square' : 'check-square')
			.onClick(() => { item.checked = !item.checked; this.render(); this.scheduleSave(); }));

		menu.addItem((mi) => mi.setTitle(t('card.archive')).setIcon('archive')
			.onClick(() => { item.archived = true; this.render(); this.scheduleSave(); }));

		menu.addItem((mi) => mi.setTitle(t('card.create-note')).setIcon('file-plus')
			.onClick(async () => await this.createLinkedNote(item)));

		const wikilinkMatch = item.title.match(/\[\[([^\]]+)\]\]/);
		if (wikilinkMatch) {
			menu.addItem((mi) => mi.setTitle(t('card.open-note')).setIcon('file-text')
				.onClick(async () => { await this.app.workspace.openLinkText(wikilinkMatch[1].split('|')[0], this.file?.path || ''); }));
		}

		menu.addSeparator();
		if (this.board) {
			for (const targetLane of this.board.lanes) {
				if (targetLane.id === lane.id) continue;
				menu.addItem((mi) => mi.setTitle(t('card.move-to', { lane: targetLane.title })).setIcon('arrow-right')
					.onClick(() => { const i = lane.items.indexOf(item); if (i >= 0) { lane.items.splice(i, 1); targetLane.items.push(item); this.render(); this.scheduleSave(); } }));
			}
		}
		menu.addSeparator();
		menu.addItem((mi) => mi.setTitle(t('card.delete')).setIcon('trash').onClick(() => this.deleteItem(item, lane)));
		this.showMenuAtEvent(menu, e);
	}

	private async createLinkedNote(item: KanbanItem): Promise<void> {
		const cleanTitle = item.title.replace(/#[^\s#]+/g, '').replace(/@\{\d{4}-\d{2}-\d{2}\}/g, '').replace(/\[\[[^\]]+\]\]/g, '').trim();
		const noteName = cleanTitle || 'Untitled';
		const folder = this.file?.parent?.path || '';
		const notePath = normalizePath(folder ? `${folder}/${noteName}.md` : `${noteName}.md`);
		if (!this.app.vault.getAbstractFileByPath(notePath)) await this.app.vault.create(notePath, `# ${noteName}\n`);
		if (!item.title.includes('[[')) { item.title = `${item.title} [[${noteName}]]`; this.render(); this.scheduleSave(); }
		await this.app.workspace.openLinkText(noteName, this.file?.path || '');
	}

	private showLaneMenu(e: MouseEvent | Event, lane: KanbanLane): void {
		const menu = new Menu();
		menu.addItem((mi) => mi.setTitle(t('lane.set-wip-limit')).setIcon('alert-circle')
			.onClick(() => new WipLimitModal(this.app, lane, (limit) => { lane.wipLimit = limit; this.render(); this.scheduleSave(); }).open()));
		menu.addSeparator();
		menu.addItem((mi) => mi.setTitle(t('lane.delete')).setIcon('trash')
			.onClick(() => {
				const activeItems = lane.items.filter((i) => !i.archived).length;
				if (activeItems > 0) new ConfirmDeleteModal(this.app, lane.title, activeItems, () => this.performLaneDelete(lane)).open();
				else this.performLaneDelete(lane);
			}));
		this.showMenuAtEvent(menu, e);
	}

	private performLaneDelete(lane: KanbanLane): void {
		if (!this.board) return;
		const index = this.board.lanes.indexOf(lane);
		if (index >= 0) { this.board.lanes.splice(index, 1); this.render(); this.scheduleSave(); }
	}

	private filterCards(query: string): void {
		const q = query.toLowerCase().trim();
		const cards = this.boardEl?.querySelectorAll('.kanban-matsuo-card') as NodeListOf<HTMLElement>;
		if (!cards) return;
		cards.forEach((cardEl) => {
			const match = !q || (cardEl.textContent?.toLowerCase() || '').includes(q);
			cardEl.toggleClass('kanban-matsuo-card-hidden', !match);
		});
	}
}

class WipLimitModal extends Modal {
	private lane: KanbanLane;
	private onSubmit: (limit: number) => void;
	constructor(app: import('obsidian').App, lane: KanbanLane, onSubmit: (limit: number) => void) {
		super(app); this.lane = lane; this.onSubmit = onSubmit;
	}
	onOpen(): void {
		const { contentEl } = this; contentEl.empty();
		contentEl.createEl('h3', { text: t('modal.wip-limit-title') });
		new Setting(contentEl).setName(t('modal.wip-limit-name')).setDesc(t('modal.wip-limit-desc'))
			.addText((text) => { text.setValue(String(this.lane.wipLimit || '')); text.inputEl.type = 'number'; text.inputEl.min = '0'; text.inputEl.setAttribute('aria-label', t('modal.wip-limit-label'));
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') this.submit(text.getValue()); }); });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t('modal.save')).setCta().onClick(() => { const inp = contentEl.querySelector('input') as HTMLInputElement; this.submit(inp?.value || '0'); }))
			.addButton((btn) => btn.setButtonText(t('modal.cancel')).onClick(() => this.close()));
	}
	private submit(value: string): void { this.onSubmit(parseInt(value, 10) || 0); this.close(); }
	onClose(): void { this.contentEl.empty(); }
}

class ConfirmDeleteModal extends Modal {
	private cardCount: number;
	private onConfirm: () => void;
	constructor(app: import('obsidian').App, _laneTitle: string, cardCount: number, onConfirm: () => void) {
		super(app); this.cardCount = cardCount; this.onConfirm = onConfirm;
	}
	onOpen(): void {
		const { contentEl } = this; contentEl.empty();
		contentEl.createEl('h3', { text: t('modal.delete-lane-title') });
		contentEl.createEl('p', { text: t('lane.delete-confirm', { count: this.cardCount }) });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t('modal.delete')).setWarning().onClick(() => { this.onConfirm(); this.close(); }))
			.addButton((btn) => btn.setButtonText(t('modal.cancel')).onClick(() => this.close()));
	}
	onClose(): void { this.contentEl.empty(); }
}
