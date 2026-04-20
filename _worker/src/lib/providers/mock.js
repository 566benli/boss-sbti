/** Phase 1 Demo 支付 Provider：
 * 不对接真实支付，只模拟：createOrder 返回一个带前端可触达的 payUrl；
 * 前端支付弹层里会展示「我已支付」按钮，点击时把 orderId + shared secret 的签名发给
 * /api/pay/webhook/mock，Worker 验签后把订单置为 paid。
 */

import { sha256Hex, nowMs } from "../util.js";

export const mock = {
  id: "mock",

  async createOrder({ env, orderId, amountCent, sid }) {
    const origin = (env.ALLOWED_ORIGINS || "").split(",")[0] || "";
    return {
      payUrl: `${origin}/#mock-pay?orderId=${orderId}&sid=${sid}`,
      qrUrl: null,
      orderId,
      amountCent,
      provider: "mock",
      demo: true,
    };
  },

  /** 计算 demo 签名。前端保存不了密钥，所以密钥只对管理员/开发可见；
   * Phase 1 的确是"可被懂行用户绕过"的 demo，因此 UI 上明示只作 MVP 演示。 */
  async demoSign(orderId, env) {
    const secret = env.MOCK_WEBHOOK_SECRET || "mock-secret";
    return (await sha256Hex(`${secret}:${orderId}`)).slice(0, 16);
  },

  async verifyWebhook(request, env) {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    const sign = url.searchParams.get("sign");
    if (!orderId || !sign) return { ok: false, reason: "missing" };
    const expect = await this.demoSign(orderId, env);
    if (sign !== expect) return { ok: false, reason: "badsig" };
    return { ok: true, orderId, paidAt: nowMs() };
  },
};
