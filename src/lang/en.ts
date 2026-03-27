export const en = {
	// Board
	'board.kanban-board': 'Kanban board',
	'board.search-cards': 'Search cards...',
	'board.add-lane': '+ Add Lane',
	'board.new-lane': 'New lane',

	// Lane
	'lane.expand': 'Expand lane',
	'lane.collapse': 'Collapse lane',
	'lane.edit-title': 'Edit lane title',
	'lane.options': 'Lane options',
	'lane.set-wip-limit': 'Set WIP Limit',
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
	'modal.wip-limit-title': 'Set WIP Limit',
	'modal.wip-limit-name': 'WIP Limit',
	'modal.wip-limit-desc': 'Maximum cards in this lane (0 = unlimited).',
	'modal.wip-limit-label': 'WIP Limit value',
	'modal.save': 'Save',
	'modal.cancel': 'Cancel',
	'modal.delete-lane-title': 'Delete lane',
	'modal.delete': 'Delete',

	// Filter
	'filter.by-tag': 'Filter by tag',
	'filter.by-date': 'Filter by date',
	'filter.all': 'All',
	'filter.overdue': 'Overdue',
	'filter.today': 'Today',
	'filter.this-week': 'This week',
	'filter.no-date': 'No date',
	'filter.clear': 'Clear filter',

	// Card extra
	'card.create-note': 'Create linked note',
	'card.open-note': 'Open linked note',
	'card.unlink-note': 'Unlink note',

	// Linked notes settings
	'settings.linked-notes': 'Linked notes',
	'settings.linked-notes-enabled': 'Enable linked notes',
	'settings.linked-notes-enabled-desc': 'Create Obsidian notes linked to kanban cards.',
	'settings.linked-note-folder': 'Note folder',
	'settings.linked-note-folder-desc': 'Vault folder where linked notes will be saved. Use "/" for subfolders (e.g. Notes/Kanban).',
	'settings.linked-note-folder-placeholder': 'e.g. KanbanNotes, Notes/Kanban',
	'settings.linked-note-folder-warning': 'Please create a folder in your vault and enter its path.',

	// Commands extra
	'command.add-card': 'Add card to lane',
	'command.move-card': 'Move card',

	// Lane drag
	'lane.drag-handle': 'Drag to reorder lane',

	// Modal extra
	'modal.select-lane': 'Select lane',
	'modal.select-card': 'Select card',
	'modal.select-target-lane': 'Select target lane',
	'modal.card-title': 'Card title',

	// Template
	'command.create-from-template': 'Create board from template',
	'settings.templates': 'Templates',
	'settings.board-template': 'Board template',
	'settings.board-template-desc': 'Template file path for new boards.',

	// Input
	'settings.input': 'Input',
	'settings.newline-key': 'Newline key',
	'settings.newline-key-desc': 'Key combination to insert a newline in card text.',

	// Timezone
	'settings.timezone': 'Timezone for dates',
	'settings.timezone-desc': 'Timezone used for date filters (today, this week, overdue).',
	'settings.timezone-local': 'Local time',
	'settings.timezone-utc': 'UTC',

	// Card editor modal
	'card-editor.title': 'Edit card',
	'card-editor.card-title': 'Title',
	'card-editor.card-title-placeholder': 'Card title',
	'card-editor.tags': 'Tags',
	'card-editor.tags-desc': 'Comma-separated (e.g. Bug, Urgent, Feature).',
	'card-editor.tags-placeholder': 'Bug, Urgent',
	'card-editor.due-date': 'Due date',
	'card-editor.due-date-desc': 'Date in YYYY-MM-DD format.',
	'card-editor.clear-date': 'Clear',
	'card-editor.body': 'Description',
	'card-editor.body-placeholder': 'Card description (optional)',

	// Subtasks
	'subtask.add': 'Add subtask',
	'subtask.add-placeholder': 'New subtask...',
	'subtask.progress': '{{done}}/{{total}}',
	'subtask.promote': 'Promote to card',
	'subtask.delete': 'Delete subtask',
	'subtask.collapse-done': 'Hide completed',
	'subtask.show-done': 'Show completed',

	// Indent buttons
	'card.indent': 'Indent (make subtask)',
	'card.outdent': 'Outdent (promote)',

	// Archive
	'archive.title': 'Archived cards',
	'archive.empty': 'No archived cards.',
	'archive.restore': 'Restore',
	'archive.delete-permanent': 'Delete permanently',
	'archive.restore-to': 'Restore to "{{lane}}"',
	'archive.open': 'Archive',
	'archive.count': '{{count}}',

	// Drag hints
	'drag.move-here': 'Move here',
	'drag.indent': '→ Indent (Subtask)',
	'drag.outdent': '← Outdent',

	// Board UUID
	'board.uuid-click-to-copy': 'Click to copy full UUID',

	// Rich card toggle
	'board.rich-mode-on': 'Rich card view',
	'board.rich-mode-off': 'Compact card view',

	// Date range
	'card-editor.start-date': 'Start date',
	'card-editor.end-date': 'End date',

	// WBS
	'wbs.title': 'Gantt chart',
	'wbs.toggle-show': 'Show Gantt chart',
	'wbs.toggle-hide': 'Hide Gantt chart',
	'wbs.col-id': '#',
	'wbs.col-task': 'Task',
	'wbs.col-lane': 'Lane',
	'wbs.col-tags': 'Tags',
	'wbs.col-start': 'Start',
	'wbs.col-end': 'End',
	'wbs.col-status': 'Status',
	'wbs.col-days': 'Days',
	'wbs.col-progress': '%',
	'wbs.days': '{{days}}d',
	'wbs.filter-lanes': 'Filter lanes',
	'wbs.all-lanes': 'All lanes',
	'wbs.status-done': 'Done',
	'wbs.status-open': 'Open',
};

export type TranslationKey = keyof typeof en;
