/**
 * 分享长图海报：点击分享后出一张包含鉴定结果摘要 + 二维码的 PNG 长图。
 * 整个流程零依赖，纯 Canvas 绘制：
 *   - 头图 / 人格代码+中文名 / 老板插画 / 性格描述 / 四维星级
 *   - 底部二维码 → bosssbti.com（用 quickchart.io 生成，CORS 开放）
 *   - 弹窗内提供：下载长图、复制链接、一键选平台（微信/朋友圈/QQ/微博/小红书/抖音/X/TG/IG）
 * 用户可以长按保存图片 或 点「下载长图」，然后粘到任意 App 里发图。
 */
(function () {
  const W = 720;
  const MARGIN = 40;
  const ACCENT = "#f5b14a";
  const BG = "#0f1115";
  const CARD = "#1b2030";
  const TEXT = "#e8ecf1";
  const MUTED = "#9aa3ad";
  const BORDER = "#2a3140";
  const CJK = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif';

  function loadImage(src, crossOrigin) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  function starsText(n) {
    n = Math.max(1, Math.min(5, n | 0));
    return "★".repeat(n) + "☆".repeat(5 - n);
  }

  /* 按 Canvas 当前字体把文本按字符宽度切行，尽量贴合 CJK；超过 maxLines 时末行加省略号。*/
  function wrapText(c, text, maxWidth, maxLines) {
    if (!text) return [];
    const chars = Array.from(text);
    const lines = [];
    let cur = "";
    for (const ch of chars) {
      const next = cur + ch;
      if (c.measureText(next).width > maxWidth && cur) {
        lines.push(cur);
        cur = ch;
        if (maxLines && lines.length === maxLines - 1) {
          /* 最后一行，留省略号空间 */
        }
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const trimmed = lines.slice(0, maxLines);
      let last = trimmed[maxLines - 1];
      while (c.measureText(last + "…").width > maxWidth && last.length > 1) {
        last = last.slice(0, -1);
      }
      trimmed[maxLines - 1] = last + "…";
      return trimmed;
    }
    return lines;
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  async function generate(ctx) {
    const main = ctx.main;
    const BOSS = (window.BOSS_TYPES || {})[main] || {};
    const DL = window.DIMENSION_LABELS || { E: "E", C: "C", T: "T", M: "M" };
    const url = ctx.url || "https://bosssbti.com/";
    const dimStars = ctx.dimStars || { E: 1, C: 1, T: 1, M: 1 };

    /* 预加载老板插画（同源，无需 CORS）+ 二维码（quickchart.io 开放 CORS，带 anonymous 可 toBlob）*/
    const imgBoss = BOSS.image
      ? await loadImage(BOSS.image).catch(() => null)
      : null;
    const qrSrc = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=320&margin=1&format=png&ecLevel=M`;
    const imgQR = await loadImage(qrSrc, "anonymous").catch(() => null);

    /* 固定 720×1780 长图；内容按字节长度会自动在 desc 处按 4 行截断 */
    const H = 1780;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const cnv = document.createElement("canvas");
    cnv.width = W * DPR;
    cnv.height = H * DPR;
    const c = cnv.getContext("2d");
    c.scale(DPR, DPR);
    c.textBaseline = "top";

    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);

    const grd = c.createLinearGradient(0, 0, W, 180);
    grd.addColorStop(0, "#3a2412");
    grd.addColorStop(1, "#1a1206");
    c.fillStyle = grd;
    c.fillRect(0, 0, W, 180);

    c.fillStyle = ACCENT;
    c.font = `900 48px ${CJK}`;
    c.textAlign = "left";
    c.fillText("老板 SBTI", MARGIN, 42);
    c.fillStyle = TEXT;
    c.font = `600 24px ${CJK}`;
    c.fillText("物种鉴定报告", MARGIN, 108);
    c.fillStyle = MUTED;
    c.font = `400 18px ${CJK}`;
    c.textAlign = "right";
    c.fillText("bosssbti.com", W - MARGIN, 118);
    c.textAlign = "left";

    let y = 212;

    c.fillStyle = MUTED;
    c.font = `600 18px ${CJK}`;
    c.fillText("鉴定对象", MARGIN, y);
    y += 32;

    c.fillStyle = ACCENT;
    c.font = `900 66px ${CJK}`;
    c.fillText(BOSS.code || main, MARGIN, y);
    y += 80;

    c.fillStyle = TEXT;
    c.font = `700 32px ${CJK}`;
    const nameLines = wrapText(c, BOSS.name || "", W - MARGIN * 2, 2);
    nameLines.forEach((line, i) => c.fillText(line, MARGIN, y + i * 44));
    y += nameLines.length * 44 + 22;

    if (imgBoss) {
      const boxW = W - MARGIN * 2;
      const boxH = 360;
      const ratio = Math.min(boxW / imgBoss.width, boxH / imgBoss.height);
      const iw = imgBoss.width * ratio;
      const ih = imgBoss.height * ratio;
      const ix = (W - iw) / 2;
      c.save();
      roundRect(c, ix, y, iw, ih, 16);
      c.clip();
      c.drawImage(imgBoss, ix, y, iw, ih);
      c.restore();
      c.strokeStyle = BORDER;
      c.lineWidth = 1;
      roundRect(c, ix, y, iw, ih, 16);
      c.stroke();
      y += ih + 22;
    } else {
      y += 6;
    }

    c.fillStyle = TEXT;
    c.font = `400 22px ${CJK}`;
    const descLines = wrapText(c, BOSS.desc || "", W - MARGIN * 2, 4);
    descLines.forEach((line, i) => c.fillText(line, MARGIN, y + i * 32));
    y += descLines.length * 32 + 24;

    const dimCardH = 210;
    c.fillStyle = CARD;
    roundRect(c, MARGIN, y, W - MARGIN * 2, dimCardH, 14);
    c.fill();
    c.strokeStyle = BORDER;
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = MUTED;
    c.font = `600 18px ${CJK}`;
    c.fillText("四维污染评级", MARGIN + 22, y + 20);
    [["E", DL.E], ["C", DL.C], ["T", DL.T], ["M", DL.M]].forEach(
      ([k, lab], i) => {
        const dy = y + 62 + i * 32;
        c.fillStyle = TEXT;
        c.font = `500 20px ${CJK}`;
        c.textAlign = "left";
        c.fillText(lab || k, MARGIN + 22, dy);
        c.fillStyle = ACCENT;
        c.font = `700 24px ${CJK}`;
        c.textAlign = "right";
        c.fillText(starsText(dimStars[k] || 1), W - MARGIN - 22, dy);
      },
    );
    c.textAlign = "left";
    y += dimCardH + 30;

    c.fillStyle = ACCENT;
    c.font = `700 22px ${CJK}`;
    c.fillText("🔒 完整画像 / 危险关键词 / 生存建议 已加锁", MARGIN, y);
    y += 34;
    c.fillStyle = MUTED;
    c.font = `400 18px ${CJK}`;
    c.fillText("扫码 → 鉴定你老板 → 一键解锁完整报告", MARGIN, y);
    y += 40;

    const qrSize = 260;
    const qrX = (W - qrSize) / 2;
    c.fillStyle = "#ffffff";
    roundRect(c, qrX - 12, y - 12, qrSize + 24, qrSize + 24, 14);
    c.fill();
    if (imgQR) {
      c.drawImage(imgQR, qrX, y, qrSize, qrSize);
    } else {
      c.fillStyle = "#111";
      c.textAlign = "center";
      c.font = `600 22px ${CJK}`;
      c.fillText("bosssbti.com", W / 2, y + qrSize / 2 - 10);
      c.fillStyle = MUTED;
      c.font = `400 16px ${CJK}`;
      c.fillText("（二维码加载失败，请直接访问）", W / 2, y + qrSize / 2 + 20);
    }
    c.textAlign = "left";
    y += qrSize + 28;

    c.fillStyle = TEXT;
    c.font = `700 28px ${CJK}`;
    c.textAlign = "center";
    c.fillText("扫码测你的老板是什么脏东西", W / 2, y);
    y += 40;
    c.fillStyle = MUTED;
    c.font = `400 16px ${CJK}`;
    c.fillText("bosssbti.com · 《老板SBTI图鉴》", W / 2, y);
    c.textAlign = "left";

    /* toBlob 失败（通常是 QR 画布被污染）时，优雅降级为 dataUrl（同样会失败则抛给调用方）。*/
    let dataUrl;
    try {
      dataUrl = cnv.toDataURL("image/png");
    } catch (err) {
      throw new Error("POSTER_TAINTED");
    }
    const blob = await new Promise((resolve) => {
      try {
        cnv.toBlob((b) => resolve(b), "image/png", 0.95);
      } catch {
        resolve(null);
      }
    });
    return { blob, dataUrl, canvas: cnv, qrLoaded: !!imgQR, bossLoaded: !!imgBoss };
  }

  function toastSafe(msg) {
    if (window.BossShare && window.BossShare.toast) {
      window.BossShare.toast(msg);
      return;
    }
    alert(msg);
  }

  function copyTextSafe(text) {
    if (window.BossShare && window.BossShare.copyText) {
      return window.BossShare.copyText(text);
    }
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }

  function trackSafe(sid, platform) {
    if (window.BossShare && window.BossShare.track) {
      return window.BossShare.track(sid, platform);
    }
  }

  function downloadBlob(dataUrl, blob, filename) {
    const a = document.createElement("a");
    a.download = filename;
    if (blob) {
      const u = URL.createObjectURL(blob);
      a.href = u;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
    } else {
      a.href = dataUrl;
      a.click();
    }
  }

  /* 平台图标沿用 share.js 的 PLATFORMS，顺序：微信 / 朋友圈 / 小红书 / 抖音 / QQ / 微博 / X / TG / IG / 复制链接 */
  function platformList() {
    const base = (window.BossShare && window.BossShare.platforms) || [
      { id: "wechat", label: "微信", emoji: "💬" },
      { id: "moments", label: "朋友圈", emoji: "🟢" },
      { id: "xhs", label: "小红书", emoji: "📕" },
      { id: "douyin", label: "抖音", emoji: "🎵" },
      { id: "qq", label: "QQ", emoji: "🐧" },
      { id: "weibo", label: "微博", emoji: "🔶" },
      { id: "x", label: "X (Twitter)", emoji: "✖️" },
      { id: "tg", label: "Telegram", emoji: "✈️" },
      { id: "ins", label: "Instagram", emoji: "📷" },
      { id: "copy", label: "复制链接", emoji: "🔗" },
    ];
    const preferredOrder = [
      "wechat", "moments", "xhs", "douyin", "qq",
      "weibo", "x", "tg", "ins", "copy",
    ];
    const byId = new Map(base.map((p) => [p.id, p]));
    return preferredOrder
      .map((id) => byId.get(id))
      .filter(Boolean);
  }

  function buildShareText(boss, url) {
    const code = boss.code || "某种老板";
    const name = boss.name || "";
    return `我被鉴定成「${code}｜${name}」的下属 😅\n快来测你的老板是什么脏东西 → ${url}`;
  }

  async function onPlatformClick(platform, poster, ctx) {
    const { dataUrl, blob } = poster;
    const { url, sid, shareText, boss } = ctx;
    trackSafe(sid, platform.id);

    if (platform.id === "copy") {
      const ok = await copyTextSafe(url);
      toastSafe(ok ? "链接已复制" : "复制失败");
      return;
    }

    /* 对于 web share URL 存在的桌面平台（QQ/微博/X/TG）：直接走 share.js 的 go()。*/
    const webShareIds = ["qq", "weibo", "x", "tg"];
    if (webShareIds.includes(platform.id) && window.BossShare && window.BossShare.go) {
      window.BossShare.go(platform.id, {
        sid, url,
        title: shareText.split("\n")[0],
        desc: "老板SBTI · 测你老板是什么脏东西",
      });
      toastSafe(`已复制文案，粘贴到 ${platform.label} 即可贴图`);
      await copyTextSafe(shareText);
      return;
    }

    /* 微信/朋友圈/小红书/抖音/Instagram：移动端 App 无 web share URL，只能走「保存图 + 复制文案 + 手动打开 App」。*/
    await copyTextSafe(shareText);
    /* 尝试 navigator.share 带图（iOS Safari 16.4+/Android Chrome 支持 files 时）→ 一步到位。*/
    if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], "老板SBTI.png", { type: "image/png" })] })) {
      try {
        await navigator.share({
          files: [new File([blob], "老板SBTI.png", { type: "image/png" })],
          title: "老板 SBTI 鉴定报告",
          text: shareText,
        });
        toastSafe("分享面板已打开");
        return;
      } catch {
        /* 用户取消 or 不支持，fallthrough 到提示。*/
      }
    }
    /* 降级：提示用户长按 / 下载保存图片后去 App 粘贴。*/
    toastSafe(`文案已复制，长按图片保存后打开 ${platform.label} 贴图即可`);
  }

  function showModal(poster, ctx) {
    const host = document.createElement("div");
    host.className = "share-poster-host";
    host.innerHTML = `
      <div class="share-poster-mask"></div>
      <div class="share-poster-card" role="dialog" aria-label="分享长图">
        <button class="share-poster-close" aria-label="关闭">×</button>
        <h3 class="share-poster-title">分享这份鉴定报告</h3>
        <p class="share-poster-hint">长按图片保存 · 或点下方按钮下载</p>
        <div class="share-poster-preview">
          <img alt="老板SBTI 鉴定报告长图" />
        </div>
        <div class="share-poster-actions">
          <button type="button" class="share-poster-download primary">下载长图</button>
          <button type="button" class="share-poster-copy secondary">复制测试链接</button>
        </div>
        <p class="share-poster-sub">选择要发到哪个平台（自动复制文案 / 提示贴图）：</p>
        <div class="share-poster-grid"></div>
      </div>
    `;
    document.body.appendChild(host);

    const imgEl = host.querySelector("img");
    imgEl.src = poster.dataUrl;

    const close = () => host.remove();
    host.querySelector(".share-poster-mask").addEventListener("click", close);
    host.querySelector(".share-poster-close").addEventListener("click", close);

    host.querySelector(".share-poster-download").addEventListener("click", () => {
      downloadBlob(poster.dataUrl, poster.blob, "老板SBTI-鉴定报告.png");
      trackSafe(ctx.sid, "download");
      toastSafe("已下载长图，去 App 发图吧");
    });

    host.querySelector(".share-poster-copy").addEventListener("click", async () => {
      const ok = await copyTextSafe(ctx.url);
      trackSafe(ctx.sid, "copy");
      toastSafe(ok ? "链接已复制" : "复制失败");
    });

    const grid = host.querySelector(".share-poster-grid");
    platformList().forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "share-btn share-poster-btn";
      btn.innerHTML = `<span class="share-ico">${p.emoji}</span><span class="share-label">${p.label}</span>`;
      btn.addEventListener("click", () => onPlatformClick(p, poster, ctx));
      grid.appendChild(btn);
    });
  }

  /* 对外入口：open({ main, sub, dimStars, url, sid })
   * 负责：生成 poster → 渲染 modal。失败时 toast 提示并回退到纯复制链接。*/
  async function open(ctx) {
    const url = ctx.url || `${location.origin}/${ctx.sid ? `?from=${encodeURIComponent(ctx.sid)}` : ""}`;
    const BOSS = (window.BOSS_TYPES || {})[ctx.main] || {};
    const shareText = buildShareText(BOSS, url);
    let poster;
    try {
      poster = await generate({ main: ctx.main, sub: ctx.sub, dimStars: ctx.dimStars, url });
    } catch (err) {
      console.warn("[boss-sbti] poster generate failed", err);
      toastSafe("长图生成失败，已复制链接，直接发给朋友吧");
      copyTextSafe(url);
      return;
    }
    showModal(poster, { ...ctx, url, shareText, boss: BOSS });
  }

  window.BossPoster = { open, generate, showModal };
})();
