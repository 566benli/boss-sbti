/** Terminal 管理员看板：登录、统计卡片、Canvas 图表、订单/session 表。 */
(function () {
  const el = (id) => document.getElementById(id);

  const COLORS = {
    green: "#7fff9a",
    greenDim: "#4d8a5e",
    amber: "#ffd07a",
    red: "#ff8f8f",
    text: "#d7ffe2",
    muted: "#6d9c7c",
    grid: "rgba(127,255,154,0.08)",
  };

  function fmtTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function short(s, n) {
    if (!s) return "—";
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  async function checkLogin() {
    el("loading-panel").hidden = false;
    el("login-panel").hidden = true;
    el("dashboard").hidden = true;
    try {
      await window.BossAPI.admin.me();
      return true;
    } catch {
      return false;
    }
  }

  function showLogin() {
    el("loading-panel").hidden = true;
    el("dashboard").hidden = true;
    el("login-panel").hidden = false;
    el("logout").hidden = true;
    el("mode-badge").textContent = "mode: guest";
  }

  function showDashboard() {
    el("loading-panel").hidden = true;
    el("login-panel").hidden = true;
    el("dashboard").hidden = false;
    el("logout").hidden = false;
  }

  async function doLogin(pwd) {
    const errEl = el("login-error");
    errEl.hidden = true;
    try {
      await window.BossAPI.admin.login(pwd);
      await loadDashboard();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = `! ${err.message || err}`;
    }
  }

  async function doLogout() {
    try { await window.BossAPI.admin.logout(); } catch {}
    showLogin();
  }

  async function loadDashboard() {
    showDashboard();
    let stats, orders, sessions, finance;
    try {
      [stats, orders, sessions, finance] = await Promise.all([
        window.BossAPI.admin.stats(),
        window.BossAPI.admin.orders(50),
        window.BossAPI.admin.sessions(50),
        window.BossAPI.admin.finance.summary(),
      ]);
    } catch (err) {
      if (err.status === 401) {
        showLogin();
        return;
      }
      alert("加载失败: " + (err.message || err));
      return;
    }

    renderFinance(finance);
    renderKpi(stats.kpi, stats.paymentMode);
    renderFunnel(stats.kpi);
    renderTrend(stats.trend || []);
    renderTypes(stats.typeDistribution || []);
    renderShares(stats.sharesByPlatform || []);
    renderOrders(orders.orders || []);
    renderSessions(sessions.sessions || []);
  }

  function fmtYuan(n) {
    if (n === null || n === undefined) return "—";
    const v = (Number(n) / 100).toFixed(2);
    return `¥${v}`;
  }

  function renderFinance(f) {
    el("fin-fee-note").textContent = `（手续费按 ${(f.feePct || 0.38).toFixed(2)}% 估算）`;
    el("fin-balance").textContent = `¥${f.estimatedBalanceYuan}`;
    el("fin-balance-dup").textContent = `¥${f.estimatedBalanceYuan}`;
    el("fin-paid-count").textContent = `${f.paidCount} 笔`;
    el("fin-paid-gross").textContent = `¥${f.grossPaidYuan}`;
    el("fin-provider-fee").textContent = `¥${f.providerFeeEstYuan}`;
    el("fin-w-count").textContent = `${f.withdrawCount} 次`;
    el("fin-w-gross").textContent = `¥${f.totalWithdrawnGrossYuan}`;
    el("fin-revenue-month").textContent = `¥${f.revenueMonth30dYuan}`;
    el("fin-revenue-week").textContent = `¥${f.revenueWeek7dYuan}`;

    const tbody = el("fin-withdrawals-tbody");
    tbody.innerHTML = "";
    (f.recent || []).forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTime(w.withdrawnAt)}</td>
        <td class="num">${fmtYuan(w.grossCent)}</td>
        <td class="num">${fmtYuan(w.netCent)}</td>
        <td class="num">${fmtYuan(w.feeCent)}</td>
        <td><code>${w.refNo ? short(w.refNo, 16) : "—"}</code></td>
        <td>${w.notes ? escapeHtml(w.notes) : "—"}</td>
        <td><button class="term-btn small danger" data-wid="${w.id}">删除</button></td>
      `;
      tbody.appendChild(tr);
    });
    if (!f.recent || !f.recent.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">（尚未录入任何提现记录）</td></tr>`;
    }
    tbody.querySelectorAll("button[data-wid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const wid = btn.getAttribute("data-wid");
        if (!wid) return;
        if (!confirm(`确认删除这条提现记录 #${wid}?`)) return;
        try {
          await window.BossAPI.admin.finance.deleteWithdraw(wid);
          await refreshFinance();
        } catch (e) { alert("删除失败：" + (e.message || e)); }
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function refreshFinance() {
    try {
      const f = await window.BossAPI.admin.finance.summary();
      renderFinance(f);
    } catch (e) { console.warn("refreshFinance failed:", e); }
  }

  function wireFinanceForm() {
    const recordBtn = el("fin-record-btn");
    const form = el("fin-form");
    const cancelBtn = el("fin-cancel");
    const errEl = el("fin-form-err");

    recordBtn.addEventListener("click", () => {
      form.hidden = false;
      el("fin-gross").focus();
    });
    cancelBtn.addEventListener("click", () => {
      form.hidden = true;
      errEl.hidden = true;
      form.reset();
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      errEl.hidden = true;
      const grossYuan = el("fin-gross").value.trim();
      const netYuan = el("fin-net").value.trim();
      const timeLocal = el("fin-time").value.trim();
      const refNo = el("fin-ref").value.trim();
      const notes = el("fin-notes").value.trim();

      const payload = { grossYuan };
      if (netYuan) payload.netYuan = netYuan;
      if (timeLocal) payload.withdrawnAt = new Date(timeLocal).getTime();
      if (refNo) payload.refNo = refNo;
      if (notes) payload.notes = notes;

      try {
        await window.BossAPI.admin.finance.recordWithdraw(payload);
        form.hidden = true;
        form.reset();
        await refreshFinance();
      } catch (err) {
        errEl.hidden = false;
        errEl.textContent = "! " + (err.message || err);
      }
    });
  }

  function renderKpi(k, mode) {
    el("k-started").textContent = k.started.toLocaleString();
    el("k-completed").textContent = k.completed.toLocaleString();
    el("k-paid").textContent = k.paid.toLocaleString();
    el("k-gmv").textContent = `¥${k.gmvYuan}`;
    el("k-started-24h").textContent = `+${k.started24h} (24h)`;
    el("k-completed-24h").textContent = `+${k.completed24h} (24h)`;
    el("k-paid-24h").textContent = `+${k.paid24h} (24h)`;
    el("k-shares").textContent = `shares: ${k.sharesTotal}`;
    el("mode-badge").textContent = `mode: ${mode || "mock"}`;
  }

  function renderFunnel(k) {
    const base = Math.max(k.started, 1);
    const w1 = 100;
    const w2 = (k.completed / base) * 100;
    const w3 = (k.paid / base) * 100;
    el("funnel-1").style.width = w1 + "%";
    el("funnel-2").style.width = w2 + "%";
    el("funnel-3").style.width = w3 + "%";
    el("funnel-1-val").textContent = `${k.started}`;
    el("funnel-2-val").textContent = `${k.completed} (${(w2).toFixed(0)}%)`;
    el("funnel-3-val").textContent = `${k.paid} (${(w3).toFixed(0)}%)`;
  }

  /* ---------- Canvas charts ---------- */

  function prepCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 640);
    const h = Math.max(rect.height, 200);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textBaseline = "top";
    return { ctx, w, h };
  }

  function clearPad(ctx, w, h, pad) {
    ctx.clearRect(0, 0, w, h);
    return { x0: pad.l, y0: pad.t, x1: w - pad.r, y1: h - pad.b };
  }

  function drawAxis(ctx, box, yMax, yLabel) {
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = box.y1 - (i / steps) * (box.y1 - box.y0);
      ctx.beginPath();
      ctx.moveTo(box.x0, y);
      ctx.lineTo(box.x1, y);
      ctx.stroke();
      ctx.fillText(String(Math.round((i / steps) * yMax)), 4, y - 6);
    }
    if (yLabel) {
      ctx.fillText(yLabel, box.x0, 4);
    }
  }

  function renderTrend(data) {
    const canvas = el("chart-trend");
    const { ctx, w, h } = prepCanvas(canvas);
    const pad = { l: 36, r: 12, t: 18, b: 24 };
    const box = clearPad(ctx, w, h, pad);
    if (!data.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("（暂无数据）", box.x0 + 10, box.y0 + 20);
      return;
    }
    const yMax = Math.max(1, ...data.map((d) => Math.max(d.completed, d.paid))) * 1.15;
    drawAxis(ctx, box, yMax, "count");

    const n = data.length;
    const groupW = (box.x1 - box.x0) / n;
    const barW = Math.min(18, groupW / 3);
    data.forEach((d, i) => {
      const gx = box.x0 + groupW * i + groupW / 2;
      const hC = ((box.y1 - box.y0) * d.completed) / yMax;
      const hP = ((box.y1 - box.y0) * d.paid) / yMax;
      ctx.fillStyle = "rgba(127,255,154,0.45)";
      ctx.fillRect(gx - barW - 1, box.y1 - hC, barW, hC);
      ctx.fillStyle = "rgba(255,208,122,0.85)";
      ctx.fillRect(gx + 1, box.y1 - hP, barW, hP);

      if (n <= 30 && i % Math.ceil(n / 10) === 0) {
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(d.date.slice(5), gx - 14, box.y1 + 4);
      }
    });

    ctx.fillStyle = "rgba(127,255,154,0.45)";
    ctx.fillRect(box.x1 - 120, box.y0 + 2, 10, 10);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("completed", box.x1 - 105, box.y0 + 2);
    ctx.fillStyle = "rgba(255,208,122,0.85)";
    ctx.fillRect(box.x1 - 40, box.y0 + 2, 10, 10);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("paid", box.x1 - 25, box.y0 + 2);
  }

  function renderTypes(rows) {
    const canvas = el("chart-types");
    const { ctx, w, h } = prepCanvas(canvas);
    const pad = { l: 80, r: 20, t: 8, b: 8 };
    const box = clearPad(ctx, w, h, pad);
    if (!rows.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("（暂无人格数据）", box.x0, box.y0 + 10);
      return;
    }
    const sorted = [...rows].slice(0, 28);
    const yMax = Math.max(1, ...sorted.map((r) => r.count));
    const rowH = (box.y1 - box.y0) / sorted.length;

    sorted.forEach((r, i) => {
      const y = box.y0 + i * rowH;
      const barH = rowH * 0.7;
      const barW = ((box.x1 - box.x0) * r.count) / yMax;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(r.type, 6, y + 4);
      ctx.fillStyle = "rgba(127,255,154,0.55)";
      ctx.fillRect(box.x0, y + (rowH - barH) / 2, barW, barH);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(r.count), box.x0 + barW + 6, y + 4);
    });
  }

  function renderShares(rows) {
    const canvas = el("chart-shares");
    const { ctx, w, h } = prepCanvas(canvas);
    const pad = { l: 80, r: 20, t: 8, b: 8 };
    const box = clearPad(ctx, w, h, pad);
    if (!rows.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("（暂无分享数据）", box.x0, box.y0 + 10);
      return;
    }
    const yMax = Math.max(1, ...rows.map((r) => r.count));
    const rowH = Math.min(26, (box.y1 - box.y0) / Math.max(rows.length, 1));

    rows.forEach((r, i) => {
      const y = box.y0 + i * rowH;
      const barH = rowH * 0.7;
      const barW = ((box.x1 - box.x0) * r.count) / yMax;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(r.platform, 6, y + 4);
      ctx.fillStyle = "rgba(255,208,122,0.7)";
      ctx.fillRect(box.x0, y + (rowH - barH) / 2, barW, barH);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(r.count), box.x0 + barW + 6, y + 4);
    });
  }

  function renderOrders(rows) {
    const body = el("orders-tbody");
    body.innerHTML = "";
    rows.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTime(o.createdAt)}</td>
        <td><code>${short(o.id, 10)}</code></td>
        <td><code>${short(o.sid, 10)}</code></td>
        <td>${o.provider}</td>
        <td class="num">${o.amountCent}</td>
        <td><span class="pill pill-${o.status}">${o.status}</span></td>
      `;
      body.appendChild(tr);
    });
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">（暂无订单）</td></tr>`;
    }
  }

  function renderSessions(rows) {
    const body = el("sessions-tbody");
    body.innerHTML = "";
    rows.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTime(s.createdAt)}</td>
        <td><code>${short(s.sid, 10)}</code></td>
        <td>${s.mainType || "—"}</td>
        <td>${s.subType || "—"}</td>
        <td>${s.completedAt ? "✓" : "—"}</td>
        <td><span class="pill ${s.paid ? "pill-paid" : ""}">${s.paid ? "paid" : "—"}</span></td>
      `;
      body.appendChild(tr);
    });
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">（暂无 session）</td></tr>`;
    }
  }

  async function boot() {
    const loggedIn = await checkLogin();
    if (loggedIn) await loadDashboard();
    else showLogin();

    el("login-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      doLogin(el("password").value);
    });
    el("logout").addEventListener("click", doLogout);
    wireFinanceForm();
  }

  boot();
})();
