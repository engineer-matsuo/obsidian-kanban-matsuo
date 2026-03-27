import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Menu,
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
import { createOrUpdateLinkedNote, syncAllLinkedNotes, colorForUuid } from './linked-notes';
import { WipLimitModal, ConfirmDeleteModal, CardEditorModal, ArchiveModal } from './modals';
import {
	GanttContext,
	updateGanttBarStatesInDom,
	updateGanttChildBarStatesInDom,
	renderWbs,
	computeParentDates,
	highlightWbsRow,
} from './gantt';
import {
	DragContext,
	handleDragOver,
	handleDrop,
	removeItemRecursive,
	setupTouchDragCard,
} from './drag-drop';

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

	// Filter state: multiple AND conditions
	private filters: { mode: FilterMode; value: string }[] = [];

	// Rich card display toggle
	private richMode = false;

	// WBS view toggle
	private showWbs = true;
	private ganttHiddenLanes = new Set<string>();
	private ganttDragging = false;
	private ganttSortedIds: string[] = [];

	// External change detection (counter to handle concurrent saves)
	private ignoreModifyCount = 0;

	// Drag state for indent detection
	private dragOriginX = 0;
	private dragOriginDepth = 0;
	private lastDragAfterElId: string | null = null;
	private lastDragDepth = -1;

	// Gantt auto-scroll timer
	private ganttAutoScrollTimer: number | null = null;

	// Card drag auto-scroll state
	private cardAutoScrollRaf: number | null = null;
	private cardAutoScrollMouseX = 0;
	private cardAutoScrollMouseY = 0;

	// Insert zone state
	private activeInsertZone: HTMLElement | null = null;
	private insertZoneData = new WeakMap<HTMLElement, { lane: KanbanLane; targetList: KanbanItem[]; insertIndex: number }>();

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

	// eslint-disable-next-line @typescript-eslint/require-await
	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('kanban-matsuo-container');

		// File change detection via registerEvent (auto-cleanup on view close)
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (this.ignoreModifyCount > 0) {
					this.ignoreModifyCount--;
					return;
				}
				if (file instanceof TFile && this.file && file.path === this.file.path) {
					void this.loadFile(file);
				}
			})
		);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
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
		// Assign UUID to boards that don't have one
		if (!this.board.settings.boardUuid) {
			this.board.settings.boardUuid = crypto.randomUUID();
			this.ignoreModifyCount++;
			await this.app.vault.process(file, () => boardToMarkdown(this.board!));
		}
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
		// Refresh file explorer UUID folder colors
		void this.plugin.refreshUuidFolderColors();
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
			void this.save();
		}, this.plugin.settings.autoSaveDelay);
	}

	private async save(): Promise<void> {
		if (!this.board || !this.file) return;
		this.ignoreModifyCount++;
		const board = this.board;
		await this.app.vault.process(this.file, () => boardToMarkdown(board));

		// Sync linked notes if feature is enabled
		if (this.plugin.settings.linkedNotesEnabled && this.plugin.settings.linkedNoteFolder) {
			const changed = await syncAllLinkedNotes(
				this.app,
				board,
				this.file.path,
				this.plugin.settings.linkedNoteFolder,
			);
			if (changed) {
				// linkedNotePath was cleared for deleted notes — save again
				this.ignoreModifyCount++;
				await this.app.vault.process(this.file, () => boardToMarkdown(board));
			}
		}
	}

	private render(): void {
		if (!this.board) return;

		// Recompute parent dates from children before any rendering
		for (const lane of this.board.lanes) {
			for (const item of lane.items) {
				if (!item.archived) computeParentDates(item);
			}
		}

		// Save scroll positions before re-render
		const ganttWrap = this.contentEl.querySelector('.kanban-matsuo-gantt-wrapper');
		const savedGanttScrollLeft = ganttWrap?.scrollLeft ?? 0;
		const savedGanttScrollTop = ganttWrap?.scrollTop ?? 0;

		const boardEl = this.contentEl.querySelector('.kanban-matsuo-board');
		const savedBoardScrollLeft = boardEl?.scrollLeft ?? 0;
		const savedBoardScrollTop = boardEl?.scrollTop ?? 0;

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
		}

		// Restore all scroll positions after DOM is ready
		const board = this.boardEl;
		requestAnimationFrame(() => {
			board.scrollLeft = savedBoardScrollLeft;
			board.scrollTop = savedBoardScrollTop;
			if (this.showWbs) {
				const newWrap = this.contentEl.querySelector('.kanban-matsuo-gantt-wrapper');
				if (newWrap) { newWrap.scrollLeft = savedGanttScrollLeft; newWrap.scrollTop = savedGanttScrollTop; }
			}
		});
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
			this.filters = [];
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

		if (this.filters.length > 0) {
			const dateLabels: Record<string, string> = {
				'overdue': t('filter.overdue'),
				'today': t('filter.today'),
				'week': t('filter.this-week'),
				'none': t('filter.no-date'),
			};

			for (let fi = 0; fi < this.filters.length; fi++) {
				const f = this.filters[fi];
				let label = '';
				if (f.mode === 'tag') label = `#${f.value}`;
				else if (f.mode === 'date') label = dateLabels[f.value] || f.value;

				const badge = leftGroup.createSpan({ cls: 'kanban-matsuo-filter-badge', text: label });
				const clearBtn = badge.createEl('button', {
					cls: 'kanban-matsuo-filter-clear-btn clickable-icon',
					attr: { 'aria-label': t('filter.clear') },
				});
				setIcon(clearBtn, 'x');
				const idx = fi;
				clearBtn.addEventListener('click', () => {
					this.filters.splice(idx, 1);
					this.render();
				});
			}
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

		// Archive button
		const archiveCount = this.countArchivedItems();
		const archiveBtn = rightGroup.createEl('button', {
			cls: 'kanban-matsuo-archive-btn clickable-icon',
			attr: { 'aria-label': t('archive.open'), 'data-tooltip-position': 'top' },
		});
		setIcon(archiveBtn, 'archive');
		if (archiveCount > 0) {
			archiveBtn.createSpan({ cls: 'kanban-matsuo-archive-badge', text: t('archive.count', { count: archiveCount }) });
		}
		archiveBtn.addEventListener('click', () => {
			new ArchiveModal(this.app, this.board!, (board) => {
				this.board = board;
				this.render();
				this.scheduleSave();
			}).open();
		});

		// Board UUID label (read-only, click to copy)
		if (this.board.settings.boardUuid) {
			const uuid = this.board.settings.boardUuid;
			const uuidLabel = rightGroup.createSpan({
				cls: 'kanban-matsuo-board-uuid',
				text: `ID: ${uuid}`,
				attr: {
					'aria-label': t('board.uuid-click-to-copy'),
					'data-tooltip-position': 'top',
				},
			});
			uuidLabel.setAttribute('style', `--kanban-uuid-color: ${colorForUuid(uuid)}`);
			uuidLabel.addEventListener('click', () => {
				void navigator.clipboard.writeText(uuid);
				uuidLabel.setText(`ID: ${uuid} ✓`);
				window.setTimeout(() => uuidLabel.setText(`ID: ${uuid}`), 1500);
			});
		}
	}

	private countArchivedItems(): number {
		if (!this.board) return 0;
		let count = 0;
		const countInItems = (items: KanbanItem[]) => {
			for (const item of items) {
				if (item.archived) count++;
				countInItems(item.children);
			}
		};
		for (const lane of this.board.lanes) countInItems(lane.items);
		return count;
	}

	private collectTags(items: KanbanItem[], tags: Set<string>): void {
		for (const item of items) {
			if (item.archived) continue;
			item.tags.forEach((tag) => tags.add(tag));
			this.collectTags(item.children, tags);
		}
	}

	private showTagFilterMenu(e: MouseEvent | Event): void {
		if (!this.board) return;
		const menu = new Menu();
		const allTags = new Set<string>();
		for (const lane of this.board.lanes) {
			this.collectTags(lane.items, allTags);
		}

		menu.addItem((mi) => mi.setTitle(t('filter.all')).setIcon('list').onClick(() => {
			this.filters = this.filters.filter((f) => f.mode !== 'tag'); this.render();
		}));
		for (const tag of allTags) {
			const active = this.filters.some((f) => f.mode === 'tag' && f.value === tag);
			menu.addItem((mi) => {
				mi.setTitle(`${active ? '✓ ' : ''}#${tag}`).setIcon('tag').onClick(() => {
				if (active) {
					this.filters = this.filters.filter((f) => !(f.mode === 'tag' && f.value === tag));
				} else {
					this.filters.push({ mode: 'tag', value: tag });
				}
				this.render();
			});
			});
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
			if (!val) {
				menu.addItem((mi) => mi.setTitle(title).setIcon(icon).onClick(() => {
					this.filters = this.filters.filter((f) => f.mode !== 'date');
					this.render();
				}));
				continue;
			}
			const active = this.filters.some((f) => f.mode === 'date' && f.value === val);
			menu.addItem((mi) => mi.setTitle(`${active ? '✓ ' : ''}${title}`).setIcon(icon).onClick(() => {
				if (active) {
					this.filters = this.filters.filter((f) => !(f.mode === 'date' && f.value === val));
				} else {
					this.filters.push({ mode: 'date', value: val });
				}
				this.render();
			}));
		}
		this.showMenuAtEvent(menu, e);
	}

	/** Check if item itself matches ALL active filters (AND). */
	private itemMatchesFilter(item: KanbanItem): boolean {
		if (item.archived) return false;
		if (this.filters.length === 0) return true;

		return this.filters.every((f) => {
			if (f.mode === 'tag') return item.tags.includes(f.value);
			if (f.mode === 'date') {
				const today = this.getToday();
				switch (f.value) {
					case 'overdue': return item.endDate !== null && item.endDate < today;
					case 'today': return item.endDate === today;
					case 'week': {
						if (!item.endDate) return false;
						const now = new Date(today + 'T00:00:00');
						const day = now.getDay();
						const diffToMon = day === 0 ? -6 : 1 - day;
						const monday = new Date(now); monday.setDate(now.getDate() + diffToMon);
						const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
						const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
						return item.endDate >= fmt(monday) && item.endDate <= fmt(sunday);
					}
					case 'none': return item.endDate === null;
				}
			}
			return true;
		});
	}

	/** Check if item or any descendant matches the filter. */
	private isItemVisible(item: KanbanItem): boolean {
		if (item.archived) return false;
		if (this.itemMatchesFilter(item)) return true;
		return item.children.some((child) => this.isItemVisible(child));
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

				// Cross-lane: only accept if mouse is well inside this lane (>40px from edge)
				if (this.draggedFromLane !== lane) {
					const rect = listEl.getBoundingClientRect();
					const insetX = e.clientX - rect.left;
					if (insetX < 40 || insetX > rect.width - 40) return;
				}

				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
				const ctx = this.getDragContext();
				handleDragOver(e, listEl, lane, ctx);
				this.syncDragContext(ctx);

				// Auto-scroll the board while dragging
				this.startCardAutoScroll(e);
			});
			// dragleave: do nothing (dragend handles cleanup)
			// Removing placeholder on dragleave causes flicker because
			// dragleave fires when entering child elements.

			listEl.addEventListener('drop', (e) => {
				if (!this.draggedItem) return;
				e.preventDefault();
				this.stopCardAutoScroll();
				const ctx = this.getDragContext();
				handleDrop(lane, listEl, ctx, { lanes: this.board!.lanes });
				this.syncDragContext(ctx);
				this.render();
				this.scheduleSave();
			});

			for (let i = 0; i < lane.items.length; i++) {
				const item = lane.items[i];
				if (this.isItemVisible(item)) {
					this.renderInsertZone(listEl, lane, lane.items, i, 0);
					this.renderCardTree(listEl, item, lane, 0);
				}
			}
			this.setupInsertZoneDetection(listEl);
			this.renderAddCardInput(laneEl, lane);
		}
	}

	/**
	 * Render a card and its children recursively, each as a separate card in the list.
	 * Children are indented by depth level.
	 */
	private renderCardTree(container: HTMLElement, item: KanbanItem, lane: KanbanLane, depth: number): void {
		this.renderCard(container, item, lane, depth);
		for (let i = 0; i < item.children.length; i++) {
			const child = item.children[i];
			if (this.isItemVisible(child)) {
				this.renderInsertZone(container, lane, item.children, i, depth + 1);
				this.renderCardTree(container, child, lane, depth + 1);
			}
		}
	}

	/** Create a zero-height marker for an insert position. Metadata is stored in insertZoneData. */
	private renderInsertZone(
		container: HTMLElement,
		lane: KanbanLane,
		targetList: KanbanItem[],
		insertIndex: number,
		depth: number,
	): void {
		const zone = container.createDiv({ cls: 'kanban-matsuo-insert-zone' });
		if (depth > 0) {
			zone.style.setProperty('margin-left', `calc(${depth} * var(--size-4-4))`);
		}
		this.insertZoneData.set(zone, { lane, targetList, insertIndex });
	}

	/**
	 * Detect cursor proximity to insert zones via mousemove on the card list.
	 * This avoids tiny hover targets and layout-shift flicker.
	 */
	private setupInsertZoneDetection(listEl: HTMLElement): void {
		let hoverTimer: number | null = null;
		let hoveredZone: HTMLElement | null = null;

		listEl.addEventListener('mousemove', (e) => {
			if (this.draggedItem) return;
			if (this.activeInsertZone?.hasClass('kanban-matsuo-insert-zone-editing')) return;

			const zones = listEl.querySelectorAll(':scope > .kanban-matsuo-insert-zone');
			const mouseY = e.clientY;
			let nearest: HTMLElement | null = null;
			let nearestDist = 30; // px threshold

			for (const z of zones) {
				const rect = (z as HTMLElement).getBoundingClientRect();
				const dist = Math.abs(mouseY - rect.top);
				if (dist < nearestDist) {
					nearestDist = dist;
					nearest = z as HTMLElement;
				}
			}

			if (nearest === hoveredZone) return;

			if (hoverTimer) { window.clearTimeout(hoverTimer); hoverTimer = null; }

			// Deactivate previous if not editing
			if (this.activeInsertZone && !this.activeInsertZone.hasClass('kanban-matsuo-insert-zone-editing')) {
				this.deactivateInsertZone(this.activeInsertZone);
			}

			hoveredZone = nearest;

			if (nearest) {
				const zone = nearest;
				hoverTimer = window.setTimeout(() => {
					const data = this.insertZoneData.get(zone);
					if (data) {
						this.activateInsertZone(zone, data.lane, data.targetList, data.insertIndex);
					}
				}, 400);
			}
		});

		listEl.addEventListener('mouseleave', () => {
			if (hoverTimer) { window.clearTimeout(hoverTimer); hoverTimer = null; }
			hoveredZone = null;
			if (this.activeInsertZone && !this.activeInsertZone.hasClass('kanban-matsuo-insert-zone-editing')) {
				this.deactivateInsertZone(this.activeInsertZone);
			}
		});
	}

	private activateInsertZone(
		zone: HTMLElement,
		lane: KanbanLane,
		targetList: KanbanItem[],
		insertIndex: number,
	): void {
		if (this.activeInsertZone && this.activeInsertZone !== zone) {
			this.deactivateInsertZone(this.activeInsertZone);
		}

		this.activeInsertZone = zone;
		zone.addClass('kanban-matsuo-insert-zone-active');

		const popup = zone.createDiv({ cls: 'kanban-matsuo-insert-popup' });
		popup.setText(t('card.add'));
		popup.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showInsertZoneInput(zone, lane, targetList, insertIndex);
		});
	}

	private showInsertZoneInput(
		zone: HTMLElement,
		_lane: KanbanLane,
		targetList: KanbanItem[],
		insertIndex: number,
	): void {
		zone.empty();
		zone.addClass('kanban-matsuo-insert-zone-editing');

		const editor = zone.createDiv({ cls: 'kanban-matsuo-insert-editor' });
		const textarea = editor.createEl('textarea', {
			cls: 'kanban-matsuo-insert-zone-textarea',
			attr: { placeholder: t('card.add'), rows: '1' },
		});
		requestAnimationFrame(() => textarea.focus());

		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				if (this.isNewlineKey(e)) return;
				e.preventDefault();
				const value = textarea.value.trim();
				if (value) {
					targetList.splice(insertIndex, 0, createItem(value));
					this.render();
					this.scheduleSave();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.deactivateInsertZone(zone);
			}
		});

		// Close on outside click
		const onDocMouseDown = (e: MouseEvent) => {
			if (!zone.contains(e.target as Node)) {
				document.removeEventListener('mousedown', onDocMouseDown);
				this.deactivateInsertZone(zone);
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
	}

	private deactivateInsertZone(zone: HTMLElement): void {
		zone.removeClass('kanban-matsuo-insert-zone-active');
		zone.removeClass('kanban-matsuo-insert-zone-editing');
		zone.empty();
		if (this.activeInsertZone === zone) {
			this.activeInsertZone = null;
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

			// Create small drag ghost
			const ghost = document.body.createDiv({ cls: 'kanban-matsuo-drag-ghost' });
			const title = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
			ghost.setText(title.length > 20 ? title.slice(0, 20) + '…' : title);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', item.id);
				e.dataTransfer.setDragImage(ghost, 60, 15);
			}
			window.setTimeout(() => {
				ghost.remove();
				cardEl.addClass('kanban-matsuo-card-dragging');
			}, 0);
		});
		cardEl.addEventListener('dragend', () => {
			cardEl.removeClass('kanban-matsuo-card-dragging');
			this.draggedItem = null; this.draggedFromLane = null;
			this.lastDragAfterElId = null; this.lastDragDepth = -1;
			this.removePlaceholder();
			this.stopCardAutoScroll();
		});

		// Touch drag for card
		setupTouchDragCard(cardEl, item, lane, this.getDragContext());

		// Keyboard
		cardEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openCardEditor(item, lane); }
			else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) { e.preventDefault(); this.deleteItem(item, lane); }
		});
		cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showCardMenu(e, item, lane); });

		// Click card body → highlight in WBS
		cardEl.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('a, input, button')) return;
			const ctx = this.getGanttContext();
			highlightWbsRow(ctx, item.id);
		});

		// Checkbox
		if (this.board!.settings.showCheckboxes) {
			const checkboxEl = cardEl.createEl('input', {
				cls: 'kanban-matsuo-card-checkbox task-list-item-checkbox',
				attr: { type: 'checkbox', 'aria-label': item.checked ? t('card.mark-as-incomplete', { title: item.title }) : t('card.mark-as-complete', { title: item.title }) },
			});
			(checkboxEl).checked = item.checked;
			checkboxEl.addEventListener('change', () => {
				item.checked = (checkboxEl).checked;
				cardEl.toggleClass('kanban-matsuo-card-checked', item.checked);

				// If parent checked, check all children recursively
				if (item.checked && item.children.length > 0) {
					this.setAllChecked(item.children, true);
					// Update child checkboxes in DOM
					this.updateChildCheckboxesInDom(item.children);
				}

				// Update progress bar on parent card if exists
				this.updateProgressBarsInDom();

				// Update gantt chart bars (done state)
				const ctx = this.getGanttContext();
				updateGanttBarStatesInDom(ctx, item);
				if (item.children.length > 0) {
					updateGanttChildBarStatesInDom(ctx, item.children);
				}

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
				tagSpan.addEventListener('click', (e) => { e.stopPropagation(); if (!this.filters.some((f) => f.mode === 'tag' && f.value === tag)) { this.filters.push({ mode: 'tag', value: tag }); } this.render(); });
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

		// Spacer to push action buttons to the right
		btnRow.createDiv({ cls: 'kanban-matsuo-indent-spacer' });

		// Linked note button (only when feature is enabled and folder is set)
		if (this.plugin.settings.linkedNotesEnabled && this.plugin.settings.linkedNoteFolder) {
			const isLinked = !!item.linkedNotePath;
			const linkBtn = btnRow.createEl('button', {
				cls: 'kanban-matsuo-card-link-btn clickable-icon',
				attr: {
					'aria-label': isLinked ? t('card.open-note') : t('card.create-note'),
					'data-tooltip-position': 'top',
				},
			});
			setIcon(linkBtn, isLinked ? 'file-text' : 'file-plus');
			linkBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (isLinked && item.linkedNotePath) {
					// Check file still exists before opening
					const file = this.app.vault.getAbstractFileByPath(item.linkedNotePath);
					if (file instanceof TFile) {
						void this.app.workspace.openLinkText(item.linkedNotePath, this.file?.path || '');
					} else {
						// File was deleted externally — clear and recreate
						item.linkedNotePath = null;
						void this.createLinkedNoteForCard(item, lane);
					}
				} else {
					void this.createLinkedNoteForCard(item, lane);
				}
			});
		}

		// Archive button
		const archiveBtn = btnRow.createEl('button', {
			cls: 'kanban-matsuo-card-archive-btn clickable-icon',
			attr: { 'aria-label': t('card.archive'), 'data-tooltip-position': 'top' },
		});
		setIcon(archiveBtn, 'archive');
		archiveBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const title = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
			new ConfirmDeleteModal(this.app, title, 0, () => {
				item.archived = true;
				this.render();
				this.scheduleSave();
			}, t('card.archive'), t('card.archive')).open();
		});
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
			const found = this.findParentItem(item.children, target, item.children);
			if (found) return found;
		}
		return null;
	}

	/**
	 * Update child checkbox elements in the DOM without re-rendering.
	 */
	private updateChildCheckboxesInDom(children: KanbanItem[]): void {
		for (const child of children) {
			const cardEl = this.boardEl?.querySelector(`[data-item-id="${child.id}"]`) as HTMLElement | null;
			if (cardEl) {
				const cb = cardEl.querySelector('.kanban-matsuo-card-checkbox');
				if (cb) (cb as HTMLInputElement).checked = child.checked;
				cardEl.toggleClass('kanban-matsuo-card-checked', child.checked);
			}
			if (child.children.length > 0) this.updateChildCheckboxesInDom(child.children);
		}
	}

	/**
	 * Update all progress bars in DOM without re-rendering.
	 */
	private updateProgressBarsInDom(): void {
		if (!this.board) return;
		const allItems = this.getAllItemsFlat();
		for (const item of allItems) {
			if (item.children.length === 0) continue;
			const cardEl = this.boardEl?.querySelector(`[data-item-id="${item.id}"]`) as HTMLElement | null;
			if (!cardEl) continue;
			const progressText = cardEl.querySelector('.kanban-matsuo-progress-text');
			const progressFill = cardEl.querySelector('.kanban-matsuo-progress-fill');
			if (progressText && progressFill) {
				const { done, total } = this.countChildren(item.children);
				progressText.setText(t('subtask.progress', { done, total }));
				const pct = total > 0 ? (done / total) * 100 : 0;
				(progressFill as HTMLElement).setCssStyles({ '--progress-pct': `${pct}%` } as unknown as Partial<CSSStyleDeclaration>);
			}
		}
	}

	private getAllItemsFlat(): KanbanItem[] {
		if (!this.board) return [];
		const result: KanbanItem[] = [];
		const collect = (items: KanbanItem[]) => {
			for (const item of items) {
				result.push(item);
				collect(item.children);
			}
		};
		for (const lane of this.board.lanes) collect(lane.items);
		return result;
	}

	private setAllChecked(items: KanbanItem[], checked: boolean): void {
		for (const item of items) {
			item.checked = checked;
			this.setAllChecked(item.children, checked);
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

	/** Build a GanttContext from current state. */
	private getGanttContext(): GanttContext {
		return {
			contentEl: this.contentEl,
			board: this.board!,
			ganttHiddenLanes: this.ganttHiddenLanes,
			ganttSortedIds: this.ganttSortedIds,
			ganttDragging: this.ganttDragging,
			ganttAutoScrollTimer: this.ganttAutoScrollTimer,
			getToday: () => this.getToday(),
			countChildren: (children) => this.countChildren(children),
			openCardEditor: (item) => this.openCardEditor(item, null as unknown as KanbanLane),
			scheduleSave: () => this.scheduleSave(),
			render: () => this.render(),
		};
	}

	/** Sync mutable gantt state back from context after delegation. */
	private syncGanttContext(ctx: GanttContext): void {
		this.ganttSortedIds = ctx.ganttSortedIds;
		this.ganttDragging = ctx.ganttDragging;
		this.ganttAutoScrollTimer = ctx.ganttAutoScrollTimer;
	}

	/**
	 * Render WBS/Gantt chart below the board.
	 * Left: task tree with status (lane). Right: date timeline bars.
	 */
	private renderWbs(container: HTMLElement): void {
		if (!this.board) return;
		const ctx = this.getGanttContext();
		renderWbs(ctx, container);
		this.syncGanttContext(ctx);
	}

	/** Build a DragContext from current state. */
	private getDragContext(): DragContext {
		return {
			draggedItem: this.draggedItem,
			draggedFromLane: this.draggedFromLane,
			dragPlaceholder: this.dragPlaceholder,
			dragOriginX: this.dragOriginX,
			dragOriginDepth: this.dragOriginDepth,
			lastDragAfterElId: this.lastDragAfterElId,
			lastDragDepth: this.lastDragDepth,
			touchStartX: this.touchStartX,
			touchStartY: this.touchStartY,
		};
	}

	/** Sync mutable drag state back from context after delegation. */
	private syncDragContext(ctx: DragContext): void {
		this.draggedItem = ctx.draggedItem;
		this.draggedFromLane = ctx.draggedFromLane;
		this.dragPlaceholder = ctx.dragPlaceholder;
		this.dragOriginX = ctx.dragOriginX;
		this.dragOriginDepth = ctx.dragOriginDepth;
		this.lastDragAfterElId = ctx.lastDragAfterElId;
		this.lastDragDepth = ctx.lastDragDepth;
		this.touchStartX = ctx.touchStartX;
		this.touchStartY = ctx.touchStartY;
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
			textarea.setCssStyles({ '--textarea-rows': '1' } as unknown as Partial<CSSStyleDeclaration>);
			const scrollH = textarea.scrollHeight;
			textarea.setCssStyles({ '--textarea-height': `${scrollH}px` } as unknown as Partial<CSSStyleDeclaration>);
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

	private removePlaceholder(): void {
		if (this.dragPlaceholder) { this.dragPlaceholder.remove(); this.dragPlaceholder = null; }
	}

	/** Auto-scroll the board during card drag (rAF-based, distance-proportional) */
	private startCardAutoScroll(e: DragEvent): void {
		// Skip zero coordinates (browser sends 0,0 during some drag phases)
		if (e.clientX === 0 && e.clientY === 0) return;
		this.cardAutoScrollMouseX = e.clientX;
		this.cardAutoScrollMouseY = e.clientY;

		// Only start the rAF loop if not already running
		if (this.cardAutoScrollRaf !== null) return;

		const edgeZone = 80;
		const maxSpeed = 18;

		const tick = () => {
			if (!this.boardEl) { this.cardAutoScrollRaf = null; return; }

			const mx = this.cardAutoScrollMouseX;
			const my = this.cardAutoScrollMouseY;
			const boardRect = this.boardEl.getBoundingClientRect();

			// Vertical: scroll board up/down when near top/bottom edge
			const distTop = my - boardRect.top;
			const distBottom = boardRect.bottom - my;

			if (distTop >= 0 && distTop < edgeZone) {
				const ratio = 1 - distTop / edgeZone;
				this.boardEl.scrollTop -= maxSpeed * ratio * ratio;
			} else if (distBottom >= 0 && distBottom < edgeZone) {
				const ratio = 1 - distBottom / edgeZone;
				this.boardEl.scrollTop += maxSpeed * ratio * ratio;
			}

			// Horizontal: scroll board left/right when near left/right edge
			const distLeft = mx - boardRect.left;
			const distRight = boardRect.right - mx;

			if (distLeft >= 0 && distLeft < edgeZone) {
				const ratio = 1 - distLeft / edgeZone;
				this.boardEl.scrollLeft -= maxSpeed * ratio * ratio;
			} else if (distRight >= 0 && distRight < edgeZone) {
				const ratio = 1 - distRight / edgeZone;
				this.boardEl.scrollLeft += maxSpeed * ratio * ratio;
			}

			this.cardAutoScrollRaf = requestAnimationFrame(tick);
		};

		this.cardAutoScrollRaf = requestAnimationFrame(tick);
	}

	private stopCardAutoScroll(): void {
		if (this.cardAutoScrollRaf !== null) {
			cancelAnimationFrame(this.cardAutoScrollRaf);
			this.cardAutoScrollRaf = null;
		}
	}

	private deleteItem(item: KanbanItem, lane: KanbanLane): void {
		if (removeItemRecursive(lane.items, item)) {
			this.render();
			this.scheduleSave();
		}
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
		removeItemRecursive(lane.items, item);
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

		// Linked notes menu items
		if (this.plugin.settings.linkedNotesEnabled && this.plugin.settings.linkedNoteFolder) {
			if (item.linkedNotePath) {
				menu.addItem((mi) => mi.setTitle(t('card.open-note')).setIcon('file-text')
					.onClick(async () => {
						const file = this.app.vault.getAbstractFileByPath(item.linkedNotePath!);
						if (file instanceof TFile) {
							await this.app.workspace.openLinkText(item.linkedNotePath!, this.file?.path || '');
						} else {
							item.linkedNotePath = null;
							await this.createLinkedNoteForCard(item, lane);
						}
					}));
				menu.addItem((mi) => mi.setTitle(t('card.unlink-note')).setIcon('link-2-off')
					.onClick(() => {
						item.linkedNotePath = null;
						this.render();
						this.scheduleSave();
					}));
			} else {
				menu.addItem((mi) => mi.setTitle(t('card.create-note')).setIcon('file-plus')
					.onClick(async () => await this.createLinkedNoteForCard(item, lane)));
			}
		} else {
			// Legacy behavior when linked notes feature is disabled
			menu.addItem((mi) => mi.setTitle(t('card.create-note')).setIcon('file-plus')
				.onClick(async () => await this.createLinkedNote(item)));

			const wikilinkMatch = item.title.match(/\[\[([^\]]+)\]\]/);
			if (wikilinkMatch) {
				menu.addItem((mi) => mi.setTitle(t('card.open-note')).setIcon('file-text')
					.onClick(async () => { await this.app.workspace.openLinkText(wikilinkMatch[1].split('|')[0], this.file?.path || ''); }));
			}
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
						removeItemRecursive(lane.items, item);
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

	private async createLinkedNoteForCard(item: KanbanItem, lane: KanbanLane): Promise<void> {
		if (!this.board || !this.file) return;
		const baseFolder = this.plugin.settings.linkedNoteFolder;
		if (!baseFolder) return;

		// Ensure board has a UUID
		if (!this.board.settings.boardUuid) {
			this.board.settings.boardUuid = crypto.randomUUID();
		}

		const notePath = await createOrUpdateLinkedNote(
			this.app,
			item,
			lane,
			this.board,
			this.file.path,
			baseFolder,
		);
		if (notePath) {
			item.linkedNotePath = notePath;
			this.render();
			this.scheduleSave();
			await this.app.workspace.openLinkText(notePath, this.file.path);
		}
	}

	/** Legacy linked note creation (for context menu when linked notes feature is disabled) */
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
