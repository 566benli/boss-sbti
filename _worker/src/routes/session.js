import { json, ok, error, uuid, nowMs, hashIp, readJsonSafe } from "../lib/util.js";
import { requireAccount } from "./account.js";

/** 读取 session 并在有 user_id 时校验归属。返回 { row, unauth, forbidden }。
 *  - 老数据 user_id 为 NULL：向后兼容，允许任意访问
 *  - 新数据 + 匿名访问：unauth → 前端引导登录
 *  - 新数据 + 已登录但非本人：forbidden → 前端引导切账号
 */
async function loadOwnedSession(env, sid, me) {
  const row = await env.DB.prepare(
    `SELECT id, user_id, completed_at, paid, paid_at,
            main_type, sub_type, dim_e, dim_c, dim_t, dim_m
     FROM sessions WHERE id = ?`,
  ).bind(sid).first();
  if (!row) return { row: null };
  if (row.user_id) {
    if (!me) return { row, unauth: true };
    if (me.id !== row.user_id) return { row, forbidden: true };
  }
  return { row };
}

export async function startSession(request, env) {
  const me = await requireAccount(request, env);
  if (!me) return error(401, "UNAUTH", "请先登录账号再开始鉴定");

  const sid = uuid();
  const ua = (request.headers.get("user-agent") || "").slice(0, 240);
  const ipHash = await hashIp(request, env);
  await env.DB.prepare(
    `INSERT INTO sessions (id, created_at, ua, ip_hash, paid, user_id)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).bind(sid, nowMs(), ua, ipHash, me.id).run();
  return ok({ sid, userCode: me.code });
}

/** 提交完成的问卷：落库最终人格与四维 + 原始作答序列。 */
export async function finishSession(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.sid) return error(400, "BAD_REQUEST", "missing sid");
  const { sid, mainType, subType, dim, answers } = body;
  if (!mainType) return error(400, "BAD_REQUEST", "missing mainType");

  const me = await requireAccount(request, env);
  const { row, unauth, forbidden } = await loadOwnedSession(env, sid, me);
  if (!row) return error(404, "NOT_FOUND", "session not found");
  if (unauth) return error(401, "UNAUTH", "请先登录账号");
  if (forbidden) return error(403, "FORBIDDEN", "该鉴定不属于当前账号");

  const e = Number(dim?.E || 0) | 0;
  const c = Number(dim?.C || 0) | 0;
  const t = Number(dim?.T || 0) | 0;
  const m = Number(dim?.M || 0) | 0;
  const answersJson = JSON.stringify(Array.isArray(answers) ? answers.slice(0, 80) : []);

  await env.DB.prepare(
    `UPDATE sessions
     SET completed_at = ?, main_type = ?, sub_type = ?, dim_e = ?, dim_c = ?, dim_t = ?, dim_m = ?, answers_json = ?
     WHERE id = ?`,
  ).bind(nowMs(), mainType, subType || null, e, c, t, m, answersJson, sid).run();

  return ok({ sid });
}

/** 锁壳预览：只返回 code/name/image + 四维、是否已付费。 */
export async function reportPreview(request, env) {
  const url = new URL(request.url);
  const sid = url.searchParams.get("sid");
  if (!sid) return error(400, "BAD_REQUEST", "missing sid");

  const me = await requireAccount(request, env);
  const { row, unauth, forbidden } = await loadOwnedSession(env, sid, me);
  if (!row) return error(404, "NOT_FOUND", "session not found");
  if (unauth) return error(401, "UNAUTH", "请先登录账号");
  if (forbidden) return error(403, "FORBIDDEN", "该鉴定不属于当前账号");
  if (!row.completed_at) return error(409, "NOT_COMPLETED", "session not finished yet");
  return ok({
    sid,
    mainType: row.main_type,
    subType: row.sub_type,
    dim: { E: row.dim_e, C: row.dim_c, T: row.dim_t, M: row.dim_m },
    paid: !!row.paid,
    priceCent: Number(env.PRICE_CENT || 99),
  });
}

/** 付费用户才能调：返回完整报告 JSON（前端用这份数据渲染 report.html）。 */
export async function reportFull(request, env) {
  const url = new URL(request.url);
  const sid = url.searchParams.get("sid");
  if (!sid) return error(400, "BAD_REQUEST", "missing sid");

  const me = await requireAccount(request, env);
  const { row, unauth, forbidden } = await loadOwnedSession(env, sid, me);
  if (!row) return error(404, "NOT_FOUND", "session not found");
  if (unauth) return error(401, "UNAUTH", "请先登录账号");
  if (forbidden) return error(403, "FORBIDDEN", "该鉴定不属于当前账号");
  if (!row.completed_at) return error(409, "NOT_COMPLETED", "session not finished yet");
  if (!row.paid) return error(402, "PAYMENT_REQUIRED", "unlock the full report first");
  return ok({
    sid,
    mainType: row.main_type,
    subType: row.sub_type,
    dim: { E: row.dim_e, C: row.dim_c, T: row.dim_t, M: row.dim_m },
    paid: true,
    unlockedAt: Date.now(),
  });
}
