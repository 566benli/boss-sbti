/** Phase 2 占位：虎皮椒（xunhupay）聚合支付。
 * 上线前需要：
 *   1. 在虎皮椒后台开通微信+支付宝 H5/Native 支付
 *   2. wrangler secret put XUNHUPAY_APPID / XUNHUPAY_APPSECRET
 *   3. 在虎皮椒后台配置 notify_url = https://api.bosssbti.com/api/pay/webhook/xunhupay
 *   4. 修改 vars.PAYMENT_MODE = "xunhupay"
 *
 * 虎皮椒 V3 签名规则：按 key 升序拼接，拼接格式
 *   key1=value1&key2=value2&...&appsecret  (去掉 sign/hash/空值)
 * 再做 md5 小写。V3 的返回体也同样验签。
 */

import { sha256Hex, nowMs } from "../util.js";

function md5(){ throw new Error("TODO: 需要引入 md5 polyfill 或改用 HMAC-SHA256 provider"); }

export const xunhupay = {
  id: "xunhupay",

  async createOrder({ env, orderId, amountCent, sid }) {
    throw new Error("xunhupay provider not yet implemented; set PAYMENT_MODE=mock for Phase 1");
  },

  async verifyWebhook(request, env) {
    return { ok: false, reason: "not-implemented" };
  },
};
