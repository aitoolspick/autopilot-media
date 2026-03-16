# Autopilot Media Corp

## 目的
AIツール×生産性ツールのニッチメディアを、Claude自律エンジンで24/7運用する。
英語（Reddit/GitHub Pages/Gumroad）+ 日本語（はてなブログ/A8.net）の2言語で収益を分散。

## ビジネスモデル
1つのリサーチ → 英語記事 + 日本語記事 → 各プラットフォームに自動配信 → アフィリ/商品/NL広告で収益

## 収益源
### 英語チャネル
- アフィリエイト（Amazon Associates, Impact, ShareASale）
- Gumroad デジタル商品（プロンプト集、テンプレート、ガイド）
- Buttondown ニュースレター（広告、将来的にスポンサー）

### 日本語チャネル
- はてなブログPro（AtomPub APIで完全自動投稿。DR91。月600円）
- アフィリエイト（A8.net, もしもアフィリエイト, Amazon.co.jp）

### なぜnote.comではなくはてなブログか
- note.comはAmazonアソシエイト以外のアフィリが規約上使えない → 収益化に致命的
- note.comには公開APIが存在しない → 自動投稿不可能
- はてなブログはDR91（noteと同等）+ AtomPub APIで完全自律 + A8.net/もしもが使える
- 商業キーワード（「○○ 比較 料金」）ではnote記事はGoogle上位10件に入っていない（実測済み）

## 自律運用スケジュール（GitHub Actions cron）

### 毎日 09:00 UTC — コンテンツ生成
1. state/strategy.json から今日のテーマを取得
2. リサーチ実行（Web検索でAIツールの最新情報収集）
3. 英語ブログ記事を生成 → content/blog/
4. 日本語note記事を生成 → content/note/
5. Reddit投稿用テキストを生成 → content/reddit/
6. X投稿（英語+日本語）を生成 → content/x/
7. 品質スコアを自動判定（80点以下は公開しない）

### 毎日 12:00 UTC — 配信
1. 英語記事 → GitHub Pages に公開（git push）
2. Reddit投稿 → Reddit API
3. X投稿 → X API（英語アカウント + 日本語アカウント）
4. NL配信 → Buttondown API（週2回のみ）
5. Gumroad商品 → 週1で新商品出品

### 毎週日曜 21:00 UTC — 分析・戦略修正
1. Google Search Console API → 検索順位データ
2. Gumroad API → 売上データ
3. Buttondown API → 開封率/CTR
4. Reddit投稿のスコア確認
5. 全メトリクスを state/metrics.json に保存
6. 勝ちコンテンツの特徴を抽出
7. 来週のテーマリストを state/strategy.json に更新
8. オーナーに週次レポートをメール送信

### 毎日 07:00 JST — 日報
1. 全データを統合
2. 日報メールをオーナーに送信

## コスト上限
- Claude API: 1日$0.50以下（Sonnet使用、月$15以下）
- GitHub Actions: 月2,000分以内（無料枠）
- 全体: 月$25以下を維持

## 安全装置
- `state/STOP` ファイルが存在したら全cronジョブを即停止
- 1回のclaude -p実行: --max-turns 15, --max-budget-usd 1.00
- 全判断を state/decisions/ にログ（人間が後追いで確認可能）
- アフィリリンクは記事の文脈に自然に埋め込む（スパム的な配置禁止）

## コンテンツルール

### 品質基準
- 事実ベース。実際にClaudeが知っているツールの情報のみ書く
- 比較記事は最低3ツールを横並びで評価
- 各ツールの料金は最新を確認（Web検索で毎回取得）
- 「おすすめ」「最強」等の主観ワードは根拠付きでのみ使用

### SEO
- 英語: 長尾KW狙い（"best AI tool for [specific task]" 形式）
- 日本語: 「[ツール名] 使い方」「[ツール名] 料金」「AIツール 比較」形式
- タイトル60文字以内、メタディスクリプション155文字以内

### アフィリエイト
- 記事の価値が先。アフィリリンクは自然な文脈でのみ
- 「PR」「広告」の開示を必ず含める（日本: 景品表示法対応）
- 英語: FTC開示文を記事冒頭に配置

### Reddit投稿
- 直リンク禁止。価値提供型の投稿のみ
- 「詳しくはブログで」のパターンは最後の1文だけ
- 各サブレのルールを事前確認してから投稿

### はてなブログ
- SEO狙いの情報記事（アフィリリンク含む）
- DR91のドメインパワーを活用
- A8.net/もしもアフィリエイト対応

## 組織構成（2ユニット + 1会議体）

### コンテンツユニット（毎日稼働）
- generate-content.ts: リサーチ → 英語記事 + 日本語記事を生成
- publish-blog.ts / post-reddit.ts / post-x.ts / post-hatena.ts: 各プラットフォームに配信

### メトリクスユニット（毎日 + 週次）
- collect-metrics.ts: 各APIからデータ収集
- send-report.ts: 日報生成・オーナー送信

### 週次戦略会議（日曜）
- weekly-strategy.ts: メトリクス分析 → 来週のcontent_queue自動補充 → strategy.json更新

## ファイル構成
```
autopilot-media/
├── CLAUDE.md                    ← このファイル
├── .github/workflows/
│   ├── daily-content.yml        ← コンテンツ生成cron
│   ├── daily-distribute.yml     ← 配信cron
│   ├── weekly-strategy.yml      ← 戦略・分析cron
│   └── daily-report.yml         ← 日報cron
├── .claude/skills/              ← スキル定義
├── state/
│   ├── strategy.json            ← 現在の戦略・来週のテーマ
│   ├── metrics.json             ← 全メトリクス蓄積
│   ├── decisions/               ← 判断ログ
│   └── STOP                     ← このファイルを作ると全停止
├── content/
│   ├── blog/                    ← 英語ブログ記事(Markdown)
│   ├── note/                    ← 日本語はてなブログ記事
│   ├── reddit/                  ← Reddit投稿テキスト
│   ├── x/                       ← X投稿テキスト
│   └── products/                ← Gumroad商品ファイル
├── scripts/
│   ├── generate-content.ts      ← コンテンツ生成
│   ├── publish-blog.ts          ← GitHub Pages公開
│   ├── post-reddit.ts           ← Reddit API投稿
│   ├── post-x.ts                ← X API投稿
│   ├── post-hatena.ts           ← はてなブログ投稿
│   ├── collect-metrics.ts       ← データ収集
│   ├── send-report.ts           ← 日報生成・送信
│   ├── # Phase 2 (未実装)
│   ├── create-product.ts        ← Gumroad商品作成（Phase 2）
│   ├── send-newsletter.ts       ← Buttondown配信（Phase 2）
│   └── generate-pdf.ts          ← PDF生成（Phase 2）
├── templates/                   ← テンプレート
└── docs/                        ← GitHub Pages本体
```

## 学習ループ（複利で効かせる）
- 週次分析で「何が売れたか」「何がクリックされたか」を自動記録
- 失敗パターン → `lessons.md` に記録（同じミスを2度としない）
- 成功パターン → `references/past-hits.md` に記録（勝ちパターンを再利用）
- state/strategy.json を自動更新し、翌週のコンテンツに反映
- コンテンツ生成時、lessons.md と past-hits.md を参照してから書く

## 階層型ルール
1. このCLAUDE.md（プロジェクト固有ルール）が最優先
2. ~/CLAUDE.md（全事業共通ルール）が次
