# Autopilot Media v2 — Etsy デジタルダウンロード自動販売機

## 目的
Etsyマーケットプレイスにデジタルテンプレート（スプレッドシート・PDF）を自動出品し、内蔵トラフィックで販売する完全自動の収益エンジン。

## ビジネスモデル
Claude API → 商品生成 → Etsy API自動出品 → Etsy検索で発見 → 販売
Pinterest API → モックアップPin自動投稿 → Etsyリスティングへ誘導 → 追加トラフィック

## 商品カテゴリ
- スプレッドシートテンプレート（.xlsx）: exceljs で生成
- PDFプランナー: pdfkit で生成（Phase 2）

## 商品設計の原則
- **超特化ニッチ**: 「Budget Tracker」ではなく「Etsy Seller Profit Calculator with Fee Breakdown」
- **データリッチ**: 数式・条件付き書式・ダッシュボードシートを含む
- **即使える**: 例示データ入り。買った瞬間に使い方が分かる
- **汎用品禁止**: 1万件の競合に埋もれる商品は作らない

## 自律運用スケジュール（GitHub Actions cron）

### 日次 — 商品生成+出品
1. state/v2-strategy.json からニッチキューを取得
2. Claude API で商品仕様（シート構成・数式・書式・Etsyメタデータ）を生成
3. exceljs で .xlsx ファイルを生成
4. Etsy API v3 でリスティング作成 → ファイルアップロード → 公開
5. モックアップ画像生成 → Pinterest API で Pin 作成
6. 1日最大5商品

### 週次 — PDCA
1. Etsy API から売上・閲覧数・お気に入り数を取得
2. 不振商品（30日間閲覧0）→ 自動非公開
3. 好調商品（お気に入り率高い）→ バリエーション自動追加
4. 売れ筋カテゴリを分析 → 来週のニッチキューに反映

## コスト上限
- Claude API: 1日$0.50以下（月$15以下）
- GitHub Actions: 月2,000分以内（無料枠）
- Etsy出品料: $0.20/リスティング（月$30以下）
- 全体: 月$50以下を維持

## 安全装置
- `state/STOP` ファイルが存在したら全処理を即停止
- 全判断を state/decisions/ にログ
- 1日の出品上限: 5商品（Etsyスパム判定回避）

## ファイル構成
```
autopilot-media/
├── CLAUDE.md                    ← このファイル
├── .github/workflows/
│   ├── v2-generate.yml          ← 商品生成+出品cron
│   └── (v1ワークフロー群)       ← 停止済み。参考用に残存
├── scripts/
│   ├── v2/
│   │   ├── generate-product.ts  ← 商品生成エンジン（Claude API + exceljs）
│   │   ├── list-on-etsy.ts      ← Etsy API出品（未実装）
│   │   ├── create-mockup.ts     ← モックアップ画像生成（未実装）
│   │   ├── post-pinterest.ts    ← Pinterest Pin投稿（未実装）
│   │   └── weekly-pdca.ts       ← 週次分析+最適化（未実装）
│   └── (v1スクリプト群)         ← 停止済み。参考用に残存
├── state/
│   ├── v2-strategy.json         ← ニッチキュー・設定・メトリクス
│   ├── STOP                     ← このファイルを作ると全停止
│   └── decisions/               ← 判断ログ
├── output/                      ← 生成された商品ファイル(.xlsx + metadata.json)
├── content/                     ← v1コンテンツ（停止済み）
└── docs/                        ← v1 GitHub Pages（停止済み）
```

## 検証コマンド
```bash
# TypeScript構文チェック
npx tsx -e "import './scripts/v2/generate-product.ts'" 2>&1 | head -5

# 商品生成テスト（要ANTHROPIC_API_KEY）
npx tsx scripts/v2/generate-product.ts

# 生成物確認
ls -la output/*/
cat output/*/metadata.json
```

## 学習ループ
- 週次PDCAで「何が売れたか」「何が閲覧されたか」を自動記録
- 売れ筋パターン → v2-strategy.json の learnings に追記
- 不振パターン → 同ニッチの再出品を停止

## 階層型ルール
1. このCLAUDE.md（プロジェクト固有ルール）が最優先
2. ~/CLAUDE.md（全事業共通ルール）が次
