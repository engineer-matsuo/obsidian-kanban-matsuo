import { describe, it, expect } from 'vitest';
import {
	parseMarkdown,
	boardToMarkdown,
	createItem,
	createBoard,
} from './parser';
import type { KanbanItem } from './types';

describe('KanbanItem children (subtask model)', () => {
	it('createItem has empty children array', () => {
		const item = createItem('Task');
		expect(item.children).toEqual([]);
	});

	it('children are same type as parent (KanbanItem)', () => {
		const parent = createItem('Parent');
		const child = createItem('Child #tag @{2026-05-01}');
		parent.children.push(child);
		expect(parent.children[0].tags).toContain('tag');
		expect(parent.children[0].endDate).toBe('2026-05-01');
		expect(parent.children[0].children).toEqual([]);
	});

	it('supports deep nesting', () => {
		const a = createItem('A');
		const b = createItem('B');
		const c = createItem('C');
		a.children.push(b);
		b.children.push(c);
		expect(a.children[0].children[0].title).toBe('C');
	});
});

describe('Markdown serialization with children', () => {
	it('serializes children as indented list items', () => {
		const board = createBoard(['Lane']);
		const parent = createItem('Parent');
		const child1 = createItem('Child 1');
		const child2 = createItem('Child 2');
		child2.checked = true;
		parent.children.push(child1, child2);
		board.lanes[0].items.push(parent);

		const md = boardToMarkdown(board);
		expect(md).toContain('- [ ] Parent');
		expect(md).toContain('    - [ ] Child 1');
		expect(md).toContain('    - [x] Child 2');
	});

	it('serializes nested children with deeper indentation', () => {
		const board = createBoard(['Lane']);
		const parent = createItem('Parent');
		const child = createItem('Level 1');
		const grandchild = createItem('Level 2');
		grandchild.checked = true;
		child.children.push(grandchild);
		parent.children.push(child);
		board.lanes[0].items.push(parent);

		const md = boardToMarkdown(board);
		expect(md).toContain('    - [ ] Level 1');
		expect(md).toContain('        - [x] Level 2');
	});

	it('does not add child lines when children is empty', () => {
		const board = createBoard(['Lane']);
		board.lanes[0].items.push(createItem('Solo'));

		const md = boardToMarkdown(board);
		const lines = md.split('\n');
		const idx = lines.findIndex((l) => l.includes('Solo'));
		const next = lines[idx + 1] || '';
		expect(next).not.toMatch(/^\s+- /);
	});

	it('serializes children with tags and dates', () => {
		const board = createBoard(['Lane']);
		const parent = createItem('Parent');
		const child = createItem('Fix bug #urgent @{2026-04-01}');
		parent.children.push(child);
		board.lanes[0].items.push(parent);

		const md = boardToMarkdown(board);
		expect(md).toContain('    - [ ] Fix bug #urgent @{2026-04-01}');
	});
});

describe('Markdown parsing with children', () => {
	it('parses indented list items as children', () => {
		const md = `## Lane

- [ ] Parent
    - [ ] Child 1
    - [x] Child 2
`;
		const board = parseMarkdown(md);
		const parent = board.lanes[0].items[0];
		expect(parent.children).toHaveLength(2);
		expect(parent.children[0].title).toBe('Child 1');
		expect(parent.children[0].checked).toBe(false);
		expect(parent.children[1].title).toBe('Child 2');
		expect(parent.children[1].checked).toBe(true);
	});

	it('parses nested children', () => {
		const md = `## Lane

- [ ] Root
    - [ ] Level 1
        - [x] Level 2
`;
		const board = parseMarkdown(md);
		const root = board.lanes[0].items[0];
		expect(root.children).toHaveLength(1);
		expect(root.children[0].children).toHaveLength(1);
		expect(root.children[0].children[0].title).toBe('Level 2');
		expect(root.children[0].children[0].checked).toBe(true);
	});

	it('parses children with tags and dates', () => {
		const md = `## Lane

- [ ] Parent
    - [ ] Child #bug @{2026-03-25}
`;
		const board = parseMarkdown(md);
		const child = board.lanes[0].items[0].children[0];
		expect(child.tags).toContain('bug');
		expect(child.endDate).toBe('2026-03-25');
	});

	it('handles mixed body and children', () => {
		const md = `## Lane

- [ ] Parent
    Description text
    - [ ] Child 1
`;
		const board = parseMarkdown(md);
		const parent = board.lanes[0].items[0];
		expect(parent.body).toBe('Description text');
		expect(parent.children).toHaveLength(1);
	});

	it('card without children has empty array', () => {
		const md = `## Lane

- [ ] Simple
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items[0].children).toEqual([]);
	});
});

describe('Children round-trip', () => {
	it('preserves children through serialize → parse', () => {
		const board = createBoard(['Lane']);
		const parent = createItem('Parent');
		const a = createItem('A');
		const b = createItem('B'); b.checked = true;
		const c = createItem('C');
		const c1 = createItem('C1'); c1.checked = true;
		c.children.push(c1);
		parent.children.push(a, b, c);
		board.lanes[0].items.push(parent);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		const p = parsed.lanes[0].items[0];

		expect(p.children).toHaveLength(3);
		expect(p.children[0].title).toBe('A');
		expect(p.children[1].checked).toBe(true);
		expect(p.children[2].children).toHaveLength(1);
		expect(p.children[2].children[0].title).toBe('C1');
	});

	it('preserves children in archived items', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Archived');
		item.archived = true;
		item.children.push(createItem('Sub'));
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		const archived = parsed.lanes[0].items[0];
		expect(archived.archived).toBe(true);
		expect(archived.children).toHaveLength(1);
	});

	it('preserves children with body', () => {
		const board = createBoard(['Lane']);
		const parent = createItem('Parent');
		parent.body = 'Some description';
		parent.children.push(createItem('Child'));
		board.lanes[0].items.push(parent);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		expect(parsed.lanes[0].items[0].body).toBe('Some description');
		expect(parsed.lanes[0].items[0].children).toHaveLength(1);
	});
});

describe('Progress counting', () => {
	it('counts done/total recursively', () => {
		function count(items: KanbanItem[]): { done: number; total: number } {
			let done = 0, total = 0;
			for (const c of items) {
				total++;
				if (c.checked) done++;
				const sub = count(c.children);
				done += sub.done;
				total += sub.total;
			}
			return { done, total };
		}

		const parent = createItem('P');
		const a = createItem('A'); a.checked = true;
		const b = createItem('B');
		const b1 = createItem('B1'); b1.checked = true;
		b.children.push(b1);
		parent.children.push(a, b);

		const { done, total } = count(parent.children);
		expect(done).toBe(2);
		expect(total).toBe(3);
	});
});
