import { json, ok, error, uuid, nowMs, hashIp, readJsonSafe } from "../lib/util.js";

export async function startSession(request, env) {
  const sid = uuid();
  const ua = (request.headers.get("user-agent") || "").slice(0, 240);
  const ipHash = await hashIp(request, env);
  await env.DB.prepare(
    `INSERT INTO sessions (id, created_at, ua, ip_hash, paid) VALUES (?, ?, ?, ?, 0)`,
  ).bind(sid, nowMs(), ua, ipHash).run();
  return ok({ sid });
}

/** 提交完成的问卷：落库最终人格与四维 + 原始作答序列。 */
export async function finishSession(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.sid) return error(400, "BAD_REQUEST", "missing sid");
  const { sid, mainType, subType, dim, answers } = body;
  if (!mainType) return error(400, "BAD_REQUEST", "missing mainType");

  const row = await env.DB.prepare(`SELECT id, completed_at FROM sessions WHERE id = ?`)
    .bind(sid).first();
  if (!row) return error(404, "NOT_FOUND", "session not found");

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
  const row = await env.DB.prepare(
    `SELECT main_type, sub_type, dim_e, dim_c, dim_t, dim_m, paid, completed_at
     FROM sessions WHERE id = ?`,
  ).bind(sid).first();
  if (!row) return error(404, "NOT_FOUND", "session not found");
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
  const row = await env.DB.prepare(
    `SELECT main_type, sub_type, dim_e, dim_c, dim_t, dim_m, paid, completed_at
     FROM sessions WHERE id = ?`,
  ).bind(sid).first();
  if (!row) return error(404, "NOT_FOUND", "session not found");
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
