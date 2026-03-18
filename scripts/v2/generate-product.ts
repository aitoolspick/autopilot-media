/**
 * Etsy デジタルダウンロード商品生成エンジン
 *
 * フロー:
 * 1. strategy.json からニッチキューを読み込み
 * 2. Claude API で商品仕様（シート構成・数式・書式）を生成
 * 3. exceljs で .xlsx ファイルを生成
 * 4. Etsy リスティング用メタデータ（タイトル・説明・タグ）を生成
 * 5. output/ に商品ファイル + メタデータ JSON を出力
 *
 * 環境変数: ANTHROPIC_API_KEY
 * 実行: npx tsx scripts/v2/generate-product.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';

const ROOT = join(import.meta.dirname ?? __dirname, '../..');
const STATE_DIR = join(ROOT, 'state');
const OUTPUT_DIR = join(ROOT, 'output');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

const client = new Anthropic();

// ─── 型定義 ───

interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width: number }[];
  rows: Record<string, string | number>[];
  formulas: { cell: string; formula: string }[];
  styling: {
    headerColor: string;     // hex e.g. "FF4472C4"
    headerFontColor: string; // hex e.g. "FFFFFFFF"
    alternateRowColor?: string;
  };
}

interface ProductSpec {
  product_name: string;
  file_name: string;
  sheets: SheetSpec[];
  etsy: {
    title: string;          // max 140 chars
    description: string;    // rich text, benefits-focused
    tags: string[];         // max 13 tags, each max 20 chars
    price_usd: number;
    taxonomy_id: number;    // Etsy category ID
  };
}

interface NicheItem {
  niche: string;
  target_audience: string;
  product_type: string;
  status: string;
}

// ─── Claude API で商品仕様を生成 ───

async function generateProductSpec(niche: NicheItem): Promise<ProductSpec> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are a product designer for Etsy digital downloads. Design a Google Sheets / Excel spreadsheet template.

Niche: "${niche.niche}"
Target audience: "${niche.target_audience}"
Product type: "${niche.product_type}"

Return a JSON object (no markdown, no code fences) with this exact structure:
{
  "product_name": "Human-readable product name",
  "file_name": "kebab-case-file-name",
  "sheets": [
    {
      "name": "Sheet Tab Name (max 31 chars)",
      "columns": [
        { "header": "Column Header", "key": "col_key", "width": 20 }
      ],
      "rows": [
        { "col_key": "Example value or empty string" }
      ],
      "formulas": [
        { "cell": "D2", "formula": "=SUM(B2:C2)" }
      ],
      "styling": {
        "headerColor": "FF4472C4",
        "headerFontColor": "FFFFFFFF"
      }
    }
  ],
  "etsy": {
    "title": "Etsy listing title (max 140 chars, include key search terms)",
    "description": "Detailed Etsy description. Include: what it is, who it's for, what's included, how to use it. Use line breaks. 500-1000 chars.",
    "tags": ["tag1", "tag2", "...up to 13 tags, each max 20 chars"],
    "price_usd": 4.99,
    "taxonomy_id": 2078
  }
}

Rules:
- Design 2-4 sheets (tabs): at minimum an Input sheet and a Dashboard/Summary sheet
- Include genuinely useful formulas (SUM, IF, VLOOKUP, AVERAGE, etc.)
- Make it solve a SPECIFIC problem for the target audience
- Include 3-5 example rows so the buyer sees how to use it immediately
- The Dashboard sheet should have summary calculations and visual indicators
- Use professional color scheme
- Etsy title must contain the primary search keyword the target audience would type
- Etsy tags must be search terms buyers would actually use
- taxonomy_id 2078 = "Templates" on Etsy (use this unless clearly wrong)
- Price between $3.99 and $9.99 based on complexity

Return ONLY the JSON. No explanation.`
    }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');

  // JSON部分を抽出（code fenceが付いている場合も対応）
  let jsonStr = block.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonStr) as ProductSpec;
}

// ─── exceljs で .xlsx を生成 ───

async function generateExcel(spec: ProductSpec): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Tools Pick';
  workbook.created = new Date();

  for (const sheet of spec.sheets) {
    const ws = workbook.addWorksheet(sheet.name);

    // カラム設定
    ws.columns = sheet.columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    // ヘッダー行のスタイル
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: sheet.styling.headerColor },
      };
      cell.font = {
        color: { argb: sheet.styling.headerFontColor },
        bold: true,
        size: 11,
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF333333' } },
      };
    });
    headerRow.height = 25;

    // データ行
    for (const rowData of sheet.rows) {
      const row = ws.addRow(rowData);
      if (sheet.styling.alternateRowColor && row.number % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: sheet.styling.alternateRowColor! },
          };
        });
      }
    }

    // 数式
    for (const f of sheet.formulas) {
      const cell = ws.getCell(f.cell);
      cell.value = { formula: f.formula } as ExcelJS.CellFormulaValue;
    }

    // オートフィルター
    if (sheet.columns.length > 0 && sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1 + sheet.rows.length, column: sheet.columns.length },
      };
    }

    // 全セルにデフォルトフォント
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.font?.bold) {
          cell.font = { ...cell.font, size: 10, name: 'Calibri' };
        }
      });
    });
  }

  // 出力
  const outputDir = join(OUTPUT_DIR, spec.file_name);
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, `${spec.file_name}.xlsx`);
  await workbook.xlsx.writeFile(filePath);

  return filePath;
}

// ─── メイン ───

async function main() {
  // ニッチキューを読み込み
  const strategyPath = join(STATE_DIR, 'v2-strategy.json');
  if (!existsSync(strategyPath)) {
    console.error('v2-strategy.json not found. Run niche research first.');
    process.exit(1);
  }

  const strategy = JSON.parse(readFileSync(strategyPath, 'utf-8'));
  const queue: NicheItem[] = strategy.product_queue || [];
  const next = queue.find(item => item.status === 'pending');

  if (!next) {
    console.log('No pending items in product queue.');
    return;
  }

  console.log(`Generating product for niche: "${next.niche}"`);

  // 1. 商品仕様を生成
  console.log('  → Generating product spec via Claude...');
  const spec = await generateProductSpec(next);
  console.log(`  → Product: ${spec.product_name}`);

  // 2. Excelファイルを生成
  console.log('  → Generating .xlsx file...');
  const xlsxPath = await generateExcel(spec);
  console.log(`  → File: ${xlsxPath}`);

  // 3. メタデータを保存
  const metadataPath = join(OUTPUT_DIR, spec.file_name, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify({
    ...spec.etsy,
    file_name: spec.file_name,
    product_name: spec.product_name,
    xlsx_path: xlsxPath,
    generated_at: new Date().toISOString(),
  }, null, 2));
  console.log(`  → Metadata: ${metadataPath}`);

  // 4. ステータス更新
  next.status = 'generated';
  strategy.last_updated = new Date().toISOString().split('T')[0];
  writeFileSync(strategyPath, JSON.stringify(strategy, null, 2));

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
