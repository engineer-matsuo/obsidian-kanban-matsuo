# Obsidian Kanban Board Plugin - 開発計画

## プラグイン概要
- **Plugin ID**: `kanban-matsuo`
- **Plugin Name**: Kanban Board Matsuo
- **説明**: Markdown-based kanban board for task and project management.
- **技術スタック**: TypeScript, Obsidian API, CSS Variables

---

## Phase 1: プロジェクト基盤 `cc:done` (2026-03-20)

### 1.1 プロジェクトセットアップ `cc:done`
- [x] manifest.json 作成（id, name, version, minAppVersion）
- [x] package.json 作成（依存関係: obsidian, typescript, esbuild）
- [x] tsconfig.json 作成
- [x] esbuild.config.mjs（ビルド設定）
- [x] main.ts（Plugin クラスのエントリポイント）
- [x] styles.css
- [x] ESLint 設定（eslint-plugin-obsidianmd）

### 1.2 データモデル設計 `cc:done`
- [x] KanbanBoard インターフェース定義（ボード全体）
- [x] KanbanLane インターフェース定義（列）
- [x] KanbanItem インターフェース定義（カード）
- [x] Markdown ⇔ データモデル パーサー実装
- [x] データバリデーション

---

## Phase 2: コアビュー機能 `cc:done` (2026-03-20)

### 2.1 カスタムビュー `cc:done`
- [x] KanbanView（ItemView 継承）の実装
- [x] ビューの登録・解除（onload/onunload）
- [x] Markdown ファイルからのボード読み込み
- [x] ビューのリフレッシュ・再描画ロジック

### 2.2 ボードレイアウト `cc:done`
- [x] 横スクロール可能なレーン（列）レイアウト
- [x] レーンヘッダー（タイトル、カード数表示）
- [x] レーン内のカードリスト表示
- [x] レスポンシブ対応（モバイル縦スクロール）

### 2.3 カード表示 `cc:done`
- [x] カードの基本表示（タイトル、本文プレビュー）
- [x] Markdown レンダリング（カード内テキスト）
- [x] タグ表示（カラーバッジ）
- [x] 日付表示（期限）
- [x] チェックボックス表示

---

## Phase 3: インタラクション `cc:done` (2026-03-20)

### 3.1 ドラッグ＆ドロップ `cc:done`
- [x] カードのレーン間移動（D&D）
- [x] カードのレーン内並び替え（D&D）
- [x] レーンの並び替え（D&D）
- [x] ドラッグ中のビジュアルフィードバック
- [x] タッチデバイス対応（モバイル D&D）

### 3.2 カード操作 `cc:done`
- [x] 新規カード追加（レーン下部の入力フォーム）
- [x] カード編集（インライン編集）
- [x] カード削除（確認ダイアログ付き）
- [x] カードのアーカイブ
- [x] コンテキストメニュー（右クリック）

### 3.3 レーン操作 `cc:done`
- [x] 新規レーン追加
- [x] レーン名の編集
- [x] レーン削除（カード有無の確認）
- [x] レーンの折りたたみ/展開

---

## Phase 4: Markdown 連携 `cc:done` (2026-03-20)

### 4.1 データ永続化 `cc:done`
- [x] ボード状態 → Markdown 変換（保存）
- [x] Markdown → ボード状態 変換（読み込み）
- [x] 自動保存（debounce 付き）
- [x] ファイル変更検知と再同期

### 4.2 Markdown フォーマット `cc:done`
- [x] Kanban メタデータ（YAML frontmatter）
- [x] レーン = 見出し（## レーン名）
- [x] カード = リストアイテム（- カード内容）
- [x] タグ、日付、チェックボックスの Markdown 表現

---

## Phase 5: 設定・カスタマイズ `cc:done` (2026-03-20)

### 5.1 プラグイン設定 `cc:done`
- [x] SettingTab 実装
- [x] デフォルトレーン名設定
- [x] カード表示オプション（日付表示、タグ表示等）
- [x] ボードの最大幅設定

### 5.2 ボード固有設定 `cc:done`
- [x] ボードごとの設定（frontmatter）
- [x] レーン幅のカスタマイズ
- [x] WIP 制限（Work In Progress 上限）

---

## Phase 6: 高度な機能 `cc:done` (2026-03-20)

### 6.1 検索・フィルタ `cc:done`
- [x] カード検索（テキスト検索）
- [x] タグフィルタ
- [x] 日付フィルタ（期限切れ、今日、今週）

### 6.2 リンク連携 `cc:done`
- [x] カードからノートへのリンク（[[wikilink]]）
- [x] リンク先ノートのプレビュー（ホバー）
- [x] 新規ノート作成とカードの紐付け

### 6.3 パフォーマンス最適化 `cc:TODO`
- [ ] 仮想スクロール（大量カード対応）
- [ ] レンダリング最適化（差分更新）
- [x] メモリリーク防止（registerEvent 活用）

---

## Phase 7: スタイリング・アクセシビリティ `cc:done` (2026-03-20)

### 7.1 CSS スタイリング `cc:done`
- [x] Obsidian CSS 変数を使用したテーマ対応
- [x] ダークモード/ライトモード対応
- [x] スコープ付き CSS（.kanban-matsuo-* プレフィックス）
- [x] アニメーション（カード移動時のトランジション）

### 7.2 アクセシビリティ `cc:done`
- [x] キーボードナビゲーション（Tab, Arrow keys）
- [x] ARIA ラベル・ロール設定
- [x] フォーカスインジケーター（:focus-visible）
- [x] タッチターゲット ≥ 44x44px
- [x] スクリーンリーダー対応

---

## Phase 8: コマンド・統合 `cc:done` (2026-03-20)

### 8.1 コマンドパレット `cc:done`
- [x] 「Create new board」コマンド
- [x] 「Add card to lane」コマンド
- [x] 「Move card」コマンド
- [x] 「Toggle board view」コマンド

### 8.2 その他統合 `cc:done`
- [x] ファイルエクスプローラーからのボード作成
- [x] テンプレート機能（ボードテンプレート）
- [ ] Obsidian URI スキーム対応（スキップ）

---

## Phase 9: サブタスク・チェックリスト `cc:TODO` ★必須

### 9.1 サブタスク基本機能 `cc:done` (2026-03-20)
- [x] カード内チェックリスト（複数項目のサブタスク）
- [x] サブタスクの追加・編集・削除
- [x] サブタスク完了チェックボックス
- [x] カード上に進捗バー表示（例: 3/7 完了）
- [x] サブタスクの並び替え（D&D）

### 9.2 高度なサブタスク `cc:done` (2026-03-20)
- [x] ネスト（階層化）サブタスク（サブタスク内にサブタスク）
- [x] サブタスク → カード昇格（チェックリスト項目を独立カードに変換）
- [x] 完了済みサブタスクの自動折りたたみ
- [x] サブタスク集計（親カードに子タスクのステータスをロールアップ）

---

## 非機能要件

### パフォーマンス目標
- 初期描画: < 100ms（100カード以下）
- D&D 操作: 60fps 維持
- 保存遅延: < 500ms（debounce）
- メモリ: レーン折りたたみ時に DOM 解放

### 品質基準
- ESLint エラー 0
- 全 27 ルール（eslint-plugin-obsidianmd）準拠
- モバイル（iOS/Android）動作確認
- キーボードのみで全操作可能

---

## 優先順位
1. ~~**Phase 1-8**: 基本機能（完了済み）~~
2. **Phase 9**: サブタスク・チェックリスト ★最優先
3. **Phase 10**: カード強化（モーダル、色、優先度）
4. **Phase 11**: スイムレーン・レイアウト拡張
5. **Phase 12**: 自動化・ワークフロー
6. **Phase 13-14**: 分析・Obsidian連携
7. **Phase 15**: キーボードショートカット
