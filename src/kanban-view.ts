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

	// External change detection (counter to handle concurrent saves)
	private ignoreModifyCount = 0;

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
				if (this.ignoreModifyCount > 0) {
					this.ignoreModifyCount--;
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

	/** Get today's date string respecting timezone setting */
	private getToday(): string {
		const tz = this.plugin.settings.timezone;
		if (tz === 'local') {
			const now = new Date();
			const y = now.getFullYear();
			const m = String(now.getMonth() + 1).padStart(2, '0');
			const d = String(now.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}`;
		}
		// Use Intl to get date in specified timezone
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date());
		return parts; // en-CA outputs YYYY-MM-DD
	}

	/** Save a board state and re-render (for use by commands in main.ts) */
	async saveBoard(board: KanbanBoard): Promise<void> {
		this.board = board;
		if (!this.file) return;
		this.ignoreModifyCount++;
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
		this.ignoreModifyCount++;
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
			const today = this.getToday();
			switch (this.filterValue) {
				case 'overdue': return item.dueDate !== null && item.dueDate < today;
				case 'today': return item.dueDate === today;
				case 'week': {
					if (!item.dueDate) return false;
					const now = new Date(today + 'T00:00:00');
					const day = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
					const diffToMon = day === 0 ? -6 : 1 - day;
					const monday = new Date(now); monday.setDate(now.getDate() + diffToMon);
					const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
					const fmt = (d: Date) => {
						const y = d.getFullYear();
						const m = String(d.getMonth() + 1).padStart(2, '0');
						const dd = String(d.getDate()).padStart(2, '0');
						return `${y}-${m}-${dd}`;
					};
					return item.dueDate >= fmt(monday) && item.dueDate <= fmt(sunday);
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
				if (this.isItemVisible(item)) this.renderCardTree(listEl, item, lane, 0);
			}
			this.renderAddCardInput(laneEl, lane);
		}
	}

	/**
	 * Render a card and its children recursively, each as a separate card in the list.
	 * Children are indented by depth level.
	 */
	private renderCardTree(container: HTMLElement, item: KanbanItem, lane: KanbanLane, depth: number): void {
		this.renderCard(container, item, lane, depth);
		for (const child of item.children) {
			if (this.isItemVisible(child)) {
				this.renderCardTree(container, child, lane, depth + 1);
			}
		}
	}

	private renderCard(container: HTMLElement, item: KanbanItem, lane: KanbanLane, depth: number): void {
		const cardEl = container.createDiv({
			cls: 'kanban-matsuo-card',
			attr: { 'data-item-id': item.id, draggable: 'true', role: 'listitem', tabindex: '0', 'aria-label': item.title },
		});

		if (depth > 0) {
			cardEl.addClass('kanban-matsuo-card-child');
			cardEl.style.setProperty('--card-depth', `${depth}`);
		}

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
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openCardEditor(item, lane); }
			else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) { e.preventDefault(); this.deleteItem(item, lane); }
		});
		cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showCardMenu(e, item, lane); });

		// Click anywhere on card to open editor (ignore checkbox clicks)
		cardEl.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('input, a')) return;
			this.openCardEditor(item, lane);
		});

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
		if (this.file) {
			MarkdownRenderer.render(this.app, displayTitle, titleEl, this.file.path, this);
		} else {
			titleEl.setText(displayTitle);
		}

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
			const today = this.getToday();
			if (item.dueDate < today) dateEl.addClass('kanban-matsuo-date-overdue');
			else if (item.dueDate === today) dateEl.addClass('kanban-matsuo-date-today');
			dateEl.setText(`📅 ${item.dueDate}`);
		}

		// Children progress bar (children are rendered as separate cards below)
		if (item.children.length > 0) {
			const { done, total } = this.countChildren(item.children);
			const progressEl = bodyEl.createDiv({ cls: 'kanban-matsuo-subtask-progress' });
			const barOuter = progressEl.createDiv({ cls: 'kanban-matsuo-progress-bar' });
			const barInner = barOuter.createDiv({ cls: 'kanban-matsuo-progress-fill' });
			const pct = total > 0 ? (done / total) * 100 : 0;
			barInner.style.setProperty('--progress-pct', `${pct}%`);
			progressEl.createSpan({
				cls: 'kanban-matsuo-progress-text',
				text: t('subtask.progress', { done, total }),
			});
		}
	}

	private countChildren(children: KanbanItem[]): { done: number; total: number } {
		let done = 0, total = 0;
		for (const c of children) {
			total++;
			if (c.checked) done++;
			const sub = this.countChildren(c.children);
			done += sub.done;
			total += sub.total;
		}
		return { done, total };
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
		return cards.reduce<{ offset: number; el: HTMLElement | null }>(
			(acc, card) => {
				const box = card.getBoundingClientRect();
				const offset = y - box.top - box.height / 2;
				if (offset < 0 && offset > acc.offset) return { offset, el: card };
				return acc;
			},
			{ offset: Number.NEGATIVE_INFINITY, el: null },
		).el;
	}

	private handleDrop(targetLane: KanbanLane, listEl: HTMLElement): void {
		if (!this.draggedItem || !this.draggedFromLane || !this.board) return;
		const sourceIndex = this.draggedFromLane.items.indexOf(this.draggedItem);
		if (sourceIndex >= 0) this.draggedFromLane.items.splice(sourceIndex, 1);

		// Map DOM placeholder position to actual items array index (skipping archived)
		const activeItems = targetLane.items.filter((i) => !i.archived);
		let targetIndex = activeItems.length;
		if (this.dragPlaceholder) {
			const pi = Array.from(listEl.children).indexOf(this.dragPlaceholder);
			if (pi >= 0) {
				// Count how many visible cards are before the placeholder
				let visibleBefore = 0;
				for (const child of Array.from(listEl.children)) {
					if (child === this.dragPlaceholder) break;
					if (child.classList.contains('kanban-matsuo-card')) visibleBefore++;
				}
				targetIndex = visibleBefore;
			}
		}

		// Convert active-index to real index in items array
		let realIndex = targetLane.items.length;
		let activeCount = 0;
		for (let i = 0; i < targetLane.items.length; i++) {
			if (!targetLane.items[i].archived) {
				if (activeCount === targetIndex) {
					realIndex = i;
					break;
				}
				activeCount++;
			}
		}

		targetLane.items.splice(realIndex, 0, this.draggedItem);
		this.removePlaceholder(); this.render(); this.scheduleSave();
	}

	private removePlaceholder(): void {
		if (this.dragPlaceholder) { this.dragPlaceholder.remove(); this.dragPlaceholder = null; }
	}

	private deleteItem(item: KanbanItem, lane: KanbanLane): void {
		if (this.removeItemRecursive(lane.items, item)) {
			this.render();
			this.scheduleSave();
		}
	}

	/**
	 * Recursively search and remove an item from a list or any children.
	 */
	private removeItemRecursive(items: KanbanItem[], target: KanbanItem): boolean {
		const index = items.indexOf(target);
		if (index >= 0) {
			items.splice(index, 1);
			return true;
		}
		for (const item of items) {
			if (this.removeItemRecursive(item.children, target)) return true;
		}
		return false;
	}

	/**
	 * Check if an item is a child (not top-level in the lane).
	 */
	private isChildItem(item: KanbanItem, lane: KanbanLane): boolean {
		return !lane.items.includes(item);
	}

	/**
	 * Promote a child item to a top-level card in the lane.
	 * Removes it from its parent's children first.
	 */
	private promoteItem(item: KanbanItem, lane: KanbanLane): void {
		this.removeItemRecursive(lane.items, item);
		lane.items.push(item);
		this.render();
		this.scheduleSave();
	}

	private showMenuAtEvent(menu: Menu, e: MouseEvent | Event): void {
		if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
		else if (e.target instanceof HTMLElement) { const rect = e.target.getBoundingClientRect(); menu.showAtPosition({ x: rect.left, y: rect.bottom }); }
	}

	private showCardMenu(e: MouseEvent | Event, item: KanbanItem, lane: KanbanLane): void {
		const menu = new Menu();

		menu.addItem((mi) => mi.setTitle(t('card.edit')).setIcon('pencil').onClick(() => {
			this.openCardEditor(item, lane);
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

		// Promote to top-level (only for child cards)
		if (this.isChildItem(item, lane)) {
			menu.addItem((mi) => mi.setTitle(t('subtask.promote')).setIcon('arrow-up')
				.onClick(() => this.promoteItem(item, lane)));
		}

		// Move to another lane
		if (this.board) {
			for (const targetLane of this.board.lanes) {
				if (targetLane.id === lane.id) continue;
				menu.addItem((mi) => mi.setTitle(t('card.move-to', { lane: targetLane.title })).setIcon('arrow-right')
					.onClick(() => {
						this.removeItemRecursive(lane.items, item);
						targetLane.items.push(item);
						this.render();
						this.scheduleSave();
					}));
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

	private openCardEditor(item: KanbanItem, _lane: KanbanLane): void {
		new CardEditorModal(this.app, item, () => {
			this.render();
			this.scheduleSave();
		}).open();
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

/**
 * Modal for editing a card's title, tags, due date, and body via GUI.
 */
class CardEditorModal extends Modal {
	private item: KanbanItem;
	private onSave: (item: KanbanItem) => void;

	constructor(app: import('obsidian').App, item: KanbanItem, onSave: (item: KanbanItem) => void) {
		super(app);
		this.item = item;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('kanban-matsuo-card-editor');

		contentEl.createEl('h3', { text: t('card-editor.title') });

		// Title
		let titleValue = this.item.title
			.replace(/#[^\s#]+/g, '')
			.replace(/@\{\d{4}-\d{2}-\d{2}\}/g, '')
			.trim();
		const titleSetting = new Setting(contentEl)
			.setName(t('card-editor.card-title'));
		const titleInput = titleSetting.controlEl.createEl('textarea', {
			cls: 'kanban-matsuo-editor-textarea',
			attr: {
				placeholder: t('card-editor.card-title-placeholder'),
				rows: '2',
				'aria-label': t('card-editor.card-title'),
			},
		});
		titleInput.value = titleValue;

		// Tags
		const tagsSetting = new Setting(contentEl)
			.setName(t('card-editor.tags'))
			.setDesc(t('card-editor.tags-desc'));
		const tagsInput = tagsSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: {
				type: 'text',
				placeholder: t('card-editor.tags-placeholder'),
				'aria-label': t('card-editor.tags'),
			},
		});
		(tagsInput as HTMLInputElement).value = this.item.tags.join(', ');

		// Due date
		const dateSetting = new Setting(contentEl)
			.setName(t('card-editor.due-date'))
			.setDesc(t('card-editor.due-date-desc'));
		const dateInput = dateSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: {
				type: 'date',
				'aria-label': t('card-editor.due-date'),
			},
		});
		(dateInput as HTMLInputElement).value = this.item.dueDate || '';

		// Body / description
		const bodySetting = new Setting(contentEl)
			.setName(t('card-editor.body'));
		const bodyInput = bodySetting.controlEl.createEl('textarea', {
			cls: 'kanban-matsuo-editor-textarea',
			attr: {
				placeholder: t('card-editor.body-placeholder'),
				rows: '4',
				'aria-label': t('card-editor.body'),
			},
		});
		bodyInput.value = this.item.body || '';

		// Subtasks
		this.renderSubTaskEditor(contentEl);

		// Buttons
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText(t('modal.save')).setCta().onClick(() => {
					this.saveAndClose(titleInput, tagsInput as HTMLInputElement, dateInput as HTMLInputElement, bodyInput);
				});
			})
			.addButton((btn) => {
				btn.setButtonText(t('modal.cancel')).onClick(() => this.close());
			});

		// Focus title on open
		titleInput.focus();
	}

	private saveAndClose(
		titleEl: HTMLTextAreaElement,
		tagsEl: HTMLInputElement,
		dateEl: HTMLInputElement,
		bodyEl: HTMLTextAreaElement,
	): void {
		const title = titleEl.value.trim();
		if (!title) return;

		// Rebuild the item title with embedded tags and date
		const tags = tagsEl.value
			.split(',')
			.map((s) => s.trim().replace(/^#/, ''))
			.filter((s) => s.length > 0);
		const dueDate = dateEl.value || null;

		let fullTitle = title;
		if (tags.length > 0) {
			fullTitle += ' ' + tags.map((tag) => `#${tag}`).join(' ');
		}
		if (dueDate) {
			fullTitle += ` @{${dueDate}}`;
		}

		this.item.title = fullTitle;
		this.item.tags = tags;
		this.item.dueDate = dueDate;
		this.item.body = bodyEl.value.trim();

		this.onSave(this.item);
		this.close();
	}

	private hideDone = false;

	private renderSubTaskEditor(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'kanban-matsuo-subtask-editor' });
		const header = section.createDiv({ cls: 'kanban-matsuo-subtask-header' });
		header.createEl('h4', { text: t('subtask.add'), cls: 'kanban-matsuo-subtask-heading' });

		if (this.item.children.length > 0) {
			const toggleBtn = header.createEl('button', {
				cls: 'kanban-matsuo-subtask-toggle clickable-icon',
				text: this.hideDone ? t('subtask.show-done') : t('subtask.collapse-done'),
			});
			toggleBtn.addEventListener('click', () => {
				this.hideDone = !this.hideDone;
				this.rerenderSubTasks(section);
			});
		}

		this.renderSubTaskList(section, this.item.children, 0);

		// Add child card input
		const addRow = section.createDiv({ cls: 'kanban-matsuo-subtask-add' });
		const addInput = addRow.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: { type: 'text', placeholder: t('subtask.add-placeholder'), 'aria-label': t('subtask.add') },
		});
		addInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				const val = (addInput as HTMLInputElement).value.trim();
				if (val) {
					const child = createItem(val);
					this.item.children.push(child);
					(addInput as HTMLInputElement).value = '';
					this.rerenderSubTasks(section);
				}
			}
		});
	}

	private rerenderSubTasks(section: HTMLElement): void {
		section.empty();
		this.renderSubTaskEditor(section.parentElement!);
		section.remove();
	}

	private renderSubTaskList(container: HTMLElement, items: KanbanItem[], depth: number): void {
		const list = container.createDiv({ cls: 'kanban-matsuo-subtask-list' });
		if (depth > 0) list.style.setProperty('--subtask-depth', `${depth}`);

		for (let i = 0; i < items.length; i++) {
			const child = items[i];
			if (this.hideDone && child.checked) continue;

			const row = list.createDiv({ cls: 'kanban-matsuo-subtask-row' });

			const checkbox = row.createEl('input', {
				attr: { type: 'checkbox', 'aria-label': child.title },
				cls: 'kanban-matsuo-subtask-checkbox',
			});
			(checkbox as HTMLInputElement).checked = child.checked;
			checkbox.addEventListener('change', () => {
				child.checked = (checkbox as HTMLInputElement).checked;
				row.toggleClass('kanban-matsuo-subtask-done', child.checked);
			});

			const titleEl = row.createSpan({
				cls: `kanban-matsuo-subtask-title${child.checked ? ' kanban-matsuo-subtask-done' : ''}`,
				text: child.title,
			});
			titleEl.contentEditable = 'true';
			titleEl.addEventListener('blur', () => {
				const val = titleEl.textContent?.trim();
				if (val) child.title = val;
			});

			const deleteBtn = row.createEl('button', {
				cls: 'kanban-matsuo-subtask-delete clickable-icon',
				attr: { 'aria-label': t('subtask.delete') },
			});
			setIcon(deleteBtn, 'x');
			deleteBtn.addEventListener('click', () => {
				items.splice(i, 1);
				// Re-render the subtask list in the modal
				const section = list.closest('.kanban-matsuo-subtask-editor');
				if (section) this.rerenderSubTasks(section as HTMLElement);
			});

			if (child.checked) row.addClass('kanban-matsuo-subtask-done');

			// Nested children
			if (child.children.length > 0) {
				this.renderSubTaskList(row, child.children, depth + 1);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
