/**
 * チートシートをGumroadに出品するワンショットスクリプト
 * 環境変数: GUMROAD_ACCESS_TOKEN
 */

async function main() {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) {
    console.error('GUMROAD_ACCESS_TOKEN not set');
    process.exit(1);
  }

  const res = await fetch('https://api.gumroad.com/v2/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      name: 'The AI Tools Comparison Cheat Sheet 2026',
      price: '3', // $3
      description: `Stop wasting hours researching AI tools. This cheat sheet covers 15+ tools across 4 categories — tested, compared, and rated honestly.

What's inside:
• AI Writing Tools (Jasper vs Copy.ai vs Writesonic vs Grammarly) — side-by-side comparison
• AI Coding Tools (Claude Code vs Cursor vs Windsurf vs Copilot) — for developers
• AI General Assistants (ChatGPT vs Claude vs Gemini) — which to use for what
• Notion Productivity Workflows — 4 approaches compared
• Decision Flowchart — answer 3 questions, get your tool
• Pricing Table — every plan, every tool, one table
• Power User Combos — pre-built stacks from $0 to $58/month

Updated for 2026. No fluff, no hype — just what works.

By AI Tools Pick (@aitoolspick)`,
      published: 'true',
      tags: 'ai,tools,comparison,productivity,cheatsheet'
    })
  });

  const data = await res.json() as { success: boolean; product?: { id: string; short_url: string } };

  if (data.success && data.product) {
    console.log(`SUCCESS: ${data.product.short_url}`);
    console.log(`Product ID: ${data.product.id}`);
  } else {
    console.error('Failed:', JSON.stringify(data));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
