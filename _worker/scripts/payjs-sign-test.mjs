/** 离线单测 PayJS 签名实现。
 *   用法：node scripts/payjs-sign-test.mjs
 *   通过条件：8 个 assert 全部打印 ✓。
 */
import { canonicalize, signPayjs, verifyPayjsSignature } from "../src/lib/providers/payjs.js";

let fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (ok) console.log("✓", name);
  else { console.log("✗", name, "\n  got:", got, "\n  want:", want); fail++; }
}

// ---------- test 1: 官方示例 ----------
// https://payjs.cn/docs/api/sign.html
// params { mchid: 12345, total_fee: 1, out_trade_no: '123123123123' }, key='xxxxxxxxx'
// canonical = mchid=12345&out_trade_no=123123123123&total_fee=1
const p1 = { mchid: 12345, total_fee: 1, out_trade_no: "123123123123" };
eq("canonicalize-official",
  canonicalize(p1),
  "mchid=12345&out_trade_no=123123123123&total_fee=1");

// 官方没给 MD5 具体值，我们跑一下 node 自己的 md5 验证自洽即可
import { createHash } from "node:crypto";
const expectHash = createHash("md5")
  .update("mchid=12345&out_trade_no=123123123123&total_fee=1&key=xxxxxxxxx")
  .digest("hex").toUpperCase();
eq("sign-official",
  signPayjs(p1, "xxxxxxxxx"),
  expectHash);

// ---------- test 2: 排序 + 去空值 + 排除 sign ----------
const p2 = {
  total_fee: 99,
  mchid: "1001",
  out_trade_no: "abc",
  body: "",             // 空值必须排除
  attach: undefined,    // undefined 必须排除
  notify_url: "https://a.b/c",
  sign: "OLDSIGN",      // sign 自己必须排除
};
eq("canonicalize-filter-and-sort",
  canonicalize(p2),
  "mchid=1001&notify_url=https://a.b/c&out_trade_no=abc&total_fee=99");

// ---------- test 3: 数值 / 字符串同果 ----------
const a = signPayjs({ mchid: 123, total_fee: 1, out_trade_no: "x" }, "k");
const b = signPayjs({ mchid: "123", total_fee: "1", out_trade_no: "x" }, "k");
eq("sign-value-type-tolerant", a, b);

// ---------- test 4: 验签对称 ----------
const p4 = {
  mchid: "1001",
  total_fee: 99,
  out_trade_no: "order_001",
  return_code: 1,
  payjs_order_id: "PAYJSORDER123",
  time_end: "20260420121212",
};
p4.sign = signPayjs(p4, "secret-key");
eq("verify-own-signature", verifyPayjsSignature(p4, "secret-key"), true);

// ---------- test 5: 验签抗篡改（金额） ----------
const p5 = { ...p4, total_fee: 1 };
eq("verify-detects-amount-tamper", verifyPayjsSignature(p5, "secret-key"), false);

// ---------- test 6: 验签抗篡改（密钥） ----------
eq("verify-detects-wrong-key", verifyPayjsSignature(p4, "wrong-key"), false);

// ---------- test 7: 少 sign 字段 ----------
const p7 = { ...p4 };
delete p7.sign;
eq("verify-missing-sign", verifyPayjsSignature(p7, "secret-key"), false);

if (fail) {
  console.error(`\nFAILED (${fail} cases)`);
  process.exit(1);
}
console.log("\nAll PayJS sign tests passed.");
