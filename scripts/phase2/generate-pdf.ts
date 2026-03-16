/**
 * PDF生成スクリプト（軽量版）
 *
 * MarkdownをHTMLに変換し、スタイル付きHTMLファイルとして保存。
 * Gumroad商品のダウンロードファイルとして使用。
 *
 * Puppeteer不要（CIでChromiumダウンロード問題を回避）。
 * HTMLファイルをブラウザで開いて印刷→PDFでも同等品質。
 *
 * 実行: npx tsx scripts/generate-pdf.ts
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const PRODUCTS_DIR = join(ROOT, 'content', 'products');

if (existsSync(join(ROOT, 'state', 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

const CSS = `
<style>
  @media print { body { margin: 0; } }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
    font-size: 14px; line-height: 1.8; color: #333;
    max-width: 800px; margin: 0 auto; padding: 40px;
  }
  h1 { font-size: 28px; border-bottom: 3px solid #0066cc; padding-bottom: 10px; margin-top: 40px; }
  h2 { font-size: 22px; color: #0066cc; margin-top: 30px; }
  h3 { font-size: 18px; margin-top: 20px; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; color: inherit; }
  blockquote { border-left: 4px solid #0066cc; padding-left: 16px; color: #666; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f0f7ff; font-weight: bold; }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
</style>`;

async function main() {
  if (!existsSync(PRODUCTS_DIR)) {
    console.log('No products directory.');
    return;
  }

  const productDirs = readdirSync(PRODUCTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of productDirs) {
    const mdPath = join(PRODUCTS_DIR, dir, 'content.md');
    const htmlPath = join(PRODUCTS_DIR, dir, 'product.html');

    if (!existsSync(mdPath)) continue;
    if (existsSync(htmlPath)) {
      console.log(`HTML already exists: ${htmlPath}`);
      continue;
    }

    console.log(`Generating HTML product: ${dir}`);

    const mdContent = readFileSync(mdPath, 'utf-8');
    const htmlContent = await marked(mdContent);

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dir.replace(/-/g, ' ')}</title>
  ${CSS}
</head>
<body>
${htmlContent}
<footer style="margin-top:40px;padding-top:20px;border-top:1px solid #eee;color:#999;font-size:12px;">
  <p>AI Tools Hub &copy; 2026. Thank you for your purchase.</p>
</footer>
</body>
</html>`;

    writeFileSync(htmlPath, fullHtml);
    console.log(`HTML generated: ${htmlPath}`);
  }
}

main().catch(console.error);
