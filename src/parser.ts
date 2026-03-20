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
 * Format:
 * ---
 * kanban-plugin: kanban-matsuo
 * lane-width: 272
 * ---
 *
 * ## Lane Title
 *
 * - [ ] Card title #tag @{2024-01-15}
 *     Body line 1
 *     Body line 2
 * - [x] Completed card
 *
 * ## %% Archive %%
 *
 * ### Lane Title
 *
 * - [x] Archived card
 */
export function parseMarkdown(content: string): KanbanBoard {
	const board: KanbanBoard = {
		lanes: [],
		settings: { ...DEFAULT_BOARD_SETTINGS },
	};

	const lines = content.split('\n');
	let currentLane: KanbanLane | null = null;
	let currentItem: KanbanItem | null = null;
	let inFrontmatter = false;
	let inArchive = false;

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

		// Archive section
		if (line.match(/^##\s+%%\s*Archive\s*%%/i)) {
			inArchive = true;
			currentLane = null;
			currentItem = null;
			continue;
		}

		if (inArchive) {
			// ### Lane Title inside archive
			const archiveLaneMatch = line.match(/^###\s+(.+)$/);
			if (archiveLaneMatch) {
				const laneTitle = archiveLaneMatch[1].trim();
				currentLane = board.lanes.find((l) => l.title === laneTitle) || null;
				if (!currentLane) {
					currentLane = createLane(laneTitle);
					board.lanes.push(currentLane);
				}
				currentItem = null;
				continue;
			}

			const itemMatch = line.match(/^[-*]\s+(.+)$/);
			if (itemMatch && currentLane) {
				const item = parseItemText(itemMatch[1]);
				item.archived = true;
				currentLane.items.push(item);
				currentItem = item;
				continue;
			}

			// Body lines for archived items (indented)
			if (currentItem && line.match(/^\s{4}/) && line.trim().length > 0) {
				if (currentItem.body) currentItem.body += '\n';
				currentItem.body += line.trim();
				continue;
			}

			continue;
		}

		// Lane heading (## Title)
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			currentLane = createLane(headingMatch[1]);
			board.lanes.push(currentLane);
			currentItem = null;
			continue;
		}

		// List item (card)
		const itemMatch = line.match(/^[-*]\s+(.+)$/);
		if (itemMatch && currentLane) {
			const rawText = itemMatch[1];
			const item = parseItemText(rawText);
			currentLane.items.push(item);
			currentItem = item;
			continue;
		}

		// Body lines (indented with 4 spaces or tab, belongs to current item)
		if (currentItem && line.match(/^\s{4}|\t/) && line.trim().length > 0) {
			if (currentItem.body) currentItem.body += '\n';
			currentItem.body += line.trim();
			continue;
		}

		// Empty line resets current item (body collection)
		if (line.trim() === '') {
			currentItem = null;
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
 * Active and archived items are both persisted.
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

	// Active items per lane
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

			// Body as indented lines
			if (item.body) {
				for (const bodyLine of item.body.split('\n')) {
					lines.push(`    ${bodyLine}`);
				}
			}
		}

		lines.push('');
	}

	// Archive section (only if there are archived items)
	const archivedByLane = new Map<string, KanbanItem[]>();
	for (const lane of board.lanes) {
		const archived = lane.items.filter((i) => i.archived);
		if (archived.length > 0) {
			archivedByLane.set(lane.title, archived);
		}
	}

	if (archivedByLane.size > 0) {
		lines.push('## %% Archive %%');
		lines.push('');

		for (const [laneTitle, items] of archivedByLane) {
			lines.push(`### ${laneTitle}`);
			lines.push('');
			for (const item of items) {
				let line = '- ';
				if (board.settings.showCheckboxes) {
					line += item.checked ? '[x] ' : '[ ] ';
				}
				line += item.title;
				lines.push(line);
				if (item.body) {
					for (const bodyLine of item.body.split('\n')) {
						lines.push(`    ${bodyLine}`);
					}
				}
			}
			lines.push('');
		}
	}

	return lines.join('\n');
}
