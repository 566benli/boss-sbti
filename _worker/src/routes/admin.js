import { ok, error, readJsonSafe, signJwt, verifyJwt, parseCookies, setCookie } from "../lib/util.js";

const COOKIE = "bosssbti_admin";

/** 导出给 finance.js 等其他路由用。 */
export async function requireAdminAuth(request, env) {
  return requireAdmin(request, env);
}

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

  const usersTotal = await count(`SELECT COUNT(*) AS n FROM users`);
  const users24h = await count(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ?`, d1);
  const users7d = await count(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ?`, d7);

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
      usersTotal, users24h, users7d,
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
    `SELECT o.id AS id, o.session_id AS session_id, o.provider AS provider,
            o.amount_cent AS amount_cent, o.status AS status,
            o.created_at AS created_at, o.paid_at AS paid_at,
            o.user_id AS user_id,
            u.code AS user_code, u.nickname AS user_nickname
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC LIMIT ?`,
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
      userId: r.user_id || null,
      userCode: r.user_code || null,
      userNickname: r.user_nickname || null,
    })),
  });
}

export async function adminSessions(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50) | 0, 200);
  const rows = await env.DB.prepare(
    `SELECT s.id AS id, s.created_at AS created_at, s.completed_at AS completed_at,
            s.main_type AS main_type, s.sub_type AS sub_type,
            s.paid AS paid, s.paid_at AS paid_at,
            s.user_id AS user_id,
            u.code AS user_code, u.nickname AS user_nickname
     FROM sessions s
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC LIMIT ?`,
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
      userId: r.user_id || null,
      userCode: r.user_code || null,
      userNickname: r.user_nickname || null,
    })),
  });
}

/** 用户维度：列出全部账号 + 测试/付款/GMV 统计。 */
export async function adminUsers(request, env) {
  const me = await requireAdmin(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100) | 0, 500);
  const q = (url.searchParams.get("q") || "").trim().toUpperCase();

  let sql = `
    SELECT u.id AS id, u.code AS code, u.nickname AS nickname,
           u.created_at AS created_at, u.last_seen_at AS last_seen_at,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions_count,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.paid = 1) AS paid_count,
           (SELECT COALESCE(SUM(o.amount_cent), 0) FROM orders o
             WHERE o.user_id = u.id AND o.status = 'paid') AS gmv_cent
    FROM users u
  `;
  const args = [];
  if (q) {
    sql += ` WHERE u.code LIKE ? OR UPPER(COALESCE(u.nickname, '')) LIKE ?`;
    args.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY u.created_at DESC LIMIT ?`;
  args.push(limit);

  const rows = await env.DB.prepare(sql).bind(...args).all();
  return ok({
    users: (rows.results || []).map((r) => ({
      id: r.id,
      code: r.code,
      prettyCode: r.code ? `${String(r.code).slice(0, 3)}-${String(r.code).slice(3)}` : null,
      nickname: r.nickname || null,
      createdAt: Number(r.created_at),
      lastSeenAt: r.last_seen_at ? Number(r.last_seen_at) : null,
      sessionsCount: Number(r.sessions_count || 0),
      paidCount: Number(r.paid_count || 0),
      gmvCent: Number(r.gmv_cent || 0),
      gmvYuan: (Number(r.gmv_cent || 0) / 100).toFixed(2),
    })),
  });
}
