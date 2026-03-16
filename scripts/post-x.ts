/**
 * X (Twitter) 投稿スクリプト（修正版）
 *
 * - twitter-api-v2 ライブラリ使用（手動OAuth署名を廃止）
 * - JSON解析エラーのハンドリング強化
 * - 1日1ツイート/アカウント
 *
 * 環境変数:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET（英語用）
 *   X_JA_API_KEY, X_JA_API_SECRET, X_JA_ACCESS_TOKEN, X_JA_ACCESS_SECRET（日本語用）
 *
 * 実行: npx tsx scripts/post-x.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { TwitterApi } from 'twitter-api-v2';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const X_DIR = join(ROOT, 'content', 'x');
const STATE_DIR = join(ROOT, 'state');
const POSTED_FILE = join(STATE_DIR, 'x-posted.json');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

function parseTweets(raw: string): string[] {
  // Claudeの出力からJSON配列を抽出（余計なテキストがあっても対応）
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.warn('Could not find JSON array in tweet content. Raw:', raw.substring(0, 200));
    return [];
  }
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed.filter(t => typeof t === 'string');
    return [];
  } catch {
    console.warn('Failed to parse tweet JSON:', match[0].substring(0, 200));
    return [];
  }
}

async function postTweet(
  text: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string,
  label: string
): Promise<boolean> {
  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });

    const result = await client.v2.tweet(text);
    console.log(`[${label}] Tweet posted: "${text.substring(0, 50)}..." (id: ${result.data.id})`);
    return true;
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`[${label}] Tweet failed:`, error.message);
    return false;
  }
}

async function main() {
  if (!existsSync(X_DIR)) {
    console.log('No X content directory.');
    return;
  }

  const posted: string[] = existsSync(POSTED_FILE)
    ? JSON.parse(readFileSync(POSTED_FILE, 'utf-8'))
    : [];

  const files = readdirSync(X_DIR).filter(f => f.endsWith('.json'));
  const unposted = files.filter(f => !posted.includes(f));

  if (unposted.length === 0) {
    console.log('No X posts pending.');
    return;
  }

  const file = unposted[0];
  const data = JSON.parse(readFileSync(join(X_DIR, file), 'utf-8'));
  let anyPosted = false;

  // 英語ツイート
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET) {
    const tweets = parseTweets(data.en);
    if (tweets.length > 0) {
      const ok = await postTweet(tweets[0], X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, 'EN');
      if (ok) anyPosted = true;
    }
  } else {
    console.log('EN X credentials not set. Skipping.');
  }

  // 日本語ツイート
  const { X_JA_API_KEY, X_JA_API_SECRET, X_JA_ACCESS_TOKEN, X_JA_ACCESS_SECRET } = process.env;
  if (X_JA_API_KEY && X_JA_API_SECRET && X_JA_ACCESS_TOKEN && X_JA_ACCESS_SECRET) {
    const tweets = parseTweets(data.ja);
    if (tweets.length > 0) {
      const ok = await postTweet(tweets[0], X_JA_API_KEY, X_JA_API_SECRET, X_JA_ACCESS_TOKEN, X_JA_ACCESS_SECRET, 'JA');
      if (ok) anyPosted = true;
    }
  } else {
    console.log('JA X credentials not set. Skipping.');
  }

  if (anyPosted) {
    posted.push(file);
    writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2));
  }
}

main().catch(console.error);
