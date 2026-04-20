import { ok, error, readJsonSafe, signJwt, verifyJwt, parseCookies, setCookie } from "../lib/util.js";

const COOKIE = "bosssbti_admin";

async function requireAdmin(request, env) {
  const cookies = parseCookies(request);
  const tok = cookies[COOKIE];
  if (!tok) return null;
  const payload = await verifyJwt(tok, env.ADMIN_JWT_SECRET || "dev-secret");
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

export async function adminLogin(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.password) return error(400, "BAD_REQUEST", "missing password");
  const expect = env.ADMIN_PASSWORD || "";
  if (!expect) return error(500, "NO_ADMIN_PASSWORD", "ADMIN_PASSWORD secret is empty");
  if (body.password !== expect) return error(401, "BAD_CREDENTIALS", "wrong password");

  const token = await signJwt({ role: "admin" }, env.ADMIN_JWT_SECRET || "dev-secret", 7200);
  const cookie = setCookie(COOKIE, token, {
    maxAge: 7200, path: "/", httpOnly: true, secure: true, sameSite: "None",
  });
  const res = ok({ loggedIn: true });
  res.headers.append("set-cookie", cookie);
  return res;
}

export async function adminLogout(request, env) {
  const res = ok({ loggedOut: true });
  res.headers.append("set-cookie", setCookie(COOKIE, "", {
    maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "None",
  }));
  return res;
}

export async function adminMe(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");
  return ok({ role: me.role, exp: me.exp });
}

export async function adminStats(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const DAY = 86400 * 1000;
  const now = Date.now();
  const d1 = now - DAY;
  const d7 = now - 7 * DAY;
  const d30 = now - 30 * DAY;

  const count = async (sql, ...args) => {
    const row = await env.DB.prepare(sql).bind(...args).first();
    return Number(row?.n || 0);
  };

  const started = await count(`SELECT COUNT(*) AS n FROM sessions`);
  const completed = await count(`SELECT COUNT(*) AS n FROM sessions WHERE completed_at IS NOT NULL`);
  const paid = await count(`SELECT COUNT(*) AS n FROM sessions WHERE paid = 1`);
  const started24h = await count(`SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?`, d1);
  const completed24h = await count(`SELECT COUNT(*) AS n FROM sessions WHERE completed_at >= ?`, d1);
  const paid24h = await count(`SELECT COUNT(*) AS n FROM sessions WHERE paid_at >= ?`, d1);

  const gmvRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cent), 0) AS cents FROM orders WHERE status = 'paid'`,
  ).first();
  const gmvCent = Number(gmvRow?.cents || 0);

  const shareRows = await env.DB.prepare(
    `SELECT platform, COUNT(*) AS n FROM share_events GROUP BY platform ORDER BY n DESC`,
  ).all();
  const sharesByPlatform = (shareRows.results || []).map((r) => ({
    platform: r.platform, count: Number(r.n),
  }));
  const sharesTotal = sharesByPlatform.reduce((s, x) => s + x.count, 0);

  const typeRows = await env.DB.prepare(
    `SELECT main_type AS t, COUNT(*) AS n FROM sessions
     WHERE main_type IS NOT NULL GROUP BY main_type ORDER BY n DESC`,
  ).all();
  const typeDistribution = (typeRows.results || []).map((r) => ({
    type: r.t, count: Number(r.n),
  }));

  /* 30 天每日趋势：完成 vs 付费 */
  const trendRows = await env.DB.prepare(
    `SELECT
       strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) AS d,
       COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) AS c,
       COUNT(CASE WHEN paid = 1 THEN 1 END) AS p
     FROM sessions
     WHERE created_at >= ?
     GROUP BY d ORDER BY d ASC`,
  ).bind(d30).all();
  const trend = (trendRows.results || []).map((r) => ({
    date: r.d, completed: Number(r.c), paid: Number(r.p),
  }));

  return ok({
    kpi: {
      started, completed, paid,
      started24h, completed24h, paid24h,
      gmvCent, gmvYuan: (gmvCent / 100).toFixed(2),
      convFinish: started ? (completed / started) : 0,
      convPay: completed ? (paid / completed) : 0,
      sharesTotal,
    },
    trend,
    typeDistribution,
    sharesByPlatform,
    generatedAt: now,
    paymentMode: env.PAYMENT_MODE || "mock",
  });
}

export async function adminOrders(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50) | 0, 200);
  const rows = await env.DB.prepare(
    `SELECT id, session_id, provider, amount_cent, status, created_at, paid_at
     FROM orders ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all();
  return ok({
    orders: (rows.results || []).map((r) => ({
      id: r.id,
      sid: r.session_id,
      provider: r.provider,
      amountCent: Number(r.amount_cent),
      status: r.status,
      createdAt: Number(r.created_at),
      paidAt: r.paid_at ? Number(r.paid_at) : null,
    })),
  });
}

export async function adminSessions(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50) | 0, 200);
  const rows = await env.DB.prepare(
    `SELECT id, created_at, completed_at, main_type, sub_type, paid, paid_at
     FROM sessions ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all();
  return ok({
    sessions: (rows.results || []).map((r) => ({
      sid: r.id,
      createdAt: Number(r.created_at),
      completedAt: r.completed_at ? Number(r.completed_at) : null,
      mainType: r.main_type,
      subType: r.sub_type,
      paid: !!r.paid,
      paidAt: r.paid_at ? Number(r.paid_at) : null,
    })),
  });
}
