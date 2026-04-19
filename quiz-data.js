/**
 * 题库与跳转摘自《老板SBTI图鉴.pdf》设计稿；next 字段：
 * goto:Qn | insert:Qn@resumeQm | return | finish | random@resumeQm
 */
(function () {
  const Q = {};

  function opt(text, dim, types, next) {
    return { text, dimension: dim || {}, types: types || {}, next };
  }

  /* ---------- 主线 Q1–Q12 ---------- */
  Q.Q1 = {
    id: "Q1",
    phase: 1,
    title: "下班后，你老板最常见的状态是？",
    options: [
      opt("基本不找人，除非真有紧急情况。", { E: -1, C: -1, T: -1, M: 2 }, { NURSE: 1, COVER: 1 }, "insert:Q13@Q2"),
      opt("晚上 11 点突然复活：“睡了吗？有个小事。”", { E: 2, C: 2, T: 1, M: -1 }, { NIGHTer: 4, OTOT: 1 }, "insert:Q14@Q2"),
      opt("电话、微信、钉钉、邮件一起轰炸。", { E: 1, C: 4, T: 1, M: -2 }, { RING: 5, CCTV: 2 }, "insert:Q13@Q2"),
      opt("白天不急，晚上突然说明早就要。", { E: 3, C: 2, T: 1, M: -2 }, { NIGHTer: 2, OTOT: 2, FOG: 1 }, "goto:Q2"),
    ],
  };

  Q.Q2 = {
    id: "Q2",
    phase: 1,
    title: "你请假时，他的第一反应更像？",
    options: [
      opt("你先休息，工作我们来协调。", { E: -1, C: -2, T: -1, M: 3 }, { NURSE: 3, COVER: 2 }, "goto:Q3"),
      opt("“怎么又请假？”", { E: 2, C: 3, T: 2, M: -2 }, { LEAVE: 5, DADDY: 1, PUAer: 1 }, "insert:Q15@Q3"),
      opt("表面批准，背后阴阳你。", { E: 1, C: 1, T: 3, M: -1 }, { AUV: 3, MASK: 2 }, "insert:Q20@Q3"),
      opt("“你要学会对自己的工作负责。”", { E: 2, C: 2, T: 4, M: -3 }, { LEAVE: 4, DADDY: 2, PUAer: 2 }, "insert:Q15@Q3"),
    ],
  };

  Q.Q3 = {
    id: "Q3",
    phase: 1,
    title: "你做出成果后，他通常怎么处理？",
    options: [
      opt("先解决问题，再向上承担压力。", { E: -1, C: -1, T: -1, M: 4 }, { COVER: 5 }, "goto:Q4"),
      opt("第一时间消失，别人背完锅后再出来总结。", { E: 1, C: 0, T: 2, M: -4 }, { ROACH: 4, GHOST: 4 }, "insert:Q18@Q5"),
      opt("当场爆炸，随机喷射情绪碎片。", { E: 1, C: 1, T: 4, M: -3 }, { BOOM: 5, TOXIC: 2 }, "insert:Q19@Q5"),
      opt("说“你们先反思一下”，自己没有方案。", { E: 1, C: 1, T: 2, M: -4 }, { ROACH: 3, TRASH: 2, NULL: 1 }, "goto:Q4"),
    ],
  };

  Q.Q4 = {
    id: "Q4",
    phase: 1,
    title: "项目出事时，他最像？",
    options: [
      opt("可以请，但你假期必须随时在线。", { E: 3, C: 3, T: 1, M: -2 }, { LEAVE: 3, CCTV: 2, OTOT: 1 }, "insert:Q15@Q5"),
      opt("明确说是谁做的，并帮你争取回报。", { E: -3, C: 0, T: -1, M: 4 }, { GOLD: 4, COVER: 2 }, "goto:Q5"),
      opt("汇报时变成“这是我带团队做出来的”。", { E: 3, C: 1, T: 2, M: -3 }, { THIEF: 5, ROACH: 1 }, "insert:Q16@Q5"),
      opt("成果归团队，锅归个人。", { E: 2, C: 1, T: 2, M: -3 }, { THIEF: 2, ROACH: 3, MASK: 1 }, "insert:Q17@Q5"),
      opt("不抢功，但也不会帮你争取什么。", { E: 1, C: 0, T: 0, M: -1 }, { NULL: 2, FAKE: 1 }, "goto:Q5"),
    ],
  };

  Q.Q5 = {
    id: "Q5",
    phase: 2,
    title: "他布置任务时，需求通常是什么样？",
    options: [
      opt("目标、标准、截止时间、优先级都清楚。", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "goto:Q6"),
      opt("“感觉不对，你再优化一下。”", { E: 2, C: 2, T: 0, M: -3 }, { FOG: 5 }, "insert:Q21@Q6"),
      opt("今天要 A，明天要 B，后天说一开始要的就是 C。", { E: 1, C: 2, T: 3, M: -3 }, { FOG: 3, MASK: 2, TRASH: 1 }, "insert:Q21@Q6"),
      opt("预算三块五，目标冲火星。", { E: 3, C: 1, T: 1, M: -3 }, { MOON: 5, CAKE: 1 }, "insert:Q22@Q6"),
    ],
  };

  Q.Q6 = {
    id: "Q6",
    phase: 2,
    title: "他看待加班的态度是？",
    options: [
      opt("尽量避免加班，真加班会补偿。", { E: -1, C: 0, T: -1, M: 3 }, { GOLD: 2, NURSE: 2 }, "goto:Q7"),
      opt("“今天辛苦一下”，但每天都是今天。", { E: 3, C: 1, T: 1, M: -2 }, { OTOT: 5, SUCKER: 2 }, "random@Q7"),
      opt("“年轻人多锻炼”，但钱和休息都不给。", { E: 5, C: 0, T: 2, M: -3 }, { SUCKER: 4, MONK: 2 }, "random@Q7"),
      opt("嘴上不强制，实际上不加班就被边缘化。", { E: 4, C: 2, T: 3, M: -3 }, { MASK: 3, PUAer: 2, OTOT: 2 }, "random@Q7"),
    ],
  };

  Q.Q7 = {
    id: "Q7",
    phase: 2,
    title: "他开会的风格是？",
    options: [
      opt("有议程、有结论，能不开就不开。", { E: -3, C: -1, T: -1, M: 3 }, { COVER: 2 }, "goto:Q8"),
      opt("“我最后说两句”，然后说了 48 分钟。", { E: 5, C: 1, T: 1, M: -2 }, { TEDX: 5 }, "goto:Q8"),
      opt("一天八个会，每个会都是“同步一下”。", { E: 5, C: 0, T: 2, M: -3 }, { FAKE: 4, TEDX: 2 }, "goto:Q8"),
      opt("会上不解决问题，主要观察谁站队。", { E: 4, C: 2, T: 3, M: -3 }, { KING: 2, CULT: 2, COVER: 2, GOLD: 1 }, "goto:Q8"),
    ],
  };

  Q.Q8 = {
    id: "Q8",
    phase: 2,
    title: "当你提出不同意见时，他通常？",
    options: [
      opt("会听，有道理就改。", { E: -1, C: -1, T: -1, M: 3 }, { BRICK: 5 }, "goto:Q9"),
      opt("“以前都是这么做的。”", { E: 1, C: 1, T: 1, M: -4 }, { KING: 5, DADDY: 1 }, "goto:Q9"),
      opt("“你是老板我是老板？”", { E: 1, C: 3, T: 3, M: -3 }, { AUV: 3, MASK: 3 }, "goto:Q9"),
      opt("表面说“你很有想法”，之后开始冷处理。", { E: 1, C: 1, T: 4, M: -2 }, { GOLD: 5 }, "goto:Q9"),
    ],
  };

  Q.Q9 = {
    id: "Q9",
    phase: 2,
    title: "他最喜欢用什么激励员工？",
    options: [
      opt("讲奉献、格局、使命感。", { E: 4, C: 0, T: 1, M: -2 }, { SAINT: 4, MONK: 2 }, "goto:Q10"),
      opt("说“以后空间很大”，但现在什么都没有。", { E: 3, C: 1, T: 4, M: -3 }, { CAKE: 5, SUCKER: 1 }, "goto:Q10"),
      opt("说“你能力还不够，先别谈回报”。", { E: 1, C: 1, T: 4, M: -2 }, { PUAer: 4, SUCKER: 2 }, "goto:Q10"),
      opt("给钱、给资源、给机会。", { E: -4, C: 0, T: -1, M: 4 }, { GOLD: 5 }, "goto:Q11"),
    ],
  };

  Q.Q10 = {
    id: "Q10",
    phase: 2,
    title: "他情绪稳定吗？",
    options: [
      opt("稳定，压力大也不会乱伤人。", { E: -1, C: 0, T: -3, M: 3 }, { NURSE: 2, COVER: 2 }, "goto:Q11"),
      opt("一句话不对就爆炸。", { E: 1, C: 1, T: 5, M: -3 }, { BOOM: 5, TOXIC: 2 }, "goto:Q11"),
      opt("不爆炸，但每天散发低气压。", { E: 1, C: 2, T: 2, M: -3 }, { TOXIC: 5 }, "goto:Q11"),
      opt("表面温柔，背后切割。", { E: 1, C: 1, T: 4, M: -2 }, { MASK: 5 }, "goto:Q11"),
    ],
  };

  Q.Q11 = {
    id: "Q11",
    phase: 3,
    title: "他能力怎么样？",
    options: [
      opt("有能力，也愿意承担责任。", { E: -1, C: 0, T: -1, M: 4 }, { COVER: 3, GOLD: 1 }, "goto:Q12"),
      opt("不懂业务，但特别爱指挥。", { E: 1, C: 2, T: 2, M: -5 }, { TRASH: 5 }, "insert:Q19@Q12"),
      opt("职位很高，但没什么实际内容。", { E: 0, C: 1, T: 0, M: -4 }, { NULL: 5 }, "goto:Q12"),
      opt("忙得飞起，但没有有效产出。", { E: 1, C: 2, T: 0, M: -4 }, { FAKE: 5 }, "insert:Q20@Q12"),
    ],
  };

  Q.Q12 = {
    id: "Q12",
    phase: 4,
    title: "如果用一句话总结这个老板，他更像？",
    options: [
      opt("少见的正常成年人。", { E: -3, C: -3, T: -3, M: 5 }, { COVER: 3, NURSE: 3, GOLD: 2 }, "finish"),
      opt("活着就是为了压榨别人。", { E: 5, C: 1, T: 2, M: -3 }, { SUCKER: 4, OTOT: 2 }, "finish"),
      opt("办公室空气污染源。", { E: 1, C: 1, T: 5, M: -3 }, { TOXIC: 4, BOOM: 2 }, "finish"),
      opt("人菜瘾大还爱装。", { E: 1, C: 2, T: 2, M: -5 }, { TRASH: 4, CLOWN: 2, FAKE: 2 }, "finish"),
    ],
  };

  /* ---------- 情境与追问 Q13–Q24 ---------- */
  Q.Q13 = {
    id: "Q13",
    phase: 2,
    title: "深夜需求情境题",
    scenario:
      "晚上 11:47，你已经洗完澡躺下，老板发来一句：“睡了吗？有个小事，很简单。”第二天早上你发现，这个“小事”需要改 6 页 PPT、补 3 组数据、重新写结论。",
    options: [
      opt("“不好意思昨晚太晚了，这个今天白天再看。”", { E: -1, C: -1, T: -1, M: 2 }, { NURSE: 2 }, "return"),
      opt("“你昨晚怎么没回？这个很急啊。”", { E: 2, C: 3, T: 1, M: -2 }, { NIGHTer: 3, RING: 2, CCTV: 1 }, "return"),
      opt("“我以为这个对你来说很快。”", { E: 3, C: 1, T: 2, M: -2 }, { OTOT: 3, SUCKER: 2, PUAer: 1 }, "return"),
      opt("“算了，我也不说了，你自己心里有数。”", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 3, MASK: 2 }, "return"),
    ],
  };

  Q.Q14 = {
    id: "Q14",
    phase: 2,
    title: "连环催命情境题",
    scenario:
      "你在地铁里信号不好，10 分钟没回消息。出站后手机显示：微信 4 条、钉钉 3 条、电话 2 个、邮件 1 封。老板第一句话是？",
    options: [
      opt("“刚才不方便吧？看到了再处理。”", { E: -1, C: -2, T: -1, M: 2 }, { NURSE: 2, COVER: 1 }, "return"),
      opt("“你刚才怎么没回？”", { E: 1, C: 4, T: 1, M: -2 }, { CCTV: 4, RING: 2 }, "return"),
      opt("“我找你半天了，这点响应速度都没有？”", { E: 2, C: 4, T: 2, M: -3 }, { RING: 4, PUAer: 1 }, "return"),
      opt("“没事，你忙你的。”但之后开会点名你“响应慢”。", { E: 1, C: 3, T: 4, M: -2 }, { MASK: 3, AUV: 2, CCTV: 1 }, "return"),
    ],
  };

  Q.Q15 = {
    id: "Q15",
    phase: 3,
    title: "请假审讯情境题",
    scenario:
      "你发烧 39 度，想请一天病假。他回复：“怎么又请假？”你解释身体情况后，他更可能说：",
    options: [
      opt("“那你先休息，工作我安排别人接一下。”", { E: -2, C: -2, T: -2, M: 4 }, { NURSE: 4, COVER: 2 }, "return"),
      opt("“那你能不能线上看一下？不用太久。”", { E: 3, C: 4, T: 2, M: -3 }, { LEAVE: 5, CCTV: 2, OTOT: 1 }, "return"),
      opt("“最近大家都很忙，你这个时间点请假不太合适。”", { E: 3, C: 3, T: 3, M: -3 }, { LEAVE: 4, PUAer: 2 }, "return"),
      opt("“你要学会对自己的工作负责。”", { E: 2, C: 2, T: 4, M: -3 }, { DADDY: 3, PUAer: 3, LEAVE: 2 }, "return"),
    ],
  };

  Q.Q16 = {
    id: "Q16",
    phase: 3,
    title: "抢功现场题",
    scenario:
      "你熬夜做完方案，第二天大老板会上夸这个项目。你的直属老板立刻说：“这个项目是我一直带着大家推进出来的。”这时候他最可能怎么处理你？",
    options: [
      opt("会补一句：“具体执行主要是 XX 做的。”", { E: -1, C: 0, T: -1, M: 4 }, { COVER: 4 }, "return"),
      opt("全程不提你，会后还让你把材料发他。", { E: 2, C: 1, T: 4, M: -4 }, { ROACH: 4, MASK: 2 }, "return"),
      opt("如果项目出问题，他会马上说“这个部分是你负责的”。", { E: 3, C: 1, T: 3, M: -5 }, { ROACH: 4, THIEF: 2, TRASH: 1 }, "return"),
      opt("他会说“你不要太计较个人得失”。", { E: 1, C: 1, T: 3, M: -4 }, { DADDY: 2, TEDX: 2, TRASH: 2 }, "return"),
    ],
  };

  Q.Q17 = {
    id: "Q17",
    phase: 3,
    title: "背锅现场题",
    scenario:
      "客户指出一个错误，这个错误其实来自老板前一天临时改的方向。老板在群里说：“这个问题你们团队要反思。”你觉得他后续更可能？",
    options: [
      opt("私下承认自己判断有问题，并一起修正。", { E: -1, C: 0, T: -1, M: 4 }, { GOLD: 2, COVER: 2 }, "return"),
      opt("公开不认，私下说“你们怎么没提醒我？”", { E: 2, C: 1, T: 4, M: -4 }, { THIEF: 5, SUCKER: 1 }, "return"),
      opt("直接把锅扣给执行的人。", { E: 4, C: 1, T: 2, M: -4 }, { THIEF: 4, ROACH: 3, MASK: 1 }, "return"),
      opt("说一堆“流程意识”“责任意识”，但没有解决方案。", { E: 3, C: 1, T: 3, M: -5 }, { PUAer: 3, SAINT: 2, THIEF: 2 }, "return"),
    ],
  };

  Q.Q18 = {
    id: "Q18",
    phase: 3,
    title: "消失型老板追问题",
    scenario: "项目最危急的时候，你发现老板不回消息。两小时后他出现了，第一句话是：",
    options: [
      opt("“刚刚我在帮你们协调资源。”", { E: -1, C: 0, T: -2, M: 2 }, { COVER: 1, NURSE: 1 }, "return"),
      opt("“现在是什么情况？你们怎么搞成这样？”", { E: 1, C: 1, T: 5, M: -4 }, { BOOM: 4, TRASH: 2, TOXIC: 2 }, "return"),
      opt("“我刚才在会里，你们先自己处理。”", { E: 1, C: 1, T: 5, M: -3 }, { TOXIC: 4, AUV: 1 }, "return"),
      opt("“这个事情我之前应该提醒过你们吧？”", { E: 1, C: 1, T: 4, M: -4 }, { BOOM: 2, FOG: 2, TRASH: 2 }, "return"),
    ],
  };

  Q.Q19 = {
    id: "Q19",
    phase: 3,
    title: "爆炸现场追问题",
    scenario: "你只是问了一个确认问题：“这个版本是按昨天那个方向继续吗？”老板突然回：“？”接下来他更可能：",
    options: [
      opt("解释清楚：“对，按昨天那个方向。”", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 3 }, "return"),
      opt("“这还要问？你自己不会判断吗？”", { E: 1, C: 1, T: 3, M: -4 }, { ROACH: 4, TRASH: 2 }, "return"),
      opt("不骂，但整个下午冷脸低气压。", { E: 1, C: 1, T: 1, M: -3 }, { NULL: 2, ROACH: 2, FAKE: 1 }, "return"),
      opt("“我不是早就说过了吗？”但其实他没说过。", { E: 1, C: 1, T: 4, M: -4 }, { MASK: 3, ROACH: 3, PUAer: 1 }, "return"),
    ],
  };

  Q.Q20 = {
    id: "Q20",
    phase: 3,
    title: "阴阳怪气追问题",
    scenario: "你完成了一个方案，他看完说：“你还挺有想法的。”这句话在你们办公室通常意味着？",
    options: [
      opt("真的认可，并会给你进一步建议。", { E: -1, C: 0, T: -1, M: 2 }, { COVER: 1, GOLD: 1 }, "return"),
      opt("意思是“你想太多了”，但他不直接说。", { E: 1, C: 1, T: 4, M: -2 }, { AUV: 5 }, "return"),
      opt("他准备背后告诉别人你“不成熟”。", { E: 1, C: 1, T: 4, M: -3 }, { MASK: 4, AUV: 2 }, "return"),
      opt("他会把这个当作说教开场，讲 20 分钟人生经验。", { E: 1, C: 1, T: 3, M: -2 }, { DADDY: 4, TEDX: 1 }, "return"),
    ],
  };

  Q.Q21 = {
    id: "Q21",
    phase: 3,
    title: "需求迷雾情境题",
    scenario:
      "你做了三版海报：第一版他说“不够高级”；第二版他说“太高级了，不接地气”；第三版他说“感觉还是不对”。你问：“那具体希望往哪个方向改？”他回答：",
    options: [
      opt("“我想了一下，是我前面没说清楚，我重新整理需求。”", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "return"),
      opt("“这个你要自己理解，不能什么都问我。”", { E: 2, C: 1, T: 3, M: -4 }, { FOG: 4, PUAer: 2 }, "return"),
      opt("“我也说不上来，但就是不对。”", { E: 1, C: 1, T: 1, M: -5 }, { FOG: 5, NULL: 1 }, "return"),
    ],
  };

  Q.Q22 = {
    id: "Q22",
    phase: 3,
    title: "登月 KPI 情境题",
    scenario:
      "你们团队 3 个人，预算很少，老板在会上说：“今年我们要做到行业第一。”你问资源怎么匹配。他说：",
    options: [
      opt("“你说得对，我们先拆成阶段目标。”", { E: -1, C: 0, T: -1, M: 3 }, { COVER: 2 }, "return"),
      opt("“不要被现实限制想象力。”", { E: 3, C: 1, T: 3, M: -3 }, { MOON: 5, PUAer: 1 }, "return"),
      opt("“资源不是问题，关键看你们有没有决心。”", { E: 3, C: 1, T: 3, M: -3 }, { MOON: 3, SAINT: 2, MONK: 1 }, "return"),
      opt("“以后空间很大，现在先把事情做起来。”", { E: 4, C: 0, T: 2, M: -2 }, { CAKE: 4, MOON: 2 }, "return"),
    ],
  };

  Q.Q23 = {
    id: "Q23",
    phase: 3,
    title: "工位护士长情境题",
    scenario: "你连续几天状态很差，效率明显下降。老板注意到了，他会？",
    options: [
      opt("认真问你是不是压力太大，要不要调整节奏。", { E: -2, C: -1, T: -3, M: 5 }, { NURSE: 5 }, "random@peek"),
      opt("说“大家都累，你要学会扛事”。", { E: 3, C: 1, T: 3, M: -3 }, { PUAer: 2, MONK: 2, DADDY: 1 }, "random@peek"),
      opt("不问原因，只说“最近产出不太行”。", { E: 3, C: 1, T: 1, M: -3 }, { FOG: 3, SUCKER: 4, TRASH: 1 }, "random@peek"),
      opt("“你先多出几个版本吧。”", { E: 2, C: 1, T: 2, M: -3 }, { OTOT: 1 }, "return"),
    ],
  };

  Q.Q24 = {
    id: "Q24",
    phase: 3,
    title: "财神爷情境题",
    scenario: "项目完成后，公司拿到了不错的结果。老板在复盘会上说：",
    options: [
      opt("“这次大家辛苦了，奖金我已经去争取了。”", { E: -5, C: 0, T: -2, M: 5 }, { GOLD: 6, COVER: 2 }, "random@peek"),
      opt("“大家不要只看短期回报，这次经验很宝贵。”", { E: 4, C: 0, T: 2, M: -2 }, { SAINT: 3, CAKE: 2, MONK: 1 }, "random@peek"),
      opt("“这次结果不错，说明我的方向是对的。”", { E: 2, C: 1, T: 2, M: -3 }, { THIEF: 3, KING: 1 }, "random@peek"),
      opt("“后面还有更大的空间。”", { E: 3, C: 0, T: 1, M: -2 }, { CAKE: 4 }, "random@peek"),
    ],
  };

  window.QUIZ_QUESTIONS = Q;
  window.RANDOM_POOL = ["Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22", "Q23", "Q24"];

  window.BRANCH_HINTS = {
    Q15: "系统检测到你的老板疑似存在“请假粉碎倾向”。正在追加审讯题……",
    Q16: "系统检测到你的老板可能是“抢功型生物”。进入功劳归属深度鉴定。",
    Q17: "系统检测到你的老板在“背锅现场”露出痕迹。正在追加鉴定……",
    Q18: "系统检测到你的老板疑似“消失型物种”。追加追问……",
    Q19: "系统检测到你的老板存在“爆炸现场”反应。追加追问……",
    Q20: "系统检测到你的老板疑似“阴阳怪气型”。追加追问……",
    Q21: "系统检测到你的老板疑似“需求迷雾型”。追加情境题……",
    Q22: "系统检测到你的老板疑似“登月 KPI 型”。追加情境题……",
    Q13: "系统检测到你的老板在时间边界上高度可疑。追加深夜情境题……",
    Q14: "系统检测到你的老板存在“连环催命”特征。追加情境题……",
  };

  window.SURVIVAL_ADVICE = {
    LEAVE:
      "生存建议：请假时尽量明确说明请假时间、工作交接、紧急联系人和不可工作的原因，并保留书面记录。面对这种老板，模糊表达会被他当成继续压榨的入口。",
    DEFAULT: "生存建议：保护好身心健康边界，重要沟通尽量留痕；涉及利益与工时的事项用书面确认。",
  };

  window.DIMENSION_LABELS = {
    E: "榨取压榨值",
    C: "控制入侵值",
    T: "精神毒性值",
    M: "管理成熟值",
  };
})();
