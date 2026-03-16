/**
 * メトリクス収集スクリプト
 *
 * 各プラットフォームからデータを取得し、state/metrics.json を更新。
 *
 * 環境変数: GUMROAD_ACCESS_TOKEN, BUTTONDOWN_API_KEY
 * 実行: npx tsx scripts/collect-metrics.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const STATE_DIR = join(ROOT, 'state');
const CONTENT_DIR = join(ROOT, 'content');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

function countFiles(dir: string, ext: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.endsWith(ext)).length;
}

async function getGumroadMetrics(): Promise<{ products: number; sales: number; revenue: number }> {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) return { products: 0, sales: 0, revenue: 0 };

  try {
    const res = await fetch('https://api.gumroad.com/v2/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return { products: 0, sales: 0, revenue: 0 };

    const data = await res.json() as { success: boolean; products?: Array<{ sales_count: number; sales_usd_cents: number }> };
    if (!data.success || !data.products) return { products: 0, sales: 0, revenue: 0 };

    const products = data.products.length;
    const sales = data.products.reduce((sum, p) => sum + (p.sales_count || 0), 0);
    const revenue = data.products.reduce((sum, p) => sum + (p.sales_usd_cents || 0), 0) / 100;

    return { products, sales, revenue };
  } catch {
    return { products: 0, sales: 0, revenue: 0 };
  }
}

async function getButtondownMetrics(): Promise<{ subscribers: number }> {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) return { subscribers: 0 };

  try {
    const res = await fetch('https://api.buttondown.com/v1/subscribers?type=regular', {
      headers: { 'Authorization': `Token ${apiKey}` }
    });
    if (!res.ok) return { subscribers: 0 };

    const data = await res.json() as { count?: number };
    return { subscribers: data.count || 0 };
  } catch {
    return { subscribers: 0 };
  }
}

async function main() {
  const today = new Date().toISOString().split('T')[0];

  const [gumroad, buttondown] = await Promise.all([
    getGumroadMetrics(),
    getButtondownMetrics(),
  ]);

  const metrics = JSON.parse(readFileSync(join(STATE_DIR, 'metrics.json'), 'utf-8'));

  // ファイルカウント
  metrics.totals.blog_posts = countFiles(join(CONTENT_DIR, 'blog'), '.md');
  metrics.totals.note_articles = countFiles(join(CONTENT_DIR, 'note'), '.md');
  metrics.totals.reddit_posts = countFiles(join(CONTENT_DIR, 'reddit'), '.json');

  // API データ
  metrics.totals.gumroad_products = gumroad.products;
  metrics.totals.gumroad_sales = gumroad.sales;
  metrics.totals.gumroad_revenue_usd = gumroad.revenue;
  metrics.totals.nl_subscribers = buttondown.subscribers;

  // 週次ログ
  metrics.weekly.push({
    date: today,
    gumroad: gumroad,
    nl_subscribers: buttondown.subscribers,
    blog_posts: metrics.totals.blog_posts,
    note_articles: metrics.totals.note_articles
  });

  // 最新52週分のみ保持
  if (metrics.weekly.length > 52) {
    metrics.weekly = metrics.weekly.slice(-52);
  }

  writeFileSync(join(STATE_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(`Metrics collected: ${JSON.stringify(metrics.totals)}`);
}

main().catch(console.error);
