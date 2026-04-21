/** 虎皮椒（xunhupay.com）聚合支付 provider —— 正式实现。
 *
 * 与 PayJS 的关键差异：
 *   - 签名字段叫 `hash`（不是 `sign`）
 *   - 签名拼接末尾直接贴 APPSECRET，不是 `&key=APPSECRET`（PHP 示例：md5($arg.$hashkey)）
 *   - md5 取 **小写** 32 位
 *   - total_fee 单位是**元**（decimal 字符串如 "0.99"），PayJS 是分
 *   - 下单接口 https://api.xunhupay.com/payment/do.html，返回 { url, url_qrcode }
 *   - plugins = "wechat" | "alipay" 锁定支付渠道
 *   - 回调字段 status = "OD"(成功) / "WP"(待支付) / "CD"(取消)
 *   - 异步通知响应必须为纯文本 "success"（不是 success 会重试 6 次）
 *
 * 我们在下单侧额外支持：
 *   - channel: "wechat" | "alipay" —— 前端 pay-modal 两个按钮分别下单，避免双倍扣费
 *   - isMobile: boolean —— 移动端微信走 H5（type=WAP）；桌面走扫码（默认）
 *
 * 运行依赖：wrangler.toml 里已开启 compatibility_flags = ["nodejs_compat"]，
 *   使得 `import { createHash, randomBytes } from "node:crypto"` 可用。
 */

import { createHash, randomBytes } from "node:crypto";
import { nowMs } from "../util.js";

const API_HOST_PRIMARY = "https://api.xunhupay.com";
const API_HOST_BACKUP = "https://api.dpweixin.com";
const API_VERSION = "1.1";

/** 按虎皮椒规则生成待签字符串（不含末尾 appsecret）。 */
export function canonicalize(params) {
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

/** md5 小写 32 位。 */
export function signXunhu(params, appsecret) {
  const stringA = canonicalize(params);
  const stringSignTemp = stringA + appsecret; // 注意：无任何分隔符
  return createHash("md5").update(stringSignTemp, "utf8").digest("hex");
}

/** 验证虎皮椒回传签名（同步返回 / 异步通知都适用）。 */
export function verifyXunhuSignature(params, appsecret) {
  const received = params.hash;
  if (!received || typeof received !== "string") return false;
  const expected = signXunhu(params, appsecret);
  return expected.toLowerCase() === received.toLowerCase();
}

function env_required(env, key) {
  const v = env[key];
  if (!v || String(v).trim() === "") throw new Error(`xunhupay: missing secret ${key}`);
  return String(v).trim();
}

function frontendOrigin(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)[0]
    || "https://bosssbti.com";
}

function notifyUrl(env) {
  const base = String(env.XUNHUPAY_NOTIFY_URL || "https://api.bosssbti.com").replace(/\/+$/, "");
  return `${base}/api/pay/webhook/xunhupay`;
}

function returnUrl(env, sid) {
  const origin = frontendOrigin(env).replace(/\/+$/, "");
  return `${origin}/report.html?sid=${encodeURIComponent(sid)}&from=xunhupay`;
}

function shortOrderNo(orderId) {
  return String(orderId).replace(/-/g, "").slice(0, 32);
}

function nonceStr() {
  return randomBytes(8).toString("hex");
}

/** 金额：分 -> 元（保留两位小数字符串，虎皮椒要求） */
function centToYuan(cent) {
  const c = Number(cent) | 0;
  return (c / 100).toFixed(2);
}

function normalizeChannel(channel) {
  const c = String(channel || "wechat").toLowerCase();
  if (c === "alipay" || c === "zfb") return "alipay";
  return "wechat";
}

export const xunhupay = {
  id: "xunhupay",

  /** 调用虎皮椒下单接口，返回支付跳转 URL + 二维码图片 URL。 */
  async createOrder({ env, orderId, amountCent, sid, channel, isMobile }) {
    const appid = env_required(env, "XUNHUPAY_APPID");
    const appsecret = env_required(env, "XUNHUPAY_APPSECRET");
    const plugins = normalizeChannel(channel);

    const params = {
      version: API_VERSION,
      appid,
      trade_order_id: shortOrderNo(orderId),
      total_fee: centToYuan(amountCent),
      title: "老板SBTI·完整报告解锁",
      time: String(Math.floor(Date.now() / 1000)),
      notify_url: notifyUrl(env),
      return_url: returnUrl(env, sid),
      nonce_str: nonceStr(),
      plugins, // "wechat" | "alipay"
      attach: sid,
    };
    // 移动端微信走 H5 支付（浏览器里直接拉起微信）
    if (isMobile && plugins === "wechat") params.type = "WAP";

    params.hash = signXunhu(params, appsecret);

    let data = null;
    let lastErr = null;
    for (const host of [API_HOST_PRIMARY, API_HOST_BACKUP]) {
      try {
        const res = await fetch(`${host}/payment/do.html`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(params),
        });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        data = await res.json();
        break;
      } catch (err) { lastErr = err; }
    }
    if (!data) throw new Error(`xunhupay create order failed: ${lastErr && lastErr.message || "unknown"}`);

    if (Number(data.errcode) !== 0) {
      throw new Error(`xunhupay create order rejected: [${data.errcode}] ${data.errmsg || JSON.stringify(data)}`);
    }
    if (!verifyXunhuSignature(data, appsecret)) {
      throw new Error("xunhupay response signature mismatch");
    }

    return {
      payUrl: data.url || null,
      qrUrl: data.url_qrcode || null,
      orderId,
      amountCent,
      provider: "xunhupay",
      demo: false,
      providerOrderId: data.openid || null,
      channel: plugins,
    };
  },

  /** 验证虎皮椒异步通知。成功时调用方必须用**纯文本 "success"** 响应。 */
  async verifyWebhook(request, env) {
    const appsecret = env_required(env, "XUNHUPAY_APPSECRET");
    const raw = await request.text();

    const params = parseFormOrJson(raw);
    if (!params) return { ok: false, reason: "unparseable" };

    if (!verifyXunhuSignature(params, appsecret)) {
      return { ok: false, reason: "bad_signature", raw };
    }

    // status = OD 支付成功；WP 待支付；CD 已取消
    const status = String(params.status || "OD"); // 老版本 notify 可能没有 status 字段但成功一定发
    if (status === "CD") return { ok: false, reason: "cancelled", raw, params };
    if (status === "WP") return { ok: false, reason: "still_pending", raw, params };

    const orderId = String(params.trade_order_id || "");
    if (!orderId) return { ok: false, reason: "missing_trade_order_id", raw };

    const totalYuan = Number(params.total_fee || 0);
    const totalCent = Math.round(totalYuan * 100);

    return {
      ok: true,
      orderId,
      providerOrderId: String(params.open_order_id || params.transaction_id || ""),
      totalFee: totalCent,
      paidAt: params.time ? Number(params.time) * 1000 : nowMs(),
      raw,
      params,
    };
  },
};

/** 虎皮椒 notify 默认是 form-urlencoded。JSON 也兜住。 */
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
