/* 头less 校验 app.js 的去重逻辑：
 * 场景：Q2 → 选项 C（insert:Q20@Q3）→ 应进入 Q20；回到 Q3。
 *       Q3 走主线到 Q4~Q7（随意），之后 Q8 → 选项 D（insert:Q20@Q9）→ 由于 Q20 已答过，应直接跳到 Q9。
 *
 * 运行：node _tests/dedupe-check.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, document: { getElementById: () => null, createElement: () => ({ addEventListener() {} }) } };
vm.createContext(ctx);
const quizSrc = fs.readFileSync(path.join(__dirname, "..", "quiz-data.js"), "utf8");
vm.runInContext(quizSrc, ctx);

const Q = ctx.window.QUIZ_QUESTIONS;

/* 复刻 app.js 里的 parseNext / 去重逻辑（单元测试用）。 */
const MAINLINE = ["Q1","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9","Q10","Q11","Q12"];
function nextMainlineAfter(id) {
  const i = MAINLINE.indexOf(id);
  if (i >= 0 && i + 1 < MAINLINE.length) return MAINLINE[i + 1];
  return "Q12";
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
  if (next.startsWith("random@")) return { op: "random", resume: next.slice(7), peek: false };
  return { op: "goto", target: "Q1" };
}

function simulate(pathOfChoices) {
  /* pathOfChoices 是 [{qid, optionIndex}] 的选择序列（按玩家实际点击顺序）。*/
  const state = { answered: new Set(), stack: [], currentId: null, resumeAfterRandom: null, history: [] };
  const MAX_HOPS = 32;
  function advancePastAnswered(t) {
    for (let i = 0; i < MAX_HOPS && state.answered.has(t); i++) {
      const n = nextMainlineAfter(t);
      if (n === t) return null;
      t = n;
    }
    return state.answered.has(t) ? null : t;
  }

  const trail = [];
  function visit(qid) {
    state.currentId = qid;
    state.answered.add(qid);
    trail.push(qid);
  }

  visit("Q1");
  let step = 0;
  while (step < 100) {
    const plan = pathOfChoices.find((p) => p.qid === state.currentId && !p._consumed);
    if (!plan) break;
    plan._consumed = true;
    const q = Q[state.currentId];
    const opt = q.options[plan.optionIndex];
    const nav = parseNext(opt.next);
    if (nav.op === "finish") { trail.push("FINISH"); break; }
    if (nav.op === "return") {
      const resume = state.resumeAfterRandom || state.stack.pop() || "Q1";
      state.resumeAfterRandom = null;
      visit(resume);
    } else if (nav.op === "goto") {
      const t = advancePastAnswered(nav.target);
      if (!t) { trail.push("FINISH"); break; }
      visit(t);
    } else if (nav.op === "insert") {
      if (state.answered.has(nav.target)) {
        const t = advancePastAnswered(nav.resume);
        if (!t) { trail.push("FINISH"); break; }
        visit(t);
      } else {
        state.stack.push(nav.resume);
        visit(nav.target);
      }
    } else if (nav.op === "random") {
      /* 测试里跳过随机情境题，直接走 resume / peek fallback. */
      const resume = nav.peek ? nextMainlineAfter(q.id) : nav.resume;
      visit(resume);
    }
    step++;
  }
  return trail;
}

/* 构造路径：
 *   Q1 选 A  (goto:Q2)
 *   Q2 选 C 索引 2 (表面批准背后阴阳 → insert:Q20@Q3)  → 进 Q20
 *   Q20 选 A (默认按 return 回 Q3) —— 从 quiz-data 里看 Q20 是什么。
 * 先看 Q20 的选项。*/
console.log("Q20 选项：", Q.Q20.options.map((o, i) => `${i}: "${o.next}"`));
console.log("Q8 选项：", Q.Q8.options.map((o, i) => `${i}: "${o.next}"`));

/* 简化：Q20 的每一个选项 next 都是 return（从题库设计上），选任意一个都会回 resume。
 * 此处选择 Q20 的 0 号选项。*/
const trail = simulate([
  { qid: "Q1", optionIndex: 0 },   // goto Q2
  { qid: "Q2", optionIndex: 2 },   // insert:Q20@Q3
  { qid: "Q20", optionIndex: 0 },
  { qid: "Q3", optionIndex: 0 },   // goto Q4
  { qid: "Q4", optionIndex: 0 },   // goto Q5
  { qid: "Q5", optionIndex: 0 },   // goto Q6
  { qid: "Q6", optionIndex: 0 },   // random@peek → 被我们测试代码视为 resume=Q7
  { qid: "Q7", optionIndex: 0 },   // goto Q8
  { qid: "Q8", optionIndex: 3 },   // insert:Q20@Q9 —— 因为 Q20 已答过，应跳到 Q9
  { qid: "Q9", optionIndex: 0 },
]);

console.log("trail:", trail.join(" → "));

/* 验证：Q20 只应出现一次 */
const q20count = trail.filter((x) => x === "Q20").length;
if (q20count !== 1) {
  console.error(`FAIL: 期望 Q20 出现 1 次，实际 ${q20count} 次`);
  process.exit(1);
}

/* 验证：Q8 之后应紧跟 Q9（而不是 Q20） */
const i8 = trail.indexOf("Q8");
if (trail[i8 + 1] !== "Q9") {
  console.error(`FAIL: Q8 后应立即到 Q9（跳过已答过的 Q20），实际到 ${trail[i8 + 1]}`);
  process.exit(1);
}

console.log("PASS: Q20 只出现 1 次，Q8 后直接跳到 Q9（去重生效）。");
