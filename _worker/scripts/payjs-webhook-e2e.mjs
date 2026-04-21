/** 线上 E2E：构造带签名的 PayJS notify，逐项验证 webhook 行为。
 *   依赖：线上 Worker 已部署 payjsWebhook 路由，PAYJS_KEY 已被设置为 TEST_KEY。
 *   用法：node scripts/payjs-webhook-e2e.mjs
 */
import { createHash } from "node:crypto";

const BASE = "https://api.bosssbti.com";
const TEST_KEY = "phase2-test-key-0420";

function canonicalize(params) {
  return Object.keys(params)
    .filter((k) => {
      if (k === "sign") return false;
      const v = params[k];
      if (v === undefined || v === null) return false;
      return String(v).length > 0;
    })
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function sign(params, key) {
  const s = canonicalize(params) + `&key=${key}`;
  return createHash("md5").update(s, "utf8").digest("hex").toUpperCase();
}

async function post(path, body, headers) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers || { "content-type": "application/json" },
    body: typeof body === "string" ? body : body == null ? null : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, text: await res.text() };
}

function shortNo(uuid) { return uuid.replace(/-/g, "").slice(0, 32); }

function formBody(obj) {
  return new URLSearchParams(obj).toString();
}

let pass = 0, fail = 0;
function assert(name, ok, extra) {
  if (ok) { console.log("✓", name); pass++; }
  else { console.log("✗", name, extra || ""); fail++; }
}

// ---------- 预热：创建一个真实 session + 订单 ----------
console.log("\n== Phase 0: bootstrap a real session/order ==");
const s1 = await post("/api/session/start", {});
const sid = JSON.parse(s1.text).sid;
console.log("  sid =", sid);

await post("/api/session/finish", {
  sid,
  answers: [{ qid: "q1", idx: 0 }],
  dimensions: { E: 1, C: 1, T: 1, M: 1 },
  mainType: "PHASE2-TEST", subType: "PHASE2-TEST",
});

const c1 = await post("/api/pay/create", { sid });
const order = JSON.parse(c1.text);
console.log("  orderId =", order.orderId, "amountCent=", order.amountCent, "provider=", order.provider);
const outTradeNo = shortNo(order.orderId);

// ---------- 1. 不合法 body ----------
console.log("\n== Test 1: empty body ==");
const r1 = await post("/api/pay/webhook/payjs", null, {});
assert("empty body -> 400 fail:*", r1.status === 400 && /fail:/i.test(r1.text),
  `status=${r1.status} body=${r1.text.slice(0,120)}`);

// ---------- 2. return_code != 1 ----------
console.log("\n== Test 2: return_code=0 ==");
const p2 = { return_code: "0", out_trade_no: outTradeNo, mchid: "1", total_fee: "99" };
p2.sign = sign(p2, TEST_KEY);
const r2 = await post("/api/pay/webhook/payjs", formBody(p2),
  { "content-type": "application/x-www-form-urlencoded" });
assert("return_code=0 -> rejected", r2.status === 400 && /return_code/.test(r2.text),
  `status=${r2.status} body=${r2.text}`);

// ---------- 3. 错签 ----------
console.log("\n== Test 3: bad signature ==");
const p3 = { return_code: "1", out_trade_no: outTradeNo, mchid: "1", total_fee: "99",
             sign: "NOT_A_REAL_SIGNATURE_EVEN_CLOSE" };
const r3 = await post("/api/pay/webhook/payjs", formBody(p3),
  { "content-type": "application/x-www-form-urlencoded" });
assert("bad sig -> fail:bad_signature", r3.status === 400 && /bad_signature/.test(r3.text),
  `status=${r3.status} body=${r3.text}`);

// ---------- 4. 订单不存在 ----------
console.log("\n== Test 4: unknown out_trade_no ==");
const p4 = { return_code: "1", out_trade_no: "NO_SUCH_ORDER_xx_xx", mchid: "1", total_fee: "99" };
p4.sign = sign(p4, TEST_KEY);
const r4 = await post("/api/pay/webhook/payjs", formBody(p4),
  { "content-type": "application/x-www-form-urlencoded" });
assert("unknown order -> fail:order_not_found", r4.status === 404 && /order_not_found/.test(r4.text),
  `status=${r4.status} body=${r4.text}`);

// ---------- 5. 金额防篡改 ----------
console.log("\n== Test 5: amount tampering ==");
const p5 = { return_code: "1", out_trade_no: outTradeNo, mchid: "1", total_fee: "1",
             payjs_order_id: "ATTACK" };
p5.sign = sign(p5, TEST_KEY);
const r5 = await post("/api/pay/webhook/payjs", formBody(p5),
  { "content-type": "application/x-www-form-urlencoded" });
assert("tampered amount -> fail:amount_mismatch",
  r5.status === 400 && /amount_mismatch/.test(r5.text),
  `status=${r5.status} body=${r5.text}`);

// DB 未被污染
const st5 = await get(`/api/pay/status?orderId=${order.orderId}`);
const st5j = JSON.parse(st5.text);
assert("tampered amount did NOT flip order", st5j.status === "pending",
  `status=${st5j.status}`);

// ---------- 6. 正常付费通知 ----------
console.log("\n== Test 6: valid notify -> success ==");
const p6 = {
  return_code: "1",
  mchid: "test-mchid",
  out_trade_no: outTradeNo,
  payjs_order_id: "PAYJS_OID_TEST_001",
  total_fee: String(order.amountCent),
  transaction_id: "wx20260420xxxxxxxxxxxxxxxx",
  time_end: "20260420121212",
  openid: "oTestOpenId",
};
p6.sign = sign(p6, TEST_KEY);
const r6 = await post("/api/pay/webhook/payjs", formBody(p6),
  { "content-type": "application/x-www-form-urlencoded" });
assert("valid notify -> 200 'success'",
  r6.status === 200 && r6.text.trim() === "success",
  `status=${r6.status} body=${r6.text}`);

const st6 = await get(`/api/pay/status?orderId=${order.orderId}`);
const st6j = JSON.parse(st6.text);
assert("order marked paid", st6j.status === "paid",
  `status=${st6j.status}`);

// ---------- 7. 幂等 ----------
console.log("\n== Test 7: duplicate notify is idempotent ==");
const r7 = await post("/api/pay/webhook/payjs", formBody(p6),
  { "content-type": "application/x-www-form-urlencoded" });
assert("repeat notify still returns 'success'",
  r7.status === 200 && r7.text.trim() === "success",
  `status=${r7.status} body=${r7.text}`);

// ---------- 报告放行 ----------
console.log("\n== Test 8: /api/report/full now accessible ==");
const full = await get(`/api/report/full?sid=${sid}`);
assert("report/full now 200", full.status === 200,
  `status=${full.status}`);

// ---------- 汇总 ----------
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
