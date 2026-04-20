/** 前端统一 API 封装。
 * 默认后端在 https://api.bosssbti.com；可以通过 <meta name="bosssbti-api"> 或
 * localStorage.BOSSSBTI_API_BASE 覆盖（便于本地 wrangler dev）。
 */
(function () {
  const DEFAULT_BASE = "https://api.bosssbti.com";

  function apiBase() {
    try {
      const ls = localStorage.getItem("BOSSSBTI_API_BASE");
      if (ls) return ls.replace(/\/+$/, "");
    } catch {}
    const meta = document.querySelector('meta[name="bosssbti-api"]');
    if (meta && meta.content) return meta.content.replace(/\/+$/, "");
    return DEFAULT_BASE;
  }

  async function call(method, path, body) {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || (data && data.ok === false)) {
      const err = new Error((data && data.message) || `HTTP ${res.status}`);
      err.code = data?.code;
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data || {};
  }

  function saveSid(sid) {
    try { localStorage.setItem("BOSSSBTI_SID", sid); } catch {}
  }

  function loadSid() {
    try { return localStorage.getItem("BOSSSBTI_SID") || ""; } catch { return ""; }
  }

  function clearSid() {
    try { localStorage.removeItem("BOSSSBTI_SID"); } catch {}
  }

  window.BossAPI = {
    base: apiBase,
    get:  (p)    => call("GET",  p),
    post: (p, b) => call("POST", p, b || {}),
    session: {
      start:  ()       => call("POST", "/api/session/start"),
      finish: (payload) => call("POST", "/api/session/finish", payload),
    },
    report: {
      preview: (sid) => call("GET",  `/api/report/preview?sid=${encodeURIComponent(sid)}`),
      full:    (sid) => call("GET",  `/api/report/full?sid=${encodeURIComponent(sid)}`),
    },
    pay: {
      create: (sid)     => call("POST", "/api/pay/create", { sid }),
      status: (orderId) => call("GET",  `/api/pay/status?orderId=${encodeURIComponent(orderId)}`),
      mockWebhook: (orderId, sign) => fetch(
        `${apiBase()}/api/pay/webhook/mock?orderId=${encodeURIComponent(orderId)}&sign=${encodeURIComponent(sign)}`,
        { method: "POST", credentials: "include" },
      ).then((r) => r.json()),
    },
    share: {
      click: (sid, platform) => call("POST", "/api/share/click", { sid, platform }),
    },
    admin: {
      login:    (password) => call("POST", "/api/admin/login", { password }),
      logout:   ()         => call("POST", "/api/admin/logout"),
      me:       ()         => call("GET",  "/api/admin/me"),
      stats:    ()         => call("GET",  "/api/admin/stats"),
      orders:   (limit)    => call("GET",  `/api/admin/orders?limit=${limit || 50}`),
      sessions: (limit)    => call("GET",  `/api/admin/sessions?limit=${limit || 50}`),
    },
    sid: { save: saveSid, load: loadSid, clear: clearSid },
  };
})();
