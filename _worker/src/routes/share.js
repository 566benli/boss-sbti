import { ok, error, nowMs, readJsonSafe } from "../lib/util.js";

const PLATFORMS = new Set([
  "copy", "wechat", "moments", "qq", "weibo", "tg", "x",
  "douyin", "xhs", "ins",
  /* 长图海报流程新增：用户下载 PNG / 通过 navigator.share 触发系统面板 */
  "download", "native",
]);

export async function shareClick(request, env) {
  const body = await readJsonSafe(request);
  if (!body) return error(400, "BAD_REQUEST", "missing body");
  const { sid, platform } = body;
  if (!sid || !platform) return error(400, "BAD_REQUEST", "missing sid/platform");
  if (!PLATFORMS.has(platform)) return error(400, "BAD_PLATFORM", `unknown: ${platform}`);

  await env.DB.prepare(
    `INSERT INTO share_events (session_id, platform, created_at) VALUES (?, ?, ?)`,
  ).bind(sid, platform, nowMs()).run();
  return ok({ sid, platform });
}
