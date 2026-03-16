/**
 * Reddit投稿スクリプト（修正版）
 *
 * - User-Agent形式を修正（Reddit要件準拠）
 * - HTTPレスポンスのエラーチェック追加
 * - 1日1投稿のレート制限
 *
 * 環境変数:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *
 * 実行: npx tsx scripts/post-reddit.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const REDDIT_DIR = join(ROOT, 'content', 'reddit');
const STATE_DIR = join(ROOT, 'state');
const POSTED_FILE = join(STATE_DIR, 'reddit-posted.json');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

const USER_AGENT = `nodejs:AutopilotMedia:v1.0 (by u/${process.env.REDDIT_USERNAME || 'unknown'})`;

async function getAccessToken(): Promise<string> {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    throw new Error('Reddit credentials not set. Required: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
  }

  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD
    })
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { access_token?: string; error?: string };
  if (data.error) {
    throw new Error(`Reddit auth error: ${data.error}`);
  }
  if (!data.access_token) {
    throw new Error('Reddit auth returned no access_token');
  }

  return data.access_token;
}

async function submitPost(token: string, subreddit: string, title: string, body: string): Promise<string | null> {
  const sub = subreddit.replace(/^r\//, '');

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams({
      sr: sub,
      kind: 'self',
      title,
      text: body,
      api_type: 'json'
    })
  });

  if (!res.ok) {
    console.error(`Reddit submit failed: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = await res.json() as { json?: { errors?: string[][]; data?: { url?: string } } };

  if (data?.json?.errors && data.json.errors.length > 0) {
    console.error(`Reddit post errors:`, data.json.errors);
    return null;
  }

  const url = data?.json?.data?.url;
  console.log(`Posted to r/${sub}: ${url || 'success (no URL returned)'}`);
  return url || 'posted';
}

async function main() {
  if (!existsSync(REDDIT_DIR)) {
    console.log('No Reddit content directory.');
    return;
  }

  const posted: string[] = existsSync(POSTED_FILE)
    ? JSON.parse(readFileSync(POSTED_FILE, 'utf-8'))
    : [];

  const files = readdirSync(REDDIT_DIR).filter(f => f.endsWith('.json'));
  const unposted = files.filter(f => !posted.includes(f));

  if (unposted.length === 0) {
    console.log('No Reddit posts pending.');
    return;
  }

  // 1日1投稿（スパム回避）
  const file = unposted[0];
  const post = JSON.parse(readFileSync(join(REDDIT_DIR, file), 'utf-8'));

  try {
    const token = await getAccessToken();
    const targetSub = post.subreddits[0];
    const result = await submitPost(token, targetSub, post.title, post.body);

    if (result) {
      posted.push(file);
      writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2));
    }
  } catch (e) {
    console.error('Reddit posting failed:', e);
  }
}

main().catch(console.error);
