/**
 * はてなブログ投稿スクリプト
 *
 * AtomPub API を使用して content/note/ の記事をはてなブログに自動投稿する。
 * （ディレクトリ名はnoteのままだが、投稿先ははてなブログ）
 *
 * はてなブログ AtomPub API:
 *   POST https://blog.hatena.ne.jp/{hatena_id}/{blog_id}/atom/entry
 *
 * 環境変数:
 *   HATENA_ID       - はてなID
 *   HATENA_BLOG_ID  - ブログID（例: yourname.hatenablog.com）
 *   HATENA_API_KEY  - はてなブログのAPIキー（管理画面 > 詳細設定 > AtomPub）
 *
 * 実行: npx tsx scripts/post-hatena.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const NOTE_DIR = join(ROOT, 'content', 'note');  // 日本語記事ディレクトリ
const STATE_DIR = join(ROOT, 'state');
const POSTED_FILE = join(STATE_DIR, 'hatena-posted.json');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

async function createAtomEntry(title: string, content: string, categories: string[] = []): Promise<string> {
  const categoriesXml = categories
    .map(c => `<category term="${c}" />`)
    .join('\n    ');

  // MarkdownをHTMLに変換してから送信
  const htmlContent = await marked(content);
  return `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <title>${escapeXml(title)}</title>
  <content type="text/html">${htmlContent}</content>
  ${categoriesXml}
  <app:control>
    <app:draft>no</app:draft>
  </app:control>
</entry>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTitle(markdown: string): string {
  // 最初の # 見出しをタイトルとして抽出
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1];
  // 見出しがなければ最初の行
  const firstLine = markdown.split('\n').find(l => l.trim().length > 0);
  return firstLine?.replace(/^#+\s*/, '') || 'Untitled';
}

async function postToHatena(title: string, content: string): Promise<string | null> {
  const { HATENA_ID, HATENA_BLOG_ID, HATENA_API_KEY } = process.env;

  if (!HATENA_ID || !HATENA_BLOG_ID || !HATENA_API_KEY) {
    console.error('Hatena credentials not set. Required: HATENA_ID, HATENA_BLOG_ID, HATENA_API_KEY');
    return null;
  }

  const url = `https://blog.hatena.ne.jp/${HATENA_ID}/${HATENA_BLOG_ID}/atom/entry`;
  const auth = Buffer.from(`${HATENA_ID}:${HATENA_API_KEY}`).toString('base64');

  const categories = ['AIツール', 'AI', '生産性'];
  const atomXml = await createAtomEntry(title, content, categories);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/atom+xml; charset=utf-8'
      },
      body: atomXml
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Hatena API error: ${res.status} ${errorBody}`);
      return null;
    }

    // レスポンスからURLを抽出
    const responseXml = await res.text();
    const urlMatch = responseXml.match(/<link rel="alternate"[^>]+href="([^"]+)"/);
    const postUrl = urlMatch ? urlMatch[1] : 'posted';
    console.log(`Posted to Hatena: ${postUrl}`);
    return postUrl;
  } catch (e) {
    console.error('Hatena posting failed:', e);
    return null;
  }
}

async function main() {
  if (!existsSync(NOTE_DIR)) {
    console.log('No Japanese content directory.');
    return;
  }

  const posted: string[] = existsSync(POSTED_FILE)
    ? JSON.parse(readFileSync(POSTED_FILE, 'utf-8'))
    : [];

  const files = readdirSync(NOTE_DIR).filter(f => f.endsWith('.md'));
  const unposted = files.filter(f => !posted.includes(f));

  if (unposted.length === 0) {
    console.log('No Hatena posts pending.');
    return;
  }

  // 1日1投稿
  const file = unposted[0];
  const content = readFileSync(join(NOTE_DIR, file), 'utf-8');
  const title = extractTitle(content);

  const result = await postToHatena(title, content);

  if (result) {
    posted.push(file);
    writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2));
  }
}

main().catch(console.error);
