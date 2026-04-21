(function () {
  const MAINLINE = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12"];

  /* 四维破平局优先池；严格按照新版文档《老板SBTI测评小问卷_新版答题逻辑与结果.docx》第七节。*/
  const POOL_EXTRACT = {
    E: ["SUCKER", "OTOT", "CAKE", "SAINT", "MONK", "MOON"],
    C: ["CCTV", "RING", "LEAVE", "KING", "CULT", "SHEET"],
    T: ["PUAer", "AUV", "MASK", "BOOM", "DADDY"],
    W: ["TRASH", "BRICK", "FOG", "FAKE", "ROACH", "TEDX", "THIEF"],
    GOOD: ["GOLD", "COVER", "NURSE"],
  };

  const GOOD_TYPES = new Set(POOL_EXTRACT.GOOD);

  const el = (id) => document.getElementById(id);

  const state = {
    stack: [],
    currentId: null,
    answered: new Set(),
    dim: { E: 0, C: 0, T: 0, M: 0 },
    types: {},
    resumeAfterRandom: null,
    dimBounds: { E: [0, 0], C: [0, 0], T: [0, 0], M: [0, 0] },
    randomInserted: 0,
    sid: null,
    answerTrail: [],
    resolved: null,
    history: [],
  };

  /* 记录"作答前"的完整状态，便于「上一题」原子回退：
   * 改答案后跳题路径可能变化（goto/insert/random 不同）→ 全量恢复比补偿式回退更安全。*/
  function snapshotState() {
    return {
      currentId: state.currentId,
      stack: state.stack.slice(),
      answered: new Set(state.answered),
      dim: { ...state.dim },
      types: { ...state.types },
      resumeAfterRandom: state.resumeAfterRandom,
      randomInserted: state.randomInserted,
      answerTrail: state.answerTrail.slice(),
    };
  }

  function restoreSnapshot(snap) {
    state.currentId = snap.currentId;
    state.stack = snap.stack.slice();
    state.answered = new Set(snap.answered);
    state.dim = { ...snap.dim };
    state.types = { ...snap.types };
    state.resumeAfterRandom = snap.resumeAfterRandom;
    state.randomInserted = snap.randomInserted;
    state.answerTrail = snap.answerTrail.slice();
  }

  function initTypeScores() {
    window.TYPE_SCORE_KEYS.forEach((k) => {
      state.types[k] = 0;
    });
  }

  function computeDimBounds() {
    const acc = { E: [0, 0], C: [0, 0], T: [0, 0], M: [0, 0] };
    function walk(d) {
      ["E", "C", "T", "M"].forEach((k) => {
        const v = d[k] || 0;
        acc[k][0] += Math.min(0, v);
        acc[k][1] += Math.max(0, v);
      });
    }
    Object.values(window.QUIZ_QUESTIONS).forEach((q) => {
      q.options.forEach((o) => walk(o.dimension || {}));
    });
    state.dimBounds = acc;
  }

  function parseNext(next) {
    if (next === "return") return { op: "return" };
    if (next === "finish") return { op: "finish" };
    if (next.startsWith("goto:")) return { op: "goto", target: next.slice(5) };
    if (next.startsWith("insert:")) {
      const [a, b] = next.slice(7).split("@");
      return { op: "insert", target: a, resume: b };
    }
    if (next === "random@peek") return { op: "random", peek: true };
    if (next.startsWith("random@")) {
      const tail = next.slice(7);
      return { op: "random", resume: tail, peek: false };
    }
    return { op: "goto", target: "Q1" };
  }

  function applyOption(option, question, optionIndex) {
    Object.entries(option.dimension || {}).forEach(([k, v]) => {
      state.dim[k] = (state.dim[k] || 0) + v;
    });
    Object.entries(option.types || {}).forEach(([k, v]) => {
      if (state.types[k] == null) state.types[k] = 0;
      state.types[k] += v;
    });
    if (question) {
      state.answerTrail.push({
        qid: question.id,
        idx: optionIndex,
        text: (option.text || "").slice(0, 60),
      });
    }
  }

  function pickRandomQuestion() {
    const pool = (window.RANDOM_POOL || []).filter((id) => !state.answered.has(id));
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function showScreen(name) {
    ["screen-landing", "screen-quiz", "screen-result"].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.hidden = id !== name;
    });
  }

  function renderQuestion() {
    const q = window.QUIZ_QUESTIONS[state.currentId];
    if (!q) return;
    state.answered.add(q.id);
    el("quiz-phase").textContent = q.phase ? `阶段 ${q.phase} / 4` : "";
    el("question-title").textContent = q.title || "";
    el("question-scenario").textContent = q.scenario || "";
    el("question-scenario").hidden = !q.scenario;
    const opts = el("question-options");
    opts.innerHTML = "";
    const labels = ["A", "B", "C", "D", "E"];
    q.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt-btn";
      b.textContent = `${labels[i]}. ${o.text}`;
      b.addEventListener("click", () => onChoose(o, q, i));
      opts.appendChild(b);
    });
    const idx = MAINLINE.indexOf(q.id);
    el("quiz-progress").textContent =
      idx >= 0 ? `主线进度：第 ${idx + 1} / ${MAINLINE.length} 题` : `追加题：${q.id}`;
    renderNavControls();
  }

  function renderNavControls() {
    const host = el("quiz-nav");
    if (!host) return;
    host.innerHTML = "";
    if (!state.history.length) return;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary back-btn";
    back.textContent = "← 上一题（可改答案）";
    back.addEventListener("click", goBack);
    host.appendChild(back);
  }

  function goBack() {
    const snap = state.history.pop();
    if (!snap) return;
    restoreSnapshot(snap);
    /* 回到上一题后，允许重选：如路径不同（goto/insert/random 目标变化）会自然跳到新题。*/
    renderQuestion();
  }

  function onChoose(option, question, optionIndex) {
    state.history.push(snapshotState());
    applyOption(option, question, optionIndex);
    const nav = parseNext(option.next);
    if (nav.op === "finish") {
      showLockedPreview();
      return;
    }
    if (nav.op === "return") {
      if (state.resumeAfterRandom) {
        const t = state.resumeAfterRandom;
        state.resumeAfterRandom = null;
        if (state.stack.length && state.stack[state.stack.length - 1] === t) state.stack.pop();
        goTo(t, false);
        return;
      }
      const resume = state.stack.pop();
      goTo(resume || "Q1", false);
      return;
    }
    if (nav.op === "goto") {
      goTo(nav.target, false);
      return;
    }
    if (nav.op === "insert") {
      state.stack.push(nav.resume);
      goTo(nav.target, true);
      return;
    }
    if (nav.op === "random") {
      /* 控制最多随机追加两道情境题，符合文档「第 6 题后随机出现 1–2 道」规范。*/
      const allowed = state.randomInserted < 2;
      const sub = allowed ? pickRandomQuestion() : null;
      if (!sub) {
        const fallback = nav.peek
          ? state.stack.length
            ? state.stack[state.stack.length - 1]
            : nextMainlineAfter(question.id)
          : nav.resume;
        goTo(fallback, false);
        return;
      }
      if (nav.peek) {
        state.resumeAfterRandom = state.stack.length
          ? state.stack[state.stack.length - 1]
          : nextMainlineAfter(question.id);
      } else {
        state.stack.push(nav.resume);
      }
      state.randomInserted += 1;
      goTo(sub, true);
      return;
    }
  }

  function nextMainlineAfter(id) {
    const i = MAINLINE.indexOf(id);
    if (i >= 0 && i + 1 < MAINLINE.length) return MAINLINE[i + 1];
    return "Q12";
  }

  function goTo(id, isBranchEntry) {
    state.currentId = id;
    renderQuestion();
  }

  function starLine(label, filled, total) {
    let s = "";
    for (let i = 0; i < total; i++) s += i < filled ? "★" : "☆";
    return `${label}：${s}`;
  }

  function dimToStars(key) {
    const [mn, mx] = state.dimBounds[key];
    const v = state.dim[key];
    const span = mx - mn || 1;
    const t = (v - mn) / span;
    const filled = 1 + Math.round(t * 4);
    return Math.max(1, Math.min(5, filled));
  }

  function sortedTypes() {
    return Object.entries(state.types).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }

  /**
   * 结果判定三层结构（对齐新版文档第七节）：
   *   1. 人格分优先：第一名 ≥ 第二名 + 3 直出
   *   2. 好老板保护规则：GOLD/COVER/NURSE 之一进前二 且 M ≥ 12 且 E/C/T ≤ 0 直出
   *   3. 四维破平局：E/C/T/M 对应优先池筛选
   */
  function resolveMainType() {
    const arr = sortedTypes();
    if (!arr.length || arr[0][1] <= 0) {
      return { main: "TRASH", sub: null };
    }
    const [[t1, s1], [t2, s2] = [null, 0]] = arr;
    const E = state.dim.E,
      C = state.dim.C,
      T = state.dim.T,
      M = state.dim.M;

    /* 好老板保护规则：当 GOLD/COVER/NURSE 之一位列前二，且四维呈现明确正向，
     * 优先输出这位好老板，避免被少量轻微负面选项污染。*/
    const goodProtected = (() => {
      if (!(M >= 12 && E <= 0 && C <= 0 && T <= 0)) return null;
      const topGood = arr.find(([k, s]) => GOOD_TYPES.has(k) && s > 0);
      if (!topGood) return null;
      const topIdx = arr.findIndex(([k]) => k === topGood[0]);
      if (topIdx > 1) return null;
      const other = arr.find(
        ([k, s]) => k !== topGood[0] && s > 0 && GOOD_TYPES.has(k),
      );
      return { main: topGood[0], sub: other ? other[0] : null };
    })();
    if (goodProtected) return goodProtected;

    if (!t2 || s2 <= 0 || s1 >= s2 + 3) {
      return { main: t1, sub: t2 && s2 > 0 ? t2 : null };
    }

    /* 四维破平局：M 高且 E/C/T 低 → 好老板池；否则按 E/C/T 最高维度选池；
     * 若 M 是最低值则进入低能管理池（W）。*/
    const emax = Math.max(E, C, T);
    const poolKey = (() => {
      if (M >= 10 && E <= 0 && C <= 0 && T <= 0) return "GOOD";
      if (M <= Math.min(E, C, T)) return "W";
      if (E >= C && E >= T && E === emax) return "E";
      if (C >= E && C >= T && C === emax) return "C";
      if (T >= E && T >= C && T === emax) return "T";
      return "W";
    })();

    const pool = POOL_EXTRACT[poolKey];
    const top = arr.filter(([k]) => pool.includes(k) && state.types[k] > 0);
    if (top.length) {
      top.sort(
        (a, b) => b[1] - a[1] || pool.indexOf(a[0]) - pool.indexOf(b[0]),
      );
      return { main: top[0][0], sub: top[1] ? top[1][0] : t2 };
    }
    return { main: t1, sub: t2 };
  }

  function renderLockedCard(key) {
    const t = window.BOSS_TYPES[key];
    if (!t) return `<p class="muted">未知类型：${key}</p>`;
    const img = t.image
      ? `<img class="boss-img" src="${t.image}" alt="${t.code} · ${t.name}" loading="lazy" />`
      : "";
    return `
      <h3 class="boss-title"><span class="boss-code">${t.code}</span><span class="boss-sep">｜</span><span class="boss-name">${t.name}</span></h3>
      ${img}
      <p class="locked-desc">${t.desc || ""}</p>
    `;
  }

  async function reportFinishToBackend(main, sub) {
    if (!window.BossAPI) return;
    try {
      if (!state.sid) {
        const r = await window.BossAPI.session.start();
        state.sid = r.sid;
        window.BossAPI.sid.save(state.sid);
      }
      await window.BossAPI.session.finish({
        sid: state.sid,
        mainType: main,
        subType: sub || null,
        dim: { E: state.dim.E, C: state.dim.C, T: state.dim.T, M: state.dim.M },
        answers: state.answerTrail,
      });
    } catch (err) {
      console.warn("[boss-sbti] finish report failed", err);
    }
  }

  function showLockedPreview() {
    showScreen("screen-result");
    const { main, sub } = resolveMainType();
    state.resolved = { main, sub };

    const e = dimToStars("E"),
      c = dimToStars("C"),
      t = dimToStars("T"),
      m = dimToStars("M");

    el("result-main").innerHTML = renderLockedCard(main);

    el("result-sub").innerHTML = `
      <div class="locked-meta">
        <p><strong>危险关键词：</strong><span class="blur">长按识别老板说话……</span></p>
        <p><strong>典型行为：</strong><span class="blur">他每天会做的那些骚操作……</span></p>
        <p><strong>相似人格：</strong><span class="blur">另一种可能是谁？</span></p>
      </div>
    `;

    el("result-radar").innerHTML = `
      <h4>老板污染类型（四维由本题库分值区间归一化为 1–5 档）</h4>
      <p>${starLine(window.DIMENSION_LABELS.E, e, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.C, c, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.T, t, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.M, m, 5)}</p>
    `;

    el("result-advice").innerHTML = `
      <div class="locked-advice">
        <div class="lock-badge">
          <span class="lock-icon" aria-hidden="true">🔒</span>
          <strong>生存建议 / 完整画像已加锁</strong>
        </div>
        <p class="muted">支付 <strong>¥0.99</strong> 解锁：本次鉴定的完整画像、相似人格、危险关键词、恐怖/治愈评级、以及针对这类老板的生存建议（附专属转发链接，可发微信 / 朋友圈 / 小红书 / 抖音等）。</p>
      </div>
    `;

    ensureUnlockCta();

    reportFinishToBackend(main, sub);
  }

  function ensureUnlockCta() {
    let cta = el("btn-unlock");
    if (!cta) {
      cta = document.createElement("button");
      cta.type = "button";
      cta.id = "btn-unlock";
      cta.className = "primary unlock-cta";
      cta.textContent = "立即解锁完整报告 · ¥0.99";
      cta.addEventListener("click", onUnlock);
      const retry = el("btn-retry");
      retry.parentNode.insertBefore(cta, retry);
    }
  }

  async function onUnlock() {
    if (!state.sid) {
      console.warn("[boss-sbti] no sid, finishing first");
      if (!state.resolved) return;
      await reportFinishToBackend(state.resolved.main, state.resolved.sub);
    }
    if (!window.BossPay) {
      alert("支付组件未加载，请刷新页面重试。");
      return;
    }
    window.BossPay.open(state.sid, {
      onPaid: ({ sid }) => {
        window.location.href = `/report.html?sid=${encodeURIComponent(sid)}`;
      },
    });
  }

  function resetQuiz() {
    state.stack.length = 0;
    state.answered.clear();
    state.dim = { E: 0, C: 0, T: 0, M: 0 };
    state.resumeAfterRandom = null;
    state.randomInserted = 0;
    state.answerTrail = [];
    state.resolved = null;
    state.history = [];
    initTypeScores();
    state.currentId = "Q1";
  }

  async function startQuiz() {
    resetQuiz();
    showScreen("screen-quiz");
    renderQuestion();
    if (window.BossAPI) {
      try {
        const r = await window.BossAPI.session.start();
        state.sid = r.sid;
        window.BossAPI.sid.save(state.sid);
      } catch (err) {
        console.warn("[boss-sbti] session start failed (offline mode)", err);
      }
    }
  }

  document.getElementById("btn-start").addEventListener("click", startQuiz);
  document.getElementById("btn-retry").addEventListener("click", () => {
    showScreen("screen-landing");
  });

  initTypeScores();
  computeDimBounds();
})();
