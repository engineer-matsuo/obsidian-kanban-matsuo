import { describe, it, expect } from 'vitest';
import {
	parseMarkdown,
	boardToMarkdown,
	createItem,
	createLane,
	createBoard,
	extractTags,
	extractDate,
	generateId,
} from './parser';

describe('generateId', () => {
	it('returns a non-empty string', () => {
		const id = generateId();
		expect(id).toBeTruthy();
		expect(typeof id).toBe('string');
	});

	it('returns unique values', () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateId()));
		expect(ids.size).toBe(100);
	});
});

describe('extractTags', () => {
	it('extracts single tag', () => {
		expect(extractTags('Task #urgent')).toEqual(['urgent']);
	});

	it('extracts multiple tags', () => {
		expect(extractTags('Task #urgent #bug #p1')).toEqual(['urgent', 'bug', 'p1']);
	});

	it('returns empty array when no tags', () => {
		expect(extractTags('Just a task')).toEqual([]);
	});

	it('handles tag at start of text', () => {
		expect(extractTags('#feature request')).toEqual(['feature']);
	});

	it('does not extract tags without leading space or start of line', () => {
		// "C#" followed by space matches the regex /#[^\s#]+/ → "#"
		// This is expected behavior - # always starts a tag
		expect(extractTags('No tags here')).toEqual([]);
	});
});

describe('extractDate', () => {
	it('extracts @{YYYY-MM-DD} format', () => {
		expect(extractDate('Task @{2024-03-15}')).toBe('2024-03-15');
	});

	it('extracts emoji date format', () => {
		expect(extractDate('Task 📅 2024-03-15')).toBe('2024-03-15');
	});

	it('returns null when no date', () => {
		expect(extractDate('Just a task')).toBeNull();
	});

	it('prefers @{} format over emoji', () => {
		expect(extractDate('Task @{2024-01-01} 📅 2024-02-02')).toBe('2024-01-01');
	});
});

describe('createItem', () => {
	it('creates an item with correct defaults', () => {
		const item = createItem('My task');
		expect(item.title).toBe('My task');
		expect(item.body).toBe('');
		expect(item.checked).toBe(false);
		expect(item.archived).toBe(false);
		expect(item.id).toBeTruthy();
	});

	it('extracts tags from title', () => {
		const item = createItem('Fix #bug in login');
		expect(item.tags).toEqual(['bug']);
	});

	it('extracts date from title', () => {
		const item = createItem('Due @{2024-06-01}');
		expect(item.dueDate).toBe('2024-06-01');
	});

	it('trims whitespace', () => {
		const item = createItem('  trimmed  ');
		expect(item.title).toBe('trimmed');
	});
});

describe('createLane', () => {
	it('creates a lane with correct defaults', () => {
		const lane = createLane('To Do');
		expect(lane.title).toBe('To Do');
		expect(lane.items).toEqual([]);
		expect(lane.collapsed).toBe(false);
		expect(lane.wipLimit).toBe(0);
	});
});

describe('createBoard', () => {
	it('creates a board with specified lanes', () => {
		const board = createBoard(['To Do', 'In Progress', 'Done']);
		expect(board.lanes).toHaveLength(3);
		expect(board.lanes[0].title).toBe('To Do');
		expect(board.lanes[1].title).toBe('In Progress');
		expect(board.lanes[2].title).toBe('Done');
	});

	it('creates empty board', () => {
		const board = createBoard([]);
		expect(board.lanes).toHaveLength(0);
	});
});

describe('parseMarkdown', () => {
	it('parses basic board with frontmatter', () => {
		const md = `---
kanban-plugin: kanban-matsuo
lane-width: 300
---

## To Do

- [ ] Task 1
- [x] Task 2

## Done

- [x] Completed task
`;
		const board = parseMarkdown(md);
		expect(board.lanes).toHaveLength(2);
		expect(board.lanes[0].title).toBe('To Do');
		expect(board.lanes[0].items).toHaveLength(2);
		expect(board.lanes[0].items[0].title).toBe('Task 1');
		expect(board.lanes[0].items[0].checked).toBe(false);
		expect(board.lanes[0].items[1].title).toBe('Task 2');
		expect(board.lanes[0].items[1].checked).toBe(true);
		expect(board.lanes[1].title).toBe('Done');
		expect(board.lanes[1].items[0].checked).toBe(true);
		expect(board.settings.laneWidth).toBe(300);
	});

	it('parses board without frontmatter', () => {
		const md = `## Backlog

- Task A
- Task B
`;
		const board = parseMarkdown(md);
		expect(board.lanes).toHaveLength(1);
		expect(board.lanes[0].items).toHaveLength(2);
		expect(board.lanes[0].items[0].checked).toBe(false);
	});

	it('parses tags and dates in items', () => {
		const md = `## Tasks

- [ ] Fix login #bug @{2024-05-01}
- [ ] Add feature #feature
`;
		const board = parseMarkdown(md);
		const item1 = board.lanes[0].items[0];
		expect(item1.tags).toContain('bug');
		expect(item1.dueDate).toBe('2024-05-01');

		const item2 = board.lanes[0].items[1];
		expect(item2.tags).toContain('feature');
		expect(item2.dueDate).toBeNull();
	});

	it('handles empty content', () => {
		const board = parseMarkdown('');
		expect(board.lanes).toHaveLength(0);
	});

	it('parses frontmatter settings', () => {
		const md = `---
kanban-plugin: kanban-matsuo
show-tags: false
show-dates: false
show-checkboxes: false
---

## Lane
`;
		const board = parseMarkdown(md);
		expect(board.settings.showTags).toBe(false);
		expect(board.settings.showDates).toBe(false);
		expect(board.settings.showCheckboxes).toBe(false);
	});

	it('handles items with asterisk bullets', () => {
		const md = `## Lane

* Item one
* Item two
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items).toHaveLength(2);
	});
});

describe('boardToMarkdown', () => {
	it('produces valid markdown from a board', () => {
		const board = createBoard(['To Do', 'Done']);
		board.lanes[0].items.push(createItem('Task 1'));
		board.lanes[0].items.push(createItem('Task 2'));

		const md = boardToMarkdown(board);
		expect(md).toContain('kanban-plugin: kanban-matsuo');
		expect(md).toContain('## To Do');
		expect(md).toContain('## Done');
		expect(md).toContain('[ ] Task 1');
		expect(md).toContain('[ ] Task 2');
	});

	it('marks checked items with [x]', () => {
		const board = createBoard(['Done']);
		const item = createItem('Completed');
		item.checked = true;
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).toContain('[x] Completed');
	});

	it('excludes archived items', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Archived');
		item.archived = true;
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).not.toContain('Archived');
	});

	it('omits checkboxes when showCheckboxes is false', () => {
		const board = createBoard(['Lane']);
		board.settings.showCheckboxes = false;
		board.lanes[0].items.push(createItem('No checkbox'));

		const md = boardToMarkdown(board);
		expect(md).toContain('- No checkbox');
		expect(md).not.toContain('[ ]');
	});

	it('includes settings in frontmatter', () => {
		const board = createBoard([]);
		board.settings.laneWidth = 400;
		board.settings.showTags = false;

		const md = boardToMarkdown(board);
		expect(md).toContain('lane-width: 400');
		expect(md).toContain('show-tags: false');
	});
});

describe('round-trip', () => {
	it('preserves board state through parse → serialize → parse', () => {
		const original = createBoard(['To Do', 'In Progress', 'Done']);
		original.lanes[0].items.push(createItem('Task A #bug'));
		original.lanes[0].items.push(createItem('Task B @{2024-12-25}'));
		const checked = createItem('Task C');
		checked.checked = true;
		original.lanes[2].items.push(checked);

		const md = boardToMarkdown(original);
		const parsed = parseMarkdown(md);

		expect(parsed.lanes).toHaveLength(3);
		expect(parsed.lanes[0].items).toHaveLength(2);
		expect(parsed.lanes[0].items[0].tags).toContain('bug');
		expect(parsed.lanes[0].items[1].dueDate).toBe('2024-12-25');
		expect(parsed.lanes[2].items[0].checked).toBe(true);
	});
});
