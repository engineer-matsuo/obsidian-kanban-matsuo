import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Menu,
	Modal,
	Setting,
	setIcon,
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

	// Rich card display toggle
	private richMode = false;

	// WBS view toggle
	private showWbs = false;
	private ganttDragging = false;
	private ganttSortedIds: string[] = [];

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

		// Save scroll positions before re-render
		const ganttWrap = this.contentEl.querySelector('.kanban-matsuo-gantt-wrapper') as HTMLElement | null;
		const savedScrollLeft = ganttWrap?.scrollLeft ?? 0;
		const savedScrollTop = ganttWrap?.scrollTop ?? 0;

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

		// WBS section
		if (this.showWbs) {
			this.renderWbs(this.contentEl);

			// Restore scroll positions
			const newWrap = this.contentEl.querySelector('.kanban-matsuo-gantt-wrapper') as HTMLElement | null;
			if (newWrap) { newWrap.scrollLeft = savedScrollLeft; newWrap.scrollTop = savedScrollTop; }
		}
	}

	private renderToolbar(container: HTMLElement): void {
		// Left group: search + filters
		const leftGroup = container.createDiv({ cls: 'kanban-matsuo-toolbar-left' });

		const searchInput = leftGroup.createEl('input', {
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

		const tagFilterBtn = leftGroup.createEl('button', {
			cls: 'kanban-matsuo-filter-btn clickable-icon',
			attr: { 'aria-label': t('filter.by-tag'), 'data-tooltip-position': 'top' },
		});
		setIcon(tagFilterBtn, 'tag');
		tagFilterBtn.addEventListener('click', (e) => this.showTagFilterMenu(e));

		const dateFilterBtn = leftGroup.createEl('button', {
			cls: 'kanban-matsuo-filter-btn clickable-icon',
			attr: { 'aria-label': t('filter.by-date'), 'data-tooltip-position': 'top' },
		});
		setIcon(dateFilterBtn, 'calendar');
		dateFilterBtn.addEventListener('click', (e) => this.showDateFilterMenu(e));

		if (this.filterMode !== 'none') {
			const clearBtn = leftGroup.createEl('button', {
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

		// Right group: rich mode toggle
		const rightGroup = container.createDiv({ cls: 'kanban-matsuo-toolbar-right' });

		const richToggle = rightGroup.createEl('button', {
			cls: `kanban-matsuo-rich-toggle clickable-icon${this.richMode ? ' kanban-matsuo-rich-toggle-active' : ''}`,
			attr: {
				'aria-label': this.richMode ? t('board.rich-mode-off') : t('board.rich-mode-on'),
				'data-tooltip-position': 'top',
			},
		});
		setIcon(richToggle, this.richMode ? 'layout-list' : 'layout-dashboard');
		richToggle.addEventListener('click', () => {
			this.richMode = !this.richMode;
			this.render();
		});

		// WBS toggle
		const wbsToggle = rightGroup.createEl('button', {
			cls: `kanban-matsuo-wbs-toggle clickable-icon${this.showWbs ? ' kanban-matsuo-wbs-toggle-active' : ''}`,
			attr: {
				'aria-label': this.showWbs ? t('wbs.toggle-hide') : t('wbs.toggle-show'),
				'data-tooltip-position': 'top',
			},
		});
		setIcon(wbsToggle, 'table');
		wbsToggle.addEventListener('click', () => {
			this.showWbs = !this.showWbs;
			this.render();
		});
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
				case 'overdue': return item.endDate !== null && item.endDate < today;
				case 'today': return item.endDate === today;
				case 'week': {
					if (!item.endDate) return false;
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
					return item.endDate >= fmt(monday) && item.endDate <= fmt(sunday);
				}
				case 'none': return item.endDate === null;
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
				this.handleDragOver(e, listEl, lane);
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
			this.dragOriginX = e.clientX;
			this.dragOriginDepth = depth;
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

		// Title as clickable link to open editor
		const displayTitle = item.title.replace(/#[^\s#]+/g, '').replace(/@\{\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?\}/g, '').trim() || item.title;
		const titleLink = bodyEl.createEl('a', {
			cls: 'kanban-matsuo-card-title-link',
			text: displayTitle,
			attr: {
				href: '#',
				'aria-label': t('card.edit'),
				tabindex: '-1',
			},
		});
		titleLink.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openCardEditor(item, lane);
		});


		// Tags (always shown)
		if (this.board!.settings.showTags && item.tags.length > 0) {
			const tagsEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-tags' });
			for (const tag of item.tags) {
				const tagSpan = tagsEl.createSpan({ cls: 'kanban-matsuo-tag', text: `#${tag}` });
				tagSpan.addEventListener('click', (e) => { e.stopPropagation(); this.filterMode = 'tag'; this.filterValue = tag; this.render(); });
			}
		}

		// Dates (always shown)
		if (this.board!.settings.showDates && (item.startDate || item.endDate)) {
			const dateEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-date' });
			const today = this.getToday();

			if (item.endDate && item.endDate < today) dateEl.addClass('kanban-matsuo-date-overdue');
			else if (item.endDate === today) dateEl.addClass('kanban-matsuo-date-today');

			let dateText = '📅 ';
			if (item.startDate && item.endDate) {
				dateText += `${item.startDate} → ${item.endDate}`;
			} else if (item.startDate) {
				dateText += `${item.startDate} →`;
			} else {
				dateText += `→ ${item.endDate}`;
			}
			dateEl.setText(dateText);
		}

		// Description (rich mode only)
		if (this.richMode && item.body) {
			const descEl = bodyEl.createDiv({ cls: 'kanban-matsuo-card-description' });
			descEl.setText(item.body);
		}

		// Indent/Outdent buttons
		this.renderIndentButtons(bodyEl, item, lane, depth);

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

	/**
	 * Render indent/outdent buttons on a card.
	 * Indent: make this card a child of the sibling above.
	 * Outdent: promote this card to the parent's level.
	 */
	private renderIndentButtons(container: HTMLElement, item: KanbanItem, lane: KanbanLane, depth: number): void {
		const siblingList = this.findParentList(lane.items, item);
		if (!siblingList) return;

		const idx = siblingList.indexOf(item);
		// Can indent: has a sibling above in the same list to become its child
		const canIndent = idx > 0;
		// Can also "deep indent": even if idx===0, if we're a child, we can re-indent
		// under the sibling above us in the flat view (our parent's previous sibling's last child)
		const canDeepIndent = !canIndent && depth > 0 && this.canDeepIndent(item, lane);
		const canOutdent = depth > 0;

		const btnRow = container.createDiv({ cls: 'kanban-matsuo-indent-buttons' });

		if (canOutdent) {
			const outdentBtn = btnRow.createEl('button', {
				cls: 'kanban-matsuo-indent-btn clickable-icon',
				attr: { 'aria-label': t('card.outdent'), 'data-tooltip-position': 'top' },
			});
			setIcon(outdentBtn, 'arrow-left');
			outdentBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.outdentItem(item, lane);
			});
		}

		if (canIndent || canDeepIndent) {
			const indentBtn = btnRow.createEl('button', {
				cls: 'kanban-matsuo-indent-btn clickable-icon',
				attr: { 'aria-label': t('card.indent'), 'data-tooltip-position': 'top' },
			});
			setIcon(indentBtn, 'arrow-right');
			indentBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.indentItem(item, lane);
			});
		}
	}

	/**
	 * Check if a deep indent is possible: the item is at idx 0 in its parent's children,
	 * but the parent has a sibling above whose last child can adopt this item.
	 */
	private canDeepIndent(item: KanbanItem, lane: KanbanLane): boolean {
		const parentInfo = this.findParentItem(lane.items, item);
		if (!parentInfo) return false;
		const { parent, grandparentList } = parentInfo;
		const parentIdx = grandparentList.indexOf(parent);
		// Parent must have a sibling above it
		return parentIdx > 0;
	}

	/**
	 * Find the array (lane.items or some parent's .children) that directly contains this item.
	 */
	private findParentList(items: KanbanItem[], target: KanbanItem): KanbanItem[] | null {
		if (items.includes(target)) return items;
		for (const item of items) {
			const found = this.findParentList(item.children, target);
			if (found) return found;
		}
		return null;
	}

	/**
	 * Indent: move item to be a child of the sibling directly above.
	 * If no sibling above (idx===0), do a deep indent: outdent first, then indent under the new sibling above.
	 */
	private indentItem(item: KanbanItem, lane: KanbanLane): void {
		const list = this.findParentList(lane.items, item);
		if (!list) return;
		const idx = list.indexOf(item);

		if (idx > 0) {
			// Normal indent: become child of sibling above
			const newParent = list[idx - 1];
			list.splice(idx, 1);
			newParent.children.push(item);
		} else {
			// Deep indent: first outdent to parent level, which places us after parent,
			// then indent under what is now the sibling above (the former parent).
			const parentInfo = this.findParentItem(lane.items, item);
			if (!parentInfo) return;

			const { parent, grandparentList } = parentInfo;
			const childIdx = parent.children.indexOf(item);
			if (childIdx < 0) return;

			// Remove from parent's children
			parent.children.splice(childIdx, 1);

			// Find the sibling above parent in grandparent list
			const parentIdx = grandparentList.indexOf(parent);
			if (parentIdx <= 0) return;

			const newParent = grandparentList[parentIdx - 1];
			newParent.children.push(item);
		}

		this.render();
		this.scheduleSave();
	}

	/**
	 * Outdent: move item from parent's children to grandparent's list, after the parent.
	 */
	private outdentItem(item: KanbanItem, lane: KanbanLane): void {
		// Find the parent that holds this item
		const parentInfo = this.findParentItem(lane.items, item);
		if (!parentInfo) return;

		const { parent, grandparentList } = parentInfo;
		const childIdx = parent.children.indexOf(item);
		if (childIdx < 0) return;

		parent.children.splice(childIdx, 1);

		// Insert after the parent in the grandparent list
		const parentIdx = grandparentList.indexOf(parent);
		grandparentList.splice(parentIdx + 1, 0, item);

		this.render();
		this.scheduleSave();
	}

	/**
	 * Find the parent item and the grandparent list for an item.
	 */
	private findParentItem(
		items: KanbanItem[],
		target: KanbanItem,
		grandparentList?: KanbanItem[],
	): { parent: KanbanItem; grandparentList: KanbanItem[] } | null {
		for (const item of items) {
			if (item.children.includes(target)) {
				return { parent: item, grandparentList: grandparentList || items };
			}
			const found = this.findParentItem(item.children, target, items);
			if (found) return found;
		}
		return null;
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

	/**
	 * Render WBS/Gantt chart below the board.
	 * Left: task tree with status (lane). Right: date timeline bars.
	 */
	private renderWbs(container: HTMLElement): void {
		if (!this.board) return;

		// Collect all items flat with lane info
		const flatItems: { item: KanbanItem; lane: string; depth: number }[] = [];
		for (const lane of this.board.lanes) {
			for (const item of lane.items) {
				if (!item.archived) this.flattenForWbs(item, lane.title, 0, flatItems);
			}
		}

		// Compute date range for timeline
		const today = this.getToday();
		let minDate = today;
		let maxDate = today;
		for (const { item } of flatItems) {
			if (item.startDate && item.startDate < minDate) minDate = item.startDate;
			if (item.endDate && item.endDate > maxDate) maxDate = item.endDate;
		}
		// Generous padding so bars don't disappear at edges during drag
		const rangeStart = this.addDays(minDate, -7);
		const rangeEnd = this.addDays(maxDate, 30);
		const dates = this.generateDateRange(rangeStart, rangeEnd);

		const wbsContainer = container.createDiv({ cls: 'kanban-matsuo-wbs' });
		const wrapper = wbsContainer.createDiv({ cls: 'kanban-matsuo-gantt-wrapper' });

		// Sort
		if (this.ganttDragging && this.ganttSortedIds.length > 0) {
			const idOrder = new Map(this.ganttSortedIds.map((id, i) => [id, i]));
			flatItems.sort((a, b) => (idOrder.get(a.item.id) ?? 999) - (idOrder.get(b.item.id) ?? 999));
		} else {
			flatItems.sort((a, b) => {
				const aDate = a.item.startDate || a.item.endDate || '9999-99-99';
				const bDate = b.item.startDate || b.item.endDate || '9999-99-99';
				return aDate.localeCompare(bDate);
			});
			this.ganttSortedIds = flatItems.map((f) => f.item.id);
		}

		// HEADER ROW 1: month (each cell = 28px, label on first day of month)
		const hdr1 = wrapper.createDiv({ cls: 'kanban-matsuo-gantt-row kanban-matsuo-gantt-hdr' });
		hdr1.createDiv({ cls: 'kanban-matsuo-gantt-left-cell kanban-matsuo-gantt-hdr-cell', text: t('wbs.title') });
		const hdr1Right = hdr1.createDiv({ cls: 'kanban-matsuo-gantt-right-cells kanban-matsuo-gantt-hdr-cell' });
		// Build month blocks: each block spans the days in that month
		let currentMonth = '';
		let monthDayCount = 0;
		let monthIndex = 0;
		let monthEl: HTMLElement | null = null;
		for (let i = 0; i <= dates.length; i++) {
			const ym = i < dates.length ? dates[i].slice(0, 7) : '';
			if (ym !== currentMonth) {
				// Finish previous month block
				if (monthEl && monthDayCount > 0) {
					monthEl.style.setProperty('width', `${monthDayCount * 28}px`);
					monthEl.style.setProperty('min-width', `${monthDayCount * 28}px`);
				}
				if (i >= dates.length) break;
				// Start new month block
				currentMonth = ym;
				monthIndex++;
				monthDayCount = 1;
				const [y, m] = ym.split('-');
				monthEl = hdr1Right.createDiv({
					cls: `kanban-matsuo-gantt-month-block ${monthIndex % 2 === 0 ? 'kanban-matsuo-gantt-month-even' : 'kanban-matsuo-gantt-month-odd'}`,
					text: `${y}/${m}`,
				});
			} else {
				monthDayCount++;
			}
		}

		// HEADER ROW 2: days
		const hdr2 = wrapper.createDiv({ cls: 'kanban-matsuo-gantt-row kanban-matsuo-gantt-hdr' });
		const hdr2Left = hdr2.createDiv({ cls: 'kanban-matsuo-gantt-left-cell kanban-matsuo-gantt-hdr-cell' });
		hdr2Left.createSpan({ text: t('wbs.col-task'), cls: 'kanban-matsuo-gantt-hdr-task' });
		hdr2Left.createSpan({ text: t('wbs.col-progress'), cls: 'kanban-matsuo-gantt-hdr-progress' });
		const hdr2Right = hdr2.createDiv({ cls: 'kanban-matsuo-gantt-right-cells kanban-matsuo-gantt-hdr-cell' });
		for (const d of dates) {
			const dayCell = hdr2Right.createDiv({ cls: 'kanban-matsuo-gantt-day-cell' });
			dayCell.setText(d.slice(8, 10));
			if (d === today) dayCell.addClass('kanban-matsuo-gantt-today');
			const dow = new Date(d + 'T00:00:00').getDay();
			if (dow === 0 || dow === 6) dayCell.addClass('kanban-matsuo-gantt-weekend');
		}

		// BODY ROWS: each row has left (task+progress) and right (date cells)
		const bodyArea = wrapper.createDiv({ cls: 'kanban-matsuo-gantt-body' });

		for (const { item, depth } of flatItems) {
			const row = bodyArea.createDiv({
				cls: `kanban-matsuo-gantt-row${item.checked ? ' kanban-matsuo-wbs-done' : ''}`,
				attr: { 'data-gantt-id': item.id },
			});

			// Left: task + progress
			const leftCell = row.createDiv({ cls: 'kanban-matsuo-gantt-left-cell' });
			const taskSpan = leftCell.createSpan({ cls: 'kanban-matsuo-gantt-task' });
			if (depth > 0) taskSpan.style.setProperty('--gantt-depth', `${depth}`);
			taskSpan.setText(`${depth > 0 ? '└ ' : ''}${item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim()}`);
			leftCell.createSpan({ cls: 'kanban-matsuo-gantt-progress', text: (() => {
				let pct = item.checked ? 100 : 0;
				if (item.children.length > 0) {
					const { done, total } = this.countChildren(item.children);
					pct = total > 0 ? Math.round((done / total) * 100) : 0;
				}
				return `${pct}%`;
			})() });

			// Right: date cells
			const rightCells = row.createDiv({ cls: 'kanban-matsuo-gantt-right-cells' });

			for (let di = 0; di < dates.length; di++) {
				const d = dates[di];
				const cell = rightCells.createDiv({
					cls: 'kanban-matsuo-gantt-day-cell kanban-matsuo-gantt-cell',
					attr: { 'data-date': d },
				});
				if (d === today) cell.addClass('kanban-matsuo-gantt-today');
				const dow = new Date(d + 'T00:00:00').getDay();
				if (dow === 0 || dow === 6) cell.addClass('kanban-matsuo-gantt-weekend');

				const start = item.startDate || item.endDate;
				const end = item.endDate || item.startDate;
				const inRange = start && end && d >= start && d <= end;

				if (inRange) {
					const bar = cell.createDiv({ cls: 'kanban-matsuo-gantt-bar' });
					if (item.checked) bar.addClass('kanban-matsuo-gantt-bar-done');
					if (d === start) {
						bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-left' });
						bar.setAttribute('data-label', item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim());
					}
					if (d === end) {
						bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-right' });
					}
					this.setupGanttBarDrag(bar, item, dates);
					if (d === start) {
						const lh = bar.querySelector('.kanban-matsuo-gantt-handle-left') as HTMLElement;
						if (lh) this.setupGanttResize(lh, item, dates, 'start');
					}
					if (d === end) {
						const rh = bar.querySelector('.kanban-matsuo-gantt-handle-right') as HTMLElement;
						if (rh) this.setupGanttResize(rh, item, dates, 'end');
					}
				} else {
					cell.addEventListener('click', () => {
						if (!item.startDate && !item.endDate) { item.startDate = d; item.endDate = d; }
						else if (!item.startDate) { item.startDate = d < item.endDate! ? d : item.endDate; if (d > item.endDate!) item.endDate = d; }
						else if (!item.endDate) { item.endDate = d > item.startDate ? d : item.startDate; if (d < item.startDate) item.startDate = d; }
						this.updateItemTitleDates(item);
						this.scheduleSave();
						this.render();
					});
				}
			}
		}

	}

	/**
	 * Setup drag on a gantt bar to move the entire period.
	 */
	/**
	 * Update gantt bar cells in-place without re-rendering the whole view.
	 * Finds the row by item id and toggles bar visibility per cell.
	 */
	private updateGanttRowInPlace(item: KanbanItem, dates: string[]): void {
		const row = this.contentEl.querySelector(
			`.kanban-matsuo-gantt-row[data-gantt-id="${item.id}"]`
		) as HTMLElement | null;
		if (!row) return;

		const ganttCells = Array.from(row.querySelectorAll('.kanban-matsuo-gantt-cell'));
		const start = item.startDate || item.endDate;
		const end = item.endDate || item.startDate;

		ganttCells.forEach((cell, i) => {
			const d = dates[i];
			if (!d) return;
			const existing = cell.querySelector('.kanban-matsuo-gantt-bar');
			const inRange = start && end && d >= start && d <= end;

			if (inRange && !existing) {
				const bar = (cell as HTMLElement).createDiv({ cls: 'kanban-matsuo-gantt-bar' });
				if (item.checked) bar.addClass('kanban-matsuo-gantt-bar-done');
				if (d === start) {
					const label = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
					bar.setAttribute('data-label', label);
					bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-left' });
				}
				if (d === end) {
					bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-right' });
				}
			} else if (!inRange && existing) {
				existing.remove();
			} else if (inRange && existing) {
				// Update label position
				const bar = existing as HTMLElement;
				if (d === start) {
					const label = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
					bar.setAttribute('data-label', label);
				} else {
					bar.removeAttribute('data-label');
				}
			}
		});
	}

	private setupGanttBarDrag(bar: HTMLElement, item: KanbanItem, dates: string[]): void {
		let startX = 0;
		let origStart = '';
		let origEnd = '';

		bar.addEventListener('mousedown', (e) => {
			if ((e.target as HTMLElement).classList.contains('kanban-matsuo-gantt-handle-left') ||
				(e.target as HTMLElement).classList.contains('kanban-matsuo-gantt-handle-right')) return;

			e.preventDefault();
			e.stopPropagation();
			startX = e.clientX;
			origStart = item.startDate || '';
			origEnd = item.endDate || '';
			this.ganttDragging = true;

			const cellWidth = 28;

			const onMouseMove = (ev: MouseEvent) => {
				const dx = ev.clientX - startX;
				const dayShift = Math.round(dx / cellWidth);
				if (dayShift === 0) return;

				const si = dates.indexOf(origStart);
				const ei = dates.indexOf(origEnd);
				if (si < 0 || ei < 0) return;

				const newSi = Math.max(0, Math.min(dates.length - 1, si + dayShift));
				const newEi = Math.max(0, Math.min(dates.length - 1, ei + dayShift));

				item.startDate = dates[newSi];
				item.endDate = dates[newEi];
				this.updateItemTitleDates(item);
				this.updateGanttRowInPlace(item, dates);
			};

			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				this.ganttDragging = false;
				this.scheduleSave();
				this.render();
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});
	}

	private setupGanttResize(handle: HTMLElement, item: KanbanItem, dates: string[], edge: 'start' | 'end'): void {
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const origDate = edge === 'start' ? (item.startDate || '') : (item.endDate || '');
			const cellWidth = 28;
			this.ganttDragging = true;

			const onMouseMove = (ev: MouseEvent) => {
				const dx = ev.clientX - startX;
				const dayShift = Math.round(dx / cellWidth);
				if (dayShift === 0) return;

				const origIdx = dates.indexOf(origDate);
				if (origIdx < 0) return;

				const newIdx = Math.max(0, Math.min(dates.length - 1, origIdx + dayShift));
				const newDate = dates[newIdx];

				if (edge === 'start') {
					if (item.endDate && newDate > item.endDate) return;
					item.startDate = newDate;
				} else {
					if (item.startDate && newDate < item.startDate) return;
					item.endDate = newDate;
				}

				this.updateItemTitleDates(item);
				this.updateGanttRowInPlace(item, dates);
			};

			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				this.ganttDragging = false;
				this.scheduleSave();
				this.render();
			};

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});
	}

	/**
	 * Update item.title to reflect current startDate/endDate.
	 */
	private updateItemTitleDates(item: KanbanItem): void {
		// Remove existing date markers from title
		let title = item.title.replace(/@\{[^}]*\}/g, '').trim();

		if (item.startDate && item.endDate) {
			title += ` @{${item.startDate}~${item.endDate}}`;
		} else if (item.endDate) {
			title += ` @{${item.endDate}}`;
		} else if (item.startDate) {
			title += ` @{${item.startDate}~}`;
		}

		item.title = title;
	}

	private flattenForWbs(item: KanbanItem, lane: string, depth: number, out: { item: KanbanItem; lane: string; depth: number }[]): void {
		out.push({ item, lane, depth });
		for (const child of item.children) {
			if (!child.archived) this.flattenForWbs(child, lane, depth + 1, out);
		}
	}

	private addDays(dateStr: string, days: number): string {
		const d = new Date(dateStr + 'T00:00:00');
		d.setDate(d.getDate() + days);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${dd}`;
	}

	private generateDateRange(start: string, end: string): string[] {
		const dates: string[] = [];
		let current = start;
		while (current <= end) {
			dates.push(current);
			current = this.addDays(current, 1);
		}
		return dates;
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


	// Drag state for indent detection
	private dragOriginX = 0;
	private dragOriginDepth = 0;

	private handleDragOver(e: DragEvent, listEl: HTMLElement, targetLane: KanbanLane): void {
		if (!this.draggedItem) return;
		this.removePlaceholder();
		this.dragPlaceholder = listEl.createDiv({ cls: 'kanban-matsuo-drop-placeholder' });
		this.dragPlaceholder.remove();

		const afterEl = this.getDragAfterElement(listEl, e.clientY);
		if (afterEl) listEl.insertBefore(this.dragPlaceholder, afterEl);
		else listEl.appendChild(this.dragPlaceholder);

		// Cross-lane: always top level (no indent)
		const isCrossLane = this.draggedFromLane !== targetLane;
		let targetDepth = 0;

		if (!isCrossLane) {
			// Same lane: calculate depth from drag offset
			const aboveEl = this.getCardAbovePlaceholder(listEl);
			const aboveDepth = aboveEl ? this.getCardDepth(aboveEl) : -1;

			const dx = e.clientX - this.dragOriginX;
			const depthDelta = Math.round(dx / 60);
			targetDepth = Math.max(0, this.dragOriginDepth + depthDelta);
			targetDepth = Math.min(targetDepth, aboveDepth + 1);
		}

		this.dragPlaceholder.style.setProperty('--card-depth', `${targetDepth}`);
		if (targetDepth > 0) {
			this.dragPlaceholder.addClass('kanban-matsuo-drop-placeholder-indented');
		} else {
			this.dragPlaceholder.removeClass('kanban-matsuo-drop-placeholder-indented');
		}
	}

	private getCardAbovePlaceholder(listEl: HTMLElement): HTMLElement | null {
		let lastCard: HTMLElement | null = null;
		for (const child of Array.from(listEl.children)) {
			if (child === this.dragPlaceholder) break;
			if (child.classList.contains('kanban-matsuo-card')) lastCard = child as HTMLElement;
		}
		return lastCard;
	}

	private getCardDepth(el: HTMLElement): number {
		const depthStr = el.style.getPropertyValue('--card-depth');
		return depthStr ? parseInt(depthStr, 10) : 0;
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

		const isCrossLane = this.draggedFromLane !== targetLane;

		// Remove from source (could be top-level or nested)
		this.removeItemRecursive(this.draggedFromLane.items, this.draggedItem);

		// Cross-lane moves always go to top level
		const targetDepth = isCrossLane ? 0
			: (this.dragPlaceholder
				? parseInt(this.dragPlaceholder.style.getPropertyValue('--card-depth') || '0', 10)
				: 0);

		// Build a flat list of visible cards with their items and depths
		const flatList = this.buildFlatList(targetLane.items, 0);

		// Find index in flat list where we're inserting
		const cardsBefore: string[] = [];
		if (this.dragPlaceholder) {
			for (const child of Array.from(listEl.children)) {
				if (child === this.dragPlaceholder) break;
				if (child.classList.contains('kanban-matsuo-card')) {
					const id = child.getAttribute('data-item-id');
					if (id) cardsBefore.push(id);
				}
			}
		}

		if (targetDepth === 0) {
			// Insert at top level
			const insertIdx = this.findTopLevelInsertIndex(targetLane, cardsBefore);
			targetLane.items.splice(insertIdx, 0, this.draggedItem);
		} else {
			// Find the parent: walk backwards through cards above to find one at depth = targetDepth - 1
			let parentItem: KanbanItem | null = null;
			for (let i = cardsBefore.length - 1; i >= 0; i--) {
				const entry = flatList.find((f) => f.item.id === cardsBefore[i]);
				if (entry && entry.depth < targetDepth) {
					parentItem = entry.item;
					break;
				}
			}

			if (parentItem) {
				// Find insert position within parent's children
				// By default append at end, but if there are cards below from same parent, insert before
				const lastAboveId = cardsBefore[cardsBefore.length - 1];
				const lastAboveIdx = parentItem.children.findIndex((c) => c.id === lastAboveId);
				if (lastAboveIdx >= 0) {
					parentItem.children.splice(lastAboveIdx + 1, 0, this.draggedItem);
				} else {
					parentItem.children.push(this.draggedItem);
				}
			} else {
				// Fallback: top level
				targetLane.items.push(this.draggedItem);
			}
		}

		this.removePlaceholder();
		this.render();
		this.scheduleSave();
	}

	private buildFlatList(items: KanbanItem[], depth: number): { item: KanbanItem; depth: number }[] {
		const result: { item: KanbanItem; depth: number }[] = [];
		for (const item of items) {
			if (!item.archived) {
				result.push({ item, depth });
				result.push(...this.buildFlatList(item.children, depth + 1));
			}
		}
		return result;
	}

	private findTopLevelInsertIndex(lane: KanbanLane, cardsBefore: string[]): number {
		if (cardsBefore.length === 0) return 0;

		const lastAboveId = cardsBefore[cardsBefore.length - 1];

		// Find which top-level item owns the last card above
		for (let i = lane.items.length - 1; i >= 0; i--) {
			const topItem = lane.items[i];
			if (this.containsId(topItem, lastAboveId)) {
				return i + 1;
			}
		}
		return lane.items.length;
	}

	private containsId(item: KanbanItem, id: string): boolean {
		if (item.id === id) return true;
		return item.children.some((c) => this.containsId(c, id));
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

		// Start date
		const startSetting = new Setting(contentEl)
			.setName(t('card-editor.start-date'));
		const startInput = startSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: { type: 'date', 'aria-label': t('card-editor.start-date') },
		});
		(startInput as HTMLInputElement).value = this.item.startDate || '';

		// End date
		const endSetting = new Setting(contentEl)
			.setName(t('card-editor.end-date'));
		const endInput = endSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: { type: 'date', 'aria-label': t('card-editor.end-date') },
		});
		(endInput as HTMLInputElement).value = this.item.endDate || '';

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


		// Buttons
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText(t('modal.save')).setCta().onClick(() => {
					this.saveAndClose(titleInput, tagsInput as HTMLInputElement, startInput as HTMLInputElement, endInput as HTMLInputElement, bodyInput);
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
		startEl: HTMLInputElement,
		endEl: HTMLInputElement,
		bodyEl: HTMLTextAreaElement,
	): void {
		const title = titleEl.value.trim();
		if (!title) return;

		const tags = tagsEl.value
			.split(',')
			.map((s) => s.trim().replace(/^#/, ''))
			.filter((s) => s.length > 0);
		const startDate = startEl.value || null;
		const endDate = endEl.value || null;

		let fullTitle = title;
		if (tags.length > 0) {
			fullTitle += ' ' + tags.map((tag) => `#${tag}`).join(' ');
		}
		if (startDate && endDate) {
			fullTitle += ` @{${startDate}~${endDate}}`;
		} else if (endDate) {
			fullTitle += ` @{${endDate}}`;
		} else if (startDate) {
			fullTitle += ` @{${startDate}~}`;
		}

		this.item.title = fullTitle;
		this.item.tags = tags;
		this.item.startDate = startDate;
		this.item.endDate = endDate;
		this.item.body = bodyEl.value.trim();

		this.onSave(this.item);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
