#!/usr/bin/env node

const API = "https://gabe.usegabe.workers.dev";
const fs = require("fs");
const path = require("path");
const https = require("https");

const CONFIG_DIR = path.join(require("os").homedir(), ".gabe");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const args = process.argv.slice(2);
const cmd = args[0];

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const config = loadConfig();
    if (config.api_key) {
      options.headers["Authorization"] = `Bearer ${config.api_key}`;
    }
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  switch (cmd) {
    case "signup": {
      const email = args[1];
      if (!email) return console.log("Usage: gabe signup <email>");
      const res = await request("POST", "/api/signup", { email });
      if (res.error) return console.log("Error:", res.error);
      saveConfig({ api_key: res.api_key, email });
      console.log("Account created. API key saved to ~/.gabe/config.json");
      console.log("API key:", res.api_key);
      break;
    }

    case "login": {
      const email = args[1];
      if (!email) return console.log("Usage: gabe login <email>");
      const res = await request("POST", "/api/login", { email });
      if (res.error) return console.log("Error:", res.error);
      saveConfig({ api_key: res.api_key, email });
      console.log("Logged in. API key saved.");
      break;
    }

    case "create": {
      const name = args[1];
      const interval = parseInt(args[2]);
      const webhook = args[3];
      if (!name || !interval) {
        return console.log("Usage: gabe create <name> <interval_minutes> [webhook_url]");
      }
      const body = { name, interval_minutes: interval };
      if (webhook) body.webhook_url = webhook;
      const res = await request("POST", "/api/monitors", body);
      if (res.error) return console.log("Error:", res.error);
      console.log(`Monitor "${name}" created.`);
      console.log(`Ping URL: ${res.monitor.ping_url}`);
      console.log(`\nAdd to your crontab:`);
      console.log(`  curl -fsS --retry 3 ${res.monitor.ping_url}`);
      break;
    }

    case "list":
    case "ls": {
      const res = await request("GET", "/api/monitors");
      if (res.error) return console.log("Error:", res.error);
      if (res.monitors.length === 0) {
        return console.log("No monitors yet. Run: gabe create <name> <interval_minutes>");
      }
      console.log(`Monitors (${res.count}/${res.limit}):\n`);
      for (const m of res.monitors) {
        const status = m.status === "up" ? "\x1b[32mup\x1b[0m" :
                       m.status === "down" ? "\x1b[31mdown\x1b[0m" :
                       "\x1b[33mwaiting\x1b[0m";
        const ping = m.last_ping ? timeSince(new Date(m.last_ping)) : "never";
        console.log(`  ${status}  ${m.name.padEnd(24)} last ping: ${ping}`);
        console.log(`       ${m.ping_url}`);
      }
      break;
    }

    case "rm":
    case "delete": {
      const id = args[1];
      if (!id) return console.log("Usage: gabe rm <monitor_id>");
      const res = await request("DELETE", `/api/monitors/${id}`);
      if (res.error) return console.log("Error:", res.error);
      console.log(res.message);
      break;
    }

    default:
      console.log(`
  gabe - Lightweight cron job monitoring
  https://scolliq.github.io/gabe

  Commands:
    gabe signup <email>                          Create an account
    gabe login <email>                           Log in to existing account
    gabe create <name> <minutes> [webhook_url]   Create a monitor
    gabe list                                    List all monitors
    gabe rm <monitor_id>                         Delete a monitor

  Example:
    gabe signup dev@company.com
    gabe create db-backup 60 https://hooks.slack.com/...
    gabe list
`);
  }
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

main().catch((e) => console.log("Error:", e.message));
