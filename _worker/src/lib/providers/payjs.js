/** PayJS 聚合支付（https://payjs.cn）provider。
 *
 * 签名算法（官方）：
 *   1. 过滤：去掉 sign 字段、去掉空值（undefined/null/""）。
 *   2. 按参数名 ASCII 升序排序，拼成 k1=v1&k2=v2&...
 *   3. 末尾追加 &key=通信密钥
 *   4. MD5(utf-8) 大写。
 *
 * Worker 运行时：需要 wrangler.toml 里打开 compatibility_flags = ["nodejs_compat"]，
 * 然后可以 `import { createHash } from "node:crypto"` 拿到 md5。
 *
 * 两种下单模式：
 *   - cashier（默认）：构造带签名的 GET URL，前端浏览器跳转
 *       https://payjs.cn/api/cashier?mchid=...&total_fee=...&sign=...
 *     收银台页支持微信 + 支付宝（需商户已绑 2088 开头支付宝商户号）。
 *   - native：Worker 侧 POST 到 https://payjs.cn/api/native，拿到 qrcode（图片 URL）
 *     与 code_url（原始 weixin://），仅微信扫码。桌面端展示效果最好。
 *
 * 异步通知（notify）：
 *   PayJS 会以 application/x-www-form-urlencoded POST 到我们 notify_url。
 *   验证签名后，必须用纯文本 "success" 回应（不能是 JSON），否则 PayJS 会持续重试。
 *   返回字段里含 return_code=1、out_trade_no、payjs_order_id、total_fee、transaction_id、
 *   time_end、attach 等，sign 同样用上面算法校验。
 */

import { createHash } from "node:crypto";
import { nowMs } from "../util.js";

const CASHIER_URL = "https://payjs.cn/api/cashier";
const NATIVE_URL = "https://payjs.cn/api/native";

/** 把参数对象按 PayJS 规则拼成待签字符串（不含 &key= 那段）。 */
export function canonicalize(params) {
  return Object.keys(params)
    .filter((k) => {
      if (k === "sign") return false;
      const v = params[k];
      if (v === undefined || v === null) return false;
      const s = String(v);
      if (s.length === 0) return false;
      return true;
    })
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

/** PayJS md5 大写签名。 */
export function signPayjs(params, secretKey) {
  const stringA = canonicalize(params);
  const stringSignTemp = `${stringA}&key=${secretKey}`;
  return createHash("md5")
    .update(stringSignTemp, "utf8")
    .digest("hex")
    .toUpperCase();
}

/** 验证 PayJS 回传（notify / 同步返回）的签名。 */
export function verifyPayjsSignature(params, secretKey) {
  const received = params.sign;
  if (!received || typeof received !== "string") return false;
  const expected = signPayjs(params, secretKey);
  return expected === received;
}

/** 把 UUID 压成 PayJS 允许的 out_trade_no（≤32 字符）。 */
function shortOrderNo(orderId) {
  return String(orderId).replace(/-/g, "").slice(0, 32);
}

/** 给 `body` 字段规整，PayJS 限制 64 字符以内。 */
function trimBody(body) {
  const s = String(body || "老板SBTI·完整报告解锁");
  return s.length > 60 ? s.slice(0, 60) : s;
}

function env_required(env, key) {
  const v = env[key];
  if (!v || String(v).trim() === "") {
    throw new Error(`payjs: missing secret ${key}`);
  }
  return String(v).trim();
}

function frontendOrigin(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)[0]
    || "https://bosssbti.com";
}

function notifyUrl(env) {
  const base = String(env.PAYJS_NOTIFY_URL || "https://api.bosssbti.com").replace(/\/+$/, "");
  return `${base}/api/pay/webhook/payjs`;
}

function callbackUrl(env, sid, rtToken) {
  const origin = frontendOrigin(env).replace(/\/+$/, "");
  const base = `${origin}/report.html?sid=${encodeURIComponent(sid)}&from=payjs`;
  return rtToken ? `${base}&rt=${encodeURIComponent(rtToken)}` : base;
}

/** 构造收银台跳转 URL（不走 server→PayJS 请求，直接让浏览器跳） */
export function buildCashierUrl({ env, orderId, amountCent, sid, rtToken }) {
  const mchid = env_required(env, "PAYJS_MCHID");
  const key = env_required(env, "PAYJS_KEY");

  const params = {
    mchid,
    total_fee: String(amountCent | 0),
    out_trade_no: shortOrderNo(orderId),
    body: trimBody("老板SBTI·完整报告解锁"),
    attach: sid,
    notify_url: notifyUrl(env),
    callback_url: callbackUrl(env, sid, rtToken),
  };
  params.sign = signPayjs(params, key);

  const qs = new URLSearchParams(params).toString();
  return `${CASHIER_URL}?${qs}`;
}

/** 调用 PayJS Native 接口，拿到 code_url + qrcode 图片 URL。 */
export async function createNativeOrder({ env, orderId, amountCent, sid }) {
  const mchid = env_required(env, "PAYJS_MCHID");
  const key = env_required(env, "PAYJS_KEY");

  const params = {
    mchid,
    total_fee: String(amountCent | 0),
    out_trade_no: shortOrderNo(orderId),
    body: trimBody("老板SBTI·完整报告解锁"),
    attach: sid,
    notify_url: notifyUrl(env),
  };
  params.sign = signPayjs(params, key);

  const res = await fetch(NATIVE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`payjs native HTTP ${res.status}`);
  }
  const data = await res.json();
  if (Number(data.return_code) !== 1) {
    throw new Error(`payjs native failed: ${data.return_msg || JSON.stringify(data)}`);
  }
  if (!verifyPayjsSignature(data, key)) {
    throw new Error("payjs native response signature mismatch");
  }
  return {
    codeUrl: data.code_url,
    qrUrl: data.qrcode,
    payjsOrderId: data.payjs_order_id,
  };
}

export const payjs = {
  id: "payjs",

  /** 默认用 cashier 模式：一条 URL 搞定 PC 扫码 / H5 微信 / H5 支付宝。
   *  若商户开了 Native 或前端想要自绘 QR，可以把 `PAYJS_PREFER=native` 切一下。 */
  async createOrder({ env, orderId, amountCent, sid, rtToken }) {
    const prefer = String(env.PAYJS_PREFER || "cashier").toLowerCase();

    const payUrl = buildCashierUrl({ env, orderId, amountCent, sid, rtToken });
    let qrUrl = null;
    let providerOrderId = null;

    if (prefer === "native") {
      try {
        const n = await createNativeOrder({ env, orderId, amountCent, sid });
        qrUrl = n.qrUrl;
        providerOrderId = n.payjsOrderId;
      } catch (err) {
        console.warn("payjs native degraded to cashier:", err && err.message);
      }
    }

    return {
      payUrl,
      qrUrl,
      orderId,
      amountCent,
      provider: "payjs",
      demo: false,
      providerOrderId,
    };
  },

  /** 验证 PayJS 异步通知。返回 `{ ok, orderId, paidAt, raw, providerOrderId }`。
   *  调用方需要：
   *    - 把 raw 存到 orders.webhook_payload
   *    - 用 orderId（out_trade_no）找 DB 订单
   *    - 成功后**返回纯文本 "success"**（不是 JSON），否则 PayJS 会重试 5 次。 */
  async verifyWebhook(request, env) {
    const key = env_required(env, "PAYJS_KEY");
    const raw = await request.text();

    let params = parseFormOrJson(raw);
    if (!params) return { ok: false, reason: "unparseable" };

    if (Number(params.return_code) !== 1) {
      return { ok: false, reason: `return_code=${params.return_code}`, raw };
    }

    if (!verifyPayjsSignature(params, key)) {
      return { ok: false, reason: "bad_signature", raw };
    }

    const outTradeNo = String(params.out_trade_no || "");
    if (!outTradeNo) return { ok: false, reason: "missing_out_trade_no", raw };

    return {
      ok: true,
      orderId: outTradeNo,
      providerOrderId: String(params.payjs_order_id || ""),
      totalFee: Number(params.total_fee || 0) | 0,
      paidAt: parsePayjsTimeEnd(params.time_end) || nowMs(),
      raw,
      params,
    };
  },
};

/** PayJS 的 notify 一般是 form-urlencoded，但我们宽松一点把 JSON 也兜住。 */
function parseFormOrJson(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  }
  const sp = new URLSearchParams(raw);
  const obj = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  return Object.keys(obj).length ? obj : null;
}

/** PayJS time_end 是形如 20200826080808 的 14 位字符串（东八区）。 */
function parsePayjsTimeEnd(s) {
  if (!s || !/^\d{14}$/.test(String(s))) return null;
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const h = Number(s.slice(8, 10));
  const mi = Number(s.slice(10, 12));
  const se = Number(s.slice(12, 14));
  // 服务器是 UTC，PayJS 给的是北京时间
  return Date.UTC(y, mo, d, h - 8, mi, se);
}
