export interface KanbanItem {
	id: string;
	title: string;
	body: string;
	tags: string[];
	startDate: string | null;
	endDate: string | null;
	checked: boolean;
	archived: boolean;
	children: KanbanItem[];
	linkedNotePath: string | null;
}

export interface KanbanLane {
	id: string;
	title: string;
	items: KanbanItem[];
	collapsed: boolean;
	wipLimit: number;
}

export interface KanbanBoard {
	lanes: KanbanLane[];
	settings: KanbanBoardSettings;
}

export interface KanbanBoardSettings {
	laneWidth: number;
	showTags: boolean;
	showDates: boolean;
	showCheckboxes: boolean;
	boardUuid: string;
}

export interface KanbanPluginSettings {
	defaultLanes: string[];
	laneWidth: number;
	showTags: boolean;
	showDates: boolean;
	showCheckboxes: boolean;
	autoSaveDelay: number;
	language: 'auto' | 'en' | 'ja';
	newlineKey: 'shift+enter' | 'ctrl+enter' | 'alt+enter';
	timezone: string;
	linkedNotesEnabled: boolean;
	linkedNoteFolder: string;
}

export const DEFAULT_PLUGIN_SETTINGS: KanbanPluginSettings = {
	defaultLanes: ['To Do', 'In Progress', 'Done'],
	laneWidth: 500,
	showTags: true,
	showDates: true,
	showCheckboxes: true,
	autoSaveDelay: 500,
	language: 'auto',
	newlineKey: 'shift+enter',
	timezone: 'local',
	linkedNotesEnabled: false,
	linkedNoteFolder: '',
};

export const DEFAULT_BOARD_SETTINGS: KanbanBoardSettings = {
	laneWidth: 500,
	showTags: true,
	showDates: true,
	showCheckboxes: true,
	boardUuid: '',
};
