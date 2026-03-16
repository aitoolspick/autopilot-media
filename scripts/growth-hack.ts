/**
 * Growth Hacking スクリプト（毎日実行）
 *
 * A) Reddit karma building: ターゲットsubredditのホット投稿にAI生成コメントを投稿
 * B) はてなブックマーク セルフブックマーク: 自分のはてなブログ記事をブックマーク
 *
 * 環境変数:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *   ANTHROPIC_API_KEY
 *   HATENA_ID, HATENA_API_KEY
 *
 * 実行: npx tsx scripts/growth-hack.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const STATE_DIR = join(ROOT, 'state');
const DECISIONS_DIR = join(STATE_DIR, 'decisions');
const STRATEGY_FILE = join(STATE_DIR, 'strategy.json');
const HATENA_POSTED_FILE = join(STATE_DIR, 'hatena-posted.json');
const HATENA_BOOKMARKED_FILE = join(STATE_DIR, 'hatena-bookmarked.json');

// STOPファイルチェック
if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

mkdirSync(DECISIONS_DIR, { recursive: true });

const today = new Date().toISOString().split('T')[0];
const USER_AGENT = `nodejs:AutopilotMedia:v1.0 (by u/${process.env.REDDIT_USERNAME || 'unknown'})`;

// ============================================================
// A) Reddit Karma Building
// ============================================================

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  num_comments: number;
}

async function getRedditAccessToken(): Promise<string> {
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
  if (data.error) throw new Error(`Reddit auth error: ${data.error}`);
  if (!data.access_token) throw new Error('Reddit auth returned no access_token');

  return data.access_token;
}

async function getHotPosts(token: string, subreddit: string, limit: number = 5): Promise<RedditPost[]> {
  const sub = subreddit.replace(/^r\//, '');

  const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': USER_AGENT
    }
  });

  if (!res.ok) {
    console.error(`Failed to fetch hot posts from r/${sub}: ${res.status}`);
    return [];
  }

  const data = await res.json() as {
    data?: {
      children?: Array<{
        data: {
          id: string;
          title: string;
          selftext: string;
          subreddit: string;
          permalink: string;
          num_comments: number;
          stickied: boolean;
        }
      }>
    }
  };

  return (data?.data?.children || [])
    .filter(c => !c.data.stickied)  // ピン留め投稿を除外
    .map(c => ({
      id: c.data.id,
      title: c.data.title,
      selftext: c.data.selftext,
      subreddit: c.data.subreddit,
      permalink: c.data.permalink,
      num_comments: c.data.num_comments
    }));
}

async function generateComment(post: RedditPost): Promise<string> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `You are a genuine Reddit user who is knowledgeable about AI tools and productivity.
Write comments that:
- Provide genuinely useful information or insights
- Are conversational and natural (not marketing speak)
- Add value to the discussion
- Are concise (2-4 sentences max)
- Never promote any product or link
- Match the subreddit's tone
- Never start with "Great post!" or similar generic openers`,
    messages: [{
      role: 'user',
      content: `Write a valuable comment for this Reddit post in r/${post.subreddit}:

Title: ${post.title}
Body: ${post.selftext.slice(0, 500)}

Respond with ONLY the comment text. No quotes, no explanation.`
    }]
  });

  const block = message.content[0];
  if (block.type === 'text') return block.text;
  throw new Error('Unexpected response type from Claude');
}

async function postComment(token: string, postId: string, text: string): Promise<boolean> {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams({
      thing_id: `t3_${postId}`,
      text,
      api_type: 'json'
    })
  });

  if (!res.ok) {
    console.error(`Failed to post comment: ${res.status} ${await res.text()}`);
    return false;
  }

  const data = await res.json() as { json?: { errors?: string[][] } };
  if (data?.json?.errors && data.json.errors.length > 0) {
    console.error('Comment errors:', data.json.errors);
    return false;
  }

  return true;
}

async function redditKarmaBuilding(): Promise<void> {
  console.log('=== Reddit Karma Building ===');

  const { REDDIT_CLIENT_ID, ANTHROPIC_API_KEY } = process.env;
  if (!REDDIT_CLIENT_ID || !ANTHROPIC_API_KEY) {
    console.log('Reddit or Anthropic credentials not set. Skipping Reddit karma building.');
    return;
  }

  // strategy.json からターゲットsubreddit一覧を取得
  const strategy = JSON.parse(readFileSync(STRATEGY_FILE, 'utf-8'));
  const subreddits = new Set<string>();
  for (const item of strategy.content_queue || []) {
    for (const sub of item.reddit_subs || []) {
      subreddits.add(sub.replace(/^r\//, ''));
    }
  }

  if (subreddits.size === 0) {
    console.log('No target subreddits found in strategy.json.');
    return;
  }

  // 今日のコメント記録を確認（レート制限: 1 subreddit あたり1日1コメント、合計最大2コメント/日）
  const commentLogFile = join(DECISIONS_DIR, `${today}-reddit-comments.json`);
  const commentLog: Array<{ subreddit: string; postId: string; timestamp: string }> = existsSync(commentLogFile)
    ? JSON.parse(readFileSync(commentLogFile, 'utf-8'))
    : [];

  const MAX_COMMENTS_PER_DAY = 2;
  if (commentLog.length >= MAX_COMMENTS_PER_DAY) {
    console.log(`Already posted ${commentLog.length} comments today. Rate limit reached.`);
    return;
  }

  const commentedSubs = new Set(commentLog.map(c => c.subreddit));

  try {
    const token = await getRedditAccessToken();
    let totalCommented = commentLog.length;

    for (const sub of subreddits) {
      if (totalCommented >= MAX_COMMENTS_PER_DAY) break;
      if (commentedSubs.has(sub)) {
        console.log(`Already commented in r/${sub} today. Skipping.`);
        continue;
      }

      console.log(`Fetching hot posts from r/${sub}...`);
      const hotPosts = await getHotPosts(token, sub, 5);
      if (hotPosts.length === 0) {
        console.log(`No suitable posts in r/${sub}.`);
        continue;
      }

      // 一番上のホット投稿にコメント
      const targetPost = hotPosts[0];
      console.log(`Generating comment for: "${targetPost.title}" in r/${sub}`);

      const comment = await generateComment(targetPost);
      console.log(`Generated comment: ${comment.slice(0, 100)}...`);

      const success = await postComment(token, targetPost.id, comment);
      if (success) {
        console.log(`Comment posted to r/${sub} on "${targetPost.title}"`);
        commentLog.push({
          subreddit: sub,
          postId: targetPost.id,
          timestamp: new Date().toISOString()
        });
        totalCommented++;
      }

      // Reddit API レート制限対策: 投稿間に2秒待機
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    writeFileSync(commentLogFile, JSON.stringify(commentLog, null, 2));
    console.log(`Reddit karma building done. ${commentLog.length} comments today.`);
  } catch (e) {
    console.error('Reddit karma building failed:', e);
  }
}

// ============================================================
// B) はてなブックマーク セルフブックマーク
// ============================================================

function createWSSEHeader(username: string, apiKey: string): string {
  const nonce = createHash('sha1').update(Math.random().toString()).digest('hex');
  const created = new Date().toISOString();
  const digest = createHash('sha1')
    .update(nonce + created + apiKey)
    .digest('base64');

  return `UsernameToken Username="${username}", PasswordDigest="${digest}", Nonce="${Buffer.from(nonce).toString('base64')}", Created="${created}"`;
}

async function bookmarkOnHatena(url: string, comment: string, tags: string[]): Promise<boolean> {
  const { HATENA_ID, HATENA_API_KEY } = process.env;

  if (!HATENA_ID || !HATENA_API_KEY) {
    console.error('Hatena credentials not set. Required: HATENA_ID, HATENA_API_KEY');
    return false;
  }

  const wsseHeader = createWSSEHeader(HATENA_ID, HATENA_API_KEY);

  // タグをコメントに含める（はてブの慣習: [tag1][tag2] コメント）
  const tagPrefix = tags.map(t => `[${t}]`).join('');
  const fullComment = `${tagPrefix} ${comment}`;

  try {
    const res = await fetch('https://bookmark.hatenaapis.com/rest/1/my/bookmark', {
      method: 'POST',
      headers: {
        'X-WSSE': wsseHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        url,
        comment: fullComment,
        tags
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Hatena Bookmark API error: ${res.status} ${errorBody}`);
      return false;
    }

    console.log(`Bookmarked: ${url}`);
    return true;
  } catch (e) {
    console.error(`Hatena Bookmark failed for ${url}:`, e);
    return false;
  }
}

async function hatenaBookmarking(): Promise<void> {
  console.log('=== Hatena Bookmark Self-Bookmarking ===');

  const { HATENA_ID, HATENA_API_KEY } = process.env;
  if (!HATENA_ID || !HATENA_API_KEY) {
    console.log('Hatena credentials not set. Skipping Hatena bookmarking.');
    return;
  }

  // はてなブログ投稿済み記事を読み込む
  if (!existsSync(HATENA_POSTED_FILE)) {
    console.log('No hatena-posted.json found. No articles to bookmark.');
    return;
  }

  const postedArticles: Array<string | { file: string; url: string; date: string }> = JSON.parse(
    readFileSync(HATENA_POSTED_FILE, 'utf-8')
  );

  // ブックマーク済みURLを読み込む
  const bookmarkedUrls: string[] = existsSync(HATENA_BOOKMARKED_FILE)
    ? JSON.parse(readFileSync(HATENA_BOOKMARKED_FILE, 'utf-8'))
    : [];

  const bookmarkedSet = new Set(bookmarkedUrls);

  // 過去7日以内に投稿された記事で、まだブックマークしていないものを抽出
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const articlesToBookmark: Array<{ url: string; file: string }> = [];

  for (const article of postedArticles) {
    // 文字列だけの場合（ファイル名のみ）はURLが不明なのでスキップ
    if (typeof article === 'string') continue;

    if (!article.url || bookmarkedSet.has(article.url)) continue;

    // 日付チェック: 過去7日以内のもののみ
    const articleDate = new Date(article.date);
    if (articleDate < sevenDaysAgo) continue;

    articlesToBookmark.push({ url: article.url, file: article.file });
  }

  if (articlesToBookmark.length === 0) {
    console.log('No new articles to bookmark.');
    return;
  }

  console.log(`Found ${articlesToBookmark.length} articles to bookmark.`);

  for (const article of articlesToBookmark) {
    const tags = ['AI', 'AIツール', '生産性'];
    const comment = 'AIツールの活用法をまとめました';

    const success = await bookmarkOnHatena(article.url, comment, tags);
    if (success) {
      bookmarkedUrls.push(article.url);
    }

    // API レート制限対策
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  writeFileSync(HATENA_BOOKMARKED_FILE, JSON.stringify(bookmarkedUrls, null, 2));
  console.log(`Hatena bookmarking done. Total bookmarked: ${bookmarkedUrls.length}`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`Growth Hack run: ${today}`);

  await redditKarmaBuilding();
  await hatenaBookmarking();

  // 判断ログ
  writeFileSync(join(DECISIONS_DIR, `${today}-growth-hack.json`), JSON.stringify({
    date: today,
    action: 'growth_hack',
    status: 'completed',
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('Growth hacking complete.');
}

main().catch(console.error);
