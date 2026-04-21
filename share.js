/** 分享面板：
 *   复制链接 / 微信 / 朋友圈 / QQ / 微博 / Telegram / X / 抖音 / 小红书 / Instagram
 * 每次点击都 fire-and-forget 上报 /api/share/click。
 *
 * 微信 / 朋友圈 / 抖音 / 小红书 / Instagram 没有标准 web share URL，这里统一做「复制链接 + 二维码」。
 * 二维码使用 quickchart.io 的公开 API（免 build、无依赖），失败时降级为纯复制链接。
 */
(function () {
  const PLATFORMS = [
    { id: "copy",    label: "复制链接",    emoji: "🔗" },
    { id: "wechat",  label: "微信",        emoji: "💬" },
    { id: "moments", label: "朋友圈",      emoji: "🟢" },
    { id: "qq",      label: "QQ",          emoji: "🐧" },
    { id: "weibo",   label: "微博",        emoji: "🔶" },
    { id: "tg",      label: "Telegram",    emoji: "✈️" },
    { id: "x",       label: "X (Twitter)", emoji: "✖️" },
    { id: "douyin",  label: "抖音",        emoji: "🎵" },
    { id: "xhs",     label: "小红书",      emoji: "📕" },
    { id: "ins",     label: "Instagram",   emoji: "📷" },
  ];

  function qrUrl(url) {
    return `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=220&margin=2&dark=e8ecf1&light=171b22`;
  }

  function toast(msg) {
    let t = document.getElementById("boss-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "boss-toast";
      t.className = "boss-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function openWindow(url) {
    window.open(url, "_blank", "noopener,width=640,height=640");
  }

  function showQrModal(shareUrl, label) {
    const host = document.createElement("div");
    host.className = "share-qr-host";
    host.innerHTML = `
      <div class="share-qr-mask"></div>
      <div class="share-qr-card">
        <button class="share-qr-close" aria-label="关闭">×</button>
        <h3>扫码分享到 ${label}</h3>
        <p class="muted">用 ${label} 扫码后发送给好友；或点下方按钮复制链接到 App 内粘贴。</p>
        <img class="share-qr-img" alt="QR" />
        <button class="share-qr-copy">复制链接</button>
      </div>
    `;
    document.body.appendChild(host);
    host.querySelector(".share-qr-img").src = qrUrl(shareUrl);
    const close = () => host.remove();
    host.querySelector(".share-qr-mask").addEventListener("click", close);
    host.querySelector(".share-qr-close").addEventListener("click", close);
    host.querySelector(".share-qr-copy").addEventListener("click", async () => {
      const ok = await copyText(shareUrl);
      toast(ok ? "链接已复制" : "复制失败，请长按选中链接");
    });
  }

  function logoFor(platform) {
    return PLATFORMS.find((p) => p.id === platform)?.emoji || "•";
  }

  function labelFor(platform) {
    return PLATFORMS.find((p) => p.id === platform)?.label || platform;
  }

  async function track(sid, platform) {
    if (!sid || !window.BossAPI) return;
    try { await window.BossAPI.share.click(sid, platform); } catch {}
  }

  function go(platform, ctx) {
    const { sid, url, title, desc } = ctx;
    track(sid, platform);
    const enc = encodeURIComponent;
    switch (platform) {
      case "copy":
        copyText(url).then((ok) => toast(ok ? "链接已复制" : "复制失败"));
        return;
      case "wechat":
      case "moments":
        showQrModal(url, labelFor(platform));
        return;
      case "qq":
        openWindow(`https://connect.qq.com/widget/shareqq/index.html?url=${enc(url)}&title=${enc(title)}&desc=${enc(desc)}`);
        return;
      case "weibo":
        openWindow(`https://service.weibo.com/share/share.php?url=${enc(url)}&title=${enc(title + " " + desc)}`);
        return;
      case "tg":
        openWindow(`https://t.me/share/url?url=${enc(url)}&text=${enc(title + " — " + desc)}`);
        return;
      case "x":
        openWindow(`https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title + " — " + desc)}`);
        return;
      case "douyin":
      case "xhs":
      case "ins":
        copyText(url).then((ok) => {
          toast(ok ? `链接已复制，打开 ${labelFor(platform)} App 粘贴即可` : "复制失败");
        });
        return;
    }
  }

  function mount(containerEl, ctx) {
    containerEl.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "share-grid";
    PLATFORMS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "share-btn";
      btn.innerHTML = `<span class="share-ico">${p.emoji}</span><span class="share-label">${p.label}</span>`;
      btn.addEventListener("click", () => go(p.id, ctx));
      grid.appendChild(btn);
    });
    containerEl.appendChild(grid);
  }

  window.BossShare = {
    mount,
    platforms: PLATFORMS,
    go,
    track,
    copyText,
    toast,
    labelFor,
    qrUrl,
  };
})();
