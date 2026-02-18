export default {
  // Handle HTTP requests (pings + API)
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return json(null, cors, 204);
    }

    // ---- PING ENDPOINTS (no auth needed) ----

    // GET/POST /ping/:id — the heartbeat ping
    const pingMatch = url.pathname.match(/^\/ping\/([a-zA-Z0-9_-]+)$/);
    if (pingMatch) {
      return handlePing(pingMatch[1], env, cors);
    }

    // ---- PUBLIC ----
    if (url.pathname === "/" || url.pathname === "") {
      return json({
        name: "Gabe",
        tagline: "Dead simple cron monitoring. Know when your jobs fail.",
        docs: "https://scolliq.github.io/gabe",
      }, cors);
    }

    // ---- AUTH REQUIRED API ----
    const authResult = await authenticate(request, env);

    // POST /api/signup — create account
    if (url.pathname === "/api/signup" && request.method === "POST") {
      return handleSignup(request, env, cors);
    }

    // POST /api/login — get API key by email
    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env, cors);
    }

    // Everything below requires auth
    if (!authResult) {
      return json({ error: "Missing or invalid API key." }, cors, 401);
    }

    // GET /api/monitors — list all monitors
    if (url.pathname === "/api/monitors" && request.method === "GET") {
      return handleListMonitors(authResult, env, cors);
    }

    // POST /api/monitors — create a monitor
    if (url.pathname === "/api/monitors" && request.method === "POST") {
      return handleCreateMonitor(request, authResult, env, cors);
    }

    // DELETE /api/monitors/:id
    const deleteMatch = url.pathname.match(/^\/api\/monitors\/([a-zA-Z0-9_-]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      return handleDeleteMonitor(deleteMatch[1], authResult, env, cors);
    }

    // GET /api/account
    if (url.pathname === "/api/account" && request.method === "GET") {
      return json({ user: authResult }, cors);
    }

    return json({ error: "Not found." }, cors, 404);
  },

  // Cron trigger — runs every 2 minutes, checks all monitors
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAllMonitors(env));
  },
};

// ---- PING HANDLER ----
async function handlePing(monitorId, env, cors) {
  const monitorData = await env.KV.get(`monitor:${monitorId}`);
  if (!monitorData) {
    return json({ error: "Unknown monitor ID." }, cors, 404);
  }

  const monitor = JSON.parse(monitorData);
  const wasDown = monitor.status === "down";
  const now = Date.now();

  monitor.last_ping = now;
  monitor.status = "up";
  monitor.total_pings = (monitor.total_pings || 0) + 1;

  await env.KV.put(`monitor:${monitorId}`, JSON.stringify(monitor));

  // Send recovery webhook if it was down
  if (wasDown) {
    await sendRecovery(monitor, { KV: env.KV });
  }

  return json({ ok: true, monitor: monitor.name, received: new Date(now).toISOString() }, cors);
}

// ---- AUTH ----
async function authenticate(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;

  const apiKey = auth.slice(7);
  const userData = await env.KV.get(`apikey:${apiKey}`);
  if (!userData) return null;

  return JSON.parse(userData);
}

// ---- SIGNUP ----
async function handleSignup(request, env, cors) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Send JSON with 'email'." }, cors, 400);
  }

  const { email } = body;
  if (!email || !email.includes("@")) {
    return json({ error: "Valid email required." }, cors, 400);
  }

  // Check if already exists
  const existing = await env.KV.get(`user:${email}`);
  if (existing) {
    return json({ error: "Account already exists. Use /api/login." }, cors, 409);
  }

  // Generate API key
  const apiKey = "gabe_" + crypto.randomUUID().replace(/-/g, "");

  const user = {
    email,
    apiKey,
    plan: "free",
    monitor_limit: 3,
    created: Date.now(),
  };

  // Store user by email and API key
  await env.KV.put(`user:${email}`, JSON.stringify(user));
  await env.KV.put(`apikey:${apiKey}`, JSON.stringify(user));
  await env.KV.put(`monitors:${email}`, JSON.stringify([]));

  return json({
    message: "Account created!",
    api_key: apiKey,
    plan: "free",
    monitor_limit: 3,
    tip: "Save your API key — you'll need it for all requests.",
  }, cors, 201);
}

// ---- LOGIN ----
async function handleLogin(request, env, cors) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Send JSON with 'email'." }, cors, 400);
  }

  const { email } = body;
  const userData = await env.KV.get(`user:${email}`);
  if (!userData) {
    return json({ error: "No account with that email. Use /api/signup." }, cors, 404);
  }

  const user = JSON.parse(userData);
  return json({ api_key: user.apiKey, plan: user.plan }, cors);
}

// ---- CREATE MONITOR ----
async function handleCreateMonitor(request, authResult, env, cors) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Send JSON." }, cors, 400);
  }

  const { name, interval_minutes, alert_email, webhook_url } = body;

  if (!name) return json({ error: "'name' required." }, cors, 400);
  if (!interval_minutes || interval_minutes < 1) {
    return json({ error: "'interval_minutes' required (minimum 1)." }, cors, 400);
  }
  if (webhook_url && !webhook_url.startsWith("http")) {
    return json({ error: "'webhook_url' must be a valid URL." }, cors, 400);
  }

  // Check monitor limit
  const monitorListData = await env.KV.get(`monitors:${authResult.email}`);
  const monitorList = monitorListData ? JSON.parse(monitorListData) : [];

  if (monitorList.length >= authResult.monitor_limit) {
    return json({
      error: `Monitor limit reached (${authResult.monitor_limit}). Upgrade for more.`,
    }, cors, 403);
  }

  // Generate monitor
  const monitorId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const monitor = {
    id: monitorId,
    name,
    interval_minutes: Number(interval_minutes),
    alert_email: alert_email || authResult.email,
    webhook_url: webhook_url || null,
    owner: authResult.email,
    status: "waiting",
    last_ping: null,
    last_alert: null,
    total_pings: 0,
    created: Date.now(),
  };

  await env.KV.put(`monitor:${monitorId}`, JSON.stringify(monitor));

  monitorList.push(monitorId);
  await env.KV.put(`monitors:${authResult.email}`, JSON.stringify(monitorList));

  return json({
    message: "Monitor created!",
    monitor: {
      id: monitorId,
      name,
      ping_url: `https://gabe.usegabe.workers.dev/ping/${monitorId}`,
      interval: `every ${interval_minutes} minutes`,
      alerts_to: monitor.alert_email,
    },
    usage: `Add this to your cron job:\n  curl -fsS --retry 3 https://gabe.usegabe.workers.dev/ping/${monitorId}`,
  }, cors, 201);
}

// ---- LIST MONITORS ----
async function handleListMonitors(authResult, env, cors) {
  const monitorListData = await env.KV.get(`monitors:${authResult.email}`);
  const monitorIds = monitorListData ? JSON.parse(monitorListData) : [];

  const monitors = [];
  for (const id of monitorIds) {
    const data = await env.KV.get(`monitor:${id}`);
    if (data) {
      const m = JSON.parse(data);
      monitors.push({
        id: m.id,
        name: m.name,
        status: m.status,
        ping_url: `https://gabe.usegabe.workers.dev/ping/${m.id}`,
        interval_minutes: m.interval_minutes,
        last_ping: m.last_ping ? new Date(m.last_ping).toISOString() : null,
        total_pings: m.total_pings,
      });
    }
  }

  return json({ monitors, count: monitors.length, limit: authResult.monitor_limit }, cors);
}

// ---- DELETE MONITOR ----
async function handleDeleteMonitor(monitorId, authResult, env, cors) {
  const monitorData = await env.KV.get(`monitor:${monitorId}`);
  if (!monitorData) return json({ error: "Monitor not found." }, cors, 404);

  const monitor = JSON.parse(monitorData);
  if (monitor.owner !== authResult.email) {
    return json({ error: "Not your monitor." }, cors, 403);
  }

  await env.KV.delete(`monitor:${monitorId}`);

  // Remove from user's list
  const listData = await env.KV.get(`monitors:${authResult.email}`);
  const list = listData ? JSON.parse(listData) : [];
  const updated = list.filter((id) => id !== monitorId);
  await env.KV.put(`monitors:${authResult.email}`, JSON.stringify(updated));

  return json({ message: `Monitor "${monitor.name}" deleted.` }, cors);
}

// ---- CRON: CHECK ALL MONITORS ----
async function checkAllMonitors(env) {
  // List all monitor keys
  const allMonitors = await env.KV.list({ prefix: "monitor:" });
  const now = Date.now();

  for (const key of allMonitors.keys) {
    const data = await env.KV.get(key.name);
    if (!data) continue;

    const monitor = JSON.parse(data);

    // Skip monitors that haven't pinged yet
    if (!monitor.last_ping || monitor.status === "waiting") continue;

    const elapsed = now - monitor.last_ping;
    const expectedMs = monitor.interval_minutes * 60 * 1000;

    // Add 30-second grace period
    if (elapsed > expectedMs + 30000) {
      // It's late!
      if (monitor.status !== "down") {
        monitor.status = "down";

        // Don't alert more than once per hour
        const lastAlert = monitor.last_alert || 0;
        if (now - lastAlert > 3600000) {
          monitor.last_alert = now;
          await sendAlert(monitor, elapsed, env);
        }

        await env.KV.put(key.name, JSON.stringify(monitor));
      }
    }
  }
}

// ---- SEND ALERT ----
async function sendAlert(monitor, elapsedMs, env) {
  const minutesLate = Math.round(elapsedMs / 60000);

  const alert = {
    monitor_id: monitor.id,
    monitor_name: monitor.name,
    status: "down",
    minutes_late: minutesLate,
    expected_interval: monitor.interval_minutes,
    message: `"${monitor.name}" hasn't checked in for ${minutesLate} minutes. Expected every ${monitor.interval_minutes} minutes.`,
    timestamp: new Date().toISOString(),
  };

  // Store alert in KV
  await env.KV.put(
    `alert:${monitor.id}:${Date.now()}`,
    JSON.stringify(alert),
    { expirationTtl: 86400 * 7 }
  );

  // Send webhook if configured
  if (monitor.webhook_url) {
    try {
      await fetch(monitor.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
      });
    } catch (e) {
      console.log(`Webhook failed for ${monitor.id}: ${e.message}`);
    }
  }
}

// ---- RECOVERY ALERT (when a monitor comes back up) ----
async function sendRecovery(monitor, env) {
  const recovery = {
    monitor_id: monitor.id,
    monitor_name: monitor.name,
    status: "up",
    message: `"${monitor.name}" is back online.`,
    timestamp: new Date().toISOString(),
  };

  if (monitor.webhook_url) {
    try {
      await fetch(monitor.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recovery),
      });
    } catch (e) {
      console.log(`Recovery webhook failed for ${monitor.id}: ${e.message}`);
    }
  }
}

// ---- HELPERS ----
function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
