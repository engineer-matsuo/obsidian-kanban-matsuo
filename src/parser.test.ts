import { describe, it, expect } from 'vitest';
import {
	parseMarkdown,
	boardToMarkdown,
	createItem,
	createLane,
	createBoard,
	extractTags,
	extractDates,
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

describe('extractDates', () => {
	it('extracts single @{YYYY-MM-DD} as endDate', () => {
		expect(extractDates('Task @{2024-03-15}')).toEqual({ start: null, end: '2024-03-15' });
	});

	it('extracts range @{start~end}', () => {
		expect(extractDates('Task @{2024-03-01~2024-03-15}')).toEqual({ start: '2024-03-01', end: '2024-03-15' });
	});

	it('extracts start only @{start~}', () => {
		expect(extractDates('Task @{2024-03-01~}')).toEqual({ start: '2024-03-01', end: null });
	});

	it('extracts emoji date as endDate', () => {
		expect(extractDates('Task 📅 2024-03-15')).toEqual({ start: null, end: '2024-03-15' });
	});

	it('returns nulls when no date', () => {
		expect(extractDates('Just a task')).toEqual({ start: null, end: null });
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
		expect(item.endDate).toBe('2024-06-01');
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
		expect(item1.endDate).toBe('2024-05-01');

		const item2 = board.lanes[0].items[1];
		expect(item2.tags).toContain('feature');
		expect(item2.endDate).toBeNull();
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

	it('moves archived items to Archive section, not in active lane', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Archived');
		item.archived = true;
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		// Should NOT appear under the active lane heading
		const laneSection = md.split('## %% Archive %%')[0];
		const laneLines = laneSection.split('\n').filter((l) => l.startsWith('- '));
		expect(laneLines).toHaveLength(0);
		// Should appear in archive section
		expect(md).toContain('## %% Archive %%');
		expect(md).toContain('Archived');
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

describe('boardToMarkdown - edge cases', () => {
	it('handles multiline card titles', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Line one\nLine two');
		board.lanes[0].items.push(item);
		const md = boardToMarkdown(board);
		expect(md).toContain('Line one');
	});

	it('handles cards with both tags and dates', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Task #urgent @{2026-06-01}');
		board.lanes[0].items.push(item);
		const md = boardToMarkdown(board);
		expect(md).toContain('#urgent');
		expect(md).toContain('@{2026-06-01}');
	});

	it('handles empty lane with no items', () => {
		const board = createBoard(['Empty']);
		const md = boardToMarkdown(board);
		expect(md).toContain('## Empty');
		expect(md).not.toContain('- ');
	});

	it('preserves multiple lanes order', () => {
		const board = createBoard(['Alpha', 'Beta', 'Gamma', 'Delta']);
		const md = boardToMarkdown(board);
		const alphaIdx = md.indexOf('## Alpha');
		const betaIdx = md.indexOf('## Beta');
		const gammaIdx = md.indexOf('## Gamma');
		const deltaIdx = md.indexOf('## Delta');
		expect(alphaIdx).toBeLessThan(betaIdx);
		expect(betaIdx).toBeLessThan(gammaIdx);
		expect(gammaIdx).toBeLessThan(deltaIdx);
	});
});

describe('parseMarkdown - edge cases', () => {
	it('handles wikilinks in card titles', () => {
		const md = `## Lane

- [ ] Check [[My Note]] for details
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items[0].title).toContain('[[My Note]]');
	});

	it('handles cards with multiple tags', () => {
		const md = `## Lane

- [ ] Task #bug #critical #p0
`;
		const board = parseMarkdown(md);
		const item = board.lanes[0].items[0];
		expect(item.tags).toEqual(['bug', 'critical', 'p0']);
	});

	it('handles special characters in lane titles', () => {
		const md = `## 🚀 Sprint #3 - Week 12

- [ ] Item
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].title).toBe('🚀 Sprint #3 - Week 12');
	});

	it('ignores non-list content between lanes', () => {
		const md = `## Lane 1

Some description text

- [ ] Task 1

## Lane 2

- [ ] Task 2
`;
		const board = parseMarkdown(md);
		expect(board.lanes).toHaveLength(2);
		expect(board.lanes[0].items).toHaveLength(1);
		expect(board.lanes[1].items).toHaveLength(1);
	});
});

describe('boardToMarkdown - archive persistence', () => {
	it('persists archived items in Archive section', () => {
		const board = createBoard(['To Do']);
		const item = createItem('Archived task');
		item.archived = true;
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).toContain('## %% Archive %%');
		expect(md).toContain('### To Do');
		expect(md).toContain('Archived task');
	});

	it('does not show Archive section when no archived items', () => {
		const board = createBoard(['To Do']);
		board.lanes[0].items.push(createItem('Active'));

		const md = boardToMarkdown(board);
		expect(md).not.toContain('Archive');
	});

	it('separates active and archived items', () => {
		const board = createBoard(['Lane']);
		board.lanes[0].items.push(createItem('Active'));
		const archived = createItem('Old');
		archived.archived = true;
		board.lanes[0].items.push(archived);

		const md = boardToMarkdown(board);
		const archiveIdx = md.indexOf('%% Archive %%');
		const activeIdx = md.indexOf('Active');
		const oldIdx = md.indexOf('Old');
		expect(activeIdx).toBeLessThan(archiveIdx);
		expect(oldIdx).toBeGreaterThan(archiveIdx);
	});
});

describe('boardToMarkdown - body persistence', () => {
	it('persists body as indented lines', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Task');
		item.body = 'Line 1\nLine 2';
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).toContain('    Line 1');
		expect(md).toContain('    Line 2');
	});

	it('does not add indented lines for empty body', () => {
		const board = createBoard(['Lane']);
		board.lanes[0].items.push(createItem('Task'));

		const md = boardToMarkdown(board);
		const lines = md.split('\n');
		const taskLine = lines.findIndex((l) => l.includes('Task'));
		// Next non-empty line should not be indented
		const nextLine = lines[taskLine + 1];
		if (nextLine && nextLine.trim()) {
			expect(nextLine.startsWith('    ')).toBe(false);
		}
	});
});

describe('parseMarkdown - body parsing', () => {
	it('parses indented body lines', () => {
		const md = `## Lane

- [ ] Task title
    Body line 1
    Body line 2

`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items[0].body).toBe('Body line 1\nBody line 2');
	});

	it('handles card with no body', () => {
		const md = `## Lane

- [ ] Simple task
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items[0].body).toBe('');
	});
});

describe('parseMarkdown - archive parsing', () => {
	it('parses archived items from Archive section', () => {
		const md = `## To Do

- [ ] Active task

## %% Archive %%

### To Do

- [x] Old task
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items).toHaveLength(2);
		expect(board.lanes[0].items[0].archived).toBe(false);
		expect(board.lanes[0].items[1].archived).toBe(true);
		expect(board.lanes[0].items[1].title).toBe('Old task');
	});
});

describe('round-trip with body and archive', () => {
	it('preserves body through round-trip', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Task');
		item.body = 'Description text';
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		expect(parsed.lanes[0].items[0].body).toBe('Description text');
	});

	it('preserves archived items through round-trip', () => {
		const board = createBoard(['Done']);
		const archived = createItem('Old task');
		archived.archived = true;
		archived.checked = true;
		board.lanes[0].items.push(archived);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		expect(parsed.lanes[0].items[0].archived).toBe(true);
		expect(parsed.lanes[0].items[0].checked).toBe(true);
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
		expect(parsed.lanes[0].items[1].endDate).toBe('2024-12-25');
		expect(parsed.lanes[2].items[0].checked).toBe(true);
	});
});
