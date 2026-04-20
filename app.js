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
    branchMessage: "",
    dimBounds: { E: [0, 0], C: [0, 0], T: [0, 0], M: [0, 0] },
    randomInserted: 0,
  };

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

  function applyOption(option) {
    Object.entries(option.dimension || {}).forEach(([k, v]) => {
      state.dim[k] = (state.dim[k] || 0) + v;
    });
    Object.entries(option.types || {}).forEach(([k, v]) => {
      if (state.types[k] == null) state.types[k] = 0;
      state.types[k] += v;
    });
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

  function branchHintFor(id) {
    return (window.BRANCH_HINTS && window.BRANCH_HINTS[id]) || "";
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
      b.addEventListener("click", () => onChoose(o, q));
      opts.appendChild(b);
    });
    const idx = MAINLINE.indexOf(q.id);
    el("quiz-progress").textContent =
      idx >= 0 ? `主线进度：第 ${idx + 1} / ${MAINLINE.length} 题` : `追加题：${q.id}`;
    el("branch-banner").textContent = state.branchMessage || "";
    el("branch-banner").hidden = !state.branchMessage;
    state.branchMessage = "";
  }

  function onChoose(option, question) {
    applyOption(option);
    const nav = parseNext(option.next);
    if (nav.op === "finish") {
      showResults();
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
      state.branchMessage = branchHintFor(nav.target);
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
      state.branchMessage =
        (window.RANDOM_HINT) || "系统正在随机追加一道情境鉴定题……";
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

  function renderTypeCard(key) {
    const t = window.BOSS_TYPES[key];
    if (!t) {
      return `<p class="muted">未知类型：${key}</p>`;
    }
    const horror = t.horror ? `<p><strong>恐怖评级：</strong>${t.horror}</p>` : "";
    const luck = t.luck ? `<p><strong>好运评级：</strong>${t.luck}</p>` : "";
    const heal = t.heal ? `<p><strong>治愈评级：</strong>${t.heal}</p>` : "";
    const kd = t.keywordDanger
      ? `<p><strong>危险关键词：</strong>「${t.keywordDanger}」</p>`
      : "";
    const kh = t.keywordHappy
      ? `<p><strong>幸福关键词：</strong>「${t.keywordHappy}」</p>`
      : "";
    const ks = t.keywordSafe
      ? `<p><strong>安全关键词：</strong>「${t.keywordSafe}」</p>`
      : "";
    const img = t.image
      ? `<img class="boss-img" src="${t.image}" alt="${t.code} · ${t.name}" loading="lazy" />`
      : "";
    return `
      ${img}
      <h3>${t.code}｜${t.name}</h3>
      <p><strong>性格描述：</strong>${t.desc}</p>
      <p><strong>典型行为：</strong>${t.behavior}</p>
      ${horror}${luck}${heal}
      ${kd}${kh}${ks}
    `;
  }

  function showResults() {
    showScreen("screen-result");
    const { main, sub } = resolveMainType();
    el("result-main").innerHTML = renderTypeCard(main);
    const subHtml =
      sub && sub !== main && state.types[sub] > 0
        ? `<div class="sub-card"><h4>相似人格</h4>${renderTypeCard(sub)}</div>`
        : "";
    el("result-sub").innerHTML = subHtml;
    const e = dimToStars("E"),
      c = dimToStars("C"),
      t = dimToStars("T"),
      m = dimToStars("M");
    el("result-radar").innerHTML = `
      <h4>老板污染类型（四维由本题库分值区间归一化为 1–5 档）</h4>
      <p>${starLine(window.DIMENSION_LABELS.E, e, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.C, c, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.T, t, 5)}</p>
      <p>${starLine(window.DIMENSION_LABELS.M, m, 5)}</p>
    `;
    const adv =
      (window.SURVIVAL_ADVICE && window.SURVIVAL_ADVICE[main]) ||
      (window.SURVIVAL_ADVICE && window.SURVIVAL_ADVICE.DEFAULT) ||
      "";
    el("result-advice").textContent = adv;
  }

  function resetQuiz() {
    state.stack.length = 0;
    state.answered.clear();
    state.dim = { E: 0, C: 0, T: 0, M: 0 };
    state.resumeAfterRandom = null;
    state.branchMessage = "";
    state.randomInserted = 0;
    initTypeScores();
    state.currentId = "Q1";
  }

  function startQuiz() {
    resetQuiz();
    showScreen("screen-quiz");
    renderQuestion();
  }

  document.getElementById("btn-start").addEventListener("click", startQuiz);
  document.getElementById("btn-retry").addEventListener("click", () => {
    showScreen("screen-landing");
  });

  initTypeScores();
  computeDimBounds();
})();
