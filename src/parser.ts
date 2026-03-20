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
		children: [],
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
 * Cards at the top level are `- [ ] title`.
 * Child cards (subtasks) are indented by 4 spaces per level:
 *   `    - [ ] child`
 *   `        - [ ] grandchild`
 *
 * Body text is indented but NOT a list item.
 */
export function parseMarkdown(content: string): KanbanBoard {
	const board: KanbanBoard = {
		lanes: [],
		settings: { ...DEFAULT_BOARD_SETTINGS },
	};

	const lines = content.split('\n');
	let currentLane: KanbanLane | null = null;
	let inFrontmatter = false;
	let inArchive = false;

	// Stack to track nesting: each entry is [indent, KanbanItem]
	let itemStack: [number, KanbanItem][] = [];

	function getCurrentItem(): KanbanItem | null {
		return itemStack.length > 0 ? itemStack[itemStack.length - 1][1] : null;
	}

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
			itemStack = [];
			continue;
		}

		if (inArchive) {
			const archiveLaneMatch = line.match(/^###\s+(.+)$/);
			if (archiveLaneMatch) {
				const laneTitle = archiveLaneMatch[1].trim();
				currentLane = board.lanes.find((l) => l.title === laneTitle) || null;
				if (!currentLane) {
					currentLane = createLane(laneTitle);
					board.lanes.push(currentLane);
				}
				itemStack = [];
				continue;
			}

			// Items inside archive (same parsing as active, but mark archived)
			const parsed = parseCardLine(line, itemStack, currentLane, true);
			if (parsed) {
				itemStack = parsed;
				continue;
			}

			// Body lines
			const cur = getCurrentItem();
			if (cur && line.match(/^\s{4}/) && line.trim().length > 0 && !line.match(/^\s*[-*]\s/)) {
				if (cur.body) cur.body += '\n';
				cur.body += line.trim();
			}
			continue;
		}

		// Lane heading (## Title)
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			currentLane = createLane(headingMatch[1]);
			board.lanes.push(currentLane);
			itemStack = [];
			continue;
		}

		// Card lines (top-level or indented)
		const parsed = parseCardLine(line, itemStack, currentLane, false);
		if (parsed) {
			itemStack = parsed;
			continue;
		}

		// Body lines (indented non-list text)
		const cur = getCurrentItem();
		if (cur && line.match(/^\s{4}|\t/) && line.trim().length > 0 && !line.match(/^\s*[-*]\s/)) {
			if (cur.body) cur.body += '\n';
			cur.body += line.trim();
			continue;
		}

		// Empty line
		if (line.trim() === '') {
			itemStack = [];
		}
	}

	return board;
}

/**
 * Try to parse a line as a card (list item). Handles indentation for nesting.
 * Returns updated stack, or null if the line is not a card.
 */
function parseCardLine(
	line: string,
	stack: [number, KanbanItem][],
	currentLane: KanbanLane | null,
	archived: boolean,
): [number, KanbanItem][] | null {
	const match = line.match(/^(\s*)([-*])\s+(.+)$/);
	if (!match || !currentLane) return null;

	const indent = match[1].length;
	const rawText = match[3];
	const item = parseItemText(rawText);
	if (archived) item.archived = true;

	if (indent === 0) {
		// Top-level card
		currentLane.items.push(item);
		return [[0, item]];
	}

	// Child card: find parent by indentation
	// Pop stack until we find an item at a lower indent level
	const newStack = [...stack];
	while (newStack.length > 0 && newStack[newStack.length - 1][0] >= indent) {
		newStack.pop();
	}

	if (newStack.length > 0) {
		const parent = newStack[newStack.length - 1][1];
		parent.children.push(item);
	} else {
		// Fallback: treat as top-level
		currentLane.items.push(item);
	}

	newStack.push([indent, item]);
	return newStack;
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

	// Active items per lane
	for (const lane of board.lanes) {
		lines.push(`## ${lane.title}`);
		lines.push('');

		for (const item of lane.items) {
			if (item.archived) continue;
			serializeItem(item, lines, 0, board.settings.showCheckboxes);
		}

		lines.push('');
	}

	// Archive section
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
				serializeItem(item, lines, 0, board.settings.showCheckboxes);
			}
			lines.push('');
		}
	}

	return lines.join('\n');
}

/**
 * Serialize a single item and its children recursively.
 */
function serializeItem(item: KanbanItem, lines: string[], depth: number, showCheckboxes: boolean): void {
	const indent = '    '.repeat(depth);
	let line = `${indent}- `;
	if (showCheckboxes) {
		line += item.checked ? '[x] ' : '[ ] ';
	}
	line += item.title;
	lines.push(line);

	// Body
	if (item.body) {
		for (const bodyLine of item.body.split('\n')) {
			lines.push(`${indent}    ${bodyLine}`);
		}
	}

	// Children (same KanbanItem, deeper indent)
	for (const child of item.children) {
		serializeItem(child, lines, depth + 1, showCheckboxes);
	}
}
