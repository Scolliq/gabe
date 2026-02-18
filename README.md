# gabe

[![npm version](https://img.shields.io/npm/v/gabe-monitor)](https://www.npmjs.com/package/gabe-monitor)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020)](https://workers.cloudflare.com)

Lightweight cron job monitoring. Get alerted when scheduled jobs fail silently.

**[Website](https://scolliq.github.io/gabe)** &middot; **[API](https://gabe.usegabe.workers.dev)** &middot; **[npm](https://www.npmjs.com/package/gabe-monitor)**

---

## What it does

Gabe watches your cron jobs. You add a single `curl` to the end of each job. If the curl stops arriving on schedule, Gabe sends an alert to your webhook (Slack, Discord, or any URL).

No agents to install. No SDK. Just HTTP.

## Quick start

```bash
# 1. Create an account
curl -X POST https://gabe.usegabe.workers.dev/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'

# 2. Create a monitor (alerts via Slack webhook)
curl -X POST https://gabe.usegabe.workers.dev/api/monitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"name":"db-backup","interval_minutes":60,"webhook_url":"https://hooks.slack.com/services/..."}'

# 3. Add the ping to your crontab
0 * * * * /usr/local/bin/backup.sh && curl -fsS --retry 3 https://gabe.usegabe.workers.dev/ping/YOUR_MONITOR_ID
```

That's it. If `backup.sh` fails or the machine goes down, the curl never fires, and Gabe alerts your Slack within minutes.

## API

Base URL: `https://gabe.usegabe.workers.dev`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signup` | Create an account. Body: `{"email":"..."}` |
| POST | `/api/login` | Retrieve your API key. Body: `{"email":"..."}` |
| POST | `/api/monitors` | Create a monitor. Body: `{"name":"...","interval_minutes":60}` |
| GET | `/api/monitors` | List all your monitors. |
| DELETE | `/api/monitors/:id` | Delete a monitor. |
| GET/POST | `/ping/:id` | Send a heartbeat. No auth required. |

### Creating a monitor

```bash
curl -X POST https://gabe.usegabe.workers.dev/api/monitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "name": "nightly-report",
    "interval_minutes": 1440,
    "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx"
  }'
```

The `webhook_url` is optional. When a monitor goes down or recovers, Gabe POSTs a JSON payload to your webhook:

```json
{
  "monitor_id": "a3f8x1",
  "monitor_name": "nightly-report",
  "status": "down",
  "minutes_late": 47,
  "message": "\"nightly-report\" hasn't checked in for 47 minutes. Expected every 1440 minutes.",
  "timestamp": "2026-02-18T12:00:00.000Z"
}
```

## Pricing

| | Free | Pro ($4/mo) |
|---|---|---|
| Monitors | 3 | 20 |
| Check interval | 2 min | 1 min |
| Webhook alerts | Yes | Yes |
| Email alerts | - | Yes |

[Upgrade to Pro](https://buy.stripe.com/6oU9AMd7e02C8PF0LIdUY00)

## Self-hosting

Gabe runs on Cloudflare Workers. To self-host:

```bash
git clone https://github.com/Scolliq/gabe.git
cd gabe
# Edit wrangler.toml with your account details
wrangler deploy
```

Requires a Cloudflare account (free tier works).

## License

MIT
