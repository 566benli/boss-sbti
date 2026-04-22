/** 付费弹层 —— 兼容 3 种 provider：
 *   - mock (Phase 1)：直接建单 + 「我已支付（Demo）」按钮
 *   - payjs：单一 cashier URL（支付宝+微信同页），桌面端加 QR
 *   - xunhupay：**先选渠道**（微信/支付宝两个按钮），点击后才下单拿 QR
 *
 * 为了在不知道当前后端 provider 的前提下决定 UX，我们先做一次 probe 下单
 * （不传 channel）—— mock/payjs 会直接返回可用的 payUrl；xunhupay 会用默认
 * 的微信下单。返回里的 `provider` 字段告诉前端是否需要再补一个支付宝入口。
 *
 * 付费成功由轮询 /api/pay/status 感知，跳转 /report.html?sid=xxx。
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

  function closeHost(host) {
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }

  function qrForUrl(url) {
    return `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=220&margin=2`;
  }

  function providerLabel(provider, channel) {
    const p = String(provider || "mock").toLowerCase();
    if (p === "xunhupay") {
      return channel === "alipay" ? "虎皮椒 · 支付宝扫码" : "虎皮椒 · 微信扫码";
    }
    if (p === "payjs") return "PayJS · 微信 / 支付宝";
    return "Demo 模式";
  }

  /** 把一张订单渲染成可以扫/可以点的支付区域，挂到 mountNode 下。 */
  function renderOrderPane(mountNode, order, { onPaid }) {
    mountNode.innerHTML = "";
    const provider = String(order.provider || "mock").toLowerCase();

    if (order.demo) {
      // Demo 模式
      mountNode.appendChild(el("a", {
        class: "pay-modal-cta",
        href: order.payUrl || "#",
        target: "_blank",
        rel: "noopener",
      }, "打开 Demo 支付页"));

      const hint = el("div", { class: "pay-modal-demo" }, [
        el("p", {}, "⚠ Demo 模式：后台暂未绑定真实商户号。点击下方按钮可直接解锁报告用于演示。"),
      ]);
      const demoBtn = el("button", { class: "pay-modal-demo-btn" }, "我已支付（Demo 解锁）");
      demoBtn.addEventListener("click", async () => {
        demoBtn.disabled = true;
        demoBtn.textContent = "解锁中…";
        try { await window.BossAPI.pay.mockWebhook(order.orderId, order.demoSign); }
        catch { /* 让下面的轮询去接管 */ }
      });
      hint.appendChild(demoBtn);
      mountNode.appendChild(hint);
      return;
    }

    // 移动端且有 payUrl：CTA 跳转
    if (isMobile() && order.payUrl) {
      mountNode.appendChild(el("a", {
        class: "pay-modal-cta",
        href: order.payUrl,
        target: "_blank",
        rel: "noopener",
      }, `前往支付 ¥${order.priceYuan}`));
      mountNode.appendChild(el("p", { class: "pay-modal-hint" },
        "支付完成后请返回本页面，系统会在几秒内自动解锁。"));
      return;
    }

    // 桌面端：展示 QR
    const qrSrc = order.qrUrl || (order.payUrl ? qrForUrl(order.payUrl) : null);
    if (qrSrc) {
      mountNode.appendChild(el("div", { class: "pay-modal-qr" }, [
        el("img", { class: "pay-modal-qr-img", src: qrSrc, alt: "支付二维码" }),
        el("p", { class: "pay-modal-qr-tip" },
          `用${order.channel === "alipay" ? "支付宝" : "微信"}扫码支付 ¥${order.priceYuan}`),
      ]));
      if (order.payUrl) {
        mountNode.appendChild(el("a", {
          class: "pay-modal-cta pay-modal-cta-ghost",
          href: order.payUrl, target: "_blank", rel: "noopener",
        }, "或在新窗口打开支付页"));
      }
      return;
    }

    // fallback：只有 payUrl
    if (order.payUrl) {
      mountNode.appendChild(el("a", {
        class: "pay-modal-cta", href: order.payUrl, target: "_blank", rel: "noopener",
      }, `打开支付页面 ¥${order.priceYuan}`));
    }
  }

  async function createAndRender({ sid, channel, slot, statusLine, box, opts, state }) {
    statusLine.textContent = "正在创建订单…";
    try {
      const order = await window.BossAPI.pay.create(sid, channel);
      if (order.alreadyPaid) {
        statusLine.textContent = "检测到本次鉴定已付费，正在跳转报告…";
        setTimeout(() => { window.location.href = `/report.html?sid=${sid}&just_paid=1`; }, 600);
        return;
      }
      state.currentOrderId = order.orderId;
      statusLine.innerHTML = `订单号 <code>${order.orderId.slice(0, 8)}…</code> · ¥${order.priceYuan} · <strong>${providerLabel(order.provider, order.channel)}</strong>`;
      renderOrderPane(slot, order, { onPaid: opts.onPaid });

      // 启动轮询（只启一次，针对最新订单 id）
      if (!state.pollingStarted) {
        state.pollingStarted = true;
        pollForPaid(state, opts, sid);
      }
    } catch (err) {
      statusLine.textContent = `创建订单失败：${err.message || err}`;
    }
  }

  function pollForPaid(state, opts, sid) {
    const pollEl = state.pollEl;
    let tries = 0;
    const tick = async () => {
      tries++;
      const orderId = state.currentOrderId;
      if (orderId) {
        try {
          const s = await window.BossAPI.pay.status(orderId);
          if (s.status === "paid") {
            pollEl.textContent = "支付成功，正在跳转完整报告…";
            if (typeof opts.onPaid === "function") opts.onPaid({ sid, orderId });
            else setTimeout(() => { window.location.href = `/report.html?sid=${sid}&just_paid=1`; }, 500);
            return;
          }
        } catch {}
      }
      if (tries < 180) setTimeout(tick, 2000);
      else pollEl.textContent = "超过等待时长，请刷新页面后重试。";
    };
    setTimeout(tick, 1500);
  }

  async function open(sid, opts) {
    opts = opts || {};
    const host = el("div", { class: "pay-modal-host" });
    const box = el("div", { class: "pay-modal-card" });
    host.appendChild(el("div", { class: "pay-modal-mask", onclick: () => closeHost(host) }));
    host.appendChild(box);
    document.body.appendChild(host);

    box.appendChild(el("button", {
      class: "pay-modal-close", "aria-label": "关闭", onclick: () => closeHost(host),
    }, "×"));
    box.appendChild(el("h3", {}, "解锁完整报告"));
    box.appendChild(el("p", { class: "pay-modal-price" }, [
      el("span", { class: "pay-modal-amount" }, "¥0.99"),
      el("span", { class: "pay-modal-sub" }, "  · 一次性买断本次鉴定"),
    ]));

    const channelRow = el("div", { class: "pay-channel-row" });
    box.appendChild(channelRow);

    const statusLine = el("p", { class: "pay-modal-status" }, "正在创建订单…");
    box.appendChild(statusLine);

    const slot = el("div", { class: "pay-modal-slot" });
    box.appendChild(slot);

    const pollEl = el("p", { class: "pay-modal-poll" }, "等待支付结果中…");
    box.appendChild(pollEl);

    const state = { currentOrderId: null, pollingStarted: false, pollEl };

    // 先做一次 probe create（不传 channel），探测 provider 类型
    statusLine.textContent = "正在创建订单…";
    let order;
    try {
      order = await window.BossAPI.pay.create(sid);
    } catch (err) {
      statusLine.textContent = `创建订单失败：${err.message || err}`;
      return;
    }
    if (order.alreadyPaid) {
      statusLine.textContent = "检测到本次鉴定已付费，正在跳转报告…";
      setTimeout(() => { window.location.href = `/report.html?sid=${sid}&just_paid=1`; }, 600);
      return;
    }
    state.currentOrderId = order.orderId;
    statusLine.innerHTML = `订单号 <code>${order.orderId.slice(0, 8)}…</code> · ¥${order.priceYuan} · <strong>${providerLabel(order.provider, order.channel)}</strong>`;
    renderOrderPane(slot, order, { onPaid: opts.onPaid });
    if (!state.pollingStarted) { state.pollingStarted = true; pollForPaid(state, opts, sid); }

    // 虎皮椒：按后端 availableChannels 渲染按钮；只有一个渠道时不显示按钮行。
    if (String(order.provider).toLowerCase() === "xunhupay") {
      const avail = Array.isArray(order.availableChannels) && order.availableChannels.length
        ? order.availableChannels
        : ["wechat"];
      if (avail.length >= 2) {
        const mkBtn = (label, channel, initial) => {
          const b = el("button", {
            class: "pay-channel-btn" + (initial ? " pay-channel-btn-active" : ""),
          }, label);
          b.addEventListener("click", async () => {
            [...channelRow.querySelectorAll(".pay-channel-btn")]
              .forEach((x) => x.classList.remove("pay-channel-btn-active"));
            b.classList.add("pay-channel-btn-active");
            await createAndRender({ sid, channel, slot, statusLine, box, opts, state });
          });
          return b;
        };
        if (avail.includes("wechat")) {
          channelRow.appendChild(mkBtn("🟢 微信支付", "wechat", order.channel !== "alipay"));
        }
        if (avail.includes("alipay")) {
          channelRow.appendChild(mkBtn("🔵 支付宝支付", "alipay", order.channel === "alipay"));
        }
      }
    }
  }

  window.BossPay = { open };
})();
