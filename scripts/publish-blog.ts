/**
 * ブログ公開スクリプト
 *
 * content/blog/ の未公開記事を docs/ にコピーし、
 * git push で GitHub Pages に公開する。
 *
 * 実行: npx tsx scripts/publish-blog.ts
 */

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const BLOG_DIR = join(ROOT, 'content', 'blog');
const DOCS_DIR = join(ROOT, 'docs');
const STATE_DIR = join(ROOT, 'state');

if (existsSync(join(STATE_DIR, 'STOP'))) {
  console.log('STOP file detected. Aborting.');
  process.exit(0);
}

async function main() {
  mkdirSync(join(DOCS_DIR, '_posts'), { recursive: true });

  // content/blog/ の全記事を docs/_posts/ にコピー
  const blogFiles = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  const docsFiles = new Set(
    existsSync(join(DOCS_DIR, '_posts'))
      ? readdirSync(join(DOCS_DIR, '_posts'))
      : []
  );

  let published = 0;
  for (const file of blogFiles) {
    if (!docsFiles.has(file)) {
      copyFileSync(join(BLOG_DIR, file), join(DOCS_DIR, '_posts', file));
      console.log(`Published: ${file}`);
      published++;
    }
  }

  if (published === 0) {
    console.log('No new posts to publish.');
    return;
  }

  // Git commit & push
  try {
    execSync('git add docs/', { cwd: ROOT });
    execSync(`git commit -m "Publish ${published} new post(s)"`, { cwd: ROOT });
    execSync('git push origin main', { cwd: ROOT });
    console.log(`Pushed ${published} posts to GitHub Pages.`);
  } catch (e) {
    console.error('Git push failed:', e);
  }
}

main().catch(console.error);
