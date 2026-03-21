import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { KanbanBoard, KanbanItem, KanbanLane } from './types';

/**
 * Generate a deterministic color from a UUID.
 * Uses the first 8 hex chars as hue (mod 360), with fixed saturation/lightness.
 */
export function colorForUuid(uuid: string): string {
	const hex = uuid.replace(/-/g, '').slice(0, 8);
	const num = parseInt(hex, 16);
	const hue = num % 360;
	return `hsl(${hue}, 60%, 55%)`;
}

/**
 * Clean a card title for use as a filename.
 * Removes tags, dates, wikilinks, and characters illegal in filenames.
 */
export function cleanTitleForFilename(title: string): string {
	let clean = title
		.replace(/#[^\s#]+/g, '')
		.replace(/@\{[^}]*\}/g, '')
		.replace(/\[\[[^\]]+\]\]/g, '')
		.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
		.trim();
	// Remove characters illegal in most filesystems
	clean = clean.replace(/[\\/:*?"<>|]/g, '_');
	return clean || 'Untitled';
}

// Managed section markers — content between these is auto-generated
const MANAGED_START = '%% kanban-managed-start — この範囲はカンバンが自動更新します。編集しないでください / This section is auto-synced by Kanban. Do not edit. %%';
const MANAGED_END = '%% kanban-managed-end — 自動管理ここまで / End of auto-managed section %%';

/**
 * Generate only the managed (auto-synced) section of a note.
 */
function generateManagedSection(
	item: KanbanItem,
	lane: KanbanLane,
	boardPath: string,
	parentItem: KanbanItem | null,
): string {
	const lines: string[] = [];

	lines.push(MANAGED_START);
	lines.push(`> [!info] Kanban: **${lane.title}** — ${item.checked ? 'Complete' : 'Incomplete'}`);
	lines.push(`> Source: \`${boardPath}\``);
	lines.push('');

	// Parent task
	if (parentItem && parentItem.linkedNotePath) {
		const parentNoteName = parentItem.linkedNotePath.replace(/\.md$/, '').split('/').pop() || '';
		lines.push('### Parent task');
		lines.push(`- [[${parentNoteName}]]`);
		lines.push('');
	}

	// Direct children only (not grandchildren — each level links only to its immediate children)
	const directChildren = item.children;
	if (directChildren.length > 0) {
		lines.push('### Subtasks');
		for (const child of directChildren) {
			const check = child.checked ? '[x]' : '[ ]';
			const childTitle = cleanTitleForFilename(child.title);
			if (child.linkedNotePath) {
				const childNoteName = child.linkedNotePath.replace(/\.md$/, '').split('/').pop() || '';
				lines.push(`- ${check} [[${childNoteName}]] - ${childTitle}`);
			} else {
				lines.push(`- ${check} ${childTitle}`);
			}
			// Grandchildren (child.children) are NOT listed here.
			// They appear in the child's own linked note instead.
		}
		lines.push('');
	}

	lines.push(MANAGED_END);

	return lines.join('\n');
}

/**
 * Generate frontmatter for a linked note.
 */
function generateFrontmatter(
	item: KanbanItem,
	lane: KanbanLane,
	boardPath: string,
): string {
	const lines: string[] = [];
	lines.push('---');
	lines.push(`kanban-source: "${boardPath}"`);
	lines.push(`kanban-card-id: "${item.id}"`);
	lines.push(`kanban-lane: "${lane.title}"`);
	if (item.tags.length > 0) {
		lines.push(`tags: [${item.tags.join(', ')}]`);
	}
	if (item.startDate) {
		lines.push(`start-date: ${item.startDate}`);
	}
	if (item.endDate) {
		lines.push(`end-date: ${item.endDate}`);
	}
	lines.push(`status: ${item.checked ? 'complete' : 'incomplete'}`);
	lines.push('---');
	return lines.join('\n');
}

/**
 * Generate the initial note content for a newly created linked note.
 */
export function generateNoteContent(
	item: KanbanItem,
	lane: KanbanLane,
	boardPath: string,
	parentItem: KanbanItem | null,
): string {
	const lines: string[] = [];

	lines.push(generateFrontmatter(item, lane, boardPath));
	lines.push('');

	const displayTitle = cleanTitleForFilename(item.title);
	lines.push(`# ${displayTitle}`);
	lines.push('');

	// Managed section (auto-synced)
	lines.push(generateManagedSection(item, lane, boardPath, parentItem));
	lines.push('');

	// User notes placeholder
	lines.push('## Notes');
	lines.push('');

	return lines.join('\n');
}

/**
 * Update an existing note: replace only frontmatter and managed section,
 * preserving all user-written content.
 */
function updateNoteContent(
	existingContent: string,
	item: KanbanItem,
	lane: KanbanLane,
	boardPath: string,
	parentItem: KanbanItem | null,
): string {
	let content = existingContent;

	// 1. Replace frontmatter
	const fmRegex = /^---\n[\s\S]*?\n---/;
	const newFm = generateFrontmatter(item, lane, boardPath);
	if (fmRegex.test(content)) {
		content = content.replace(fmRegex, newFm);
	} else {
		// No frontmatter found — prepend it
		content = newFm + '\n\n' + content;
	}

	// 2. Remove ALL existing managed sections (handles old/new marker formats, duplicates)
	const managedSection = generateManagedSection(item, lane, boardPath, parentItem);
	const managedBlockRegex = /%%\s*kanban-managed-start[\s\S]*?kanban-managed-end[^\n]*%%\n*/g;
	content = content.replace(managedBlockRegex, '');

	// Insert the single new managed section after the first heading
	const headingMatch = content.match(/^# .+$/m);
	if (headingMatch && headingMatch.index !== undefined) {
		const insertPos = headingMatch.index + headingMatch[0].length;
		const before = content.slice(0, insertPos);
		const after = content.slice(insertPos);
		content = before + '\n\n' + managedSection + '\n' + after;
	} else {
		content = content + '\n\n' + managedSection + '\n';
	}

	return content;
}

/**
 * Build a map of item ID → { item, lane } for all items in the board (recursive).
 */
function buildItemMap(board: KanbanBoard): Map<string, { item: KanbanItem; lane: KanbanLane }> {
	const map = new Map<string, { item: KanbanItem; lane: KanbanLane }>();
	function walk(items: KanbanItem[], lane: KanbanLane): void {
		for (const item of items) {
			map.set(item.id, { item, lane });
			walk(item.children, lane);
		}
	}
	for (const lane of board.lanes) {
		walk(lane.items, lane);
	}
	return map;
}

/**
 * Find the parent of an item in the board's tree structure.
 */
function findParent(items: KanbanItem[], target: KanbanItem): KanbanItem | null {
	for (const item of items) {
		if (item.children.includes(target)) return item;
		const found = findParent(item.children, target);
		if (found) return found;
	}
	return null;
}

/**
 * Ensure the folder exists, creating it if needed.
 */
async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (!normalized) return;
	const existing = app.vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFolder) return;
	await app.vault.createFolder(normalized);
}

/**
 * Generate a unique filename for a linked note.
 * If a file with the same name already exists and belongs to a different card, append the card ID.
 */
function getUniqueNotePath(app: App, folder: string, baseName: string, cardId: string): string {
	const firstTry = normalizePath(`${folder}/${baseName}.md`);
	const existing = app.vault.getAbstractFileByPath(firstTry);
	if (!existing) return firstTry;
	// File exists — use suffix
	return normalizePath(`${folder}/${baseName}_${cardId}.md`);
}

/**
 * Create or update a single linked note for a card.
 * Returns the note path.
 */
export async function createOrUpdateLinkedNote(
	app: App,
	item: KanbanItem,
	lane: KanbanLane,
	board: KanbanBoard,
	boardPath: string,
	baseFolder: string,
): Promise<string> {
	const boardUuid = board.settings.boardUuid;
	if (!boardUuid) return '';

	const boardFolder = normalizePath(`${baseFolder}/${boardUuid}`);
	await ensureFolder(app, boardFolder);

	const parentItem = findParentInBoard(board, item);

	if (item.linkedNotePath) {
		// Update existing note — preserve user content
		const file = app.vault.getAbstractFileByPath(item.linkedNotePath);
		if (file instanceof TFile) {
			const existingContent = await app.vault.read(file);
			const updatedContent = updateNoteContent(existingContent, item, lane, boardPath, parentItem);
			await app.vault.modify(file, updatedContent);
			return item.linkedNotePath;
		}
		// File was deleted externally — create anew
	}

	// Create new note
	const content = generateNoteContent(item, lane, boardPath, parentItem);
	const baseName = cleanTitleForFilename(item.title);
	const notePath = getUniqueNotePath(app, boardFolder, baseName, item.id);
	await app.vault.create(notePath, content);
	return notePath;
}

/**
 * Find parent of an item across the entire board.
 */
function findParentInBoard(board: KanbanBoard, target: KanbanItem): KanbanItem | null {
	for (const lane of board.lanes) {
		const found = findParent(lane.items, target);
		if (found) return found;
	}
	return null;
}

/**
 * Sync all linked notes: update managed sections only, clear broken linkedNotePaths.
 * User-written content outside managed sections is preserved.
 */
export async function syncAllLinkedNotes(
	app: App,
	board: KanbanBoard,
	boardPath: string,
	baseFolder: string,
): Promise<boolean> {
	if (!board.settings.boardUuid || !baseFolder) return false;

	const allItems = buildItemMap(board);
	let changed = false;

	for (const [, { item, lane }] of allItems) {
		if (!item.linkedNotePath) continue;

		// Check if the note file still exists
		const file = app.vault.getAbstractFileByPath(item.linkedNotePath);
		if (!(file instanceof TFile)) {
			// Note was deleted externally
			item.linkedNotePath = null;
			changed = true;
			continue;
		}

		// Update only managed sections, preserve user content
		const parentItem = findParentInBoard(board, item);
		const existingContent = await app.vault.read(file);
		const updatedContent = updateNoteContent(existingContent, item, lane, boardPath, parentItem);
		if (existingContent !== updatedContent) {
			await app.vault.modify(file, updatedContent);
		}
	}

	return changed;
}
