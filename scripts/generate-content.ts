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

const BLOG_BASE_URL = 'https://aitoolspick.github.io/autopilot-media';

// アフィリエイトリンクマッピング（直接登録不要のリファラルリンク + 公式サイトリンク）
// アフィリプログラム承認後にここを更新する
const AFFILIATE_LINKS: Record<string, { url: string; label: string }> = {
  'cursor.com': { url: 'https://www.cursor.com/', label: 'Cursor' },
  'claude.ai': { url: 'https://claude.ai/upgrade', label: 'Claude Pro' },
  'chatgpt.com': { url: 'https://chatgpt.com/', label: 'ChatGPT' },
  'jasper.ai': { url: 'https://www.jasper.ai/', label: 'Jasper AI' },
  'grammarly.com': { url: 'https://www.grammarly.com/', label: 'Grammarly' },
  'notion.so': { url: 'https://www.notion.so/', label: 'Notion' },
  'semrush.com': { url: 'https://www.semrush.com/', label: 'SEMrush' },
  'ahrefs.com': { url: 'https://ahrefs.com/', label: 'Ahrefs' },
  'moz.com': { url: 'https://moz.com/', label: 'Moz' },
  'windsurf.com': { url: 'https://windsurf.com/', label: 'Windsurf' },
  'github.com/features/copilot': { url: 'https://github.com/features/copilot', label: 'GitHub Copilot' },
  'writesonic.com': { url: 'https://writesonic.com/', label: 'Writesonic' },
  'copy.ai': { url: 'https://www.copy.ai/', label: 'Copy.ai' },
  'zapier.com': { url: 'https://zapier.com/', label: 'Zapier' },
  'make.com': { url: 'https://www.make.com/', label: 'Make' },
  'midjourney.com': { url: 'https://www.midjourney.com/', label: 'Midjourney' },
};

// 全コンテンツ生成に適用される絶対ルール（--append-system-prompt相当）
const SYSTEM_RULES = `You are a content writer for an AI tools review blog (aitoolspick.github.io/autopilot-media).
Absolute rules (never violate):
- Include FTC/景品表示法 affiliate disclosure in every article
- Never make false claims about tools. Only write what you actually know.
- Include both pros AND cons for every tool mentioned
- Never guarantee results or make income claims
- Factual accuracy is paramount. If unsure, say "based on available information"
- Content must provide genuine value. No filler or fluff.
- Every tool mentioned MUST have a clickable link to its official site or sign-up page.
- When recommending a tool, use a clear CTA like "Try [Tool] here" or "Get started with [Tool]" with the link.

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

  // アフィリリンク情報を構築
  const affiliateInfo = nextItem.affiliate_targets
    .map(target => {
      const link = AFFILIATE_LINKS[target];
      return link ? `- ${link.label}: ${link.url}` : `- ${target}`;
    })
    .join('\n');

  // 1. 英語ブログ記事
  try {
    const enContent = await generateText(`Write a comprehensive, SEO-optimized blog post about: "${nextItem.topic}"

Requirements:
- 2000-2500 words
- Include H2 and H3 headings
- Include a comparison table if applicable (use Markdown tables)
- Include pros and cons for each tool mentioned
- Natural, conversational tone
- FTC disclosure at the top: "*Disclosure: Some links in this article are affiliate links. I may earn a commission at no extra cost to you.*"
- End with a clear recommendation and a "Getting Started" section with direct links
- Format as Markdown
- Do NOT include any preamble or explanation. Start directly with the article content.
- CRITICAL: Every tool mentioned MUST include a hyperlink to its sign-up or pricing page. Use inline Markdown links like [Tool Name](https://url). Do NOT just mention tool names without links.
- Include a "Quick Links" section near the top with direct links to all tools discussed.
- End each tool section with a CTA like "→ [Try Tool Name free](https://url)" or "→ [Check Tool Name pricing](https://url/pricing)"

Tool links to use:
${affiliateInfo || 'Use official tool websites'}`);

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

  // 2. 日本語はてなブログ記事
  try {
    const jaContent = await generateText(`以下のテーマについて、はてなブログ用の記事を書いてください: "${nextItem.ja_topic}"

要件:
- 2000-3000文字
- 見出し（##、###）を適切に使用
- 比較表がある場合はMarkdownテーブルで含める
- 友達に教えるようなカジュアルなトーン
- 記事末尾に「※この記事にはアフィリエイトリンクを含みます」の開示
- 具体的な使い方や活用例を含める
- 重要: 各ツールの公式サイトへのリンクを必ず含める。[ツール名](https://url) 形式で。
- 各ツールのセクション末尾に「→ [ツール名の公式サイトはこちら](https://url)」のCTAを入れる
- Markdown形式
- 前置きや説明なしで、記事本文のみを出力してください。

使用するリンク:
${affiliateInfo || '各ツールの公式サイトURLを使用'}`);

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
  // ブログURLはpost-x.tsで自動付与されるので、ツイート本文は230文字以内にする
  try {
    const xEnContent = await generateText(`Write exactly 3 tweets about: "${nextItem.topic}"

Rules:
- Each tweet must be under 230 characters (a URL will be appended automatically).
- Tweet 1: A bold, curiosity-driven hook. Make people want to click.
- Tweet 2: Share one specific insight or data point from the article.
- Tweet 3: A hot take or contrarian opinion to drive engagement.
- Do NOT include URLs or hashtags — they'll be added automatically.
- Write like a human, not a brand. Be opinionated.
Return ONLY a JSON array of 3 strings. No explanation, no markdown, no code fences.
Example: ["tweet 1", "tweet 2", "tweet 3"]`, 'claude-haiku-4-5-20251001');

    const xJaContent = await generateText(`以下のテーマについてX(Twitter)投稿を3つ書いてください: "${nextItem.ja_topic}"

ルール:
- 各投稿は120文字以内（URLが自動付与されるため）
- 投稿1: 好奇心を刺激するフック。クリックしたくなる内容
- 投稿2: 記事から1つ具体的な発見・データを共有
- 投稿3: 議論を呼ぶ意見やホットテイク
- URLやハッシュタグは不要（自動付与）
- 企業アカウントではなく個人の発信トーンで
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
