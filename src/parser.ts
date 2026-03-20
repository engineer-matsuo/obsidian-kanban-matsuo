import { KanbanBoard, KanbanItem, KanbanLane, DEFAULT_BOARD_SETTINGS } from './types';

/**
 * Generate a unique ID for lanes and items.
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new empty KanbanItem.
 */
export function createItem(title: string): KanbanItem {
	return {
		id: generateId(),
		title: title.trim(),
		body: '',
		tags: extractTags(title),
		dueDate: extractDate(title),
		checked: false,
		archived: false,
	};
}

/**
 * Create a new empty KanbanLane.
 */
export function createLane(title: string): KanbanLane {
	return {
		id: generateId(),
		title: title.trim(),
		items: [],
		collapsed: false,
		wipLimit: 0,
	};
}

/**
 * Create a new empty KanbanBoard with default lanes.
 */
export function createBoard(laneNames: string[]): KanbanBoard {
	return {
		lanes: laneNames.map((name) => createLane(name)),
		settings: { ...DEFAULT_BOARD_SETTINGS },
	};
}

/**
 * Extract #tags from text.
 */
export function extractTags(text: string): string[] {
	const matches = text.match(/#[^\s#]+/g);
	return matches ? matches.map((t) => t.slice(1)) : [];
}

/**
 * Extract date in format @{YYYY-MM-DD} or 📅 YYYY-MM-DD from text.
 */
export function extractDate(text: string): string | null {
	const atMatch = text.match(/@\{(\d{4}-\d{2}-\d{2})\}/);
	if (atMatch) return atMatch[1];

	const emojiMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
	if (emojiMatch) return emojiMatch[1];

	return null;
}

/**
 * Parse Markdown content into a KanbanBoard.
 *
 * Expected format:
 * ---
 * kanban-plugin: kanban-matsuo
 * lane-width: 272
 * ---
 *
 * ## Lane Title
 *
 * - [ ] Card title #tag @{2024-01-15}
 * - [x] Completed card
 * - Card without checkbox
 */
export function parseMarkdown(content: string): KanbanBoard {
	const board: KanbanBoard = {
		lanes: [],
		settings: { ...DEFAULT_BOARD_SETTINGS },
	};

	const lines = content.split('\n');
	let currentLane: KanbanLane | null = null;
	let inFrontmatter = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Handle YAML frontmatter
		if (i === 0 && line.trim() === '---') {
			inFrontmatter = true;
			continue;
		}

		if (inFrontmatter) {
			if (line.trim() === '---') {
				inFrontmatter = false;
				continue;
			}
			parseFrontmatterLine(line, board.settings);
			continue;
		}

		// Lane heading (## Title)
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			currentLane = createLane(headingMatch[1]);
			board.lanes.push(currentLane);
			continue;
		}

		// List item (card)
		const itemMatch = line.match(/^[-*]\s+(.+)$/);
		if (itemMatch && currentLane) {
			const rawText = itemMatch[1];
			const item = parseItemText(rawText);
			currentLane.items.push(item);
			continue;
		}
	}

	return board;
}

/**
 * Parse a single frontmatter line into board settings.
 */
function parseFrontmatterLine(line: string, settings: typeof DEFAULT_BOARD_SETTINGS): void {
	const match = line.match(/^(\w[\w-]*):\s*(.+)$/);
	if (!match) return;

	const [, key, value] = match;
	switch (key) {
		case 'lane-width':
			settings.laneWidth = parseInt(value, 10) || DEFAULT_BOARD_SETTINGS.laneWidth;
			break;
		case 'show-tags':
			settings.showTags = value.trim() === 'true';
			break;
		case 'show-dates':
			settings.showDates = value.trim() === 'true';
			break;
		case 'show-checkboxes':
			settings.showCheckboxes = value.trim() === 'true';
			break;
	}
}

/**
 * Parse a list item's text content into a KanbanItem.
 */
function parseItemText(rawText: string): KanbanItem {
	let checked = false;
	let text = rawText;

	// Handle checkbox
	const checkboxMatch = text.match(/^\[([x ])\]\s*/i);
	if (checkboxMatch) {
		checked = checkboxMatch[1].toLowerCase() === 'x';
		text = text.slice(checkboxMatch[0].length);
	}

	const item = createItem(text);
	item.checked = checked;

	return item;
}

/**
 * Convert a KanbanBoard back to Markdown string.
 */
export function boardToMarkdown(board: KanbanBoard): string {
	const lines: string[] = [];

	// Frontmatter
	lines.push('---');
	lines.push('kanban-plugin: kanban-matsuo');
	lines.push(`lane-width: ${board.settings.laneWidth}`);
	lines.push(`show-tags: ${board.settings.showTags}`);
	lines.push(`show-dates: ${board.settings.showDates}`);
	lines.push(`show-checkboxes: ${board.settings.showCheckboxes}`);
	lines.push('---');
	lines.push('');

	// Lanes
	for (const lane of board.lanes) {
		lines.push(`## ${lane.title}`);
		lines.push('');

		for (const item of lane.items) {
			if (item.archived) continue;

			let line = '- ';
			if (board.settings.showCheckboxes) {
				line += item.checked ? '[x] ' : '[ ] ';
			}
			line += item.title;

			lines.push(line);
		}

		lines.push('');
	}

	return lines.join('\n');
}
