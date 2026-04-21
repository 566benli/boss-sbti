# 虎皮椒 xunhupay 上线 Checklist（Phase 2 · 推荐方案）

> 目标：把 `PAYMENT_MODE` 从 `mock` 切到 `xunhupay`，让 0.99 元解锁走真实微信 + 支付宝收款。
> 前置：代码侧已写好 `_worker/src/lib/providers/xunhupay.js`（MD5 小写签名、下单、H5/扫码双模、异步通知验签、金额防篡改），线上 E2E 11/11 通过。
> 你要做的只有「开户 + 拿密钥 + 填 notify URL + 切开关」。

**为什么选虎皮椒而不是 PayJS**：零开户费（PayJS 要 300 元）、首日就给支付宝（PayJS 新号 1-2 个月才开）、费率更低（0.38% 对 2.38%）。代价是放款偶尔延迟，不影响用户支付体验。

---

## 一、材料准备（3 分钟）

个人商户开户只需要：

1. 一个**未被其它个人支付平台用过**的本人微信号（用于接收结算）
2. 本人身份证（正反面照片）
3. 一张**同名**的本人银行卡（用于提现）
4. 本人手持身份证照片
5. 一张收款方便的支付宝账号（想上支付宝则必须）

> 个人商户结算规则（2025 年行情）：
> - 微信：T+1 到你绑定的微信零钱，然后你自己提到银行卡。
> - 支付宝：T+1 直接到你绑定的支付宝账户余额。

---

## 二、注册 + 开通（15–60 分钟，含人工审核）

### 1. 注册账号

打开 <https://www.xunhupay.com>，右上角 **「登录/注册」**。
推荐用**本人微信扫码登录**（这会自动关联你的微信号，减少后面实名步骤）。

### 2. 实名认证

进到后台后，顶部菜单 → **「个人中心」→「实名认证」**：

- 上传身份证正反面
- 上传手持身份证
- 填真实姓名 / 身份证号码

通常 10 分钟内人工审核通过（工作日高峰期可能到 1-3 小时）。

### 3. 申请支付渠道

后台 → **「支付渠道管理」→「我的支付渠道」→「申请新渠道」**。

**你需要申请两次**（微信一次、支付宝一次）：

#### 第一次：微信支付渠道
- 选 **「微信直连」** 或 **「微信收款」**（不同时期页面叫法略不同）
- 支付场景：选 **「H5 网页」** 或 **「扫码支付」**（两个都勾更保险）
- 用途描述：**"个人兴趣测试结果解锁，单笔 0.99 元，H5 网页访问"**
- 绑定收款微信号（会让你本人扫一次码确认）

#### 第二次：支付宝渠道
- 选 **「支付宝直连」**
- 支付场景：**「H5 网页」**
- 绑定收款支付宝账号（同样扫码确认）

审核时间同上。审核通过后你会在「我的支付渠道」看到两个渠道各自的状态为「可用」。

### 4. 拿到两样关键信息

每个渠道开通后，点「详情」或「管理」，你会看到：

| 信息 | 我们代码里对应的变量 |
| --- | --- |
| APP ID（一串数字/字母） | `XUNHUPAY_APPID` |
| APPSECRET（一串字符串） | `XUNHUPAY_APPSECRET` |

**重要**：虎皮椒对微信和支付宝会给出**两套不同的 APPID/APPSECRET**。本项目代码在下单时会根据用户选择的渠道走不同的 `plugins` 参数，但**目前只用一套凭据**——**建议把微信渠道的凭据填进去**，支付宝下单时我们的代码会通过同一套凭据但换 `plugins=alipay` 去拉单，虎皮椒会自动路由。

> 如果虎皮椒后台提示必须用不同凭据（部分账号会这样），告诉我，我把 provider 改成"按 channel 取不同 env 变量"只需 10 分钟。

### 5. 填写「异步通知 URL」

渠道详情页通常有个「回调 URL」或「通知 URL」字段（有时需要在「应用配置」里）。**两个渠道都要填**：

```
https://api.bosssbti.com/api/pay/webhook/xunhupay
```

如果虎皮椒要求「同步跳转 URL」，填：

```
https://bosssbti.com/report.html
```

（我们在下单时每单会额外传一个 `return_url=...?sid=xxx&from=xunhupay`，覆盖这个默认值。）

---

## 三、切线上（3 分钟）

```powershell
cd _worker

npx wrangler secret put XUNHUPAY_APPID
# 粘贴 APP ID，回车

npx wrangler secret put XUNHUPAY_APPSECRET
# 粘贴 APPSECRET，回车
```

然后改 `_worker/wrangler.toml` 中的 `[vars]`：

```toml
[vars]
PAYMENT_MODE = "xunhupay"
```

部署：

```powershell
npx wrangler deploy
```

---

## 四、上线后必做的 5 项测试

1. **手机 + 微信**：完成测试 → 点「解锁」→ 弹层默认选中「微信支付」→ 点「前往支付」→ 微信完成 0.99 → 自动返回报告页。
2. **手机 + 支付宝**：同上，点「支付宝支付」切换 → 完成 0.99 → 解锁。
3. **桌面端扫码**：桌面浏览器里弹层显示二维码 → 用手机扫码 → 完成支付 → 桌面页面 2 秒内自动跳 `/report.html`。
4. **异步通知**：虎皮椒后台 → 订单管理，能看到两笔订单（微信/支付宝各一），状态 `已支付`。Terminal 管理后台的「今日付费 +2」。
5. **金额防篡改**：用 `curl` 构造一个 `total_fee=0.01` 的伪造回调（需要你知道 APPSECRET），应该返回 `fail:amount_mismatch`，订单仍是 pending。

---

## 五、常见坑位

| 症状 | 成因 | 修复 |
| --- | --- | --- |
| 弹层卡在"创建订单失败" | `XUNHUPAY_APPID/APPSECRET` 漏填 | `npx wrangler secret list` 确认；`secret put` 补上 |
| 下单返回 `errcode: 500, errmsg: "invalid sign!"` | APPSECRET 填错、多了空格、或复制时加了回车 | 重新复制，重 `secret put` |
| 扫码后提示"商户号异常" | 渠道审核未通过 / 已被封 | 登虎皮椒后台看渠道状态；与客服沟通 |
| 付款成功但前端不跳转 | 「回调 URL」没配 / 填错 | 回虎皮椒后台的渠道详情页核对 `https://api.bosssbti.com/api/pay/webhook/xunhupay` |
| 微信扫码显示"交易金额过小" | 虎皮椒测试账号限制（≤0.1 元） | 这是测试账号限制；正式渠道 0.99 没问题。若一直限制，找客服提升限额 |
| 支付宝提示"无法创建订单" | 支付宝渠道尚未审核通过 | 用户先用微信付；等支付宝渠道通过再回来 |

---

## 六、回滚（10 秒）

```toml
# _worker/wrangler.toml
PAYMENT_MODE = "mock"
```

```powershell
npx wrangler deploy
```

新订单回 Demo 模式，已付订单不受影响。

---

## 七、如果你后来决定换 PayJS

参见 [`PAYJS-SETUP.md`](./PAYJS-SETUP.md)。代码里 PayJS provider 也已经写好、测过，切换只需：

```powershell
npx wrangler secret put PAYJS_MCHID
npx wrangler secret put PAYJS_KEY
# wrangler.toml: PAYMENT_MODE = "payjs"
npx wrangler deploy
```

以及在虎皮椒后台把异步通知 URL 关掉（可选）。
