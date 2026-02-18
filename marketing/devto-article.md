---
title: I built a cron job monitor that runs entirely on Cloudflare Workers (free tier)
published: true
tags: devops, monitoring, cloudflare, opensource
---

Last month one of my backup scripts stopped running. I didn't notice for two weeks. The cron job had been silently failing since a server update changed the path to `pg_dump`.

I looked at monitoring services. Healthchecks.io is great but I wanted something I could self-host. Cronitor is slick but expensive for hobby projects. So I built my own.

## What it does

Gabe is a heartbeat monitor for cron jobs. The concept is simple:

1. You register a job and get a ping URL
2. You append `&& curl -s https://gabe.usegabe.workers.dev/ping/YOUR_ID` to your crontab entry
3. If the curl stops arriving on schedule, Gabe fires a webhook to your Slack or Discord

That's the entire product.

## Setup in 30 seconds

```bash
# Create an account
curl -X POST https://gabe.usegabe.workers.dev/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
# Returns: {"api_key": "gabe_k8x2m..."}

# Create a monitor
curl -X POST https://gabe.usegabe.workers.dev/api/monitors \
  -H "Authorization: Bearer gabe_k8x2m..." \
  -H "Content-Type: application/json" \
  -d '{"name":"db-backup","interval_minutes":60,"webhook_url":"https://hooks.slack.com/services/..."}'
# Returns: {"ping_url": "https://gabe.usegabe.workers.dev/ping/a3f8x1"}
```

Then in your crontab:

```
0 * * * * /usr/local/bin/backup.sh && curl -fsS --retry 3 https://gabe.usegabe.workers.dev/ping/a3f8x1
```

If `backup.sh` fails (non-zero exit), the curl never fires, and Gabe alerts your Slack within 2 minutes.

## There's also a CLI

```bash
npm i -g gabe-monitor
gabe signup
gabe create --name db-backup --interval 60
gabe ls
```

## How it works under the hood

The entire thing runs on a single Cloudflare Worker with KV storage. A cron trigger runs every 2 minutes, iterates over all monitors, and checks if any have missed their expected ping window. If they have, it POSTs a JSON payload to the user's webhook URL.

No database. No server. No Docker. Just a Worker and a KV namespace.

Recovery alerts are also built in — when a monitor that was down starts pinging again, you get a "recovered" notification.

## Free tier

- 3 monitors
- 2-minute check intervals
- Webhook alerts (Slack, Discord, or any URL)

Pro is $4/mo for 20 monitors if you need more.

## Self-hosting

It's fully open source. Clone the repo, edit `wrangler.toml`, run `wrangler deploy`. You're done.

```bash
git clone https://github.com/Scolliq/gabe.git
cd gabe
wrangler deploy
```

Runs entirely within Cloudflare's free tier.

---

GitHub: [github.com/Scolliq/gabe](https://github.com/Scolliq/gabe)
Website: [scolliq.github.io/gabe](https://scolliq.github.io/gabe)
npm: [npmjs.com/package/gabe-monitor](https://www.npmjs.com/package/gabe-monitor)

Would love feedback. What features would make this useful for your setup?
