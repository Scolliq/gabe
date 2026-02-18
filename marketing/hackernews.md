# Hacker News — Show HN

**Title:** Show HN: Gabe – Cron job heartbeat monitor on Cloudflare Workers (free tier)

**URL:** https://github.com/Scolliq/gabe

---

# Reddit posts (rewritten to avoid spam filters)

## r/selfhosted (wait 2-3 days, then post)

**Title:** Built a self-hostable cron monitor — runs on Cloudflare Workers free tier

**Body:**
Been running a handful of cron jobs across a few VPSes. Had a backup script fail silently for two weeks after a server update. Decided to build something simple to catch that.

It's a heartbeat monitor. You append a curl to your crontab entry. If the curl stops arriving, it sends a webhook to Slack or Discord.

Runs on a single Cloudflare Worker + KV. You can self-host the whole thing for free. No database, no Docker, no agents.

I know Healthchecks.io exists and it's great. This is more minimal — just the alerting, nothing else. Open source, MIT licensed.

https://github.com/Scolliq/gabe

Happy to answer questions about the architecture if anyone's curious.

---

## r/homelab (wait 1 week after r/selfhosted)

**Title:** Simple heartbeat monitor for cron jobs — self-hostable on Cloudflare Workers

**Body:**
Sharing a small tool I built for monitoring cron jobs across my homelab. It's a dead man's switch style monitor — your cron job pings a URL after each run, and if the ping stops, you get a webhook alert.

Self-hostable on Cloudflare Workers free tier. Just clone the repo and deploy.

No dependencies, no database server, no Docker required.

https://github.com/Scolliq/gabe

---

## Tips for posting:

1. Only post to ONE subreddit at a time
2. Wait 3-5 days between posts to different subs
3. Engage with every comment
4. Don't mention pricing in the post — let people discover that
5. Use the "story" angle (backup script failed for 2 weeks)
6. Post on Tuesday-Thursday mornings (US time, ~9-11am EST)
