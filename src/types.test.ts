import { describe, it, expect } from 'vitest';
import {
	DEFAULT_PLUGIN_SETTINGS,
	DEFAULT_BOARD_SETTINGS,
} from './types';
import type { KanbanItem, KanbanLane, KanbanBoard, KanbanPluginSettings } from './types';

describe('DEFAULT_PLUGIN_SETTINGS', () => {
	it('has all required fields with correct defaults', () => {
		expect(DEFAULT_PLUGIN_SETTINGS.defaultLanes).toEqual(['To Do', 'In Progress', 'Done']);
		expect(DEFAULT_PLUGIN_SETTINGS.laneWidth).toBe(272);
		expect(DEFAULT_PLUGIN_SETTINGS.showTags).toBe(true);
		expect(DEFAULT_PLUGIN_SETTINGS.showDates).toBe(true);
		expect(DEFAULT_PLUGIN_SETTINGS.showCheckboxes).toBe(true);
		expect(DEFAULT_PLUGIN_SETTINGS.autoSaveDelay).toBe(500);
		expect(DEFAULT_PLUGIN_SETTINGS.language).toBe('auto');
		expect(DEFAULT_PLUGIN_SETTINGS.boardTemplatePath).toBe('');
		expect(DEFAULT_PLUGIN_SETTINGS.newlineKey).toBe('shift+enter');
		expect(DEFAULT_PLUGIN_SETTINGS.timezone).toBe('local');
	});
});

describe('DEFAULT_BOARD_SETTINGS', () => {
	it('has correct defaults', () => {
		expect(DEFAULT_BOARD_SETTINGS.laneWidth).toBe(272);
		expect(DEFAULT_BOARD_SETTINGS.showTags).toBe(true);
		expect(DEFAULT_BOARD_SETTINGS.showDates).toBe(true);
		expect(DEFAULT_BOARD_SETTINGS.showCheckboxes).toBe(true);
	});
});

describe('KanbanItem interface', () => {
	it('can create a valid item object', () => {
		const item: KanbanItem = {
			id: 'test-id',
			title: 'Test card #bug @{2026-03-20}',
			body: 'Description',
			tags: ['bug'],
			startDate: null,
			endDate: '2026-03-20',
			checked: false,
			archived: false,
			children: [],
		};
		expect(item.id).toBe('test-id');
		expect(item.tags).toContain('bug');
		expect(item.endDate).toBe('2026-03-20');
		expect(item.body).toBe('Description');
	});

	it('supports null endDate', () => {
		const item: KanbanItem = {
			id: 'x', title: 'No date', body: '',
			tags: [], startDate: null, endDate: null, checked: false, archived: false, children: [],
		};
		expect(item.endDate).toBeNull();
	});
});

describe('KanbanLane interface', () => {
	it('can create a valid lane with items', () => {
		const lane: KanbanLane = {
			id: 'lane-1',
			title: 'To Do',
			items: [
				{ id: '1', title: 'Task', body: '', tags: [], startDate: null, endDate: null, checked: false, archived: false, children: [] },
			],
			collapsed: false,
			wipLimit: 5,
		};
		expect(lane.items).toHaveLength(1);
		expect(lane.wipLimit).toBe(5);
	});
});

describe('KanbanBoard interface', () => {
	it('can create a valid board structure', () => {
		const board: KanbanBoard = {
			lanes: [
				{ id: '1', title: 'Lane', items: [], collapsed: false, wipLimit: 0 },
			],
			settings: { ...DEFAULT_BOARD_SETTINGS },
		};
		expect(board.lanes).toHaveLength(1);
		expect(board.settings.laneWidth).toBe(272);
	});
});

describe('KanbanPluginSettings timezone field', () => {
	it('accepts IANA timezone strings', () => {
		const settings: KanbanPluginSettings = { ...DEFAULT_PLUGIN_SETTINGS, timezone: 'Asia/Tokyo' };
		expect(settings.timezone).toBe('Asia/Tokyo');
	});

	it('accepts local and utc', () => {
		const s1: KanbanPluginSettings = { ...DEFAULT_PLUGIN_SETTINGS, timezone: 'local' };
		const s2: KanbanPluginSettings = { ...DEFAULT_PLUGIN_SETTINGS, timezone: 'UTC' };
		expect(s1.timezone).toBe('local');
		expect(s2.timezone).toBe('UTC');
	});
});
