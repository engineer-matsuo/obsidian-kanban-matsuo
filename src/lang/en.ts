export const en = {
	// Board
	'board.kanban-board': 'Kanban board',
	'board.search-cards': 'Search cards...',
	'board.add-lane': '+ Add lane',
	'board.new-lane': 'New lane',

	// Lane
	'lane.expand': 'Expand lane',
	'lane.collapse': 'Collapse lane',
	'lane.edit-title': 'Edit lane title',
	'lane.options': 'Lane options',
	'lane.set-wip-limit': 'Set WIP limit',
	'lane.delete': 'Delete lane',
	'lane.delete-confirm': 'This lane has {{count}} card(s). Delete anyway?',

	// Card
	'card.add': 'Add a card...',
	'card.add-to': 'Add card to {{lane}}',
	'card.edit': 'Edit',
	'card.edit-title': 'Edit card title',
	'card.mark-complete': 'Mark complete',
	'card.mark-incomplete': 'Mark incomplete',
	'card.mark-as-complete': 'Mark "{{title}}" as complete',
	'card.mark-as-incomplete': 'Mark "{{title}}" as incomplete',
	'card.archive': 'Archive',
	'card.move-to': 'Move to "{{lane}}"',
	'card.delete': 'Delete',

	// Commands
	'command.create-new-board': 'Create new board',
	'command.toggle-board-view': 'Toggle board view',

	// Settings
	'settings.board-defaults': 'Board defaults',
	'settings.default-lanes': 'Default lanes',
	'settings.default-lanes-desc': 'Comma-separated list of lane names for new boards.',
	'settings.lane-width': 'Lane width',
	'settings.lane-width-desc': 'Default width of each lane in pixels.',
	'settings.display': 'Display',
	'settings.show-tags': 'Show tags',
	'settings.show-tags-desc': 'Display tags on cards.',
	'settings.show-dates': 'Show dates',
	'settings.show-dates-desc': 'Display due dates on cards.',
	'settings.show-checkboxes': 'Show checkboxes',
	'settings.show-checkboxes-desc': 'Display checkboxes on cards.',
	'settings.performance': 'Performance',
	'settings.auto-save-delay': 'Auto-save delay',
	'settings.auto-save-delay-desc': 'Delay in milliseconds before auto-saving changes.',
	'settings.language': 'Language',
	'settings.language-desc': 'UI language for the plugin.',
	'settings.language-auto': 'Auto (follow Obsidian)',

	// Modal
	'modal.wip-limit-title': 'Set WIP limit',
	'modal.wip-limit-name': 'WIP limit',
	'modal.wip-limit-desc': 'Maximum cards in this lane (0 = unlimited).',
	'modal.wip-limit-label': 'WIP limit value',
	'modal.save': 'Save',
	'modal.cancel': 'Cancel',
	'modal.delete-lane-title': 'Delete lane',
	'modal.delete': 'Delete',
};

export type TranslationKey = keyof typeof en;
