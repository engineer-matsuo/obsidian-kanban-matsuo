# Kanban Board Matsuo

A feature-rich, Markdown-based kanban board plugin for [Obsidian](https://obsidian.md).
Manage tasks with drag-and-drop, subtasks, Gantt charts, linked notes, and more — all stored as plain Markdown.

Obsidian用の高機能カンバンボードプラグインです。
ドラッグ&ドロップ、サブタスク、ガントチャート、リンクノート連携など、豊富な機能をMarkdownベースで提供します。

<!-- TODO: demo GIF here -->

## Do I need it? / こんな人におすすめ

- You want a **standalone kanban board** inside Obsidian — no external tools needed
  Obsidian内で完結するカンバンボードが欲しい方
- You need **subtasks with progress tracking** and **Gantt chart visualization**
  サブタスクの進捗管理やガントチャート表示が必要な方
- You want kanban cards that **sync with Obsidian notes** (bidirectional linking)
  カンバンカードとObsidianノートを双方向に連携させたい方
- You prefer **Markdown-based storage** for version control and portability
  Markdownベースでデータを管理し、Git等と連携したい方

## Features / 機能一覧

### Board & Lanes / ボードとレーン

- **Create boards** from the command palette, ribbon icon, or file explorer context menu
  ボードはコマンドパレット、リボンアイコン、右クリックメニューから作成
- **Customizable lanes** — inline title editing, collapse/expand, drag-to-reorder
  レーンのタイトル編集、折りたたみ、ドラッグで並び替え
- **WIP limits** per lane with visual warning when exceeded
  レーンごとのWIP制限と超過時の警告表示

### Cards / カード

- **Drag-and-drop** between lanes with smooth auto-scrolling at edges
  レーン間のドラッグ&ドロップ（端での自動スクロール付き）
- **Tags** (`#tag`), **dates** (`@{2025-01-01~2025-01-31}`), and **descriptions**
  タグ・日付（開始〜終了）・説明文
- **Checkboxes** to mark tasks complete (strikethrough styling)
  チェックボックスで完了マーク（取り消し線表示）
- **Card editor modal** — edit title, tags, start/end dates, body text
  カード編集モーダルでまとめて編集
- **Archive** cards and restore or permanently delete later
  カードのアーカイブ・復元・完全削除

### Subtasks / サブタスク

- **Indent/Outdent** buttons to create hierarchical task trees
  インデント/アウトデントで階層構造を構築
- **Progress bars** on parent cards (e.g., 3/5 completed)
  親カードに進捗バー（例: 3/5）
- **Unlimited nesting depth**
  無制限のネスト深度

### Gantt Chart (WBS) / ガントチャート

- **Toggle** the Gantt panel below the board
  ボード下部にガントパネルを表示/非表示
- **Timeline** with month/day headers, today marker, weekend shading
  月/日ヘッダー、今日マーカー、週末シェーディング
- **Drag bars** to adjust start/end dates on the chart
  バーをドラッグして日付を直接変更
- **Resize handles** on bar edges for fine-tuning
  バー端のハンドルで期間を微調整
- **Lane filtering** — show/hide specific lanes
  レーンフィルタで表示レーンを選択
- **Click card → highlight** the Gantt row
  カードクリックでガント行をハイライト
- **Pan & scroll** — click-drag or Shift+wheel
  クリックドラッグ・Shift+ホイールで移動

### Linked Notes / リンクノート

- **One-click** note creation linked to a card
  ワンクリックでカード連動ノートを作成
- **Bidirectional sync** — managed sections auto-update, your notes are preserved
  双方向同期（管理セクションのみ自動更新、メモはそのまま）
- **Subtask links** — parent ↔ child references in notes
  ノート内に親子タスクの相互リンク
- **Color-coded folders** — board UUID colors match in file explorer
  UUIDフォルダの色でボードとの対応を一目で確認

### Filtering & Search / フィルター＆検索

- **Full-text search** across card titles and descriptions
  タイトル・説明文を横断検索
- **Tag filter** — one or more tags (AND logic)
  タグフィルタ（AND条件）
- **Date filter** — Overdue / Today / This Week / No Date
  日付フィルタ（期限切れ・今日・今週・日付なし）
- **Filter badges** with individual clear buttons
  バッジ表示と個別解除ボタン

## Installation / インストール

### From Obsidian Community Plugins / コミュニティプラグインから

> Coming soon / 準備中

1. Open Obsidian Settings / Obsidianの設定を開く
2. Go to **Community Plugins** and disable Safe Mode / **コミュニティプラグイン**でセーフモードを無効化
3. Click **Browse** and search for "**Kanban Board Matsuo**" / **閲覧**で「Kanban Board Matsuo」を検索
4. Click **Install**, then **Enable** / **インストール**→**有効化**

### Manual Installation / 手動インストール

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
   最新リリースから `main.js`, `manifest.json`, `styles.css` をダウンロード
2. Create folder: `your-vault/.obsidian/plugins/kanban-matsuo/`
   Vault内にフォルダを作成: `your-vault/.obsidian/plugins/kanban-matsuo/`
3. Copy the 3 files into the folder
   3つのファイルをフォルダにコピー
4. Restart Obsidian → Settings → Community Plugins → Enable "Kanban Board Matsuo"
   Obsidianを再起動 → 設定 → コミュニティプラグイン → 有効化

## Usage / 使い方

1. **Create a board** — Command palette (`Ctrl/Cmd+P`) → "Create new kanban board", or click the kanban icon in the ribbon
   コマンドパレット（`Ctrl/Cmd+P`）→「新規ボード作成」、またはリボンのカンバンアイコン
2. **Add cards** — Type in the input field at the bottom of any lane and press Enter
   レーン下部の入力欄にテキストを入力してEnter
3. **Edit cards** — Click the card title to open the editor modal
   カードタイトルをクリックして編集モーダルを開く
4. **Move cards** — Drag-and-drop between lanes
   ドラッグ&ドロップでレーン間を移動
5. **Create subtasks** — Click the → (indent) button on a card to nest it under the card above
   →（インデント）ボタンでカードを上のカードのサブタスクに
6. **View Gantt chart** — Click the table icon in the toolbar to toggle the WBS/Gantt panel
   ツールバーのテーブルアイコンでガントチャートを表示/非表示
7. **Link notes** — Enable in Settings → Linked Notes, then click the file icon on any card
   設定 → リンクノートで有効化後、カードのファイルアイコンをクリック

No additional plugins are required. すべてこのプラグイン単体で動作します。

## Configuration / 設定

Settings are found in **Settings → Kanban Board Matsuo**.
設定は **設定 → Kanban Board Matsuo** から変更できます。

| Setting | Description | Default |
|---------|-------------|---------|
| **Language** | Auto (follow Obsidian) / English / 日本語 | Auto |
| **Default lanes** | Lane names for new boards (comma-separated) / 新規ボードのレーン名 | To Do, In Progress, Done |
| **Lane width** | Width in pixels / レーン幅（px） | 500 |
| **Show tags** | Display tags on cards / カードにタグを表示 | On |
| **Show dates** | Display dates on cards / カードに日付を表示 | On |
| **Show checkboxes** | Display checkboxes on cards / カードにチェックボックスを表示 | On |
| **Auto-save delay** | Save delay in ms (min 100) / 自動保存の遅延 | 500 |
| **Timezone** | Timezone for date filters (20+ options) / 日付フィルタ用タイムゾーン | Local |
| **Newline key** | Key combo for newlines in card input / カード入力での改行キー | Shift+Enter |
| **Linked notes** | Enable + set folder path (e.g., `Notes/Kanban`) / リンクノートの有効化とフォルダ指定 | Off |

## Commands / コマンド

All commands are available via the command palette (`Ctrl/Cmd+P`).
すべてのコマンドはコマンドパレット（`Ctrl/Cmd+P`）から実行できます。

| Command | Description |
|---------|-------------|
| **Create new kanban board** | Create a new board / 新規ボードを作成 |
| **Toggle board view** | Switch between Markdown ↔ Kanban view / 表示切替 |
| **Add card to lane** | Pick a lane, then enter card title / レーンを選んでカードを追加 |
| **Move card** | Pick a card, then pick target lane / カードを別レーンに移動 |

## Data Format / データ形式

Boards are stored as **standard Markdown files** with YAML frontmatter — human-readable, version-control friendly, and portable.

ボードは**標準的なMarkdownファイル**として保存されます。人が読める形式で、Gitとの相性も抜群です。

```markdown
---
kanban-plugin: kanban-matsuo
lane-width: 500
show-tags: true
show-dates: true
show-checkboxes: true
board-uuid: a1b2c3d4-...
---

## To Do

- [ ] Task one #design @{2025-04-01~2025-04-15}
    - [ ] Subtask A
    - [x] Subtask B

## In Progress

- [ ] Task two #dev

## Done

- [x] Completed task
```

## Mobile Support / モバイル対応

- **Touch-friendly** targets (44x44px minimum) / タッチ操作に最適化（最小44×44px）
- **Long-press** to drag cards and lanes / 長押しでドラッグ操作
- **Responsive layout** — single column on narrow screens / 狭い画面では1カラム表示

## Compatibility / 互換性

- Requires **Obsidian v1.0.0** or higher / Obsidian v1.0.0以上が必要です
- Works on **desktop and mobile** / デスクトップ・モバイル両対応
- No other plugins required / 他のプラグインは不要です

## Troubleshooting / トラブルシューティング

| Problem | Solution |
|---------|----------|
| Board doesn't open as kanban / ボードがカンバン表示にならない | Check that the file contains `kanban-plugin: kanban-matsuo` in frontmatter / フロントマターに `kanban-plugin: kanban-matsuo` があるか確認 |
| Linked notes not working / リンクノートが動かない | Enable in Settings → Linked Notes and set a folder path / 設定でリンクノートを有効化しフォルダを指定 |
| Gantt bars not showing / ガントバーが表示されない | Add dates to cards using the editor modal or `@{YYYY-MM-DD}` syntax / カードに日付を設定（編集モーダルまたは`@{}`記法） |
| Drag-and-drop not working on mobile / モバイルでドラッグできない | Use long-press (300ms) to start dragging / 長押し（300ms）でドラッグ開始 |

## Support / サポート

If you find this plugin helpful, consider buying me a coffee!
このプラグインが役に立ったら、コーヒーをおごってください！

<a href="https://buymeacoffee.com/engineer.matsuo"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=engineer.matsuo&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

## Contributing / 貢献

If you find this plugin helpful:
このプラグインが役に立ったら：

- ⭐ Star the GitHub repository / GitHubでスターをお願いします
- 🐛 [Report issues](../../issues) / バグ報告はIssuesへ
- 🔀 Submit pull requests / プルリクエスト歓迎です

## License / ライセンス

[MIT](LICENSE)
