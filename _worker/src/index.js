/** 老板 SBTI 后端 Worker 路由入口。
 * 统一 CORS / 错误处理；所有 /api/* 在此分发。
 */

import { withCors, preflight, text, error } from "./lib/util.js";
import { startSession, finishSession, reportPreview, reportFull } from "./routes/session.js";
import { createPayment, payStatus, mockWebhook, xunhupayWebhook, payjsWebhook } from "./routes/pay.js";
import { shareClick } from "./routes/share.js";
import {
  adminLogin, adminLogout, adminMe,
  adminStats, adminOrders, adminSessions,
} from "./routes/admin.js";
import { financeSummary, financeWithdraw, financeWithdrawDelete } from "./routes/finance.js";

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const p = url.pathname;

  if (m === "OPTIONS") return preflight(request, env);

  if (p === "/" || p === "/api" || p === "/api/") {
    return text("boss-sbti api ok\n");
  }

  if (m === "GET" && p === "/api/health") {
    return text("ok\n");
  }

  if (m === "POST" && p === "/api/session/start") return startSession(request, env);
  if (m === "POST" && p === "/api/session/finish") return finishSession(request, env);

  if (m === "GET" && p === "/api/report/preview") return reportPreview(request, env);
  if (m === "GET" && p === "/api/report/full") return reportFull(request, env);

  if (m === "POST" && p === "/api/pay/create") return createPayment(request, env);
  if (m === "GET" && p === "/api/pay/status") return payStatus(request, env);
  if (m === "POST" && p === "/api/pay/webhook/mock") return mockWebhook(request, env);
  if (m === "POST" && p === "/api/pay/webhook/payjs") return payjsWebhook(request, env);
  if (m === "POST" && p === "/api/pay/webhook/xunhupay") return xunhupayWebhook(request, env);

  if (m === "POST" && p === "/api/share/click") return shareClick(request, env);

  if (m === "POST" && p === "/api/admin/login") return adminLogin(request, env);
  if (m === "POST" && p === "/api/admin/logout") return adminLogout(request, env);
  if (m === "GET" && p === "/api/admin/me") return adminMe(request, env);
  if (m === "GET" && p === "/api/admin/stats") return adminStats(request, env);
  if (m === "GET" && p === "/api/admin/orders") return adminOrders(request, env);
  if (m === "GET" && p === "/api/admin/sessions") return adminSessions(request, env);
  if (m === "GET" && p === "/api/admin/finance/summary") return financeSummary(request, env);
  if (m === "POST" && p === "/api/admin/finance/withdraw") return financeWithdraw(request, env);
  if (m === "DELETE" && p === "/api/admin/finance/withdraw") return financeWithdrawDelete(request, env);

  return error(404, "NOT_FOUND", `no route for ${m} ${p}`);
}

export default {
  async fetch(request, env, ctx) {
    let res;
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      console.error("worker error:", err && err.stack || err);
      res = error(500, "INTERNAL", String(err && err.message || err));
    }
    return withCors(res, request, env);
  },
};
