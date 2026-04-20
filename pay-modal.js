/** 付费弹层 —— 通用：
 *   - 移动端：展示一个「前往支付」按钮 + 提示（点击跳转 payUrl）
 *   - 桌面端：展示 QR（如果 Provider 返回了 qrUrl）+「前往支付」链接
 *   - Phase 1 mock：显示「我已支付（Demo）」按钮，点击后直接 POST 到 mock webhook 解锁
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

    statusLine.innerHTML = `订单号 <code>${order.orderId.slice(0, 8)}…</code> · ¥${order.priceYuan} · <strong>支持微信 / 支付宝</strong>`;

    const payCta = el("a", {
      class: "pay-modal-cta",
      href: order.payUrl || "#",
      target: isMobile() ? "_self" : "_blank",
      rel: "noopener",
    }, isMobile() ? "前往支付（微信 / 支付宝）" : "打开支付页面（新窗口）");

    box.appendChild(payCta);

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
