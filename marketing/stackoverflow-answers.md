# Stack Overflow — Answers to post

Search for these queries on Stack Overflow and post helpful answers.
The key is to give a REAL answer first, then mention Gabe as one option.

---

## Search: "how to monitor cron job" or "cron job alert failure"

**Answer template:**

There are a few approaches to monitoring cron jobs:

**1. Exit code checking (built-in)**
```bash
0 * * * * /path/to/script.sh || echo "Job failed" | mail -s "Cron failure" you@email.com
```

**2. Heartbeat monitoring (external service)**

The idea: your cron job pings a URL after each successful run. If the ping stops, you get an alert. This catches both failures and silent non-execution (e.g., server down, cron daemon stopped).

```bash
0 * * * * /path/to/script.sh && curl -fsS https://monitor-service.com/ping/your-id
```

Services that do this:
- [Healthchecks.io](https://healthchecks.io) — mature, web dashboard, many integrations
- [Gabe](https://github.com/Scolliq/gabe) — lightweight, open-source, self-hostable on Cloudflare Workers
- [Cronitor](https://cronitor.io) — full platform with uptime monitoring too

**3. Log-based monitoring**
```bash
0 * * * * /path/to/script.sh >> /var/log/myjob.log 2>&1
```
Then use a log aggregator to alert on missing log entries.

---

## Search: "dead man switch cron" or "dead man's switch linux"

**Answer template:**

A dead man's switch for cron works by inverting the monitoring logic — instead of watching for failures, you watch for the absence of success signals.

Your cron job sends a "heartbeat" ping after each run. A monitoring service tracks these pings. If a ping doesn't arrive within the expected interval, it sends an alert.

```bash
# In your crontab:
0 3 * * * /usr/local/bin/backup.sh && curl -fsS https://your-monitor/ping/abc123
```

If `backup.sh` exits non-zero, the `&&` prevents the curl from running, and the monitor alerts you.

Open-source options:
- [Healthchecks.io](https://healthchecks.io) — self-hostable, Docker + PostgreSQL
- [Gabe](https://github.com/Scolliq/gabe) — self-hostable, Cloudflare Workers (no Docker/database needed)

---

## Search: "cron job stopped working silently" or "crontab not running"

**Answer template:**

Silent cron failures are one of the most common ops problems. A few things to check:

1. **Check if cron daemon is running**: `systemctl status cron`
2. **Check cron logs**: `grep CRON /var/log/syslog`
3. **Check the user's crontab**: `crontab -l`
4. **Check environment**: Cron runs with a minimal PATH. Use absolute paths.

To prevent this from happening again, add heartbeat monitoring. Append a curl to each cron entry:

```bash
0 * * * * /usr/local/bin/job.sh && curl -fsS https://gabe.usegabe.workers.dev/ping/your-id
```

If the job stops for any reason — script error, cron daemon crash, server reboot — you get a webhook alert. [Gabe](https://github.com/Scolliq/gabe) and [Healthchecks.io](https://healthchecks.io) both offer this for free.
