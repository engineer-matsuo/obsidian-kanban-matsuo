import { describe, it, expect } from 'vitest';
import {
	parseMarkdown,
	boardToMarkdown,
	createItem,
	createBoard,
} from './parser';
import type { SubTask } from './types';

// Helper to create a subtask
function createSubTask(title: string, checked = false, subtasks: SubTask[] = []): SubTask {
	return { id: 'test', title, checked, subtasks };
}

describe('SubTask data model', () => {
	it('KanbanItem has subtasks array', () => {
		const item = createItem('Task');
		expect(item.subtasks).toEqual([]);
	});

	it('SubTask supports nesting', () => {
		const nested: SubTask = createSubTask('Child', false, [
			createSubTask('Grandchild', true),
		]);
		expect(nested.subtasks).toHaveLength(1);
		expect(nested.subtasks[0].checked).toBe(true);
	});
});

describe('SubTask Markdown serialization', () => {
	it('serializes subtasks as indented checkboxes', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Parent task');
		item.subtasks = [
			createSubTask('Sub 1', false),
			createSubTask('Sub 2', true),
		];
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).toContain('    - [ ] Sub 1');
		expect(md).toContain('    - [x] Sub 2');
	});

	it('serializes nested subtasks with deeper indentation', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Parent');
		item.subtasks = [
			createSubTask('Level 1', false, [
				createSubTask('Level 2', true),
			]),
		];
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		expect(md).toContain('    - [ ] Level 1');
		expect(md).toContain('        - [x] Level 2');
	});

	it('does not serialize empty subtasks array', () => {
		const board = createBoard(['Lane']);
		board.lanes[0].items.push(createItem('No subtasks'));

		const md = boardToMarkdown(board);
		const lines = md.split('\n');
		const taskIdx = lines.findIndex((l) => l.includes('No subtasks'));
		const nextLine = lines[taskIdx + 1] || '';
		// Next line should not be an indented checkbox
		expect(nextLine).not.toMatch(/^\s+- \[/);
	});
});

describe('SubTask Markdown parsing', () => {
	it('parses indented checkboxes as subtasks', () => {
		const md = `## Lane

- [ ] Parent task
    - [ ] Sub 1
    - [x] Sub 2
`;
		const board = parseMarkdown(md);
		const item = board.lanes[0].items[0];
		expect(item.subtasks).toHaveLength(2);
		expect(item.subtasks[0].title).toBe('Sub 1');
		expect(item.subtasks[0].checked).toBe(false);
		expect(item.subtasks[1].title).toBe('Sub 2');
		expect(item.subtasks[1].checked).toBe(true);
	});

	it('parses nested subtasks', () => {
		const md = `## Lane

- [ ] Parent
    - [ ] Level 1
        - [x] Level 2
`;
		const board = parseMarkdown(md);
		const item = board.lanes[0].items[0];
		expect(item.subtasks).toHaveLength(1);
		expect(item.subtasks[0].title).toBe('Level 1');
		expect(item.subtasks[0].subtasks).toHaveLength(1);
		expect(item.subtasks[0].subtasks[0].title).toBe('Level 2');
		expect(item.subtasks[0].subtasks[0].checked).toBe(true);
	});

	it('parses card with no subtasks', () => {
		const md = `## Lane

- [ ] Simple card
`;
		const board = parseMarkdown(md);
		expect(board.lanes[0].items[0].subtasks).toEqual([]);
	});

	it('handles mixed body and subtasks', () => {
		const md = `## Lane

- [ ] Task with body and subtasks
    Some description text
    - [ ] Sub 1
    - [x] Sub 2
`;
		const board = parseMarkdown(md);
		const item = board.lanes[0].items[0];
		expect(item.body).toBe('Some description text');
		expect(item.subtasks).toHaveLength(2);
	});
});

describe('SubTask round-trip', () => {
	it('preserves subtasks through serialize → parse', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Task');
		item.subtasks = [
			createSubTask('A', false),
			createSubTask('B', true),
			createSubTask('C', false, [
				createSubTask('C1', true),
			]),
		];
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		const parsedItem = parsed.lanes[0].items[0];

		expect(parsedItem.subtasks).toHaveLength(3);
		expect(parsedItem.subtasks[0].title).toBe('A');
		expect(parsedItem.subtasks[0].checked).toBe(false);
		expect(parsedItem.subtasks[1].title).toBe('B');
		expect(parsedItem.subtasks[1].checked).toBe(true);
		expect(parsedItem.subtasks[2].title).toBe('C');
		expect(parsedItem.subtasks[2].subtasks).toHaveLength(1);
		expect(parsedItem.subtasks[2].subtasks[0].title).toBe('C1');
		expect(parsedItem.subtasks[2].subtasks[0].checked).toBe(true);
	});

	it('preserves subtasks in archived items', () => {
		const board = createBoard(['Lane']);
		const item = createItem('Archived');
		item.archived = true;
		item.subtasks = [createSubTask('Sub', true)];
		board.lanes[0].items.push(item);

		const md = boardToMarkdown(board);
		const parsed = parseMarkdown(md);
		const archivedItem = parsed.lanes[0].items[0];
		expect(archivedItem.archived).toBe(true);
		expect(archivedItem.subtasks).toHaveLength(1);
	});
});

describe('SubTask progress calculation', () => {
	it('counts completed / total correctly', () => {
		const subtasks: SubTask[] = [
			createSubTask('A', true),
			createSubTask('B', false),
			createSubTask('C', true),
		];
		const completed = subtasks.filter((s) => s.checked).length;
		const total = subtasks.length;
		expect(completed).toBe(2);
		expect(total).toBe(3);
	});

	it('counts nested subtasks recursively', () => {
		const subtasks: SubTask[] = [
			createSubTask('A', true, [
				createSubTask('A1', true),
				createSubTask('A2', false),
			]),
			createSubTask('B', false),
		];

		function countAll(subs: SubTask[]): { done: number; total: number } {
			let done = 0, total = 0;
			for (const s of subs) {
				total++;
				if (s.checked) done++;
				const child = countAll(s.subtasks);
				done += child.done;
				total += child.total;
			}
			return { done, total };
		}

		const { done, total } = countAll(subtasks);
		expect(done).toBe(2); // A, A1
		expect(total).toBe(4); // A, A1, A2, B
	});
});
