/**
 * ニュースレター配信スクリプト
 *
 * Buttondown API を使用して週2回配信。
 * content/blog/ の最新記事をキュレーションしてNLを生成。
 *
 * 環境変数: ANTHROPIC_API_KEY, BUTTONDOWN_API_KEY
 * 実行: npx tsx scripts/send-newsletter.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const BLOG_DIR = join(ROOT, 'content', 'blog');
const STATE_DIR = join(ROOT, 'state');
const NL_SENT_FILE = join(STATE_DIR, 'nl-sent.json');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

async function main() {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    console.log('BUTTONDOWN_API_KEY not set. Skipping newsletter.');
    return;
  }

  // 週2回（水曜・土曜）のみ配信
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek !== 3 && dayOfWeek !== 6) {
    console.log(`Today is day ${dayOfWeek}. Newsletter sends on Wed(3) and Sat(6) only.`);
    return;
  }

  // 既に今日送信済みかチェック
  const today = new Date().toISOString().split('T')[0];
  const sent: string[] = existsSync(NL_SENT_FILE)
    ? JSON.parse(readFileSync(NL_SENT_FILE, 'utf-8'))
    : [];
  if (sent.includes(today)) {
    console.log('Already sent today.');
    return;
  }

  // 最新3記事を取得
  if (!existsSync(BLOG_DIR)) {
    console.log('No blog content yet.');
    return;
  }
  const blogFiles = readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 3);

  if (blogFiles.length === 0) {
    console.log('No blog posts to include.');
    return;
  }

  const articles = blogFiles.map(f => {
    const content = readFileSync(join(BLOG_DIR, f), 'utf-8');
    const titleMatch = content.match(/title:\s*"(.+?)"/);
    return {
      title: titleMatch ? titleMatch[1] : f,
      file: f,
      preview: content.substring(0, 500)
    };
  });

  // Claude APIでNLテキスト生成
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Write a brief, engaging newsletter email featuring these articles:

${articles.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}

Requirements:
- Friendly, conversational tone
- Brief intro (2-3 sentences)
- For each article: 1-2 sentence teaser
- End with "See you next time!"
- Keep it under 300 words
- Markdown format
- Do NOT include subject line or any metadata, just the email body.`
    }],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    console.error('Unexpected response type');
    return;
  }
  const emailBody = block.text;

  // Buttondown APIで配信
  const subject = `AI Tools Weekly: ${articles[0].title}`;

  try {
    const res = await fetch('https://api.buttondown.com/v1/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject,
        body: emailBody,
        status: 'about_to_send'
      })
    });

    if (!res.ok) {
      console.error(`Buttondown API error: ${res.status} ${await res.text()}`);
      return;
    }

    console.log(`Newsletter sent: "${subject}"`);
    sent.push(today);
    writeFileSync(NL_SENT_FILE, JSON.stringify(sent, null, 2));
  } catch (e) {
    console.error('Newsletter send failed:', e);
  }
}

main().catch(console.error);
