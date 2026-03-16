/**
 * 日報生成・送信スクリプト
 *
 * 全メトリクスを統合し、オーナーにメール送信する。
 *
 * 環境変数:
 *   REPORT_EMAIL（送信先メールアドレス）
 *   RESEND_API_KEY（Resend.com APIキー、無料で月100通）
 *
 * 実行: npx tsx scripts/send-report.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
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

async function main() {
  const metrics = JSON.parse(readFileSync(join(STATE_DIR, 'metrics.json'), 'utf-8'));
  const strategy = JSON.parse(readFileSync(join(STATE_DIR, 'strategy.json'), 'utf-8'));

  const today = new Date().toISOString().split('T')[0];
  const pendingContent = strategy.content_queue.filter((c: any) => c.status === 'pending').length;
  const completedContent = strategy.content_queue.filter((c: any) => c.status === 'completed').length;

  const blogCount = countFiles(join(CONTENT_DIR, 'blog'), '.md');
  const noteCount = countFiles(join(CONTENT_DIR, 'note'), '.md');
  const redditCount = countFiles(join(CONTENT_DIR, 'reddit'), '.json');

  const report = `
━━━ Autopilot Media Corp 日報 ${today} ━━━

💰 Revenue
   Gumroad:    $${metrics.totals.gumroad_revenue_usd}
   Affiliate:  $${metrics.totals.affiliate_revenue_usd}
   note.com:   ¥${metrics.totals.note_revenue_jpy}
   Total:      $${metrics.totals.gumroad_revenue_usd + metrics.totals.affiliate_revenue_usd}
               + ¥${metrics.totals.note_revenue_jpy}

📝 Content
   EN blog posts:   ${blogCount}
   JA note articles: ${noteCount}
   Reddit posts:     ${redditCount}
   Gumroad products: ${metrics.totals.gumroad_products}

📊 Growth
   NL subscribers: ${metrics.totals.nl_subscribers}
   X followers EN: ${metrics.totals.x_followers_en}
   X followers JA: ${metrics.totals.x_followers_ja}
   Blog sessions:  ${metrics.totals.blog_sessions}

📋 Queue
   Completed: ${completedContent}
   Pending:   ${pendingContent}

⚙️ System
   Phase: ${strategy.phase}
   Last updated: ${strategy.last_updated}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

  console.log(report);

  // Resend.comでメール送信（無料枠: 月100通）
  const { REPORT_EMAIL, RESEND_API_KEY } = process.env;
  if (REPORT_EMAIL && RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Autopilot Media <onboarding@resend.dev>',
          to: REPORT_EMAIL,
          subject: `📊 Autopilot Daily Report ${today}`,
          text: report
        })
      });

      if (res.ok) {
        console.log(`Report emailed to ${REPORT_EMAIL}`);
      } else {
        console.error('Email send failed:', await res.text());
      }
    } catch (e) {
      console.error('Email error:', e);
    }
  } else {
    console.log('Email credentials not set. Report printed to console only.');
  }
}

main().catch(console.error);
