/** 线上 smoke test：实际走一遍 /api/pay/create，看虎皮椒是否返回合法支付链接。
 * 不会真扣钱——只创建订单、拿 URL，不支付。成功后手动清掉这笔未支付订单。
 */
const BASE = "https://api.bosssbti.com";

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, text: await r.text() };
}

console.log("== 1. start session ==");
const s = await post("/api/session/start", {});
const sid = JSON.parse(s.text).sid;
console.log("  sid =", sid);

console.log("\n== 2. finish session (fake answers) ==");
const f = await post("/api/session/finish", {
  sid,
  answers: [{ qid: "q1", idx: 0 }],
  dimensions: { E: 1, C: 1, T: 1, M: 1 },
  mainType: "SMOKE-TEST",
  subType: "SMOKE-TEST",
});
console.log("  finish ->", f.status, f.text.slice(0, 80));

console.log("\n== 3. create payment (channel=wechat) ==");
const c1 = await post("/api/pay/create", { sid, channel: "wechat" });
console.log("  status:", c1.status);
console.log("  body:  ", c1.text);
try {
  const j = JSON.parse(c1.text);
  if (j.error) { console.log("  ✗ xunhupay refused"); process.exit(1); }
  console.log("  ✓ provider =", j.provider, "channel =", j.channel);
  console.log("  ✓ payUrl   =", j.payUrl);
  console.log("  ✓ qrUrl    =", j.qrUrl);
} catch (e) { console.log("  ✗ parse error", e); }

console.log("\n== 4. create payment (channel=alipay) ==");
const c2 = await post("/api/pay/create", { sid, channel: "alipay" });
console.log("  status:", c2.status);
console.log("  body:  ", c2.text.slice(0, 400));
try {
  const j = JSON.parse(c2.text);
  if (j.error) { console.log("  ✗ xunhupay refused alipay (expected if alipay channel not yet approved)"); }
  else {
    console.log("  ✓ provider =", j.provider, "channel =", j.channel);
    console.log("  ✓ payUrl   =", j.payUrl);
    console.log("  ✓ qrUrl    =", j.qrUrl);
  }
} catch (e) { console.log("  ✗ parse error", e); }

console.log("\n== 5. cleanup sid ==");
console.log("  sid to clean:", sid);
