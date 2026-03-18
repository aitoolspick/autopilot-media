# Lessons

自律運用で学んだ教訓を記録する。weekly-analyze.yml が自動更新する。

フォーマット:
```
### YYYY-MM-DD: [カテゴリ] 概要
- 事象: 何が起きたか
- 原因: なぜ起きたか
- ルール: 今後はどうするか
```

カテゴリ: content / reddit / x / affiliate / gumroad / hatena / newsletter / system

---

（運用開始後に自動追記される）

### 2026-03-18: [system] Week 0 Launch — Zero-to-One Bottlenecks Identified
- 事象: 5 pieces of content completed, 3 Reddit posts made, but zero revenue, zero subscribers, zero karma, zero affiliate approvals
- 原因: Setup phase focused on content production before distribution infrastructure was operational; affiliate approvals take time; Gumroad product not launched despite being in queue
- ルール: In future launch phases, prioritize affiliate approvals and product launches before content production begins. Revenue infrastructure must precede content volume.

### 2026-03-18: [affiliate] Affiliate Program Approval Lag Is Revenue Blocker
- 事象: All affiliate programs still pending — no approved programs after project initialization
- 原因: Applications take 3-14 days for approval; were not applied for early enough
- ルール: Apply to ALL target affiliate programs on Day 1 of any new project. Prioritize programs with instant approval (PartnerStack, Impact) over manual review programs.

### 2026-03-18: [gumroad] Product Launch Delayed Despite Being in Queue
- 事象: Gumroad prompt pack has been in product_queue as 'pending' since initialization but still not launched
- 原因: No automated trigger to move products from queue to launch; content production was prioritized
- ルール: Any product in queue must be launched within 48 hours of queue entry. A pending product earns $0; an imperfect launched product earns money.

### 2026-03-18: [reddit] Reddit Karma Is Zero Despite 3 Posts
- 事象: 3 Reddit posts submitted but 0 karma recorded
- 原因: New accounts with no comment history get filtered or downvoted for self-promotion; no karma-building comment strategy was executed first
- ルール: Before any subreddit post submission, spend 30 minutes commenting genuinely on top posts in target subreddits. Never submit a link post as first action in a subreddit. Build 50+ comment karma before any self-promotional post.

### 2026-03-18: [content] Experience Posts Need Affiliate Retrofit
- 事象: 'I Replaced 5 Paid Apps with Free AI Tools' has empty affiliate_targets array
- 原因: Content was written for virality/Reddit without monetization planning
- ルール: Every piece of content must have at least one affiliate target before publication. If a viral/experience post genuinely cannot include paid tool recommendations, use it as a newsletter subscriber capture instead with a prominent opt-in CTA.
