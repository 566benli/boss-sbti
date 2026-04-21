/** 财务面板：估算虎皮椒钱包余额 + 管理员手工录入提现记录。
 *
 * 余额估算公式：
 *   gross_paid        = SUM(orders.amount_cent WHERE status='paid')
 *   provider_fee_est  = gross_paid * FEE_PCT_DEFAULT / 100
 *   net_earned        = gross_paid - provider_fee_est
 *   total_withdrawn   = SUM(withdrawals.gross_cent)
 *   estimated_balance = net_earned - total_withdrawn
 *
 * FEE_PCT_DEFAULT 可通过 env.XUNHUPAY_FEE_PCT 覆盖；未设置默认 0.38（微信渠道费率）。
 */

import { ok, error, readJsonSafe, nowMs } from "../lib/util.js";
import { requireAdminAuth } from "./admin.js";

export async function financeSummary(request, env) {
  const me = await requireAdminAuth(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const feePct = Number(env.XUNHUPAY_FEE_PCT || "0.38");

  const paidRow = await env.DB.prepare(
    `SELECT
       COUNT(*) AS n,
       COALESCE(SUM(amount_cent), 0) AS total
     FROM orders WHERE status = 'paid'`,
  ).first();
  const paidCount = Number(paidRow?.n || 0);
  const grossPaidCent = Number(paidRow?.total || 0);

  const wRow = await env.DB.prepare(
    `SELECT
       COUNT(*) AS n,
       COALESCE(SUM(gross_cent), 0) AS gross,
       COALESCE(SUM(fee_cent), 0) AS fee,
       COALESCE(SUM(net_cent), 0) AS net
     FROM withdrawals`,
  ).first();
  const withdrawCount = Number(wRow?.n || 0);
  const totalWithdrawnGrossCent = Number(wRow?.gross || 0);
  const totalWithdrawFeeCent = Number(wRow?.fee || 0);
  const totalWithdrawnNetCent = Number(wRow?.net || 0);

  const providerFeeEstCent = Math.round(grossPaidCent * feePct / 100);
  const netEarnedCent = grossPaidCent - providerFeeEstCent;
  const estimatedBalanceCent = netEarnedCent - totalWithdrawnGrossCent;

  const DAY = 86400 * 1000;
  const now = Date.now();
  const month0 = now - 30 * DAY;
  const week0 = now - 7 * DAY;

  const monthRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cent), 0) AS c
     FROM orders WHERE status='paid' AND paid_at >= ?`,
  ).bind(month0).first();
  const weekRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cent), 0) AS c
     FROM orders WHERE status='paid' AND paid_at >= ?`,
  ).bind(week0).first();

  const rcntRows = await env.DB.prepare(
    `SELECT id, gross_cent, net_cent, fee_cent, ref_no, notes, withdrawn_at, created_at
     FROM withdrawals
     ORDER BY withdrawn_at DESC
     LIMIT 50`,
  ).all();
  const recent = (rcntRows.results || []).map((r) => ({
    id: Number(r.id),
    grossCent: Number(r.gross_cent),
    netCent: r.net_cent != null ? Number(r.net_cent) : null,
    feeCent: r.fee_cent != null ? Number(r.fee_cent) : null,
    refNo: r.ref_no || null,
    notes: r.notes || null,
    withdrawnAt: Number(r.withdrawn_at),
    createdAt: Number(r.created_at),
  }));

  return ok({
    feePct,
    paidCount,
    grossPaidCent,
    grossPaidYuan: (grossPaidCent / 100).toFixed(2),
    providerFeeEstCent,
    providerFeeEstYuan: (providerFeeEstCent / 100).toFixed(2),
    netEarnedCent,
    netEarnedYuan: (netEarnedCent / 100).toFixed(2),
    withdrawCount,
    totalWithdrawnGrossCent,
    totalWithdrawnGrossYuan: (totalWithdrawnGrossCent / 100).toFixed(2),
    totalWithdrawnNetCent,
    totalWithdrawnNetYuan: (totalWithdrawnNetCent / 100).toFixed(2),
    totalWithdrawFeeCent,
    totalWithdrawFeeYuan: (totalWithdrawFeeCent / 100).toFixed(2),
    estimatedBalanceCent,
    estimatedBalanceYuan: (estimatedBalanceCent / 100).toFixed(2),
    revenueMonth30dCent: Number(monthRow?.c || 0),
    revenueMonth30dYuan: (Number(monthRow?.c || 0) / 100).toFixed(2),
    revenueWeek7dCent: Number(weekRow?.c || 0),
    revenueWeek7dYuan: (Number(weekRow?.c || 0) / 100).toFixed(2),
    recent,
    xunhupayDashboardUrl: "https://www.xunhupay.com",
    generatedAt: now,
  });
}

/** POST /api/admin/finance/withdraw  body = { grossYuan, netYuan?, feeYuan?, refNo?, notes?, withdrawnAt? } */
export async function financeWithdraw(request, env) {
  const me = await requireAdminAuth(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const body = await readJsonSafe(request);
  if (!body) return error(400, "BAD_REQUEST", "missing body");

  const toCent = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  };

  const grossCent = toCent(body.grossYuan);
  if (grossCent == null || grossCent <= 0) return error(400, "BAD_AMOUNT", "grossYuan required and > 0");
  let netCent = toCent(body.netYuan);
  let feeCent = toCent(body.feeYuan);

  // 如果用户只填了两个字段，自动补第三个
  if (netCent != null && feeCent == null) feeCent = grossCent - netCent;
  if (feeCent != null && netCent == null) netCent = grossCent - feeCent;

  const withdrawnAt = Number(body.withdrawnAt) || nowMs();
  const refNo = body.refNo ? String(body.refNo).slice(0, 128) : null;
  const notes = body.notes ? String(body.notes).slice(0, 1024) : null;

  const res = await env.DB.prepare(
    `INSERT INTO withdrawals (gross_cent, net_cent, fee_cent, ref_no, notes, withdrawn_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(grossCent, netCent, feeCent, refNo, notes, withdrawnAt, nowMs()).run();

  return ok({
    id: res.meta?.last_row_id ?? null,
    grossCent,
    netCent,
    feeCent,
    withdrawnAt,
  });
}

/** DELETE /api/admin/finance/withdraw?id=N —— 录错了可以撤销 */
export async function financeWithdrawDelete(request, env) {
  const me = await requireAdminAuth(request, env);
  if (!me) return error(401, "UNAUTH", "not logged in");

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return error(400, "BAD_REQUEST", "missing id");

  await env.DB.prepare(`DELETE FROM withdrawals WHERE id = ?`).bind(id).run();
  return ok({ deleted: id });
}
