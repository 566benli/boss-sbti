/**
 * 离线回归测试：
 * 1) 静态校验：goto/insert/return/finish 目标合法；类型分引用合法；图片文件存在。
 * 2) 动态仿真：在 Node 内加载 types-data.js / quiz-data.js / app.js 运行脚本化测评。
 *    通过每轮选择「第 N 个选项」穷举若干策略路径，验证总能进入结果页且主人格合法。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const issues = [];
const note = (msg) => issues.push(msg);

// --- 1) 加载 DOM + 脚本 ----------------------------------------------------
const html = read('index.html');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

const ctx = { window, document: window.document, Math, Date, Object, Array, console, setTimeout, clearTimeout };
vm.createContext(ctx);
const runInWindow = (src, name) => vm.runInContext(src, ctx, { filename: name });

runInWindow(read('types-data.js'), 'types-data.js');
runInWindow(read('quiz-data.js'), 'quiz-data.js');
runInWindow(read('app.js'), 'app.js');

const TYPES = window.BOSS_TYPES;
const Q = window.QUIZ_QUESTIONS;
const POOL = window.RANDOM_POOL || [];
const SURV = window.SURVIVAL_ADVICE || {};
const HINTS = window.BRANCH_HINTS || {};

console.log(`types=${Object.keys(TYPES).length}, questions=${Object.keys(Q).length}, random_pool=${POOL.length}`);

// --- 2) 静态校验 -----------------------------------------------------------
for (const [qid, qObj] of Object.entries(Q)) {
  if (qObj.id !== qid) note(`Q.${qid}.id='${qObj.id}' 不一致`);
  if (!Array.isArray(qObj.options) || qObj.options.length < 2)
    note(`Q.${qid} 选项数量异常 (${qObj.options?.length})`);
  qObj.options.forEach((o, idx) => {
    const loc = `${qid}.opt#${idx}`;
    // 类型分引用
    for (const t of Object.keys(o.types || {})) {
      if (!TYPES[t]) note(`${loc} 引用未知人格 ${t}`);
    }
    // 跳转合法性
    const nx = o.next;
    if (!nx) return note(`${loc} 缺 next`);
    if (nx === 'finish' || nx === 'return' || nx === 'random@peek') return;
    if (nx.startsWith('goto:')) {
      const tgt = nx.slice(5);
      if (!Q[tgt]) note(`${loc} goto 不存在的 ${tgt}`);
    } else if (nx.startsWith('insert:')) {
      const m = nx.match(/^insert:(\w[-\w]*)@(\w[-\w]*)$/);
      if (!m) return note(`${loc} insert 语法异常 '${nx}'`);
      const [, sub, back] = m;
      if (!Q[sub]) note(`${loc} insert 目标 ${sub} 不存在`);
      if (!Q[back]) note(`${loc} insert 回跳 ${back} 不存在`);
    } else {
      note(`${loc} 未知 next 指令 '${nx}'`);
    }
  });
}

for (const id of POOL) if (!Q[id]) note(`RANDOM_POOL 中 ${id} 不存在`);
for (const k of Object.keys(HINTS)) if (!Q[k]) note(`BRANCH_HINTS 键 ${k} 不是有效题号`);
for (const k of Object.keys(SURV)) {
  if (k === 'DEFAULT') continue; // 官方兜底键
  if (!TYPES[k]) note(`SURVIVAL_ADVICE 键 ${k} 不是有效人格`);
}

// 图片存在性
for (const [k, t] of Object.entries(TYPES)) {
  if (!t.image) continue;
  if (!fs.existsSync(path.join(ROOT, t.image)))
    note(`${k}.image 文件缺失: ${t.image}`);
}

// index.html 中 hero-gallery 引用的图片
const galleryImgs = [...html.matchAll(/assets\/bosses\/[A-Za-z-]+\.jpg/g)].map((m) => m[0]);
for (const g of galleryImgs) {
  if (!fs.existsSync(path.join(ROOT, g))) note(`index.html 引用不存在的图片 ${g}`);
}

// 打印静态结果
if (issues.length) {
  console.log('\n=== 静态校验发现 ' + issues.length + ' 个问题 ===');
  issues.forEach((i) => console.log(' - ' + i));
} else {
  console.log('静态校验 OK');
}

// --- 3) 动态仿真：纯函数版题目引擎，模拟多策略路径 -----------------------
function simulate(strategy, seedRnd) {
  // 在 window 上按照题目引擎的数据结构重新实现一次状态机，避免对 DOM/按钮事件的耦合
  const dim = { E: 0, C: 0, T: 0, M: 0 };
  const typeScores = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0]));
  let current = 'Q1';
  const stack = [];
  let randomInserted = 0;
  let safety = 0;
  const visited = [];
  let lastMainline = null;
  // Random deterministic RNG
  let seed = seedRnd ?? 1;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const MAINLINE = ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','Q10','Q11','Q12'];
  const isMainline = (id) => MAINLINE.includes(id);

  while (current) {
    if (++safety > 200) {
      return { ok: false, reason: `safety trip at ${current}`, visited };
    }
    const q = Q[current];
    if (!q) return { ok: false, reason: `question ${current} missing`, visited };
    if (isMainline(current)) lastMainline = current;
    visited.push(current);

    const opt = strategy(q, visited.length - 1, dim, typeScores);
    // 记分（和 app.js 保持一致：四维字段名 dimension）
    for (const [k, v] of Object.entries(opt.dimension || {})) dim[k] += v;
    for (const [k, v] of Object.entries(opt.types || {})) typeScores[k] += v;

    const nx = opt.next;
    if (nx === 'finish') break;
    if (nx === 'return') {
      current = stack.pop() || nextMainline(lastMainline);
      continue;
    }
    if (nx === 'random@peek') {
      const allowed = randomInserted < 2 && POOL.length;
      const pickNext = allowed ? POOL[Math.floor(rnd() * POOL.length)] : null;
      const fallback = nextMainline(current);
      if (pickNext && !visited.includes(pickNext)) {
        stack.push(fallback);
        randomInserted += 1;
        current = pickNext;
      } else {
        current = fallback;
      }
      continue;
    }
    if (nx.startsWith('goto:')) {
      current = nx.slice(5);
      continue;
    }
    if (nx.startsWith('insert:')) {
      const [, sub, back] = nx.match(/^insert:(\w[-\w]*)@(\w[-\w]*)$/);
      stack.push(back);
      current = sub;
      continue;
    }
    return { ok: false, reason: `unknown next ${nx} at ${current}`, visited };
  }

  // 用线上 app.js 已定义的 resolveMainType? 它是闭包内函数，拿不到。
  // 复刻文档第七节的判定逻辑即可。
  const result = resolveMainType(dim, typeScores);
  return { ok: true, visited, dim, typeScores, result };
}

function nextMainline(id) {
  const MAINLINE = ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','Q10','Q11','Q12'];
  const i = MAINLINE.indexOf(id);
  if (i >= 0 && i + 1 < MAINLINE.length) return MAINLINE[i + 1];
  return 'finish-sentinel';
}

function resolveMainType(dim, scores) {
  const POOL_EXTRACT = {
    E: ['SUCKER','OTOT','CAKE','SAINT','MONK','MOON'],
    C: ['CCTV','RING','LEAVE','KING','CULT','SHEET'],
    T: ['PUAer','AUV','MASK','BOOM','DADDY'],
    W: ['TRASH','BRICK','FOG','BUSY','ROACH','TEDX','THIEF'],
    GOOD: ['GOLD','COVER','NURSE'],
  };
  const GOOD = new Set(POOL_EXTRACT.GOOD);
  const arr = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!arr.length || arr[0][1] <= 0) return { main: 'TRASH', sub: null };
  const [[t1, s1], [t2, s2] = [null, 0]] = arr;
  const { E, C, T, M } = dim;
  if (M >= 12 && E <= 0 && C <= 0 && T <= 0) {
    const topGood = arr.find(([k, s]) => GOOD.has(k) && s > 0);
    if (topGood) {
      const idx = arr.findIndex(([k]) => k === topGood[0]);
      if (idx <= 1) {
        const other = arr.find(([k, s]) => k !== topGood[0] && s > 0 && GOOD.has(k));
        return { main: topGood[0], sub: other ? other[0] : null };
      }
    }
  }
  if (!t2 || s2 <= 0 || s1 >= s2 + 3) return { main: t1, sub: t2 && s2 > 0 ? t2 : null };
  const emax = Math.max(E, C, T);
  const poolKey = (() => {
    if (M >= 10 && E <= 0 && C <= 0 && T <= 0) return 'GOOD';
    if (M <= Math.min(E, C, T)) return 'W';
    if (E >= C && E >= T && E === emax) return 'E';
    if (C >= E && C >= T && C === emax) return 'C';
    if (T >= E && T >= C && T === emax) return 'T';
    return 'W';
  })();
  const pool = POOL_EXTRACT[poolKey] || POOL_EXTRACT.W;
  const candidates = arr.filter(([k]) => pool.includes(k));
  const main = (candidates[0] && candidates[0][1] > 0) ? candidates[0][0] : t1;
  const sub = (candidates[1] && candidates[1][1] > 0) ? candidates[1][0] : (main !== t1 ? t1 : t2);
  return { main, sub: sub === main ? null : sub };
}

const strategies = {
  alwaysFirst: (q) => q.options[0],
  alwaysLast: (q) => q.options[q.options.length - 1],
  alwaysSecond: (q) => q.options[Math.min(1, q.options.length - 1)],
  alwaysThird: (q) => q.options[Math.min(2, q.options.length - 1)],
  rotating: (q, step) => q.options[step % q.options.length],
  reverseRotating: (q, step) => q.options[(q.options.length - 1) - (step % q.options.length)],
};

console.log('\n=== 动态仿真 ===');
const dynIssues = [];
for (const [name, strat] of Object.entries(strategies)) {
  for (let seed = 1; seed <= 3; seed++) {
    const r = simulate(strat, seed);
    if (!r.ok) {
      dynIssues.push(`${name}/seed${seed} FAIL: ${r.reason}\n   path=${r.visited.join('->')}`);
      continue;
    }
    if (!TYPES[r.result.main]) dynIssues.push(`${name}/seed${seed} 主人格 '${r.result.main}' 未知`);
    if (r.result.sub && !TYPES[r.result.sub]) dynIssues.push(`${name}/seed${seed} 副人格 '${r.result.sub}' 未知`);
    console.log(
      `  ${name.padEnd(18)} seed=${seed}  steps=${String(r.visited.length).padStart(2)}  ` +
      `dim E${r.dim.E} C${r.dim.C} T${r.dim.T} M${r.dim.M}  =>  ${r.result.main}${r.result.sub ? ' + ' + r.result.sub : ''}`
    );
  }
}

if (dynIssues.length) {
  console.log('\n=== 动态仿真问题 ===');
  dynIssues.forEach((i) => console.log(' - ' + i));
}

const total = issues.length + dynIssues.length;
console.log(`\n结论：${total === 0 ? '全部通过' : total + ' 处待修复'}`);
process.exit(total === 0 ? 0 : 1);
