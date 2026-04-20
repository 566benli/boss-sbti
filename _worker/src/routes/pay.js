import { json, ok, error, uuid, nowMs, readJsonSafe } from "../lib/util.js";
import { getProvider, mock } from "../lib/providers/index.js";

/** POST /api/pay/create  { sid } */
export async function createPayment(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.sid) return error(400, "BAD_REQUEST", "missing sid");
  const sid = body.sid;

  const row = await env.DB.prepare(
    `SELECT id, paid, completed_at FROM sessions WHERE id = ?`,
  ).bind(sid).first();
  if (!row) return error(404, "NOT_FOUND", "session not found");
  if (!row.completed_at) return error(409, "NOT_COMPLETED", "finish the quiz first");
  if (row.paid) return ok({ alreadyPaid: true, sid });

  const amount = Number(env.PRICE_CENT || 99) | 0;
  const orderId = uuid();
  const provider = getProvider(env);

  await env.DB.prepare(
    `INSERT INTO orders (id, session_id, provider, amount_cent, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(orderId, sid, provider.id, amount, nowMs()).run();

  const pay = await provider.createOrder({ env, orderId, amountCent: amount, sid });

  let demoSign = null;
  if (provider.id === "mock") {
    demoSign = await mock.demoSign(orderId, env);
  }
  return ok({
    orderId,
    amountCent: amount,
    priceYuan: (amount / 100).toFixed(2),
    payUrl: pay.payUrl,
    qrUrl: pay.qrUrl,
    provider: provider.id,
    demo: !!pay.demo,
    demoSign,
  });
}

/** GET /api/pay/status?orderId=... */
export async function payStatus(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return error(400, "BAD_REQUEST", "missing orderId");
  const row = await env.DB.prepare(
    `SELECT status, session_id, amount_cent, paid_at FROM orders WHERE id = ?`,
  ).bind(orderId).first();
  if (!row) return error(404, "NOT_FOUND", "order not found");
  return ok({
    orderId,
    status: row.status,
    sid: row.session_id,
    amountCent: row.amount_cent,
    paidAt: row.paid_at,
  });
}

/** POST /api/pay/webhook/mock?orderId=...&sign=... —— Phase 1 demo */
export async function mockWebhook(request, env) {
  const result = await mock.verifyWebhook(request, env);
  if (!result.ok) return error(400, "BAD_SIG", result.reason);

  const { orderId, paidAt } = result;
  const row = await env.DB.prepare(
    `SELECT id, session_id, status FROM orders WHERE id = ?`,
  ).bind(orderId).first();
  if (!row) return error(404, "NOT_FOUND", "order not found");
  if (row.status === "paid") return ok({ alreadyPaid: true, orderId });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?, webhook_payload = ? WHERE id = ?`,
    ).bind(paidAt, JSON.stringify({ demo: true, ts: paidAt }), orderId),
    env.DB.prepare(
      `UPDATE sessions SET paid = 1, paid_at = ? WHERE id = ? AND paid = 0`,
    ).bind(paidAt, row.session_id),
  ]);

  return ok({ orderId, sid: row.session_id, paidAt });
}

/** POST /api/pay/webhook/xunhupay —— Phase 2 占位 */
export async function xunhupayWebhook(request, env) {
  return error(501, "NOT_IMPLEMENTED", "xunhupay not yet wired");
}
