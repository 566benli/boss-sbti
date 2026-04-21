/** 付费弹层 —— 适配 Phase 1 mock 与 Phase 2 真实聚合支付（PayJS）。
 *
 * Provider 行为差异：
 *   - mock：展示 "我已支付（Demo）" 按钮，点击后 POST /api/pay/webhook/mock 直接解锁。
 *   - payjs（cashier 模式，默认）：拿到 cashier URL；
 *       · 移动端：直接新开窗口跳转（也可改成同页跳转）；
 *       · 桌面端：先展示"打开支付页面"按钮，同时生成 cashier URL 的二维码，用户扫码即付。
 *   - payjs（native 模式）：后端额外返回 qrUrl（PayJS 托管的 QR 图片），直接 <img> 展示。
 *
 * 不论哪种，都通过轮询 /api/pay/status 感知订单状态，付成跳转 /report.html。
 * 暴露 window.BossPay.open(sid, { onPaid })。
 */
(function () {
  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) Object.entries(props).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach((c) => {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  function close(host) {
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }

  /** 用第三方 QR 服务把 payUrl 压成二维码图片（桌面端扫码用）。
   *  GitHub Pages / Workers 都没法在浏览器里跑 QR 本地库又不拉包，所以用 quickchart。 */
  function qrForUrl(url) {
    const sz = 220;
    return `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=${sz}&margin=2`;
  }

  async function open(sid, opts) {
    opts = opts || {};
    const host = el("div", { class: "pay-modal-host" });
    const box = el("div", { class: "pay-modal-card" });
    host.appendChild(el("div", { class: "pay-modal-mask", onclick: () => close(host) }));
    host.appendChild(box);
    document.body.appendChild(host);

    box.appendChild(el("button", {
      class: "pay-modal-close", "aria-label": "关闭", onclick: () => close(host),
    }, "×"));
    box.appendChild(el("h3", {}, "解锁完整报告"));
    box.appendChild(el("p", { class: "pay-modal-price" }, [
      el("span", { class: "pay-modal-amount" }, "¥0.99"),
      el("span", { class: "pay-modal-sub" }, "  · 一次性买断本次鉴定"),
    ]));

    const statusLine = el("p", { class: "pay-modal-status" }, "正在创建订单…");
    box.appendChild(statusLine);

    let order;
    try {
      order = await window.BossAPI.pay.create(sid);
    } catch (err) {
      statusLine.textContent = `创建订单失败：${err.message || err}`;
      return;
    }

    if (order.alreadyPaid) {
      statusLine.textContent = "检测到本次鉴定已付费，正在跳转报告…";
      setTimeout(() => { window.location.href = `/report.html?sid=${sid}`; }, 600);
      return;
    }

    const providerTag = (order.provider || "mock").toLowerCase();
    const providerLabel = providerTag === "payjs" ? "PayJS · 微信 / 支付宝"
      : providerTag === "mock" ? "Demo 模式" : providerTag;

    statusLine.innerHTML = `订单号 <code>${order.orderId.slice(0, 8)}…</code> · ¥${order.priceYuan} · <strong>${providerLabel}</strong>`;

    // ---- 展示支付入口 ----
    if (providerTag === "payjs" && isMobile()) {
      // 移动端：把跳转 CTA 做明显，同时底部加一行提示
      const payCta = el("a", {
        class: "pay-modal-cta",
        href: order.payUrl || "#",
        target: "_blank",
        rel: "noopener",
      }, "前往支付（微信 / 支付宝）");
      box.appendChild(payCta);
      box.appendChild(el("p", { class: "pay-modal-hint" },
        "支付完成后请返回本页面，系统会在几秒内自动解锁。"));
    } else if (providerTag === "payjs") {
      // 桌面端：展示 QR 让用户手机扫码
      const qrImg = order.qrUrl || qrForUrl(order.payUrl);
      const qrWrap = el("div", { class: "pay-modal-qr" }, [
        el("img", { class: "pay-modal-qr-img", src: qrImg, alt: "支付二维码" }),
        el("p", { class: "pay-modal-qr-tip" }, "用微信 / 支付宝扫码支付 ¥0.99"),
      ]);
      box.appendChild(qrWrap);
      const payCta = el("a", {
        class: "pay-modal-cta pay-modal-cta-ghost",
        href: order.payUrl || "#",
        target: "_blank",
        rel: "noopener",
      }, "或在新窗口打开收银台");
      box.appendChild(payCta);
    } else {
      // mock / 其他：保持原有链接按钮样式
      const payCta = el("a", {
        class: "pay-modal-cta",
        href: order.payUrl || "#",
        target: isMobile() ? "_self" : "_blank",
        rel: "noopener",
      }, isMobile() ? "前往支付（微信 / 支付宝）" : "打开支付页面（新窗口）");
      box.appendChild(payCta);
    }

    // ---- Demo 专用快捷解锁按钮 ----
    if (order.demo) {
      const hint = el("div", { class: "pay-modal-demo" }, [
        el("p", {}, "⚠ Demo 模式：目前后台尚未绑定真实商户号。点击下方按钮可直接解锁报告用于演示。"),
      ]);
      const demoBtn = el("button", { class: "pay-modal-demo-btn" }, "我已支付（Demo 解锁）");
      demoBtn.addEventListener("click", async () => {
        demoBtn.disabled = true;
        demoBtn.textContent = "解锁中…";
        try {
          await window.BossAPI.pay.mockWebhook(order.orderId, order.demoSign);
        } catch (err) { /* 继续轮询 */ }
      });
      hint.appendChild(demoBtn);
      box.appendChild(hint);
    }

    const pollStatus = el("p", { class: "pay-modal-poll" }, "等待支付结果中…");
    box.appendChild(pollStatus);

    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const s = await window.BossAPI.pay.status(order.orderId);
        if (s.status === "paid") {
          pollStatus.textContent = "支付成功，正在跳转完整报告…";
          if (typeof opts.onPaid === "function") {
            opts.onPaid({ sid, orderId: order.orderId });
          } else {
            setTimeout(() => { window.location.href = `/report.html?sid=${sid}`; }, 500);
          }
          return;
        }
      } catch {}
      if (tries < 180) setTimeout(tick, 2000);
      else pollStatus.textContent = "超过等待时长，请刷新页面后重试。";
    };
    setTimeout(tick, 1500);
  }

  window.BossPay = { open };
})();
