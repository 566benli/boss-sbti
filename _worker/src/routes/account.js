/** 账号系统：
 *   - 首次访问 POST /api/account/create → 自动生成账号码 + 下发 cookie
 *   - 想切账号 POST /api/account/login { code, pin? } → 校验后下发 cookie
 *   - POST /api/account/logout → 清 cookie
 *   - GET  /api/account/me → 当前账号 + 最近 20 条已付款报告摘要
 *   - POST /api/account/update { nickname?, pin? } → 改昵称 / 设置或清除 PIN
 *   - POST /api/account/resume { token } → 微信支付回跳时用 rt JWT 换 cookie（解决内置浏览器 cookie 丢失）
 *
 * Cookie：`bosssbti_acct` = HS256 JWT payload { uid, code }；TTL 30 天。
 *
 * 账号码 = 6 位 base32 子集（去除易混 0O1I），分 3-3 展示为 `ABC-123`。每次随机取 3 次避碰。
 */
import {
  ok, error, json, uuid, nowMs, hashIp, sha256Hex,
  signJwt, verifyJwt, parseCookies, setCookie, readJsonSafe,
} from "../lib/util.js";

const COOKIE = "bosssbti_acct";
const COOKIE_TTL_SEC = 30 * 24 * 3600;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* 去除 0O1I */
const CODE_LEN = 6;
const RT_TTL_SEC = 15 * 60; /* 微信回跳 token 有效期 15 分钟 */

function codeSecret(env) {
  return env.ACCT_JWT_SECRET || env.ADMIN_JWT_SECRET || "dev-secret";
}

function randomCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return s;
}

function normalizeCode(raw) {
  if (typeof raw !== "string") return null;
  /* 容错：去掉连字符 / 空格 / 大小写归一 */
  const s = raw.trim().toUpperCase().replace(/[-_\s]+/g, "");
  if (s.length !== CODE_LEN) return null;
  if (!/^[A-Z2-9]+$/.test(s)) return null;
  return s;
}

function prettyCode(code) {
  if (!code) return "";
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

async function hashPin(pin, salt) {
  return sha256Hex(`${salt}:pin:${pin}`);
}

function isValidPin(pin) {
  return typeof pin === "string" && /^[0-9]{4,6}$/.test(pin);
}

async function setAuthCookie(res, user, env) {
  const token = await signJwt(
    { uid: user.id, code: user.code },
    codeSecret(env),
    COOKIE_TTL_SEC,
  );
  res.headers.append("set-cookie", setCookie(COOKIE, token, {
    maxAge: COOKIE_TTL_SEC,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "None",
  }));
  return res;
}

/** 从 cookie 解析出已登录账号。返回 null 表示未登录。 */
export async function requireAccount(request, env) {
  const cookies = parseCookies(request);
  const tok = cookies[COOKIE];
  if (!tok) return null;
  const payload = await verifyJwt(tok, codeSecret(env));
  if (!payload || !payload.uid) return null;
  const row = await env.DB.prepare(
    `SELECT id, code, nickname, pin_hash, created_at FROM users WHERE id = ?`,
  ).bind(payload.uid).first();
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    nickname: row.nickname,
    pinHash: row.pin_hash,
    createdAt: Number(row.created_at),
  };
}

async function loadRecentPaidReports(env, userId, limit = 20) {
  const rows = await env.DB.prepare(
    `SELECT id AS sid, main_type, sub_type, paid_at, completed_at
     FROM sessions
     WHERE user_id = ? AND paid = 1
     ORDER BY paid_at DESC LIMIT ?`,
  ).bind(userId, limit).all();
  return (rows.results || []).map((r) => ({
    sid: r.sid,
    mainType: r.main_type,
    subType: r.sub_type,
    paidAt: r.paid_at ? Number(r.paid_at) : null,
    completedAt: r.completed_at ? Number(r.completed_at) : null,
  }));
}

async function touchLastSeen(env, userId, request) {
  try {
    const ua = (request.headers.get("user-agent") || "").slice(0, 240);
    const ipHash = await hashIp(request, env);
    await env.DB.prepare(
      `UPDATE users SET last_seen_at = ?, ua = ?, ip_hash = ? WHERE id = ?`,
    ).bind(nowMs(), ua, ipHash, userId).run();
  } catch (err) {
    console.warn("touchLastSeen failed", err);
  }
}

/* ------------------------------------------------------------------ */

export async function accountCreate(request, env) {
  const body = (await readJsonSafe(request)) || {};
  const nickname = typeof body.nickname === "string"
    ? body.nickname.trim().slice(0, 32)
    : null;

  /* 随机账号码，重摇避碰；极低概率冲突，最多尝试 5 次。 */
  let code = null;
  for (let i = 0; i < 5; i++) {
    const candidate = randomCode();
    const exists = await env.DB.prepare(`SELECT 1 FROM users WHERE code = ?`)
      .bind(candidate).first();
    if (!exists) { code = candidate; break; }
  }
  if (!code) return error(500, "CODE_COLLISION", "无法生成唯一账号码，请重试");

  const id = uuid();
  const ua = (request.headers.get("user-agent") || "").slice(0, 240);
  const ipHash = await hashIp(request, env);
  const now = nowMs();

  await env.DB.prepare(
    `INSERT INTO users (id, code, nickname, pin_hash, created_at, last_seen_at, ua, ip_hash)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).bind(id, code, nickname || null, now, now, ua, ipHash).run();

  const res = ok({
    user: { id, code, prettyCode: prettyCode(code), nickname: nickname || null, createdAt: now },
    paidReports: [],
    justCreated: true,
  });
  return setAuthCookie(res, { id, code }, env);
}

export async function accountLogin(request, env) {
  const body = await readJsonSafe(request);
  if (!body) return error(400, "BAD_REQUEST", "missing body");
  const code = normalizeCode(body.code);
  if (!code) return error(400, "BAD_CODE", "账号码格式不正确");

  const row = await env.DB.prepare(
    `SELECT id, code, nickname, pin_hash, created_at FROM users WHERE code = ?`,
  ).bind(code).first();
  if (!row) return error(404, "NO_SUCH_ACCOUNT", "账号不存在");

  if (row.pin_hash) {
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!isValidPin(pin)) return error(401, "PIN_REQUIRED", "该账号需要 PIN");
    const given = await hashPin(pin, row.id);
    if (given !== row.pin_hash) return error(401, "BAD_PIN", "PIN 不正确");
  }

  await touchLastSeen(env, row.id, request);
  const paidReports = await loadRecentPaidReports(env, row.id);

  const res = ok({
    user: {
      id: row.id,
      code: row.code,
      prettyCode: prettyCode(row.code),
      nickname: row.nickname,
      createdAt: Number(row.created_at),
    },
    paidReports,
  });
  return setAuthCookie(res, row, env);
}

export async function accountLogout(request, env) {
  const res = ok({ loggedOut: true });
  res.headers.append("set-cookie", setCookie(COOKIE, "", {
    maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "None",
  }));
  return res;
}

export async function accountMe(request, env) {
  const me = await requireAccount(request, env);
  if (!me) return error(401, "UNAUTH", "未登录");
  await touchLastSeen(env, me.id, request);
  const paidReports = await loadRecentPaidReports(env, me.id);
  return ok({
    user: {
      id: me.id,
      code: me.code,
      prettyCode: prettyCode(me.code),
      nickname: me.nickname,
      createdAt: me.createdAt,
      hasPin: !!me.pinHash,
    },
    paidReports,
  });
}

export async function accountUpdate(request, env) {
  const me = await requireAccount(request, env);
  if (!me) return error(401, "UNAUTH", "未登录");
  const body = (await readJsonSafe(request)) || {};

  const updates = [];
  const args = [];

  if ("nickname" in body) {
    const n = typeof body.nickname === "string"
      ? body.nickname.trim().slice(0, 32)
      : null;
    updates.push(`nickname = ?`);
    args.push(n || null);
  }
  if ("pin" in body) {
    const pin = body.pin;
    if (pin == null || pin === "") {
      updates.push(`pin_hash = NULL`);
    } else if (isValidPin(pin)) {
      const h = await hashPin(pin, me.id);
      updates.push(`pin_hash = ?`);
      args.push(h);
    } else {
      return error(400, "BAD_PIN", "PIN 必须是 4-6 位数字，或传空清除");
    }
  }

  if (!updates.length) return ok({ updated: false });
  args.push(me.id);
  await env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
  ).bind(...args).run();

  return ok({ updated: true });
}

/** 支付回跳时前端携带 rt token 调此接口换回 cookie（内置浏览器 cookie 隔离兜底）。 */
export async function accountResume(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.token) return error(400, "BAD_REQUEST", "missing token");
  const payload = await verifyJwt(body.token, codeSecret(env));
  if (!payload || !payload.uid || payload.purpose !== "resume") {
    return error(401, "BAD_TOKEN", "token 无效或已过期");
  }
  const row = await env.DB.prepare(
    `SELECT id, code, nickname FROM users WHERE id = ?`,
  ).bind(payload.uid).first();
  if (!row) return error(404, "NO_SUCH_ACCOUNT", "账号不存在");

  await touchLastSeen(env, row.id, request);
  const res = ok({
    user: {
      id: row.id,
      code: row.code,
      prettyCode: prettyCode(row.code),
      nickname: row.nickname,
    },
    sid: payload.sid || null,
  });
  return setAuthCookie(res, row, env);
}

/** 给 pay.js 用：为当前账号 + 当前 sid 签一个 15 分钟 rt token。 */
export async function signResumeToken(user, sid, env) {
  return signJwt(
    { uid: user.id, sid, purpose: "resume" },
    codeSecret(env),
    RT_TTL_SEC,
  );
}

export { prettyCode };
