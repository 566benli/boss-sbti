/** 离线单测虎皮椒签名实现。
 *   用法：node scripts/xunhupay-sign-test.mjs
 */
import { canonicalize, signXunhu, verifyXunhuSignature } from "../src/lib/providers/xunhupay.js";
import { createHash } from "node:crypto";

let fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (ok) console.log("✓", name);
  else { console.log("✗", name, "\n  got:", got, "\n  want:", want); fail++; }
}

// ---------- test 1: 官方式拼接 ----------
// 与 PayJS 的关键差：(1) 尾部直接接 appsecret，无 &key= (2) 小写 md5
const p1 = {
  version: "1.1",
  appid: "201906134645",
  trade_order_id: "1",
  total_fee: "0.01",
  title: "测试",
  time: "1522390464",
  notify_url: "https://a/n",
  return_url: "https://a/r",
  nonce_str: "740969606",
};
eq("canonicalize-alpha-order",
  canonicalize(p1),
  "appid=201906134645&nonce_str=740969606&notify_url=https://a/n&return_url=https://a/r&time=1522390464&title=测试&total_fee=0.01&trade_order_id=1&version=1.1");

const expect1 = createHash("md5")
  .update("appid=201906134645&nonce_str=740969606&notify_url=https://a/n&return_url=https://a/r&time=1522390464&title=测试&total_fee=0.01&trade_order_id=1&version=1.1APPSECRET-XYZ", "utf8")
  .digest("hex");
eq("sign-lowercase-and-no-key-prefix",
  signXunhu(p1, "APPSECRET-XYZ"),
  expect1);
eq("sign-is-lowercase-32",
  /^[0-9a-f]{32}$/.test(signXunhu(p1, "APPSECRET-XYZ")),
  true);

// ---------- test 2: 排序 + 过滤空 + 排除 hash ----------
const p2 = {
  title: "x",
  appid: "A",
  empty_str: "",
  nullish: null,
  undef: undefined,
  hash: "OLDHASH",
  zzz: "1",
};
eq("canonicalize-filter-empty-and-hash",
  canonicalize(p2),
  "appid=A&title=x&zzz=1");

// ---------- test 3: 验签对称 ----------
const p3 = {
  appid: "abc",
  trade_order_id: "ord123",
  total_fee: "0.99",
  transaction_id: "4200001",
  status: "OD",
  open_order_id: "xh001",
  time: "1700000000",
  nonce_str: "rand123",
};
p3.hash = signXunhu(p3, "secret-xyz");
eq("verify-own-signature", verifyXunhuSignature(p3, "secret-xyz"), true);

// ---------- test 4: 抗篡改 ----------
const p4 = { ...p3, total_fee: "0.01" };
eq("verify-detects-amount-tamper", verifyXunhuSignature(p4, "secret-xyz"), false);
eq("verify-detects-wrong-key", verifyXunhuSignature(p3, "wrong-secret"), false);

// ---------- test 5: 接收大写 hash 也能验（容错） ----------
const p5 = { ...p3, hash: p3.hash.toUpperCase() };
eq("verify-accepts-uppercase-hash", verifyXunhuSignature(p5, "secret-xyz"), true);

// ---------- test 6: 缺 hash ----------
const p6 = { ...p3 };
delete p6.hash;
eq("verify-missing-hash", verifyXunhuSignature(p6, "secret-xyz"), false);

if (fail) {
  console.error(`\nFAILED (${fail})`);
  process.exit(1);
}
console.log("\nAll xunhupay sign tests passed.");
