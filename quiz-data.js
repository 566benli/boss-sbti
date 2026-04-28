/**
 * 题库与跳转严格对齐最新《老板SBTI图鉴》& 《老板SBTI测评小问卷_新版答题逻辑与结果》。
 * next 字段语义：
 *   goto:Qn              -> 直接跳到 Qn
 *   insert:Qn@Qm         -> 插入 Qn，答完后回到 Qm
 *   return               -> 回到栈顶 / 主线
 *   finish               -> 进入结果页
 *   random@peek          -> 尝试从 RANDOM_POOL 插入一道随机情境题，答完后继续主线
 *
 * 人格结果池共 28 种；已移除旧稿的 NULL / CLOWN / GHOST / TOXIC；FAKE 已更名为 BUSY。
 */
(function () {
  const Q = {};

  function opt(text, dim, types, next) {
    return { text, dimension: dim || {}, types: types || {}, next };
  }

  /* ---------- 第一阶段：主线简单题 Q1–Q12 ---------- */

  Q.Q1 = {
    id: "Q1",
    phase: 1,
    title: "下班后，你老板最常见的状态是？",
    options: [
      opt("基本不找我", { E: -1, C: -1, T: -1, M: 2 }, { NURSE: 1, COVER: 1 }, "goto:Q2"),
      opt("有时候会发消息给我「睡了吗？有个小事」", { E: 2, C: 2, T: 1, M: -1 }, { NIGHTer: 5, OTOT: 1 }, "insert:Q13@Q2"),
      opt("电话、微信、钉钉、邮件一起轰炸", { E: 1, C: 4, T: 1, M: -2 }, { RING: 5, CCTV: 2 }, "insert:Q14@Q2"),
      opt("某项任务白天不急，晚上突然说明早就要结果", { E: 3, C: 2, T: 1, M: -2 }, { NIGHTer: 3, OTOT: 2, FOG: 1 }, "insert:Q13@Q2"),
    ],
  };

  Q.Q2 = {
    id: "Q2",
    phase: 1,
    title: "你请假时，TA的第一反应更像？",
    options: [
      opt("会同意让我休息", { E: -1, C: -2, T: -1, M: 3 }, { NURSE: 4, COVER: 2 }, "goto:Q3"),
      opt("问「怎么又请假？」", { E: 2, C: 3, T: 2, M: -2 }, { LEAVE: 5, DADDY: 1, PUAer: 1 }, "insert:Q15@Q3"),
      opt("不情不愿地批准", { E: 1, C: 1, T: 3, M: -1 }, { AUV: 3, MASK: 2 }, "insert:Q20@Q3"),
      opt("可以请，但线上必须随时在线", { E: 3, C: 3, T: 1, M: -2 }, { LEAVE: 3, CCTV: 2, OTOT: 1 }, "insert:Q15@Q3"),
    ],
  };

  Q.Q3 = {
    id: "Q3",
    phase: 1,
    title: "你做出成果后，TA通常怎么处理？",
    options: [
      opt("夸你并给予实在奖励", { E: -3, C: 0, T: -1, M: 4 }, { GOLD: 4, COVER: 2 }, "goto:Q4"),
      opt("成果归TA名下", { E: 3, C: 1, T: 2, M: -3 }, { THIEF: 5, ROACH: 1 }, "insert:Q16@Q4"),
      opt("敷衍口头表扬", { E: 2, C: 1, T: 3, M: -3 }, { THIEF: 3, ROACH: 3, MASK: 1 }, "insert:Q17@Q4"),
      opt("不抢功，但也不帮你争取什么", { E: 1, C: 0, T: 0, M: -1 }, { BUSY: 1, TRASH: 1 }, "goto:Q4"),
    ],
  };

  Q.Q4 = {
    id: "Q4",
    phase: 1,
    title: "项目出事时，TA最像？",
    options: [
      opt("主动冲锋，解决问题，承担领导角色", { E: -1, C: -1, T: -1, M: 4 }, { COVER: 5 }, "goto:Q5"),
      opt("缩头乌龟，事后诸葛", { E: 1, C: 0, T: 2, M: -4 }, { ROACH: 5, BUSY: 1 }, "insert:Q18@Q5"),
      opt("当场愤怒指责，只有情绪不解决问题", { E: 1, C: 1, T: 4, M: -3 }, { BOOM: 5, TRASH: 1 }, "insert:Q19@Q5"),
      opt("一筹莫展，没有方案，扔给员工解决", { E: 1, C: 1, T: 2, M: -4 }, { ROACH: 3, TRASH: 3 }, "goto:Q5"),
    ],
  };

  Q.Q5 = {
    id: "Q5",
    phase: 2,
    title: "TA布置任务时，需求通常是什么样？",
    options: [
      opt("目标、标准、截止时间、优先级都清晰明了", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2, GOLD: 1 }, "goto:Q6"),
      opt("「感觉不对，你再优化一下」", { E: 1, C: 1, T: 1, M: -4 }, { FOG: 5 }, "insert:Q21@Q6"),
      opt("今天要 A，明天要 B，后天又要 C", { E: 2, C: 1, T: 2, M: -4 }, { FOG: 4, MASK: 2, TRASH: 1 }, "insert:Q21@Q6"),
      opt("预算三块五，目标冲火星", { E: 3, C: 1, T: 1, M: -3 }, { MOON: 5, CAKE: 1 }, "insert:Q22@Q6"),
    ],
  };

  /* Q6 主线无分支；在此随机追加一道情境题（Q23/Q26/Q27/Q28），再进入 Q7 */
  Q.Q6 = {
    id: "Q6",
    phase: 2,
    title: "TA看待加班的态度是？",
    options: [
      opt("一般不加班，加班会有加班费", { E: -3, C: -1, T: -1, M: 3 }, { GOLD: 2, NURSE: 2 }, "random@peek"),
      opt("「今天辛苦一下」，但每天都是今天", { E: 5, C: 1, T: 1, M: -2 }, { OTOT: 5, SUCKER: 2 }, "random@peek"),
      opt("不强制，但加班已成默认常态", { E: 5, C: 0, T: 2, M: -3 }, { SUCKER: 5, MONK: 2 }, "random@peek"),
      opt("「年轻人要多锻炼」", { E: 4, C: 2, T: 3, M: -3 }, { MASK: 3, PUAer: 2, OTOT: 2 }, "random@peek"),
    ],
  };

  Q.Q7 = {
    id: "Q7",
    phase: 2,
    title: "TA开会的风格是？",
    options: [
      opt("偶尔开会，高效完成", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "goto:Q8"),
      opt("「我来简单说两句」，然后说很久", { E: 1, C: 1, T: 1, M: -2 }, { TEDX: 5 }, "goto:Q8"),
      opt("一天八个会", { E: 2, C: 2, T: 0, M: -3 }, { BUSY: 4, TEDX: 2 }, "goto:Q8"),
      opt("开会要么打鸡血要么批斗大会", { E: 1, C: 2, T: 3, M: -3 }, { KING: 2, CULT: 3 }, "goto:Q8"),
    ],
  };

  Q.Q8 = {
    id: "Q8",
    phase: 2,
    title: "当你提出不同意见时，TA通常？",
    options: [
      opt("会认真理解并接纳", { E: -1, C: -1, T: -1, M: 3 }, { COVER: 2, NURSE: 1 }, "goto:Q9"),
      opt("「不，我以前都不是这么做的」", { E: 1, C: 1, T: 1, M: -4 }, { BRICK: 5 }, "goto:Q9"),
      opt("「你是老板我是老板？」", { E: 1, C: 3, T: 3, M: -3 }, { KING: 5, DADDY: 1 }, "goto:Q9"),
      opt("敷衍或者冷处理", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 4, MASK: 3 }, "insert:Q20@Q9"),
    ],
  };

  Q.Q9 = {
    id: "Q9",
    phase: 2,
    title: "TA最喜欢用什么激励员工？",
    options: [
      opt("给钱、给资源、给机会", { E: -4, C: 0, T: -1, M: 4 }, { GOLD: 5, COVER: 1 }, "goto:Q10"),
      opt("讲奉献、格局、使命感", { E: 3, C: 1, T: 2, M: -2 }, { SAINT: 5, MONK: 2 }, "goto:Q10"),
      opt("万能金句「公司将来不会亏待你的」", { E: 4, C: 0, T: 1, M: -2 }, { CAKE: 5, SUCKER: 1 }, "insert:Q24@Q10"),
      opt("说「吃亏是福，不要那么计较」", { E: 3, C: 1, T: 4, M: -3 }, { PUAer: 5, SAINT: 2, SUCKER: 1 }, "insert:Q25@Q10"),
    ],
  };

  Q.Q10 = {
    id: "Q10",
    phase: 2,
    title: "TA情绪稳定吗？",
    options: [
      opt("很稳定", { E: -1, C: 0, T: -3, M: 3 }, { NURSE: 2, COVER: 2 }, "goto:Q11"),
      opt("一句话不对就发脾气", { E: 1, C: 1, T: 5, M: -3 }, { BOOM: 5 }, "insert:Q19@Q11"),
      opt("不直接骂，但阴阳怪气", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 4, MASK: 1 }, "insert:Q20@Q11"),
      opt("表面温柔，实际爱记仇给人穿小鞋", { E: 1, C: 1, T: 4, M: -2 }, { MASK: 5 }, "insert:Q20@Q11"),
    ],
  };

  Q.Q11 = {
    id: "Q11",
    phase: 3,
    title: "TA能力怎么样？",
    options: [
      opt("能力很强，团队楷模", { E: -1, C: 0, T: -1, M: 4 }, { COVER: 3, GOLD: 1 }, "goto:Q12"),
      opt("不专业，但爱瞎指挥", { E: 1, C: 2, T: 2, M: -5 }, { TRASH: 5 }, "goto:Q12"),
      opt("不怎么样，还很固执", { E: 1, C: 1, T: 1, M: -4 }, { BRICK: 5 }, "goto:Q12"),
      opt("每天都很忙，但没有实际产出", { E: 1, C: 2, T: 0, M: -4 }, { BUSY: 5 }, "goto:Q12"),
    ],
  };

  Q.Q12 = {
    id: "Q12",
    phase: 4,
    title: "如果用一句话总结这个老板，TA更像？",
    options: [
      opt("成熟优秀，善解人意", { E: -3, C: -3, T: -3, M: 5 }, { COVER: 3, NURSE: 3, GOLD: 2 }, "finish"),
      opt("天天压榨员工", { E: 5, C: 1, T: 2, M: -3 }, { SUCKER: 4, OTOT: 2 }, "finish"),
      opt("办公室情绪污染源", { E: 1, C: 1, T: 5, M: -3 }, { PUAer: 2, BOOM: 2, AUV: 2, MASK: 1 }, "finish"),
      opt("人菜瘾大还爱装", { E: 1, C: 2, T: 2, M: -5 }, { TRASH: 4, BUSY: 2, TEDX: 1 }, "finish"),
    ],
  };

  /* ---------- 第二阶段：情景题 / 分支追问题 Q13–Q28 ---------- */
  /* 注意：title 字段为内部标签，不在测试界面展示；scenario 为用户看到的题目内容 */

  Q.Q13 = {
    id: "Q13",
    phase: 2,
    title: "",
    scenario:
      "想象一下，晚上你洗完澡美美躺下睡觉，第二天早上你醒来发现老板昨天晚上发消息说让你临时办一件小事，且这个「小事」其实很麻烦。以下什么情景最可能出现？",
    options: [
      opt("你回复TA之后，无事发生", { E: -1, C: -1, T: -1, M: 2 }, { NURSE: 2 }, "return"),
      opt("TA问：「昨晚怎么没回？很急啊！」", { E: 2, C: 3, T: 1, M: -2 }, { NIGHTer: 4, RING: 2 }, "return"),
      opt("TA说：「我以为你能很快搞完呢」", { E: 3, C: 1, T: 2, M: -2 }, { OTOT: 3, SUCKER: 2 }, "return"),
      opt("TA不骂，但第二天阴阳：「睡得挺好吧」", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 3, MASK: 2 }, "return"),
    ],
  };

  Q.Q14 = {
    id: "Q14",
    phase: 2,
    title: "",
    scenario:
      "想象一下，你在地铁里信号不好，10 分钟没回消息。出站后手机显示：微信 4 条、钉钉 3 条、电话 2 个、邮件 1 封。以下什么情景最可能出现？",
    options: [
      opt("TA说：「有时间了处理一下」", { E: -1, C: -2, T: -1, M: 2 }, { NURSE: 2, COVER: 1 }, "return"),
      opt("第一句：「你刚才在干嘛？」", { E: 1, C: 4, T: 1, M: -2 }, { CCTV: 4, RING: 2 }, "return"),
      opt("TA说：「工作响应速度太慢了吧」", { E: 2, C: 4, T: 2, M: -3 }, { RING: 5, PUAer: 1 }, "return"),
      opt("嘴上说没事，会上点名你「响应慢」", { E: 1, C: 3, T: 4, M: -2 }, { MASK: 3, AUV: 2, CCTV: 1 }, "return"),
    ],
  };

  Q.Q15 = {
    id: "Q15",
    phase: 2,
    title: "",
    scenario:
      "想象一下，你头痛不适，想请一天病假。TA回复：「怎么又请假？」你解释身体情况后，TA更可能说：",
    options: [
      opt("「那你好好休息吧」", { E: -2, C: -2, T: -2, M: 4 }, { NURSE: 4, COVER: 2 }, "return"),
      opt("「那你能不能线上看一下？不用太久」", { E: 3, C: 4, T: 2, M: -3 }, { LEAVE: 5, CCTV: 2, OTOT: 1 }, "return"),
      opt("「大家都不容易，你这个时间点请假不合适」", { E: 3, C: 3, T: 3, M: -3 }, { LEAVE: 4, PUAer: 2 }, "return"),
      opt("「你要学会对自己的工作负责」", { E: 2, C: 2, T: 4, M: -3 }, { DADDY: 3, PUAer: 3, LEAVE: 2 }, "return"),
    ],
  };

  Q.Q16 = {
    id: "Q16",
    phase: 2,
    title: "",
    scenario:
      "想象一下，你熬夜做完方案，大老板会上夸项目。直属老板立刻说：「这个项目是我一手带出来的。」接着更有可能发生的是：",
    options: [
      opt("TA会补充「具体执行主要靠 XX」（点名你）", { E: -2, C: 0, T: -1, M: 3 }, { GOLD: 2, COVER: 2 }, "return"),
      opt("全程不提你，会后让你把材料发TA", { E: 4, C: 1, T: 2, M: -4 }, { THIEF: 5, SUCKER: 1 }, "return"),
      opt("如果项目出问题，TA会说「这个部分是你负责的吧」", { E: 3, C: 1, T: 3, M: -5 }, { THIEF: 4, ROACH: 3, MASK: 1 }, "return"),
      opt("TA私下里和你说「不要太计较个人得失」", { E: 3, C: 1, T: 4, M: -3 }, { PUAer: 3, SAINT: 2, THIEF: 2 }, "return"),
    ],
  };

  Q.Q17 = {
    id: "Q17",
    phase: 2,
    title: "",
    scenario:
      "想象一下，客户指出一个错误，这个错误其实来自老板前一天临时改的方向。TA会在群里说：",
    options: [
      opt("承认错误，表达抱歉且鼓励修正", { E: -1, C: 0, T: -1, M: 4 }, { COVER: 4 }, "return"),
      opt("公开不认，私下说「你们怎么没提醒我？」", { E: 2, C: 1, T: 4, M: -4 }, { ROACH: 4, MASK: 2 }, "return"),
      opt("直接把锅扣给执行的人", { E: 3, C: 1, T: 3, M: -5 }, { ROACH: 4, THIEF: 2, TRASH: 1 }, "return"),
      opt("讲「责任意识」，但没有解决方案", { E: 1, C: 1, T: 3, M: -4 }, { DADDY: 2, TEDX: 2, TRASH: 2 }, "return"),
    ],
  };

  Q.Q18 = {
    id: "Q18",
    phase: 2,
    title: "",
    scenario:
      "想象一下，在项目最危急的时候老板不回消息，两小时后TA出现的第一句话大概率是：",
    options: [
      opt("「没事，我已经解决了」", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 3 }, "return"),
      opt("「现在什么情况？你们怎么搞的？」", { E: 1, C: 1, T: 3, M: -4 }, { ROACH: 5, TRASH: 2 }, "return"),
      opt("「我在忙，你们先自己处理」", { E: 1, C: 1, T: 1, M: -3 }, { BUSY: 3, ROACH: 2 }, "return"),
      opt("「这个事情我之前应该提醒过你们吧？」", { E: 1, C: 1, T: 4, M: -4 }, { MASK: 3, ROACH: 3, PUAer: 1 }, "return"),
    ],
  };

  Q.Q19 = {
    id: "Q19",
    phase: 2,
    title: "",
    scenario:
      "你只是问：「这个版本是按昨天方向继续吗？」TA更可能回复：",
    options: [
      opt("「对，辛苦了」", { E: -1, C: 0, T: -2, M: 2 }, { COVER: 1, NURSE: 1 }, "return"),
      opt("「废话！」", { E: 1, C: 1, T: 5, M: -4 }, { BOOM: 5, TRASH: 2 }, "return"),
      opt("「你要学会自己拿主意」", { E: 1, C: 1, T: 4, M: -3 }, { AUV: 2, MASK: 2 }, "return"),
      opt("「你觉得呢？」", { E: 1, C: 1, T: 4, M: -4 }, { BOOM: 3, FOG: 2, TRASH: 2 }, "return"),
    ],
  };

  Q.Q20 = {
    id: "Q20",
    phase: 2,
    title: "",
    scenario:
      "你完成方案，TA看完说：「你真是个人才。」这句话通常意味着？",
    options: [
      opt("真的认可", { E: -1, C: 0, T: -1, M: 2 }, { COVER: 1, GOLD: 1 }, "return"),
      opt("意思是「你很幼稚」", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 5 }, "return"),
      opt("「你这个奇葩，真是离谱」", { E: 1, C: 1, T: 4, M: -3 }, { MASK: 4, AUV: 2 }, "return"),
      opt("即将教训你，凸显TA的职场优越感", { E: 1, C: 1, T: 3, M: -2 }, { DADDY: 4, TEDX: 1 }, "return"),
    ],
  };

  Q.Q21 = {
    id: "Q21",
    phase: 2,
    title: "",
    scenario:
      "你做了三版方案，TA都否决了，你问具体方向，TA通常会：",
    options: [
      opt("给你明确答复", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "return"),
      opt("「这个你要自己理解，不能什么都问我」", { E: 2, C: 1, T: 3, M: -4 }, { FOG: 4, PUAer: 2 }, "return"),
      opt("「啧，反正感觉不对」", { E: 1, C: 1, T: 1, M: -5 }, { FOG: 5 }, "return"),
      opt("「你先多出几个版本咱们挑挑看吧」", { E: 3, C: 1, T: 1, M: -3 }, { FOG: 3, SUCKER: 2, OTOT: 1 }, "return"),
    ],
  };

  Q.Q22 = {
    id: "Q22",
    phase: 2,
    title: "",
    scenario:
      "想象一下，你们团队收到一个有难度的任务，团队只有 3 个人且预算很少，老板通常会：",
    options: [
      opt("「没事，我们先拆解阶段目标」", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "return"),
      opt("「你们必须做到完美」", { E: 3, C: 1, T: 3, M: -3 }, { MOON: 5, PUAer: 1 }, "return"),
      opt("「资源不是问题，关键看你们有没有决心」", { E: 4, C: 1, T: 3, M: -3 }, { MOON: 3, SAINT: 2, MONK: 1 }, "return"),
      opt("「公司将来不会亏待你们的，好好干」", { E: 4, C: 0, T: 2, M: -2 }, { CAKE: 4, MOON: 2 }, "return"),
    ],
  };

  Q.Q23 = {
    id: "Q23",
    phase: 2,
    title: "",
    scenario:
      "如果你连续几天状态很差，效率明显下降。老板注意到了，TA可能会？",
    options: [
      opt("关心你，询问是否需要请假休息", { E: -2, C: -1, T: -3, M: 5 }, { NURSE: 6 }, "return"),
      opt("说「大家都累，你要学会自己调整」", { E: 3, C: 1, T: 3, M: -3 }, { PUAer: 2, MONK: 2, DADDY: 1 }, "return"),
      opt("不问原因，只说「最近产出不太行，得加把劲」", { E: 2, C: 1, T: 2, M: -3 }, { SUCKER: 2, TRASH: 1 }, "return"),
      opt("表面关心，实际试探你是不是想离职", { E: 1, C: 3, T: 4, M: -2 }, { MASK: 4, CCTV: 1 }, "return"),
    ],
  };

  Q.Q24 = {
    id: "Q24",
    phase: 2,
    title: "",
    scenario:
      "项目完成后公司拿到不错的结果。老板在复盘会上说：",
    options: [
      opt("「大家辛苦了，奖金已经到你们账户上了」", { E: -5, C: 0, T: -2, M: 5 }, { GOLD: 6, COVER: 2 }, "return"),
      opt("「不要只看短期回报，经验是无价的」", { E: 4, C: 0, T: 2, M: -2 }, { SAINT: 3, CAKE: 2, MONK: 1 }, "return"),
      opt("「这次在我的带领下大家都做的不错」", { E: 2, C: 1, T: 2, M: -3 }, { THIEF: 3, KING: 1 }, "return"),
      opt("「公司将来不会亏待你们的」", { E: 4, C: 0, T: 1, M: -2 }, { CAKE: 5 }, "return"),
    ],
  };

  Q.Q25 = {
    id: "Q25",
    phase: 2,
    title: "",
    scenario:
      "假设你做出成果后，提出涨薪或补偿，TA大概率会：",
    options: [
      opt("愿意考虑或者爽快答应", { E: -1, C: 0, T: -1, M: 2 }, { GOLD: 1, COVER: 1 }, "return"),
      opt("说你心态不对、格局不够", { E: 3, C: 1, T: 5, M: -3 }, { PUAer: 5, SAINT: 1 }, "return"),
      opt("说年轻人吃点苦是好事", { E: 3, C: 0, T: 3, M: -2 }, { MONK: 5, DADDY: 1 }, "return"),
      opt("说除了工资，你就没有在意的东西了吗？", { E: 3, C: 1, T: 3, M: -2 }, { SAINT: 5, PUAer: 1 }, "return"),
    ],
  };

  Q.Q26 = {
    id: "Q26",
    phase: 2,
    title: "",
    scenario:
      "公司大会上，老板把企业文化讲得像圣经。最典型的一幕更像是：",
    options: [
      opt("不，我的老板不会用企业文化反对不同意见", { E: -1, C: -1, T: -1, M: 2 }, { COVER: 1 }, "return"),
      opt("质疑目标就是叛教", { E: 2, C: 4, T: 3, M: -3 }, { CULT: 5, KING: 1 }, "return"),
      opt("要求把公司当家，但加班没有加班费", { E: 3, C: 3, T: 2, M: -3 }, { CULT: 4, SAINT: 2 }, "return"),
      opt("滔滔不绝地讲「统一思想」", { E: 1, C: 4, T: 2, M: -3 }, { CULT: 4, TEDX: 1 }, "return"),
    ],
  };

  Q.Q27 = {
    id: "Q27",
    phase: 2,
    title: "",
    scenario:
      "任何事情到TA手里，最后更有可能变成：",
    options: [
      opt("一个清晰的任务清单", { E: -1, C: 0, T: -1, M: 2 }, { COVER: 1 }, "return"),
      opt("「你拉个表给我」", { E: 1, C: 3, T: 0, M: -2 }, { SHEET: 5 }, "return"),
      opt("表格套表格，汇总套汇总", { E: 2, C: 4, T: 1, M: -3 }, { SHEET: 5, BUSY: 1 }, "return"),
      opt("做完表以后，TA说：「这个格式不太对」", { E: 2, C: 3, T: 2, M: -3 }, { SHEET: 4, FOG: 2 }, "return"),
    ],
  };

  Q.Q28 = {
    id: "Q28",
    phase: 2,
    title: "",
    scenario:
      "进TA办公室汇报，氛围最像：",
    options: [
      opt("轻松平等的对话", { E: -1, C: -1, T: -1, M: 3 }, { COVER: 2 }, "return"),
      opt("像觐见皇帝，说话小心谨慎", { E: 1, C: 4, T: 3, M: -3 }, { KING: 5 }, "return"),
      opt("因为一些小事教育你", { E: 1, C: 4, T: 4, M: -3 }, { KING: 5, DADDY: 1 }, "return"),
      opt("小说霸总，死装且不容置疑", { E: 1, C: 4, T: 2, M: -4 }, { KING: 4, BRICK: 2 }, "return"),
    ],
  };

  window.QUIZ_QUESTIONS = Q;
  window.RANDOM_POOL = ["Q23", "Q26", "Q27", "Q28"];

  window.BRANCH_HINTS = {
    Q13: "系统检测到夜间诈尸信号。正在确认是否为 NIGHT-er 变异株。",
    Q14: "系统检测到你的老板存在「连环催命」特征。追加情境题……",
    Q15: "系统检测到你的老板疑似存在「请假粉碎倾向」。正在追加审讯题……",
    Q16: "系统检测到你的老板可能是「抢功型生物」。进入功劳归属深度鉴定。",
    Q17: "系统检测到你的老板在「背锅现场」露出痕迹。追加鉴定……",
    Q18: "系统检测到你的老板疑似「消失型物种」。追加追问……",
    Q19: "系统检测到「爆炸现场」反应。追加追问……",
    Q20: "系统检测到你的老板疑似「阴阳怪气型」。追加追问……",
    Q21: "系统检测到你的老板疑似「需求迷雾型」。追加情境题……",
    Q22: "系统检测到你的老板疑似「登月 KPI 型」。追加情境题……",
    Q24: "系统检测到空气中出现浓郁饼香。正在判断是 GOLD 兑现型，还是 CAKE 千层饼型。",
    Q25: "系统检测到疑似「感恩教育」信号。追加追问……",
  };

  window.RANDOM_HINT = "系统正在随机追加一道情境鉴定题……";

  window.SURVIVAL_ADVICE = {
    LEAVE:
      "生存建议：请假时尽量明确请假时段、工作交接、紧急联系人和不可工作的原因，并保留书面记录。面对这种老板，模糊表达会被他当成继续压榨的入口。",
    SUCKER:
      "生存建议：把每一次「辛苦一下」都折算成具体工时；对方反复用「年轻人要锻炼」包装压榨时，优先协商范围、补偿与截止时间，而不是点头。",
    OTOT:
      "生存建议：留下排班与加班证据（排班截图、邮件、打卡记录），评估实际时薪；长期被当作备用电池时，请优先规划退路。",
    PUAer:
      "生存建议：对方打压时尽量回到事实和数据，不接情绪球；把每次评价落到具体行为上，不要接受模糊的人格贬损。",
    CAKE:
      "生存建议：画饼一律要求书面化 —— 岗位、薪酬、时间表、兑现条件；没有节点的承诺一律按「没有」处理。",
    CCTV:
      "生存建议：界定工作时间内外的响应边界，非紧急事项统一在工作时段处理；必要时使用文字渠道留痕，避免口头问责。",
    RING:
      "生存建议：在不同平台（电话 / IM / 邮件）之间建立固定响应节奏，避免被多平台同时催死；紧急定义最好落到文字。",
    CULT:
      "生存建议：对企业文化保持礼貌距离，不做教徒；关键承诺必须走合同和流程，不在「家人」语境中让渡权利。",
    KING:
      "生存建议：汇报只讲选项与风险，把决策权交还给他；书面留痕关键判断，不替他背拍脑袋的决定。",
    BOOM:
      "生存建议：关键沟通尽量用文字，不在情绪高峰处接触；一旦爆炸，先不反驳，事后再按事实补齐记录。",
    MASK:
      "生存建议：只相信写下来的东西；当面温柔和 IM 里笑脸不能抵扣任何没有落地的承诺。",
    AUV:
      "生存建议：阴阳话请求明确翻译：「您的意思是……吗？」把模糊敌意逼成具体问题，大多数阴阳老板会退一步。",
    DADDY:
      "生存建议：人生道理听到哪里算哪里，把话题拉回工作目标和交付物；不要在情绪层面和他辩论「你还年轻」。",
    TEDX:
      "生存建议：主动帮他做 agenda 和会议结论；一切没有结论的长篇发言，会后用文字回写「我理解的决定是 X，如无异议将按此执行」。",
    BUSY:
      "生存建议：不要被他的忙碌感带偏节奏；自己划优先级、卡关键节点，把他当作审批环节而不是决策依赖。",
    TRASH:
      "生存建议：尽量把业务判断放到有数据的会上做；对草率否定，要求对方给出可衡量的标准，而不是直接返工。",
    BRICK:
      "生存建议：正面硬刚通常无效，先用小规模试点 / 数据对比说话；真推不动时，把决策权和风险在邮件里同步给他。",
    FOG:
      "生存建议：每一次「感觉不对」都请求具体样例或对标参考；三版内还没有明确方向的，请求他本人下场改一版做 benchmark。",
    MOON:
      "生存建议：把登月目标拆成资源、人力、时间三张表，让他自己签字确认缺口；不替他补差额，也不替他背 KPI。",
    SAINT:
      "生存建议：不接「格局」「使命」牌；所有奉献都要求对应的货币或时间补偿，书面化「不给钱也要给假」。",
    MONK:
      "生存建议：自己管理身体节奏，不为「吃苦光荣」叙事加班；把「苦」精确翻译成「无补偿的额外工时」来谈判。",
    THIEF:
      "生存建议：功劳实时留痕（群内同步、周报、对外邮件署名），让外部也知道是谁做的；必要时直接向上一层汇报成果。",
    ROACH:
      "生存建议：别替他背模糊的锅；发现事情要出问题时，先用书面预警对齐责任边界，再推进执行。",
    SHEET:
      "生存建议：表格做简洁，每张表附「最多 3 条结论」；坚决避免被拖进表套表、统计套统计的无效内卷。",
    NIGHTer:
      "生存建议：明确你「夜间不在线」的窗口；第二天白天再回，并且把延迟响应的代价前置告诉对方。",
    GOLD: "相处建议：珍惜这种稀有物种。把贡献说清楚、把结果沉淀好，这类老板通常愿意给真实回报。",
    COVER: "相处建议：把判断和风险坦白地同步给他，他会在关键时刻挡一下；记得也帮他扛一些他管不到的小事。",
    NURSE: "相处建议：愿意沟通状态和瓶颈；他给的松弛不是福利，是信任，请把它用在把事做稳上，而不是摸鱼。",
    DEFAULT:
      "生存建议：保护好身心健康边界，重要沟通尽量留痕；涉及利益与工时的事项用书面确认。",
  };

  window.DIMENSION_LABELS = {
    E: "榨取压榨值",
    C: "控制入侵值",
    T: "精神毒性值",
    M: "管理成熟值",
  };
})();
