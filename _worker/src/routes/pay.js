import { json, ok, error, text, uuid, nowMs, readJsonSafe } from "../lib/util.js";
import { getProvider, mock, payjs, xunhupay } from "../lib/providers/index.js";
import { requireAccount, signResumeToken } from "./account.js";

/** 解析请求头里的粗略移动端标识。 */
function requestIsMobile(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile|micromessenger|alipay/i.test(ua);
}

/** POST /api/pay/create  { sid, channel?: "wechat" | "alipay" } */
export async function createPayment(request, env) {
  const body = await readJsonSafe(request);
  if (!body || !body.sid) return error(400, "BAD_REQUEST", "missing sid");
  const sid = body.sid;
  const channel = body.channel; // 虎皮椒强制指定渠道；payjs/mock 会忽略此字段

  const me = await requireAccount(request, env);
  if (!me) return error(401, "UNAUTH", "请先登录账号");

  const row = await env.DB.prepare(
    `SELECT id, user_id, paid, completed_at FROM sessions WHERE id = ?`,
  ).bind(sid).first();
  if (!row) return error(404, "NOT_FOUND", "session not found");
  if (row.user_id && row.user_id !== me.id) {
    return error(403, "FORBIDDEN", "该鉴定不属于当前账号");
  }
  if (!row.completed_at) return error(409, "NOT_COMPLETED", "finish the quiz first");
  if (row.paid) return ok({ alreadyPaid: true, sid });

  const amount = Number(env.PRICE_CENT || 99) | 0;
  const orderId = uuid();
  const provider = getProvider(env);

  await env.DB.prepare(
    `INSERT INTO orders (id, session_id, provider, amount_cent, status, created_at, user_id)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(orderId, sid, provider.id, amount, nowMs(), me.id).run();

  /* 微信内置浏览器付完款回跳 report.html 时可能丢 cookie，
   * 所以把一次性 resume token 放进 return_url，前端到 report.html 后换回 cookie。*/
  const rtToken = await signResumeToken(me, sid, env);

  let pay;
  try {
    pay = await provider.createOrder({
      env,
      orderId,
      amountCent: amount,
      sid,
      channel,
      isMobile: requestIsMobile(request),
      rtToken,
    });
  } catch (err) {
    console.error("createOrder failed:", err && err.stack || err);
    return error(502, "PROVIDER_ERROR", String(err && err.message || err));
  }

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

  // 虎皮椒：前端要根据 availableChannels 渲染按钮。默认仅 wechat；
  // 申请到支付宝渠道后运维改 XUNHUPAY_CHANNELS env 即可放开。
  let availableChannels = null;
  if (provider.id === "xunhupay") {
    const raw = String(env.XUNHUPAY_CHANNELS || "wechat").toLowerCase();
    availableChannels = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return ok({
    orderId,
    amountCent: amount,
    priceYuan: (amount / 100).toFixed(2),
    payUrl: pay.payUrl,
    qrUrl: pay.qrUrl,
    provider: provider.id,
    channel: pay.channel || null,
    availableChannels,
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
    `SELECT status, session_id, amount_cent, paid_at, user_id FROM orders WHERE id = ?`,
  ).bind(orderId).first();
  if (!row) return error(404, "NOT_FOUND", "order not found");

  if (row.user_id) {
    const me = await requireAccount(request, env);
    if (!me || me.id !== row.user_id) {
      return error(403, "FORBIDDEN", "该订单不属于当前账号");
    }
  }

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

/** 复用的 webhook 落库流程。orderId 可能是 UUID 去横线的 32 位缩写，也可能是完整 UUID。 */
async function finalizeRealPaymentWebhook({ env, result, logTag }) {
  const { orderId, paidAt, raw, totalFee, providerOrderId } = result;

  const row = await env.DB.prepare(
    `SELECT id, session_id, status, amount_cent FROM orders
     WHERE REPLACE(id, '-', '') = ? OR id = ? LIMIT 1`,
  ).bind(orderId, orderId).first();

  if (!row) {
    console.warn(`${logTag}: order not found for`, orderId);
    return text("fail:order_not_found", { status: 404 });
  }

  if (totalFee && row.amount_cent && totalFee !== row.amount_cent) {
    console.warn(`${logTag}: amount mismatch`, { orderId, totalFee, expect: row.amount_cent });
    return text("fail:amount_mismatch", { status: 400 });
  }

  if (row.status === "paid") return text("success");

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

/** POST /api/pay/webhook/payjs */
export async function payjsWebhook(request, env) {
  let result;
  try { result = await payjs.verifyWebhook(request, env); }
  catch (err) {
    console.error("payjs webhook verify threw:", err && err.stack || err);
    return text(`fail:verify_error:${err && err.message || "unknown"}`, { status: 500 });
  }
  if (!result.ok) {
    console.warn("payjs webhook rejected:", result.reason);
    return text(`fail:${result.reason || "unknown"}`, { status: 400 });
  }
  return finalizeRealPaymentWebhook({ env, result, logTag: "payjs-webhook" });
}

/** POST /api/pay/webhook/xunhupay */
export async function xunhupayWebhook(request, env) {
  let result;
  try { result = await xunhupay.verifyWebhook(request, env); }
  catch (err) {
    console.error("xunhupay webhook verify threw:", err && err.stack || err);
    return text(`fail:verify_error:${err && err.message || "unknown"}`, { status: 500 });
  }
  if (!result.ok) {
    console.warn("xunhupay webhook rejected:", result.reason);
    return text(`fail:${result.reason || "unknown"}`, { status: 400 });
  }
  return finalizeRealPaymentWebhook({ env, result, logTag: "xunhupay-webhook" });
}
