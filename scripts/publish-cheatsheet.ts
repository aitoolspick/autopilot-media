/**
 * チートシートをGumroadに出品するスクリプト
 *
 * Gumroad API v2 POST /products
 * - ルーティング確認済み: antiwork/gumroad config/routes.rb
 *   resources :links, path: "products", only: [:index, :show, :update, :create, :destroy]
 * - SamyPesse/gumroad-api クライアントの実装を参考
 *   → multipart/form-data + access_token in body
 *
 * 環境変数: GUMROAD_ACCESS_TOKEN
 */

const PRODUCT_NAME = 'The AI Tools Comparison Cheat Sheet 2026';
const PRODUCT_PRICE = 299; // セント単位
const PRODUCT_DESCRIPTION = `Stop wasting hours researching AI tools. This cheat sheet covers 15+ tools across 4 categories — tested, compared, and rated honestly.

What's inside:
- AI Writing Tools (Jasper vs Copy.ai vs Writesonic vs Grammarly)
- AI Coding Tools (Claude Code vs Cursor vs Windsurf vs Copilot)
- AI General Assistants (ChatGPT vs Claude vs Gemini)
- Notion Productivity Workflows — 4 approaches compared
- Decision Flowchart — answer 3 questions, get your tool
- Pricing Table — every plan, every tool, one table
- Power User Combos — pre-built stacks from $0 to $58/month

Updated for 2026. No fluff, no hype — just what works.

By AI Tools Pick (@aitoolspick)`;

interface Attempt {
  label: string;
  url: string;
  init: RequestInit;
}

async function main() {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) {
    console.error('GUMROAD_ACCESS_TOKEN not set');
    process.exit(1);
  }

  // まずGETでトークン有効性を確認
  console.log('=== Token validation ===');
  const checkRes = await fetch('https://api.gumroad.com/v2/products', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`GET /products → ${checkRes.status}`);
  if (checkRes.status !== 200) {
    console.error('Token invalid. Aborting.');
    process.exit(1);
  }

  // multipart/form-data を構築（SamyPesseクライアントと同じ方式）
  const formData = new FormData();
  formData.append('access_token', token);
  formData.append('name', PRODUCT_NAME);
  formData.append('price', PRODUCT_PRICE.toString());
  formData.append('description', PRODUCT_DESCRIPTION);
  formData.append('published', 'true');

  // URLSearchParams版（application/x-www-form-urlencoded）
  const urlParams = new URLSearchParams({
    access_token: token,
    name: PRODUCT_NAME,
    price: PRODUCT_PRICE.toString(),
    description: PRODUCT_DESCRIPTION,
    published: 'true'
  });

  // 全パターンを試行
  const attempts: Attempt[] = [
    // Pattern 1: multipart/form-data + api.gumroad.com (SamyPesseクライアント方式)
    {
      label: 'multipart + api.gumroad.com/v2/products',
      url: 'https://api.gumroad.com/v2/products',
      init: { method: 'POST', body: formData }
    },
    // Pattern 2: multipart/form-data + 末尾スラッシュなし
    {
      label: 'multipart + api.gumroad.com/v2/products (no trailing slash)',
      url: 'https://api.gumroad.com/v2/products',
      init: { method: 'POST', body: formData }
    },
    // Pattern 3: urlencoded + Bearer header
    {
      label: 'urlencoded + Bearer header',
      url: 'https://api.gumroad.com/v2/products',
      init: {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          name: PRODUCT_NAME,
          price: PRODUCT_PRICE.toString(),
          description: PRODUCT_DESCRIPTION,
          published: 'true'
        })
      }
    },
    // Pattern 4: multipart + gumroad.com/api/v2 (リダイレクト先)
    {
      label: 'multipart + gumroad.com/api/v2/products',
      url: 'https://gumroad.com/api/v2/products',
      init: { method: 'POST', body: formData }
    },
    // Pattern 5: urlencoded + access_token in body (既存create-product.tsの方式)
    {
      label: 'urlencoded + access_token in body',
      url: 'https://api.gumroad.com/v2/products',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlParams
      }
    },
    // Pattern 6: multipart + Bearer header (ハイブリッド)
    {
      label: 'multipart + Bearer header',
      url: 'https://api.gumroad.com/v2/products',
      init: {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: (() => {
          const fd = new FormData();
          fd.append('name', PRODUCT_NAME);
          fd.append('price', PRODUCT_PRICE.toString());
          fd.append('description', PRODUCT_DESCRIPTION);
          fd.append('published', 'true');
          return fd;
        })()
      }
    },
  ];

  console.log(`\n=== Testing ${attempts.length} patterns ===\n`);

  for (const attempt of attempts) {
    try {
      console.log(`--- ${attempt.label} ---`);
      const res = await fetch(attempt.url, {
        ...attempt.init,
        redirect: 'follow'
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      console.log(`  Response: ${text.substring(0, 300)}`);

      if (res.ok) {
        try {
          const data = JSON.parse(text);
          if (data.success && data.product) {
            console.log(`\n✅ SUCCESS with pattern: ${attempt.label}`);
            console.log(`   Product URL: ${data.product.short_url}`);
            console.log(`   Product ID: ${data.product.id}`);
            process.exit(0);
          }
        } catch {
          // not JSON, continue
        }
      }
      console.log('');
    } catch (e) {
      console.log(`  Error: ${e}`);
      console.log('');
    }
  }

  console.error('\n❌ All patterns failed.');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
