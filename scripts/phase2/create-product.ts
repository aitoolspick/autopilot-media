/**
 * Gumroad商品作成スクリプト（修正版）
 *
 * - Anthropic SDK直接使用（claude -p廃止）
 * - Gumroad API: Authorization Bearerヘッダー方式（旧方式廃止）
 * - price単位修正: ドル整数（セントではない）
 *
 * 環境変数: ANTHROPIC_API_KEY, GUMROAD_ACCESS_TOKEN
 * 実行: npx tsx scripts/create-product.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const STATE_DIR = join(ROOT, 'state');
const PRODUCTS_DIR = join(ROOT, 'content', 'products');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

const client = new Anthropic();

async function generateProductContent(name: string, type: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Generate a high-quality digital product: "${name}"
Type: ${type}

If it's a prompt pack, create 20 genuinely useful prompts organized by category.
If it's a template, create a practical, immediately usable template.
If it's a guide, write a concise but thorough guide (1500-2000 words).

Format as clean Markdown. Include a professional title and table of contents.
Do NOT include any preamble. Start directly with the product content.`
    }],
  });

  const block = message.content[0];
  if (block.type === 'text') return block.text;
  throw new Error('Unexpected response type');
}

async function createGumroadProduct(
  name: string,
  priceUsd: number,
  description: string
): Promise<string | null> {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) {
    console.error('GUMROAD_ACCESS_TOKEN not set');
    return null;
  }

  try {
    const res = await fetch('https://api.gumroad.com/v2/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        name,
        price: priceUsd.toString(), // ドル単位（セントではない）
        description,
        published: 'true'
      })
    });

    if (!res.ok) {
      console.error(`Gumroad API error: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as { success: boolean; product?: { id: string; short_url: string } };
    if (data.success && data.product) {
      console.log(`Gumroad product created: ${data.product.short_url}`);
      return data.product.id;
    }
    console.error('Gumroad product creation returned success=false');
    return null;
  } catch (e) {
    console.error('Gumroad API call failed:', e);
    return null;
  }
}

async function main() {
  const strategy = JSON.parse(readFileSync(join(STATE_DIR, 'strategy.json'), 'utf-8'));
  const nextProduct = strategy.product_queue?.find((p: { status: string }) => p.status === 'pending');

  if (!nextProduct) {
    console.log('No pending products.');
    return;
  }

  console.log(`Creating product: ${nextProduct.name}`);

  // 1. コンテンツ生成
  const content = await generateProductContent(nextProduct.name, nextProduct.type);

  // 2. ファイル保存
  const productSlug = nextProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const productDir = join(PRODUCTS_DIR, productSlug);
  mkdirSync(productDir, { recursive: true });
  writeFileSync(join(productDir, 'content.md'), content);
  console.log(`Product content saved: ${productDir}/content.md`);

  // 3. Gumroad出品
  const description = `${nextProduct.name}\n\nA curated collection to boost your productivity with AI. Instant download after purchase.`;
  const productId = await createGumroadProduct(
    nextProduct.name,
    nextProduct.price_usd, // $9 → "9"（ドル単位）
    description
  );

  // 4. strategy.json更新
  nextProduct.status = productId ? 'completed' : 'failed';
  nextProduct.gumroad_id = productId;
  strategy.last_updated = new Date().toISOString().split('T')[0];
  writeFileSync(join(STATE_DIR, 'strategy.json'), JSON.stringify(strategy, null, 2));

  // 5. metrics更新
  try {
    const metrics = JSON.parse(readFileSync(join(STATE_DIR, 'metrics.json'), 'utf-8'));
    if (productId) metrics.totals.gumroad_products++;
    writeFileSync(join(STATE_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2));
  } catch (e) {
    console.error('Metrics update failed:', e);
  }

  console.log('Product creation complete.');
}

main().catch(console.error);
