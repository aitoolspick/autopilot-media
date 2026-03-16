/**
 * 週次戦略会議スクリプト
 *
 * 旧4部門（Intelligence, Strategist, Revenue, Analytics）を
 * 1つのClaude API呼び出しに統合。全データを投入して戦略を一括更新する。
 *
 * 環境変数: ANTHROPIC_API_KEY
 * 実行: npx tsx scripts/weekly-strategy.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const STATE_DIR = join(ROOT, 'state');
const DECISIONS_DIR = join(STATE_DIR, 'decisions');
const STRATEGY_FILE = join(STATE_DIR, 'strategy.json');
const METRICS_FILE = join(STATE_DIR, 'metrics.json');
const LESSONS_FILE = join(ROOT, 'lessons.md');
const PAST_HITS_FILE = join(ROOT, 'references', 'past-hits.md');

// STOPファイルチェック
if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

mkdirSync(DECISIONS_DIR, { recursive: true });

const today = new Date().toISOString().split('T')[0];

function readFileSafe(path: string): string {
  if (!existsSync(path)) return '(file not found)';
  return readFileSync(path, 'utf-8');
}

const SYSTEM_PROMPT = `You are the Chief Strategy Officer for an autonomous AI media business.
Your job: analyze all performance data and output a complete strategic update.

CORE PRINCIPLES:
- Revenue is the #1 priority. Every decision should be evaluated by revenue impact.
- Gray zone tactics are acceptable. Push boundaries for growth.
- Use patterns from past-hits.md to replicate success.
- Use lessons.md to avoid repeating mistakes.
- Prioritize high-affiliate-potential topics (tools with affiliate programs that pay well).
- Content should target commercial intent keywords ("best X", "X vs Y", "X review", "X pricing").
- Japanese market: はてなブログ (DR91) for SEO + A8.net/もしもアフィリエイト
- English market: GitHub Pages blog + Reddit karma + Gumroad products

OUTPUT FORMAT:
You must respond with a JSON object (no markdown fences, no explanation) containing exactly these keys:

{
  "analysis": {
    "what_worked": ["string array of things that worked well"],
    "what_didnt": ["string array of things that didn't work"],
    "key_insights": ["string array of key insights"]
  },
  "lessons_append": "string of new lessons to append to lessons.md (in the existing format with ### headers). Empty string if no new lessons.",
  "past_hits_append": "string of new past hits to append to past-hits.md (in the existing format with ### headers). Empty string if no new hits.",
  "content_queue": [
    {
      "topic": "English topic title",
      "ja_topic": "Japanese topic title",
      "type": "comparison|listicle|guide|experience|review",
      "priority": "high|medium|low",
      "affiliate_targets": ["domain1.com", "domain2.com"],
      "reddit_subs": ["r/subreddit1", "r/subreddit2"],
      "status": "pending"
    }
  ],
  "new_product": {
    "name": "Product name in English",
    "ja_name": "Product name in Japanese",
    "type": "prompt_pack|template|guide|toolkit",
    "price_usd": 9,
    "price_jpy": 980,
    "platform": "gumroad",
    "ja_platform": "note",
    "status": "pending"
  },
  "growth_tasks": ["string array of specific growth hack tasks for next week"],
  "strategy_updates": {
    "learnings": ["string array of learnings to add to strategy.json"],
    "affiliate_targets_to_add": {
      "en": ["program_name"],
      "ja": ["program_name"]
    }
  }
}

Generate exactly 7 content topics for content_queue. Prioritize topics with high affiliate commission potential.`;

async function main() {
  console.log(`Weekly Strategy Meeting: ${today}`);

  // 1. 全データ読み込み
  const metrics = readFileSafe(METRICS_FILE);
  const lessons = readFileSafe(LESSONS_FILE);
  const pastHits = readFileSafe(PAST_HITS_FILE);
  const strategy = readFileSafe(STRATEGY_FILE);

  // 2. 1回のClaude API呼び出しで全分析・戦略更新
  const client = new Anthropic();

  const userPrompt = `Here is all the data for this week's strategy meeting.

## Current Strategy (strategy.json)
\`\`\`json
${strategy}
\`\`\`

## Metrics (metrics.json)
\`\`\`json
${metrics}
\`\`\`

## Lessons Learned (lessons.md)
${lessons}

## Past Hits (past-hits.md)
${pastHits}

## Date
Today is ${today}.

Analyze all data and generate the complete strategic update as specified in your system prompt. Consider:
1. What content performed best and why?
2. Which affiliate programs should we prioritize?
3. What Reddit strategies are building karma most effectively?
4. What trending AI topics should we cover this week?
5. What products would sell well based on our audience?
6. What growth hacks should we execute next week?

Return ONLY the JSON object. No markdown code fences. No explanation.`;

  console.log('Calling Claude Sonnet for strategic analysis...');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // JSONをパース（コードフェンスがある場合は除去）
  let responseText = block.text.trim();
  if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let result: {
    analysis: {
      what_worked: string[];
      what_didnt: string[];
      key_insights: string[];
    };
    lessons_append: string;
    past_hits_append: string;
    content_queue: Array<{
      topic: string;
      ja_topic: string;
      type: string;
      priority: string;
      affiliate_targets: string[];
      reddit_subs: string[];
      status: string;
    }>;
    new_product: {
      name: string;
      ja_name: string;
      type: string;
      price_usd: number;
      price_jpy: number;
      platform: string;
      ja_platform: string;
      status: string;
    };
    growth_tasks: string[];
    strategy_updates: {
      learnings: string[];
      affiliate_targets_to_add: {
        en: string[];
        ja: string[];
      };
    };
  };

  try {
    result = JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse Claude response as JSON:', responseText.slice(0, 500));
    throw new Error('Claude response was not valid JSON');
  }

  console.log('Analysis received. Updating files...');

  // 3. lessons.md を更新
  if (result.lessons_append && result.lessons_append.trim().length > 0) {
    const currentLessons = readFileSafe(LESSONS_FILE);
    writeFileSync(LESSONS_FILE, currentLessons + '\n' + result.lessons_append + '\n');
    console.log('Updated lessons.md');
  }

  // 4. past-hits.md を更新
  if (result.past_hits_append && result.past_hits_append.trim().length > 0) {
    const currentHits = readFileSafe(PAST_HITS_FILE);
    writeFileSync(PAST_HITS_FILE, currentHits + '\n' + result.past_hits_append + '\n');
    console.log('Updated past-hits.md');
  }

  // 5. strategy.json を更新
  const currentStrategy = JSON.parse(readFileSafe(STRATEGY_FILE));

  // 完了済みアイテムは保持し、新しいキューを追加
  const completedItems = (currentStrategy.content_queue || []).filter(
    (item: { status: string }) => item.status === 'completed'
  );
  currentStrategy.content_queue = [...completedItems, ...result.content_queue];

  // 新商品をキューに追加
  if (result.new_product) {
    currentStrategy.product_queue = currentStrategy.product_queue || [];
    currentStrategy.product_queue.push(result.new_product);
  }

  // 学習を追加
  if (result.strategy_updates?.learnings) {
    currentStrategy.learnings = [
      ...(currentStrategy.learnings || []),
      ...result.strategy_updates.learnings
    ];
  }

  // アフィリエイトターゲットを追加
  if (result.strategy_updates?.affiliate_targets_to_add) {
    const targets = result.strategy_updates.affiliate_targets_to_add;
    if (targets.en) {
      currentStrategy.affiliate_programs.en.target = [
        ...new Set([...currentStrategy.affiliate_programs.en.target, ...targets.en])
      ];
    }
    if (targets.ja) {
      currentStrategy.affiliate_programs.ja.target = [
        ...new Set([...currentStrategy.affiliate_programs.ja.target, ...targets.ja])
      ];
    }
  }

  currentStrategy.week = (currentStrategy.week || 0) + 1;
  currentStrategy.last_updated = today;

  writeFileSync(STRATEGY_FILE, JSON.stringify(currentStrategy, null, 2));
  console.log('Updated strategy.json');

  // 6. 判断ログ
  writeFileSync(join(DECISIONS_DIR, `${today}-weekly-strategy.json`), JSON.stringify({
    date: today,
    action: 'weekly_strategy',
    analysis: result.analysis,
    content_topics_generated: result.content_queue.length,
    new_product: result.new_product?.name || null,
    growth_tasks: result.growth_tasks,
    status: 'completed'
  }, null, 2));

  console.log('=== Weekly Strategy Meeting Complete ===');
  console.log(`Analysis: ${result.analysis.key_insights.length} insights`);
  console.log(`New content topics: ${result.content_queue.length}`);
  console.log(`New product: ${result.new_product?.name || 'none'}`);
  console.log(`Growth tasks: ${result.growth_tasks.length}`);
}

main().catch(console.error);
