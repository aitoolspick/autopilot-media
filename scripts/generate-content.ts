/**
 * コンテンツ生成スクリプト（修正版）
 *
 * @anthropic-ai/sdk を直接使用（claude -p のシェル呼び出しを廃止）
 * シェルエスケープ問題を根本的に解消。
 *
 * 環境変数: ANTHROPIC_API_KEY
 * 実行: npx tsx scripts/generate-content.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const STATE_DIR = join(ROOT, 'state');
const CONTENT_DIR = join(ROOT, 'content');

// STOPファイルチェック
if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

const client = new Anthropic();

interface ContentItem {
  topic: string;
  ja_topic: string;
  type: string;
  priority: string;
  affiliate_targets: string[];
  reddit_subs: string[];
  status: string;
}

interface Strategy {
  content_queue: ContentItem[];
  last_updated: string;
  [key: string]: unknown;
}

// 全コンテンツ生成に適用される絶対ルール（--append-system-prompt相当）
const SYSTEM_RULES = `You are a content writer for an AI tools review blog.
Absolute rules (never violate):
- Include FTC/景品表示法 affiliate disclosure in every article
- Never make false claims about tools. Only write what you actually know.
- Include both pros AND cons for every tool mentioned
- Never guarantee results or make income claims
- Factual accuracy is paramount. If unsure, say "based on available information"
- Content must provide genuine value. No filler or fluff.

Reference past successes from references/past-hits.md patterns when available.
Reference lessons from lessons.md to avoid past mistakes.`;

async function generateText(prompt: string, model: string = 'claude-sonnet-4-6'): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_RULES,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (block.type === 'text') {
    return block.text;
  }
  throw new Error('Unexpected response type');
}

async function main() {
  const strategy: Strategy = JSON.parse(
    readFileSync(join(STATE_DIR, 'strategy.json'), 'utf-8')
  );

  const nextItem = strategy.content_queue.find(item => item.status === 'pending');
  if (!nextItem) {
    console.log('No pending content in queue.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const slug = nextItem.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  console.log(`Generating content for: ${nextItem.topic}`);

  // 1. 英語ブログ記事
  try {
    const enContent = await generateText(`Write a comprehensive, SEO-optimized blog post about: "${nextItem.topic}"

Requirements:
- 2000-2500 words
- Include H2 and H3 headings
- Include a comparison table if applicable
- Include pros and cons for each tool mentioned
- Natural, conversational tone
- FTC disclosure at the top: "This post contains affiliate links. I may earn a commission at no extra cost to you."
- End with a clear recommendation
- Format as Markdown
- Do NOT include any preamble or explanation. Start directly with the article content.

Affiliate targets: ${nextItem.affiliate_targets.join(', ') || 'none'}`);

    const blogDir = join(CONTENT_DIR, 'blog');
    mkdirSync(blogDir, { recursive: true });
    const blogPath = join(blogDir, `${today}-${slug}.md`);
    const blogFile = `---
title: "${nextItem.topic.replace(/"/g, '\\"')}"
date: "${today}"
layout: post
---

${enContent}`;
    writeFileSync(blogPath, blogFile);
    console.log(`EN blog saved: ${blogPath}`);
  } catch (e) {
    console.error('EN blog generation failed:', e);
  }

  // 2. 日本語note記事
  try {
    const jaContent = await generateText(`以下のテーマについて、note.com用の記事を書いてください: "${nextItem.ja_topic}"

要件:
- 2000-3000文字
- 見出し（##、###）を適切に使用
- 比較表がある場合は含める
- 友達に教えるようなカジュアルなトーン
- 記事末尾に「※この記事にはアフィリエイトリンクを含みます」の開示
- 具体的な使い方や活用例を含める
- Markdown形式
- 前置きや説明なしで、記事本文のみを出力してください。`);

    const noteDir = join(CONTENT_DIR, 'note');
    mkdirSync(noteDir, { recursive: true });
    writeFileSync(join(noteDir, `${today}-${slug}.md`), jaContent);
    console.log(`JA note saved.`);
  } catch (e) {
    console.error('JA note generation failed:', e);
  }

  // 3. Reddit投稿テキスト
  try {
    const redditContent = await generateText(`Write a Reddit post for ${nextItem.reddit_subs[0]} about: "${nextItem.topic}"

Rules:
- Start with a hook that provides immediate value
- Share genuine insights, not marketing fluff
- Include specific data points or comparisons
- DO NOT be promotional
- At the very end, ONE line: "I wrote a more detailed comparison on my blog if anyone's interested: [link]"
- Keep it under 500 words
- Use Reddit formatting (** for bold, etc.)
- Do NOT include any preamble. Start directly with the post content.`, 'claude-haiku-4-5-20251001');

    const redditDir = join(CONTENT_DIR, 'reddit');
    mkdirSync(redditDir, { recursive: true });
    writeFileSync(join(redditDir, `${today}-${slug}.json`), JSON.stringify({
      title: nextItem.topic,
      body: redditContent,
      subreddits: nextItem.reddit_subs,
      date: today
    }, null, 2));
    console.log(`Reddit post saved.`);
  } catch (e) {
    console.error('Reddit post generation failed:', e);
  }

  // 4. X投稿（英語+日本語）
  try {
    const xEnContent = await generateText(`Write exactly 3 tweets about: "${nextItem.topic}"
Each tweet must be under 280 characters.
Return ONLY a JSON array of 3 strings. No explanation, no markdown, no code fences.
Example format: ["tweet 1", "tweet 2", "tweet 3"]`, 'claude-haiku-4-5-20251001');

    const xJaContent = await generateText(`以下のテーマについてX(Twitter)投稿を3つ書いてください: "${nextItem.ja_topic}"
各投稿は140文字以内。
JSON配列のみを返してください。説明やコードフェンスは不要です。
例: ["投稿1", "投稿2", "投稿3"]`, 'claude-haiku-4-5-20251001');

    const xDir = join(CONTENT_DIR, 'x');
    mkdirSync(xDir, { recursive: true });
    writeFileSync(join(xDir, `${today}-${slug}.json`), JSON.stringify({
      en: xEnContent,
      ja: xJaContent,
      date: today
    }, null, 2));
    console.log(`X posts saved.`);
  } catch (e) {
    console.error('X posts generation failed:', e);
  }

  // 5. strategy.json を更新
  nextItem.status = 'completed';
  strategy.last_updated = today;
  writeFileSync(join(STATE_DIR, 'strategy.json'), JSON.stringify(strategy, null, 2));

  // 6. 判断ログ
  const decisionsDir = join(STATE_DIR, 'decisions');
  mkdirSync(decisionsDir, { recursive: true });
  writeFileSync(join(decisionsDir, `${today}-content.json`), JSON.stringify({
    date: today,
    action: 'content_generated',
    topic: nextItem.topic,
    status: 'success'
  }, null, 2));

  console.log('Content generation complete.');
}

main().catch(console.error);
