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
const BLOG_DIR = join(ROOT, 'content', 'blog');
const STATE_DIR = join(ROOT, 'state');
const POSTED_FILE = join(STATE_DIR, 'x-posted.json');
const BLOG_BASE_URL = 'https://aitoolspick.github.io/autopilot-media';

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

  // ファイル名からブログURLを構築
  // ファイル名例: 2026-03-17-chatgpt-vs-claude.json → ブログ記事のslugに対応
  const dateSlug = file.replace('.json', '');
  const blogUrl = findBlogUrl(dateSlug);

  // 英語ツイート
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET) {
    const tweets = parseTweets(data.en);
    if (tweets.length > 0) {
      const tweetText = appendBlogUrl(tweets[0], blogUrl, 280);
      const ok = await postTweet(tweetText, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, 'EN');
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

function findBlogUrl(dateSlug: string): string | null {
  if (!existsSync(BLOG_DIR)) return null;
  const blogFiles = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  // dateSlugと同じ日付のブログ記事を探す
  const datePrefix = dateSlug.substring(0, 10); // YYYY-MM-DD
  const match = blogFiles.find(f => f.startsWith(datePrefix));
  if (!match) return null;
  // Jekyll URL: /YYYY/MM/DD/slug/
  const parts = match.replace('.md', '').match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  if (!parts) return null;
  return `${BLOG_BASE_URL}/${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}/`;
}

function appendBlogUrl(tweet: string, blogUrl: string | null, maxLen: number): string {
  if (!blogUrl) return tweet;
  const suffix = `\n\n${blogUrl}`;
  // URLを足しても文字数制限内に収まるか
  if (tweet.length + suffix.length <= maxLen) {
    return tweet + suffix;
  }
  // 収まらない場合はツイート本文を切り詰める
  const available = maxLen - suffix.length - 3; // "..." 分
  return tweet.substring(0, available) + '...' + suffix;
}

main().catch(console.error);
