import type { TranslationKey } from './en';

export const ja: Record<TranslationKey, string> = {
	// Board
	'board.kanban-board': 'カンバンボード',
	'board.search-cards': 'カードを検索...',
	'board.add-lane': '+ レーンを追加',
	'board.new-lane': '新しいレーン',

	// Lane
	'lane.expand': 'レーンを展開',
	'lane.collapse': 'レーンを折りたたむ',
	'lane.edit-title': 'レーン名を編集',
	'lane.options': 'レーンの操作',
	'lane.set-wip-limit': 'WIP制限を設定',
	'lane.delete': 'レーンを削除',
	'lane.delete-confirm': 'このレーンには {{count}} 枚のカードがあります。削除しますか？',

	// Card
	'card.add': 'カードを追加...',
	'card.add-to': '{{lane}} にカードを追加',
	'card.edit': '編集',
	'card.edit-title': 'カードのタイトルを編集',
	'card.mark-complete': '完了にする',
	'card.mark-incomplete': '未完了に戻す',
	'card.mark-as-complete': '「{{title}}」を完了にする',
	'card.mark-as-incomplete': '「{{title}}」を未完了に戻す',
	'card.archive': 'アーカイブ',
	'card.move-to': '「{{lane}}」に移動',
	'card.delete': '削除',

	// Commands
	'command.create-new-board': '新しいボードを作成',
	'command.toggle-board-view': 'ボード表示を切り替え',

	// Settings
	'settings.board-defaults': 'ボードの初期設定',
	'settings.default-lanes': 'デフォルトレーン',
	'settings.default-lanes-desc': '新しいボードのレーン名（カンマ区切り）。',
	'settings.lane-width': 'レーン幅',
	'settings.lane-width-desc': '各レーンのデフォルト幅（ピクセル）。',
	'settings.display': '表示',
	'settings.show-tags': 'タグを表示',
	'settings.show-tags-desc': 'カードにタグを表示します。',
	'settings.show-dates': '日付を表示',
	'settings.show-dates-desc': 'カードに期日を表示します。',
	'settings.show-checkboxes': 'チェックボックスを表示',
	'settings.show-checkboxes-desc': 'カードにチェックボックスを表示します。',
	'settings.performance': 'パフォーマンス',
	'settings.auto-save-delay': '自動保存の遅延',
	'settings.auto-save-delay-desc': '変更後の自動保存までの遅延（ミリ秒）。',
	'settings.language': '言語',
	'settings.language-desc': 'プラグインのUI言語。',
	'settings.language-auto': '自動（Obsidianに従う）',

	// Modal
	'modal.wip-limit-title': 'WIP制限の設定',
	'modal.wip-limit-name': 'WIP制限',
	'modal.wip-limit-desc': 'このレーンのカード上限数（0 = 無制限）。',
	'modal.wip-limit-label': 'WIP制限値',
	'modal.save': '保存',
	'modal.cancel': 'キャンセル',
	'modal.delete-lane-title': 'レーンの削除',
	'modal.delete': '削除',

	// Filter
	'filter.by-tag': 'タグで絞り込み',
	'filter.by-date': '日付で絞り込み',
	'filter.all': 'すべて',
	'filter.overdue': '期限切れ',
	'filter.today': '今日',
	'filter.this-week': '今週',
	'filter.no-date': '日付なし',
	'filter.clear': 'フィルタを解除',

	// Card extra
	'card.create-note': 'リンク先ノートを作成',
	'card.open-note': 'リンク先ノートを開く',
	'card.unlink-note': 'ノートのリンクを解除',

	// Linked notes settings
	'settings.linked-notes': 'リンクノート',
	'settings.linked-notes-enabled': 'リンクノートを有効化',
	'settings.linked-notes-enabled-desc': 'カンバンカードに連動するObsidianノートを作成します。',
	'settings.linked-note-folder': 'ノートフォルダ',
	'settings.linked-note-folder-desc': 'リンクノートを保存するVault内のフォルダ。サブフォルダは「/」で区切って指定します（例: Notes/Kanban）。',
	'settings.linked-note-folder-placeholder': '例: KanbanNotes, Notes/Kanban',
	'settings.linked-note-folder-warning': 'Vault内にフォルダを作成してパスを入力してください。',

	// Commands extra
	'command.add-card': 'レーンにカードを追加',
	'command.move-card': 'カードを移動',

	// Lane drag
	'lane.drag-handle': 'ドラッグしてレーンを並び替え',

	// Modal extra
	'modal.select-lane': 'レーンを選択',
	'modal.select-card': 'カードを選択',
	'modal.select-target-lane': '移動先レーンを選択',
	'modal.card-title': 'カードのタイトル',

	// Template
	'command.create-from-template': 'テンプレートからボードを作成',
	'settings.templates': 'テンプレート',
	'settings.board-template': 'ボードテンプレート',
	'settings.board-template-desc': '新しいボード作成時のテンプレートファイルパス。',

	// Input
	'settings.input': '入力',
	'settings.newline-key': '改行キー',
	'settings.newline-key-desc': 'カードのテキスト内で改行を挿入するキーの組み合わせ。',

	// Timezone
	'settings.timezone': '日付のタイムゾーン',
	'settings.timezone-desc': '日付フィルタ（今日、今週、期限切れ）で使用するタイムゾーン。',
	'settings.timezone-local': 'ローカル時間',
	'settings.timezone-utc': 'UTC',

	// Card editor modal
	'card-editor.title': 'カードを編集',
	'card-editor.card-title': 'タイトル',
	'card-editor.card-title-placeholder': 'カードのタイトル',
	'card-editor.tags': 'タグ',
	'card-editor.tags-desc': 'カンマ区切り（例: bug, urgent, feature）。',
	'card-editor.tags-placeholder': 'bug, urgent',
	'card-editor.due-date': '期日',
	'card-editor.due-date-desc': 'YYYY-MM-DD 形式。',
	'card-editor.clear-date': 'クリア',
	'card-editor.body': '説明',
	'card-editor.body-placeholder': 'カードの説明（任意）',

	// Subtasks
	'subtask.add': 'サブタスクを追加',
	'subtask.add-placeholder': '新しいサブタスク...',
	'subtask.progress': '{{done}}/{{total}}',
	'subtask.promote': 'カードに昇格',
	'subtask.delete': 'サブタスクを削除',
	'subtask.collapse-done': '完了を非表示',
	'subtask.show-done': '完了を表示',

	// Indent buttons
	'card.indent': '段下げ（サブタスクにする）',
	'card.outdent': '段上げ（元に戻す）',

	// Archive
	'archive.title': 'アーカイブ済みカード',
	'archive.empty': 'アーカイブされたカードはありません。',
	'archive.restore': '復元',
	'archive.delete-permanent': '完全に削除',
	'archive.restore-to': '「{{lane}}」に復元',
	'archive.open': 'アーカイブ',
	'archive.count': '{{count}}',

	// Drag hints
	'drag.move-here': 'ここに移動',
	'drag.indent': '→ 段下げ（サブタスク）',
	'drag.outdent': '← 段上げ',

	// Board UUID
	'board.uuid-click-to-copy': 'クリックで完全なUUIDをコピー',

	// Rich card toggle
	'board.rich-mode-on': 'リッチカード表示',
	'board.rich-mode-off': 'コンパクトカード表示',

	// Date range
	'card-editor.start-date': '開始日',
	'card-editor.end-date': '終了日',

	// WBS
	'wbs.title': 'ガントチャート',
	'wbs.toggle-show': 'ガントチャートを表示',
	'wbs.toggle-hide': 'ガントチャートを非表示',
	'wbs.col-id': '#',
	'wbs.col-task': 'タスク',
	'wbs.col-lane': 'レーン',
	'wbs.col-tags': 'タグ',
	'wbs.col-start': '開始',
	'wbs.col-end': '終了',
	'wbs.col-status': '状態',
	'wbs.col-days': '日数',
	'wbs.col-progress': '%',
	'wbs.days': '{{days}}日',
	'wbs.filter-lanes': 'レーン表示',
	'wbs.all-lanes': 'すべてのレーン',
	'wbs.status-done': '完了',
	'wbs.status-open': '未完了',
};
