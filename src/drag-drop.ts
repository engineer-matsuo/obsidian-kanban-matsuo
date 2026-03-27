import { KanbanItem, KanbanLane } from './types';
import { t } from './lang';

export interface DragContext {
	draggedItem: KanbanItem | null;
	draggedFromLane: KanbanLane | null;
	dragPlaceholder: HTMLElement | null;
	dragOriginX: number;
	dragOriginDepth: number;
	lastDragAfterElId: string | null;
	lastDragDepth: number;
	touchStartX: number;
	touchStartY: number;
}

export function getCardDepth(el: HTMLElement): number {
	const depthStr = el.style.getPropertyValue('--card-depth');
	return depthStr ? parseInt(depthStr, 10) : 0;
}

export function getDragAfterElement(container: HTMLElement, y: number, dragPlaceholder: HTMLElement | null): HTMLElement | null {
	const cards = Array.from(container.querySelectorAll('.kanban-matsuo-card:not(.kanban-matsuo-card-dragging)'));

	// If placeholder already exists, check if cursor is still within it
	// If so, return current position (no change) to prevent oscillation
	if (dragPlaceholder?.parentElement === container) {
		const phRect = dragPlaceholder.getBoundingClientRect();
		if (y >= phRect.top && y <= phRect.bottom) {
			// Cursor is inside placeholder - return current next sibling
			const next = dragPlaceholder.nextElementSibling;
			return next instanceof HTMLElement && next.classList.contains('kanban-matsuo-card') ? next : null;
		}
	}

	return cards.reduce<{ offset: number; el: HTMLElement | null }>(
		(acc, card) => {
			const box = card.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;
			if (offset < 0 && offset > acc.offset) return { offset, el: card as HTMLElement };
			return acc;
		},
		{ offset: Number.NEGATIVE_INFINITY, el: null },
	).el;
}

export function handleDragOver(
	e: DragEvent,
	listEl: HTMLElement,
	targetLane: KanbanLane,
	ctx: DragContext,
): void {
	if (!ctx.draggedItem) return;

	// Find drop position
	const afterEl = getDragAfterElement(listEl, e.clientY, ctx.dragPlaceholder);
	const afterElId = afterEl?.getAttribute('data-item-id') || null;

	// Calculate indent depth
	const isCrossLane = ctx.draggedFromLane !== targetLane;
	let targetDepth = 0;
	if (!isCrossLane) {
		const dx = e.clientX - ctx.dragOriginX;
		const depthDelta = Math.round(dx / 30);
		targetDepth = Math.max(0, ctx.dragOriginDepth + depthDelta);

		// Clamp to card above + 1
		let aboveDepth = -1;
		if (afterEl) {
			let prev = afterEl.previousElementSibling;
			while (prev && !prev.classList.contains('kanban-matsuo-card')) prev = prev.previousElementSibling;
			if (prev instanceof HTMLElement) aboveDepth = getCardDepth(prev);
		} else {
			const allCards = listEl.querySelectorAll('.kanban-matsuo-card:not(.kanban-matsuo-card-dragging)');
			const lastCard = allCards[allCards.length - 1] as HTMLElement | undefined;
			if (lastCard) aboveDepth = getCardDepth(lastCard);
		}
		targetDepth = Math.min(targetDepth, aboveDepth + 1);
	}

	// Skip DOM update if nothing changed
	if (afterElId === ctx.lastDragAfterElId && targetDepth === ctx.lastDragDepth && ctx.dragPlaceholder?.parentElement === listEl) {
		return;
	}
	ctx.lastDragAfterElId = afterElId;
	ctx.lastDragDepth = targetDepth;

	// Remove old placeholder from other lanes
	if (ctx.dragPlaceholder && ctx.dragPlaceholder.parentElement !== listEl) {
		ctx.dragPlaceholder.remove();
		ctx.dragPlaceholder = null;
	}

	// Create placeholder if needed
	if (!ctx.dragPlaceholder) {
		ctx.dragPlaceholder = listEl.createDiv({ cls: 'kanban-matsuo-drop-placeholder' });
	}

	// Position: only move if actually needed
	const currentNext = ctx.dragPlaceholder.nextElementSibling;
	const needsMove = afterEl ? currentNext !== afterEl : ctx.dragPlaceholder.parentElement !== listEl || currentNext !== null;
	if (needsMove) {
		if (afterEl) {
			listEl.insertBefore(ctx.dragPlaceholder, afterEl);
		} else {
			listEl.appendChild(ctx.dragPlaceholder);
		}
	}

	// Indent visual + label
	ctx.dragPlaceholder.style.setProperty('--card-depth', `${targetDepth}`);
	if (targetDepth > ctx.dragOriginDepth) {
		ctx.dragPlaceholder.addClass('kanban-matsuo-drop-placeholder-indented');
		ctx.dragPlaceholder.setText(t('drag.indent'));
	} else if (targetDepth < ctx.dragOriginDepth) {
		ctx.dragPlaceholder.removeClass('kanban-matsuo-drop-placeholder-indented');
		ctx.dragPlaceholder.setText(t('drag.outdent'));
	} else {
		ctx.dragPlaceholder.removeClass('kanban-matsuo-drop-placeholder-indented');
		ctx.dragPlaceholder.setText(t('drag.move-here'));
	}
}

export function buildFlatList(items: KanbanItem[], depth: number): { item: KanbanItem; depth: number }[] {
	const result: { item: KanbanItem; depth: number }[] = [];
	for (const item of items) {
		if (!item.archived) {
			result.push({ item, depth });
			result.push(...buildFlatList(item.children, depth + 1));
		}
	}
	return result;
}

function containsId(item: KanbanItem, id: string): boolean {
	if (item.id === id) return true;
	return item.children.some((c) => containsId(c, id));
}

export function findTopLevelInsertIndex(lane: KanbanLane, cardsBefore: string[]): number {
	if (cardsBefore.length === 0) return 0;

	const lastAboveId = cardsBefore[cardsBefore.length - 1];

	// Find which top-level item owns the last card above
	for (let i = lane.items.length - 1; i >= 0; i--) {
		const topItem = lane.items[i];
		if (containsId(topItem, lastAboveId)) {
			return i + 1;
		}
	}
	return lane.items.length;
}

export function removeItemRecursive(items: KanbanItem[], target: KanbanItem): boolean {
	const index = items.indexOf(target);
	if (index >= 0) {
		items.splice(index, 1);
		return true;
	}
	for (const item of items) {
		if (removeItemRecursive(item.children, target)) return true;
	}
	return false;
}

export function handleDrop(
	targetLane: KanbanLane,
	listEl: HTMLElement,
	ctx: DragContext,
	board: { lanes: KanbanLane[] },
): void {
	if (!ctx.draggedItem || !ctx.draggedFromLane) return;

	const isCrossLane = ctx.draggedFromLane !== targetLane;

	// Remove from source (could be top-level or nested)
	removeItemRecursive(ctx.draggedFromLane.items, ctx.draggedItem);

	// Cross-lane moves always go to top level
	const targetDepth = isCrossLane ? 0
		: (ctx.dragPlaceholder
			? parseInt(ctx.dragPlaceholder.style.getPropertyValue('--card-depth') || '0', 10)
			: 0);

	// Build a flat list of visible cards with their items and depths
	const flatList = buildFlatList(targetLane.items, 0);

	// Find index in flat list where we're inserting
	// Exclude the dragged card itself from cardsBefore
	const draggedId = ctx.draggedItem.id;
	const cardsBefore: string[] = [];
	if (ctx.dragPlaceholder) {
		for (const child of Array.from(listEl.children)) {
			if (child === ctx.dragPlaceholder) break;
			if (child.classList.contains('kanban-matsuo-card') && !child.classList.contains('kanban-matsuo-card-dragging')) {
				const id = child.getAttribute('data-item-id');
				if (id && id !== draggedId) cardsBefore.push(id);
			}
		}
	}

	// Also find the card AFTER the placeholder
	let cardAfterId: string | null = null;
	if (ctx.dragPlaceholder) {
		let found = false;
		for (const child of Array.from(listEl.children)) {
			if (child === ctx.dragPlaceholder) { found = true; continue; }
			if (found && child.classList.contains('kanban-matsuo-card') && !child.classList.contains('kanban-matsuo-card-dragging')) {
				cardAfterId = child.getAttribute('data-item-id');
				break;
			}
		}
	}

	if (targetDepth === 0) {
		// Insert at top level
		if (cardAfterId) {
			// Find the top-level item that contains cardAfterId, insert before it
			const afterEntry = flatList.find((f) => f.item.id === cardAfterId);
			if (afterEntry && afterEntry.depth === 0) {
				const idx = targetLane.items.indexOf(afterEntry.item);
				if (idx >= 0) {
					targetLane.items.splice(idx, 0, ctx.draggedItem);
				} else {
					targetLane.items.push(ctx.draggedItem);
				}
			} else {
				const insertIdx = findTopLevelInsertIndex(targetLane, cardsBefore);
				targetLane.items.splice(insertIdx, 0, ctx.draggedItem);
			}
		} else {
			const insertIdx = findTopLevelInsertIndex(targetLane, cardsBefore);
			targetLane.items.splice(insertIdx, 0, ctx.draggedItem);
		}
	} else {
		// Find the parent: walk backwards through cards above to find one at depth < targetDepth
		let parentItem: KanbanItem | null = null;
		for (let i = cardsBefore.length - 1; i >= 0; i--) {
			const entry = flatList.find((f) => f.item.id === cardsBefore[i]);
			if (entry && entry.depth < targetDepth) {
				parentItem = entry.item;
				break;
			}
		}

		// If no card above, the parent is determined by the card after
		if (!parentItem && cardAfterId) {
			const afterEntry = flatList.find((f) => f.item.id === cardAfterId);
			if (afterEntry) {
				// Find the parent of cardAfter at depth = targetDepth - 1
				for (const f of flatList) {
					if (f.depth === targetDepth - 1 && f.item.children.some((c) => c.id === cardAfterId)) {
						parentItem = f.item;
						break;
					}
				}
			}
		}

		if (parentItem) {
			// Insert at correct position within parent's children
			if (cardAfterId) {
				const afterIdx = parentItem.children.findIndex((c) => c.id === cardAfterId);
				if (afterIdx >= 0) {
					parentItem.children.splice(afterIdx, 0, ctx.draggedItem);
				} else if (cardsBefore.length > 0) {
					const lastAboveId = cardsBefore[cardsBefore.length - 1];
					const lastAboveIdx = parentItem.children.findIndex((c) => c.id === lastAboveId);
					parentItem.children.splice(lastAboveIdx + 1, 0, ctx.draggedItem);
				} else {
					parentItem.children.unshift(ctx.draggedItem);
				}
			} else if (cardsBefore.length > 0) {
				const lastAboveId = cardsBefore[cardsBefore.length - 1];
				const lastAboveIdx = parentItem.children.findIndex((c) => c.id === lastAboveId);
				if (lastAboveIdx >= 0) {
					parentItem.children.splice(lastAboveIdx + 1, 0, ctx.draggedItem);
				} else {
					parentItem.children.push(ctx.draggedItem);
				}
			} else {
				parentItem.children.unshift(ctx.draggedItem);
			}
		} else {
			// Fallback: top level
			targetLane.items.push(ctx.draggedItem);
		}
	}

	// Cleanup placeholder
	if (ctx.dragPlaceholder) { ctx.dragPlaceholder.remove(); ctx.dragPlaceholder = null; }
}

export function setupTouchDragLane(
	handle: HTMLElement,
	el: HTMLElement,
	lane: KanbanLane,
	ctx: DragContext,
): void {
	let longPressTimer: number | null = null;
	let isDragging = false;

	handle.addEventListener('touchstart', (e) => {
		const touch = e.touches[0];
		ctx.touchStartX = touch.clientX; ctx.touchStartY = touch.clientY;
		longPressTimer = window.setTimeout(() => { isDragging = true; el.addClass('kanban-matsuo-touch-dragging'); ctx.draggedFromLane = lane; }, 300);
	}, { passive: true });

	handle.addEventListener('touchmove', (e) => {
		if (!isDragging) {
			const touch = e.touches[0];
			if (Math.abs(touch.clientX - ctx.touchStartX) > 10 || Math.abs(touch.clientY - ctx.touchStartY) > 10) {
				if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
			}
			return;
		}
		e.preventDefault();
	});

	handle.addEventListener('touchend', () => {
		if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
		if (isDragging) { isDragging = false; el.removeClass('kanban-matsuo-touch-dragging'); ctx.draggedFromLane = null; }
	}, { passive: true });
}

export function setupTouchDragCard(
	cardEl: HTMLElement,
	item: KanbanItem,
	lane: KanbanLane,
	ctx: DragContext,
): void {
	let longPressTimer: number | null = null;
	let isDragging = false;

	cardEl.addEventListener('touchstart', (e) => {
		const touch = e.touches[0];
		ctx.touchStartX = touch.clientX; ctx.touchStartY = touch.clientY;
		longPressTimer = window.setTimeout(() => { isDragging = true; cardEl.addClass('kanban-matsuo-touch-dragging'); ctx.draggedItem = item; ctx.draggedFromLane = lane; }, 300);
	}, { passive: true });

	cardEl.addEventListener('touchmove', (e) => {
		if (!isDragging) {
			const touch = e.touches[0];
			if (Math.abs(touch.clientX - ctx.touchStartX) > 10 || Math.abs(touch.clientY - ctx.touchStartY) > 10) {
				if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
			}
			return;
		}
		e.preventDefault();
	});

	cardEl.addEventListener('touchend', () => {
		if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
		if (isDragging) { isDragging = false; cardEl.removeClass('kanban-matsuo-touch-dragging'); ctx.draggedItem = null; ctx.draggedFromLane = null; }
	}, { passive: true });
}
