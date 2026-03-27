import { Menu, setIcon } from 'obsidian';
import { KanbanBoard, KanbanItem } from './types';
import { t } from './lang';

export interface GanttContext {
	contentEl: HTMLElement;
	board: KanbanBoard;
	ganttHiddenLanes: Set<string>;
	ganttSortedIds: string[];
	ganttDragging: boolean;
	ganttAutoScrollTimer: number | null;
	getToday: () => string;
	countChildren: (children: KanbanItem[]) => { done: number; total: number };
	openCardEditor: (item: KanbanItem) => void;
	scheduleSave: () => void;
	render: () => void;
}

/**
 * Update a single gantt bar's done state in the DOM.
 */
export function updateGanttBarStatesInDom(ctx: GanttContext, item: KanbanItem): void {
	const row = ctx.contentEl.querySelector(`.kanban-matsuo-gantt-row[data-gantt-id="${item.id}"]`);
	if (!row) return;
	row.toggleClass('kanban-matsuo-wbs-done', item.checked);
	const bar = row.querySelector('.kanban-matsuo-gantt-bar-continuous');
	if (bar) bar.toggleClass('kanban-matsuo-gantt-bar-done', item.checked);
}

/**
 * Update gantt bars for all children recursively.
 */
export function updateGanttChildBarStatesInDom(ctx: GanttContext, children: KanbanItem[]): void {
	for (const child of children) {
		updateGanttBarStatesInDom(ctx, child);
		if (child.children.length > 0) updateGanttChildBarStatesInDom(ctx, child.children);
	}
}

/**
 * Render WBS/Gantt chart below the board.
 * Left: task tree with status (lane). Right: date timeline bars.
 */
export function renderWbs(ctx: GanttContext, container: HTMLElement): void {
	if (!ctx.board) return;

	// Collect all items flat with lane info
	// Parent dates already computed in render()
	// Flatten: top-level items with children inline (parent+children always together)
	const topItems: { item: KanbanItem; lane: string }[] = [];
	for (const lane of ctx.board.lanes) {
		if (ctx.ganttHiddenLanes.has(lane.title)) continue;
		for (const item of lane.items) {
			if (!item.archived) topItems.push({ item, lane: lane.title });
		}
	}

	// Sort top-level by start date (children stay with parent)
	if (ctx.ganttDragging && ctx.ganttSortedIds.length > 0) {
		const idOrder = new Map(ctx.ganttSortedIds.map((id, i) => [id, i]));
		topItems.sort((a, b) => (idOrder.get(a.item.id) ?? 999) - (idOrder.get(b.item.id) ?? 999));
	} else {
		topItems.sort((a, b) => {
			const aDate = a.item.startDate || a.item.endDate || '9999-99-99';
			const bDate = b.item.startDate || b.item.endDate || '9999-99-99';
			return aDate.localeCompare(bDate);
		});
	}

	// Flatten sorted top-level with their children
	const flatItems: { item: KanbanItem; lane: string; depth: number }[] = [];
	for (const { item, lane } of topItems) {
		flattenForWbs(item, lane, 0, flatItems);
	}
	ctx.ganttSortedIds = topItems.map((t) => t.item.id);

	// Compute date range for timeline
	const today = ctx.getToday();
	let minDate = today;
	let maxDate = today;
	for (const { item } of flatItems) {
		if (item.startDate && item.startDate < minDate) minDate = item.startDate;
		if (item.endDate && item.endDate > maxDate) maxDate = item.endDate;
	}
	const rangeStart = addDays(minDate, -7);
	const rangeEnd = addDays(maxDate, 30);
	const dates = generateDateRange(rangeStart, rangeEnd);

	const wbsContainer = container.createDiv({ cls: 'kanban-matsuo-wbs' });
	const wrapper = wbsContainer.createDiv({ cls: 'kanban-matsuo-gantt-wrapper' });

	// Shift+wheel → horizontal scroll, normal wheel → vertical scroll
	wrapper.addEventListener('wheel', (e) => {
		if (e.shiftKey) {
			e.preventDefault();
			wrapper.scrollLeft += e.deltaY;
		}
		// Normal wheel: let default vertical scroll happen
	}, { passive: false });

	// Click+drag on empty area to pan (grab and move)
	let isPanning = false;
	let panStartX = 0;
	let panStartY = 0;
	let panScrollLeft = 0;
	let panScrollTop = 0;

	wrapper.addEventListener('mousedown', (e) => {
		// Only start pan if clicking on empty area (not on a bar or handle)
		const target = e.target as HTMLElement;
		if (target.closest('.kanban-matsuo-gantt-bar-continuous, .kanban-matsuo-gantt-handle')) return;

		// Left click on the gantt area (cells, right-cells, or wrapper itself)
		if (e.button === 0 && (target.closest('.kanban-matsuo-gantt-right-cells') || target.closest('.kanban-matsuo-gantt-wrapper'))) {
			isPanning = true;
			panStartX = e.clientX;
			panStartY = e.clientY;
			panScrollLeft = wrapper.scrollLeft;
			panScrollTop = wrapper.scrollTop;
			wrapper.addClass('kanban-matsuo-gantt-wrapper-panning');
			e.preventDefault();
		}
	});

	wrapper.addEventListener('mousemove', (e) => {
		if (!isPanning) return;
		wrapper.scrollLeft = panScrollLeft - (e.clientX - panStartX);
		wrapper.scrollTop = panScrollTop - (e.clientY - panStartY);
	});

	wrapper.addEventListener('mouseup', () => {
		if (isPanning) {
			isPanning = false;
			wrapper.removeClass('kanban-matsuo-gantt-wrapper-panning');
		}
	});

	wrapper.addEventListener('mouseleave', () => {
		if (isPanning) {
			isPanning = false;
			wrapper.removeClass('kanban-matsuo-gantt-wrapper-panning');
		}
	});

	// HEADER ROW 1: month (each cell = 28px, label on first day of month)
	const hdr1 = wrapper.createDiv({ cls: 'kanban-matsuo-gantt-row kanban-matsuo-gantt-hdr' });
	const hdr1Left = hdr1.createDiv({ cls: 'kanban-matsuo-gantt-left-cell kanban-matsuo-gantt-hdr-cell' });
	hdr1Left.createSpan({ text: t('wbs.title'), cls: 'kanban-matsuo-gantt-hdr-task' });
	// Lane filter button
	const laneFilterBtn = hdr1Left.createEl('button', {
		cls: 'kanban-matsuo-gantt-lane-filter clickable-icon',
		attr: { 'aria-label': t('wbs.filter-lanes'), 'data-tooltip-position': 'top' },
	});
	setIcon(laneFilterBtn, 'filter');
	if (ctx.ganttHiddenLanes.size > 0) laneFilterBtn.addClass('kanban-matsuo-gantt-lane-filter-active');
	laneFilterBtn.addEventListener('click', (e) => showGanttLaneFilterMenu(ctx, e));
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
	hdr2Left.createSpan({ text: t('wbs.col-start'), cls: 'kanban-matsuo-gantt-hdr-date' });
	hdr2Left.createSpan({ text: t('wbs.col-end'), cls: 'kanban-matsuo-gantt-hdr-date' });
	hdr2Left.createSpan({ text: t('wbs.col-days'), cls: 'kanban-matsuo-gantt-hdr-num' });
	hdr2Left.createSpan({ text: t('wbs.col-progress'), cls: 'kanban-matsuo-gantt-hdr-num' });
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
		const taskLink = leftCell.createEl('a', {
			cls: 'kanban-matsuo-gantt-task kanban-matsuo-gantt-task-link',
			attr: { href: '#' },
		});
		if (depth > 0) taskLink.style.setProperty('--gantt-depth', `${depth}`);
		taskLink.setText(`${depth > 0 ? '└ ' : ''}${item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim()}`);
		taskLink.addEventListener('click', (e) => {
			e.preventDefault();
			ctx.openCardEditor(item);
		});

		// Start date
		leftCell.createSpan({ cls: 'kanban-matsuo-gantt-date-col', text: item.startDate || '-' });

		// End date
		leftCell.createSpan({ cls: 'kanban-matsuo-gantt-date-col', text: item.endDate || '-' });

		// Days
		leftCell.createSpan({ cls: 'kanban-matsuo-gantt-num-col', text: (() => {
			const s = item.startDate || item.endDate;
			const e = item.endDate || item.startDate;
			if (s && e) {
				const ms = new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime();
				return t('wbs.days', { days: Math.round(ms / 86400000) + 1 });
			}
			return '-';
		})() });

		// Progress % (based on children check count)
		leftCell.createSpan({ cls: 'kanban-matsuo-gantt-num-col', text: (() => {
			if (item.children.length > 0) {
				const { done, total } = ctx.countChildren(item.children);
				return total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
			}
			return item.checked ? '100%' : '0%';
		})() });

		// Right: date cells + continuous bar overlay
		const rightCells = row.createDiv({ cls: 'kanban-matsuo-gantt-right-cells' });
		const isParent = item.children.length > 0;
		const cellWidth = 28;

		// Render grid cells (background: today, weekend)
		for (let di = 0; di < dates.length; di++) {
			const d = dates[di];
			const cell = rightCells.createDiv({
				cls: 'kanban-matsuo-gantt-day-cell kanban-matsuo-gantt-cell',
				attr: { 'data-date': d },
			});
			if (d === today) cell.addClass('kanban-matsuo-gantt-today');
			const dow = new Date(d + 'T00:00:00').getDay();
			if (dow === 0 || dow === 6) cell.addClass('kanban-matsuo-gantt-weekend');

			// Click empty cell to set date (leaf tasks only)
			if (!isParent) {
				const start = item.startDate || item.endDate;
				const end = item.endDate || item.startDate;
				const inRange = start && end && d >= start && d <= end;
				if (!inRange) {
					cell.addEventListener('click', () => {
						if (!item.startDate && !item.endDate) { item.startDate = d; item.endDate = d; }
						else if (!item.startDate) { item.startDate = d < item.endDate! ? d : item.endDate; if (d > item.endDate!) item.endDate = d; }
						else if (!item.endDate) { item.endDate = d > item.startDate ? d : item.startDate; if (d < item.startDate) item.startDate = d; }
						updateItemTitleDates(item);
						ctx.scheduleSave();
						ctx.render();
					});
				}
			}
		}

		// Render continuous bar overlay
		const start = item.startDate || item.endDate;
		const end = item.endDate || item.startDate;
		if (start && end) {
			const startIdx = dates.indexOf(start);
			const endIdx = dates.indexOf(end);
			if (startIdx >= 0 && endIdx >= 0) {
				const barLeft = startIdx * cellWidth;
				const barWidth = (endIdx - startIdx + 1) * cellWidth;

				const bar = rightCells.createDiv({ cls: 'kanban-matsuo-gantt-bar-continuous' });
				bar.style.setProperty('left', `${barLeft}px`);
				bar.style.setProperty('width', `${barWidth}px`);

				if (item.checked) bar.addClass('kanban-matsuo-gantt-bar-done');
				if (isParent) bar.addClass('kanban-matsuo-gantt-bar-parent');

				const label = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
				bar.setAttribute('data-label', label);

				if (!isParent) {
					// Resize handles
					bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-left' });
					bar.createDiv({ cls: 'kanban-matsuo-gantt-handle kanban-matsuo-gantt-handle-right' });

					setupGanttBarDrag(ctx, bar, item, dates);
					const lh = bar.querySelector('.kanban-matsuo-gantt-handle-left') as HTMLElement;
					if (lh) setupGanttResize(ctx, lh, item, dates, 'start');
					const rh = bar.querySelector('.kanban-matsuo-gantt-handle-right') as HTMLElement;
					if (rh) setupGanttResize(ctx, rh, item, dates, 'end');
				}
			}
		}
	}
}

/**
 * Recursively compute parent dates from children.
 * A parent with children cannot have its own dates - they are derived
 * from the min start and max end of all descendant leaf tasks.
 */
export function computeParentDates(item: KanbanItem): void {
	if (item.children.length === 0) return;

	// First, recursively compute children
	for (const child of item.children) {
		if (!child.archived) computeParentDates(child);
	}

	// Collect min start and max end from all descendants
	let minStart: string | null = null;
	let maxEnd: string | null = null;

	const collectDates = (items: KanbanItem[]) => {
		for (const c of items) {
			if (c.archived) continue;
			// Use startDate for min, endDate for max
			const s = c.startDate || c.endDate;
			const e = c.endDate || c.startDate;
			if (s && (!minStart || s < minStart)) minStart = s;
			if (e && (!maxEnd || e > maxEnd)) maxEnd = e;
			collectDates(c.children);
		}
	};
	collectDates(item.children);

	// Override parent dates
	item.startDate = minStart;
	item.endDate = maxEnd;
	// Update title to remove manual date markers
	item.title = item.title.replace(/@\{[^}]*\}/g, '').trim();
}

/**
 * Update gantt bar cells in-place without re-rendering the whole view.
 * Finds the row by item id and toggles bar visibility per cell.
 */
export function updateGanttRowInPlace(ctx: GanttContext, item: KanbanItem, dates: string[]): void {
	const row = ctx.contentEl.querySelector(
		`.kanban-matsuo-gantt-row[data-gantt-id="${item.id}"]`
	);
	if (!row) return;

	const rightCells = row.querySelector('.kanban-matsuo-gantt-right-cells');
	if (!rightCells) return;

	// Update continuous bar position/width
	let bar = rightCells.querySelector('.kanban-matsuo-gantt-bar-continuous');
	const start = item.startDate || item.endDate;
	const end = item.endDate || item.startDate;
	const cellWidth = 28;

	if (start && end) {
		const startIdx = dates.indexOf(start);
		const endIdx = dates.indexOf(end);
		if (startIdx >= 0 && endIdx >= 0) {
			if (!bar) {
				bar = rightCells.createDiv({ cls: 'kanban-matsuo-gantt-bar-continuous' });
			}
			(bar as HTMLElement).style.setProperty('left', `${startIdx * cellWidth}px`);
			(bar as HTMLElement).style.setProperty('width', `${(endIdx - startIdx + 1) * cellWidth}px`);
		} else if (bar) {
			bar.remove();
		}
	} else if (bar) {
		bar.remove();
	}
}

/**
 * Show the lane filter context menu.
 */
export function showGanttLaneFilterMenu(ctx: GanttContext, e: MouseEvent | Event): void {
	if (!ctx.board) return;
	const menu = new Menu();

	// Show all
	menu.addItem((mi) => mi.setTitle(t('wbs.all-lanes')).setIcon('list').onClick(() => {
		ctx.ganttHiddenLanes.clear();
		ctx.render();
	}));

	menu.addSeparator();

	// Each lane as toggle
	for (const lane of ctx.board.lanes) {
		const hidden = ctx.ganttHiddenLanes.has(lane.title);
		menu.addItem((mi) => {
			mi.setTitle(`${hidden ? '○ ' : '● '}${lane.title}`).setIcon(hidden ? 'eye-off' : 'eye').onClick(() => {
				if (hidden) {
					ctx.ganttHiddenLanes.delete(lane.title);
				} else {
					ctx.ganttHiddenLanes.add(lane.title);
				}
				ctx.render();
			});
		});
	}

	if (e instanceof MouseEvent) menu.showAtMouseEvent(e);
	else if (e.target instanceof HTMLElement) {
		const rect = e.target.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom });
	}
}

/**
 * Start auto-scrolling the gantt wrapper when mouse is near edges during drag.
 */
export function startGanttAutoScroll(ctx: GanttContext, ev: MouseEvent): void {
	const wrapper = ctx.contentEl.querySelector('.kanban-matsuo-gantt-wrapper');
	if (!wrapper) return;

	const rect = wrapper.getBoundingClientRect();
	const edgeZone = 60;
	const speed = 8;

	if (ctx.ganttAutoScrollTimer !== null) {
		window.clearInterval(ctx.ganttAutoScrollTimer);
		ctx.ganttAutoScrollTimer = null;
	}

	let scrollDx = 0;
	if (ev.clientX > rect.right - edgeZone) scrollDx = speed;
	else if (ev.clientX < rect.left + 540 + edgeZone && wrapper.scrollLeft > 0) scrollDx = -speed;

	if (scrollDx !== 0) {
		ctx.ganttAutoScrollTimer = window.setInterval(() => {
			wrapper.scrollLeft += scrollDx;
		}, 16);
	}
}

/**
 * Stop auto-scrolling the gantt wrapper.
 */
export function stopGanttAutoScroll(ctx: GanttContext): void {
	if (ctx.ganttAutoScrollTimer !== null) {
		window.clearInterval(ctx.ganttAutoScrollTimer);
		ctx.ganttAutoScrollTimer = null;
	}
}

/**
 * Scroll WBS to the row matching itemId and flash-highlight it.
 */
export function highlightWbsRow(ctx: GanttContext, itemId: string): void {
	const row = ctx.contentEl.querySelector(
		`.kanban-matsuo-gantt-row[data-gantt-id="${itemId}"]`
	);
	if (!row) return;

	const wrapper = ctx.contentEl.querySelector('.kanban-matsuo-gantt-wrapper');
	if (!wrapper) return;

	// Calculate target scroll position (both axes at once)
	const wrapperRect = wrapper.getBoundingClientRect();
	const rowRect = row.getBoundingClientRect();

	// Vertical: center the row
	const targetTop = wrapper.scrollTop + (rowRect.top - wrapperRect.top) - wrapperRect.height / 2 + rowRect.height / 2;

	// Horizontal: scroll to bar start
	let targetLeft = wrapper.scrollLeft;
	const bar = row.querySelector('.kanban-matsuo-gantt-bar-continuous');
	if (bar) {
		const barLeft = parseInt((bar as HTMLElement).style.getPropertyValue('left') || '0', 10);
		const leftColWidth = 540;
		targetLeft = Math.max(0, barLeft - leftColWidth - 50);
	}

	// Single smooth scroll for both axes
	wrapper.scrollTo({
		left: targetLeft,
		top: Math.max(0, targetTop),
		behavior: 'smooth',
	});

	// Flash highlight
	row.addClass('kanban-matsuo-gantt-row-highlight');
	window.setTimeout(() => {
		row.removeClass('kanban-matsuo-gantt-row-highlight');
	}, 2000);
}

/**
 * Setup mouse drag behavior for moving a gantt bar (shifting dates).
 */
export function setupGanttBarDrag(ctx: GanttContext, bar: HTMLElement, item: KanbanItem, dates: string[]): void {
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
		ctx.ganttDragging = true;

		const cellWidth = 28;

		const onMouseMove = (ev: MouseEvent) => {
			startGanttAutoScroll(ctx, ev);

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
			updateItemTitleDates(item);
			updateGanttRowInPlace(ctx, item, dates);
		};

		const onMouseUp = () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			stopGanttAutoScroll(ctx);
			ctx.ganttDragging = false;
			ctx.scheduleSave();
			ctx.render();
		};

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	});
}

/**
 * Setup mouse drag behavior for resizing a gantt bar (moving start or end date).
 */
export function setupGanttResize(ctx: GanttContext, handle: HTMLElement, item: KanbanItem, dates: string[], edge: 'start' | 'end'): void {
	handle.addEventListener('mousedown', (e) => {
		e.preventDefault();
		e.stopPropagation();

		const startX = e.clientX;
		const origDate = edge === 'start' ? (item.startDate || '') : (item.endDate || '');
		const cellWidth = 28;
		ctx.ganttDragging = true;

		const onMouseMove = (ev: MouseEvent) => {
			startGanttAutoScroll(ctx, ev);

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

			updateItemTitleDates(item);
			updateGanttRowInPlace(ctx, item, dates);
		};

		const onMouseUp = () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			stopGanttAutoScroll(ctx);
			ctx.ganttDragging = false;
			ctx.scheduleSave();
			ctx.render();
		};

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	});
}

/**
 * Update item.title to reflect current startDate/endDate.
 */
export function updateItemTitleDates(item: KanbanItem): void {
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

/**
 * Flatten a WBS item tree into a flat list, preserving depth.
 * Children are sorted by start date before flattening.
 */
export function flattenForWbs(item: KanbanItem, lane: string, depth: number, out: { item: KanbanItem; lane: string; depth: number }[]): void {
	out.push({ item, lane, depth });
	// Sort children by start date before flattening
	const sortedChildren = item.children
		.filter((c) => !c.archived)
		.sort((a, b) => {
			const aDate = a.startDate || a.endDate || '9999-99-99';
			const bDate = b.startDate || b.endDate || '9999-99-99';
			return aDate.localeCompare(bDate);
		});
	for (const child of sortedChildren) {
		flattenForWbs(child, lane, depth + 1, out);
	}
}

/**
 * Add a number of days to a date string (YYYY-MM-DD).
 */
export function addDays(dateStr: string, days: number): string {
	const d = new Date(dateStr + 'T00:00:00');
	d.setDate(d.getDate() + days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${dd}`;
}

/**
 * Generate an array of date strings (YYYY-MM-DD) from start to end inclusive.
 */
export function generateDateRange(start: string, end: string): string[] {
	const dates: string[] = [];
	let current = start;
	while (current <= end) {
		dates.push(current);
		current = addDays(current, 1);
	}
	return dates;
}
