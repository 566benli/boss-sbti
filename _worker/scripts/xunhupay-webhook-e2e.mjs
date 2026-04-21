/** 线上 E2E：构造带 hash 签名的虎皮椒 notify，逐项验证 webhook 行为。
 *   依赖：XUNHUPAY_APPSECRET 已设置为 TEST_KEY；PAYMENT_MODE 仍为 mock（创建订单走 mock provider 即可，我们测的是 webhook 路径）。
 *   用法：node scripts/xunhupay-webhook-e2e.mjs
 */
import { createHash } from "node:crypto";

const BASE = "https://api.bosssbti.com";
const TEST_KEY = "xh-test-appsecret-0420";

function canonicalize(params) {
  return Object.keys(params)
    .filter((k) => {
      if (k === "hash") return false;
      const v = params[k];
      if (v === undefined || v === null) return false;
      return String(v).length > 0;
    })
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function sign(params, key) {
  return createHash("md5").update(canonicalize(params) + key, "utf8").digest("hex");
}

async function post(path, body, headers) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers || { "content-type": "application/json" },
    body: typeof body === "string" ? body : body == null ? null : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, text: await res.text() };
}

const shortNo = (uuid) => uuid.replace(/-/g, "").slice(0, 32);
const formBody = (obj) => new URLSearchParams(obj).toString();

let pass = 0, fail = 0;
function assert(name, ok, extra) {
  if (ok) { console.log("✓", name); pass++; }
  else { console.log("✗", name, extra || ""); fail++; }
}

console.log("== Phase 0: bootstrap session + mock order ==");
const s1 = await post("/api/session/start", {});
const sid = JSON.parse(s1.text).sid;
console.log("  sid =", sid);

await post("/api/session/finish", {
  sid,
  answers: [{ qid: "q1", idx: 0 }],
  dimensions: { E: 1, C: 1, T: 1, M: 1 },
  mainType: "PHASE2-XH-TEST", subType: "PHASE2-XH-TEST",
});

const c1 = await post("/api/pay/create", { sid });
const order = JSON.parse(c1.text);
console.log("  orderId =", order.orderId, "amount=", order.amountCent, "provider=", order.provider);
const outTradeNo = shortNo(order.orderId);

// ---------- 1. 空 body ----------
console.log("\n== Test 1: empty body ==");
const r1 = await post("/api/pay/webhook/xunhupay", null, {});
assert("empty body -> fail:*", r1.status === 400 && /fail:/.test(r1.text),
  `status=${r1.status} body=${r1.text.slice(0,120)}`);

// ---------- 2. 错签 ----------
console.log("\n== Test 2: bad signature ==");
const p2 = { trade_order_id: outTradeNo, total_fee: "0.99", status: "OD",
             hash: "NOT-VALID-HASH-000000000000" };
const r2 = await post("/api/pay/webhook/xunhupay", formBody(p2),
  { "content-type": "application/x-www-form-urlencoded" });
assert("bad sig -> fail:bad_signature", r2.status === 400 && /bad_signature/.test(r2.text),
  `status=${r2.status} body=${r2.text}`);

// ---------- 3. status=WP 拒绝 ----------
console.log("\n== Test 3: status=WP (still pending) ==");
const p3 = { trade_order_id: outTradeNo, total_fee: "0.99", status: "WP",
             time: "1700000000", nonce_str: "n1" };
p3.hash = sign(p3, TEST_KEY);
const r3 = await post("/api/pay/webhook/xunhupay", formBody(p3),
  { "content-type": "application/x-www-form-urlencoded" });
assert("status=WP -> fail:still_pending",
  r3.status === 400 && /still_pending/.test(r3.text),
  `status=${r3.status} body=${r3.text}`);

// ---------- 4. 未知订单 ----------
console.log("\n== Test 4: unknown trade_order_id ==");
const p4 = { trade_order_id: "no_such_order_xxxx", total_fee: "0.99", status: "OD",
             time: "1700000000", nonce_str: "n2" };
p4.hash = sign(p4, TEST_KEY);
const r4 = await post("/api/pay/webhook/xunhupay", formBody(p4),
  { "content-type": "application/x-www-form-urlencoded" });
assert("unknown order -> fail:order_not_found",
  r4.status === 404 && /order_not_found/.test(r4.text),
  `status=${r4.status} body=${r4.text}`);

// ---------- 5. 金额防篡改 ----------
console.log("\n== Test 5: amount tampering ==");
const p5 = { trade_order_id: outTradeNo, total_fee: "0.01", status: "OD",
             time: "1700000000", nonce_str: "n3" };
p5.hash = sign(p5, TEST_KEY);
const r5 = await post("/api/pay/webhook/xunhupay", formBody(p5),
  { "content-type": "application/x-www-form-urlencoded" });
assert("tampered amount -> fail:amount_mismatch",
  r5.status === 400 && /amount_mismatch/.test(r5.text),
  `status=${r5.status} body=${r5.text}`);

const st5 = JSON.parse((await get(`/api/pay/status?orderId=${order.orderId}`)).text);
assert("tampered amount did NOT flip order", st5.status === "pending",
  `status=${st5.status}`);

// ---------- 6. 正常付款通知 ----------
console.log("\n== Test 6: valid notify -> success ==");
const p6 = {
  appid: "test-appid",
  trade_order_id: outTradeNo,
  open_order_id: "XH_OID_001",
  transaction_id: "wx202604200001",
  total_fee: (order.amountCent / 100).toFixed(2),
  status: "OD",
  plugins: "wechat",
  time: String(Math.floor(Date.now() / 1000)),
  nonce_str: "rand-abc",
  attach: sid,
};
p6.hash = sign(p6, TEST_KEY);
const r6 = await post("/api/pay/webhook/xunhupay", formBody(p6),
  { "content-type": "application/x-www-form-urlencoded" });
assert("valid notify -> 200 'success'",
  r6.status === 200 && r6.text.trim() === "success",
  `status=${r6.status} body=${r6.text}`);

const st6 = JSON.parse((await get(`/api/pay/status?orderId=${order.orderId}`)).text);
assert("order marked paid", st6.status === "paid",
  `status=${st6.status}`);

// ---------- 7. 幂等 ----------
console.log("\n== Test 7: duplicate notify idempotent ==");
const r7 = await post("/api/pay/webhook/xunhupay", formBody(p6),
  { "content-type": "application/x-www-form-urlencoded" });
assert("repeat notify still 'success'",
  r7.status === 200 && r7.text.trim() === "success",
  `status=${r7.status} body=${r7.text}`);

// ---------- 8. 大写 hash 也接受 ----------
console.log("\n== Test 8: uppercase hash accepted (robustness) ==");
// 创建新 session+order 来测这条
const s2 = await post("/api/session/start", {});
const sid2 = JSON.parse(s2.text).sid;
await post("/api/session/finish", {
  sid: sid2,
  answers: [{ qid: "q1", idx: 0 }],
  dimensions: { E: 1, C: 1, T: 1, M: 1 },
  mainType: "PHASE2-XH-TEST", subType: "PHASE2-XH-TEST",
});
const order2 = JSON.parse((await post("/api/pay/create", { sid: sid2 })).text);
const outNo2 = shortNo(order2.orderId);

const p8 = {
  appid: "test-appid",
  trade_order_id: outNo2,
  open_order_id: "XH_OID_002",
  transaction_id: "wx202604200002",
  total_fee: (order2.amountCent / 100).toFixed(2),
  status: "OD",
  plugins: "alipay",
  time: String(Math.floor(Date.now() / 1000)),
  nonce_str: "rand-def",
};
p8.hash = sign(p8, TEST_KEY).toUpperCase();
const r8 = await post("/api/pay/webhook/xunhupay", formBody(p8),
  { "content-type": "application/x-www-form-urlencoded" });
assert("uppercase hash accepted -> 200 'success'",
  r8.status === 200 && r8.text.trim() === "success",
  `status=${r8.status} body=${r8.text}`);

// ---------- 9. 报告放行 ----------
console.log("\n== Test 9: /api/report/full accessible post-payment ==");
const full = await get(`/api/report/full?sid=${sid}`);
assert("report/full 200", full.status === 200,
  `status=${full.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
