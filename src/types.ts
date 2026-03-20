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
}

export interface KanbanPluginSettings {
	defaultLanes: string[];
	laneWidth: number;
	showTags: boolean;
	showDates: boolean;
	showCheckboxes: boolean;
	autoSaveDelay: number;
	language: 'auto' | 'en' | 'ja';
	boardTemplatePath: string;
	newlineKey: 'shift+enter' | 'ctrl+enter' | 'alt+enter';
	timezone: string;
}

export const DEFAULT_PLUGIN_SETTINGS: KanbanPluginSettings = {
	defaultLanes: ['To Do', 'In Progress', 'Done'],
	laneWidth: 272,
	showTags: true,
	showDates: true,
	showCheckboxes: true,
	autoSaveDelay: 500,
	language: 'auto',
	boardTemplatePath: '',
	newlineKey: 'shift+enter',
	timezone: 'local',
};

export const DEFAULT_BOARD_SETTINGS: KanbanBoardSettings = {
	laneWidth: 272,
	showTags: true,
	showDates: true,
	showCheckboxes: true,
};
