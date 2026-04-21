import { json, ok, error, text, uuid, nowMs, readJsonSafe } from "../lib/util.js";
import { getProvider, mock, payjs } from "../lib/providers/index.js";

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

  // 真实聚合支付需要的 provider_order_id 在下单后才知道，这里先用 null 占位。
  await env.DB.prepare(
    `INSERT INTO orders (id, session_id, provider, amount_cent, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(orderId, sid, provider.id, amount, nowMs()).run();

  let pay;
  try {
    pay = await provider.createOrder({ env, orderId, amountCent: amount, sid });
  } catch (err) {
    console.error("createOrder failed:", err && err.stack || err);
    return error(502, "PROVIDER_ERROR", String(err && err.message || err));
  }

  // 如果 provider 返回了它自己的订单号（PayJS / 虎皮椒），写回方便对账。
  if (pay && pay.providerOrderId) {
    try {
      await env.DB.prepare(
        `UPDATE orders SET provider_order_id = ? WHERE id = ?`,
      ).bind(pay.providerOrderId, orderId).run();
    } catch { /* 不阻塞下单 */ }
  }

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

/** POST /api/pay/webhook/payjs —— PayJS 异步通知。
 *  重要：成功必须返回纯文本 "success"（任何 JSON 都会让 PayJS 判失败并最多重试 5 次）。
 *  失败时返回任意非 "success" 文本，比如 "fail:<reason>"，PayJS 会按策略重试。 */
export async function payjsWebhook(request, env) {
  let result;
  try {
    result = await payjs.verifyWebhook(request, env);
  } catch (err) {
    console.error("payjs webhook verify threw:", err && err.stack || err);
    return text(`fail:verify_error:${err && err.message || "unknown"}`, { status: 500 });
  }

  if (!result.ok) {
    console.warn("payjs webhook rejected:", result.reason);
    return text(`fail:${result.reason || "unknown"}`, { status: 400 });
  }

  const { orderId, paidAt, raw, totalFee, providerOrderId } = result;

  // out_trade_no 我们在下单时做过 UUID 去横线截 32 位（见 providers/payjs.js::shortOrderNo）。
  // 数据库里的 orders.id 是完整 UUID（含横线、36 字符）。这里用 REPLACE 匹配 shortened 形式。
  const row = await env.DB.prepare(
    `SELECT id, session_id, status, amount_cent FROM orders
     WHERE REPLACE(id, '-', '') = ? OR id = ? LIMIT 1`,
  ).bind(orderId, orderId).first();

  if (!row) {
    console.warn("payjs webhook: order not found for out_trade_no", orderId);
    return text("fail:order_not_found", { status: 404 });
  }

  // 金额校验（单位：分），抵御回调参数篡改。
  if (totalFee && row.amount_cent && totalFee !== row.amount_cent) {
    console.warn("payjs webhook amount mismatch", { orderId, totalFee, expect: row.amount_cent });
    return text("fail:amount_mismatch", { status: 400 });
  }

  if (row.status === "paid") {
    // 已经处理过，告诉 PayJS 停止重试。
    return text("success");
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?, webhook_payload = ?, provider_order_id = COALESCE(provider_order_id, ?) WHERE id = ?`,
    ).bind(paidAt, raw || "", providerOrderId || null, row.id),
    env.DB.prepare(
      `UPDATE sessions SET paid = 1, paid_at = ? WHERE id = ? AND paid = 0`,
    ).bind(paidAt, row.session_id),
  ]);

  return text("success");
}

/** POST /api/pay/webhook/xunhupay —— 保留占位，暂未启用 */
export async function xunhupayWebhook(request, env) {
  return error(501, "NOT_IMPLEMENTED", "xunhupay provider replaced by payjs");
}
