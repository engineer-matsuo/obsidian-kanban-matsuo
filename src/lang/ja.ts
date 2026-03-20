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
};
