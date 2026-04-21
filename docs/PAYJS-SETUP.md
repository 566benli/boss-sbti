# PayJS 上线 Checklist（Phase 2 · 备选方案）

> **主推方案是虎皮椒**，见 [`XUNHUPAY-SETUP.md`](./XUNHUPAY-SETUP.md)（零开户费、直接给支付宝）。
> PayJS 留作备选：合规度和稳定性更高，但有两道门槛——
> 1. **一次性开户费 ￥300**
> 2. **新号只给微信，不给支付宝**（需跑够 40 天交易量 + 日均 10 笔 + 日均 100 元才开放申请）
>
> 如果你的产品后期做成稳定现金流（月流水 1 万+）、需要企业级合规，再切 PayJS 也不迟。
>
> 目标：把 `PAYMENT_MODE` 从 `mock` 切到 `payjs`，让 0.99 元解锁走真实微信支付。
> 前置：Worker 代码侧已经在 `_worker/src/lib/providers/payjs.js` 里写好了 Cashier + Native 两套下单路径、MD5 签名、异步通知验签与金额防篡改，线上 E2E 10/10 通过。你要做的只有「开户 + 填密钥 + 切开关」。

---

## 一、材料准备（5 分钟）

PayJS 个人商户开户只需要：

1. 本人微信号（用来收款）。
2. 本人身份证（正反面照片）。
3. 一张实名认证过的**本人**银行卡（微信侧要求）。
4. 本人手持身份证的照片（部分时段要求，备好省心）。
5. 备用邮箱（接收商户号、密钥、提醒）。

> 注：PayJS 的微信收款默认 T+1 结算到你本人微信零钱，提现到银行卡免手续费。
> 支付宝需单独绑定**2088 开头的支付宝商户号**（不是普通支付宝账号）。如果暂时没有，先只上微信也能跑。

---

## 二、注册 & 开通（10~30 分钟，视人工审核速度）

### 1. 注册账号

打开 <https://payjs.cn>，右上角「注册」。用邮箱 + 手机号注册，登录后台。

### 2. 实名认证

后台 → **商户中心 → 实名认证**：

- 填真实姓名、身份证号码
- 上传身份证正反面
- 填绑定的本人银行卡
- 绑定用于收款的微信号（会让你扫一次码）

通常 5~30 分钟内审核通过。

### 3. 开通「扫码支付 / 收银台支付」产品

后台 → **产品中心 → 扫码支付** → 开通。
若要上支付宝，再单独在 **支付宝收款** 开通，按页面提示授权一次 2088 商户号。

### 4. 拿到两样关键信息

后台 → **商户中心 → 商户信息**，记下：

| 信息 | 我们代码里的变量名 |
| --- | --- |
| 商户号（`mchid`，纯数字 ~6~8 位） | `PAYJS_MCHID` |
| 通信密钥（`key`，字母数字组合） | `PAYJS_KEY` |

> ⚠️ 通信密钥只在后台展示一次，建议立即复制到密码管理器。
> 也可以随时在后台点「重置密钥」，但重置后老的订单回调会签不过。

### 5. 填写「异步通知 URL」

后台 → **商户中心 → 异步通知地址**：

```
https://api.bosssbti.com/api/pay/webhook/payjs
```

> 如果你把域名改过，替换前半段即可。这个路由在 `_worker/src/index.js` 里已经注册好。

### 6. 填写「同步跳转 URL」（可选）

我们在 `providers/payjs.js::callbackUrl()` 里每单传的是：

```
https://bosssbti.com/report.html?sid=<sid>&from=payjs
```

PayJS 支付完成后会把用户浏览器跳到这里。报告页本身会再次请求 `/api/report/full` 校验 `paid=1`，所以伪造 `?from=payjs` 也绕不开付费闸。

---

## 三、切线上（3 分钟）

拿到 `PAYJS_MCHID` / `PAYJS_KEY` 以后，在本机项目里执行（根目录下）：

```powershell
cd _worker

# 1. 把密钥塞进 Cloudflare（不会进 git，不会进代码）
npx wrangler secret put PAYJS_MCHID
# 粘贴商户号，回车
npx wrangler secret put PAYJS_KEY
# 粘贴通信密钥，回车
```

然后把 `wrangler.toml` 里 `[vars].PAYMENT_MODE` 从 `"mock"` 改成 `"payjs"`：

```toml
[vars]
PAYMENT_MODE = "payjs"
```

最后部署：

```powershell
npx wrangler deploy
```

Wrangler 会在 5~10 秒内发布完成。之后访问：

- <https://api.bosssbti.com/api/health> → `ok`
- 做一次完整测试流程，在付费弹层里应该能看到真实 PayJS 收银台/二维码，不再出现「Demo 解锁」按钮。

---

## 四、上线后最少要测的 5 件事

1. **手机端流程**：完成测试 → 点「解锁」→ 点「前往支付」→ 微信/支付宝完成 0.99 支付 → 返回原页面 → 2 秒内自动跳 `/report.html`。
2. **桌面端流程**：同上，弹层里会直接显示二维码，用手机扫码支付。
3. **异步通知到达**：PayJS 后台 → 订单管理，能看到订单状态 `已支付`。同时你 Terminal（`/terminal.html` 管理员后台）的「今日付费」会 +1。
4. **重复通知幂等**：PayJS 有时会重复回调。我们 webhook 做了 `status='paid'` 短路，重复也只会写一次 DB。
5. **金额防篡改**：试着手动 `curl` 一个 `total_fee=1` 的伪造回调，应该被拒（`fail:amount_mismatch` 或 `fail:bad_signature`），同时 `orders` 表里该单仍是 `pending`。

---

## 五、常见坑位

| 症状 | 成因 | 修复 |
| --- | --- | --- |
| 前端弹层卡在「创建订单失败」 | `PAYJS_MCHID` / `PAYJS_KEY` 漏填或填反 | `npx wrangler secret list` 确认两个都在；拼错就 `secret put` 重填 |
| PayJS 收银台打开后报「签名错误」 | 通信密钥被重置过但代码还用老的 | 去后台「重置密钥」页面复制最新的，再 `secret put PAYJS_KEY` |
| 支付成功但前端一直轮询不跳转 | 异步通知 URL 没配、或域名填错 | 登 PayJS 后台把 `https://api.bosssbti.com/api/pay/webhook/payjs` 填进去；也可以在后台手动「重发通知」补救 |
| 通知来了但 Worker 返回 400 `fail:amount_mismatch` | 你在 `[vars].PRICE_CENT` 改过价格，但 PayJS 后台某处还挂着旧单 | 忽略即可，新下的单就好了 |
| PayJS 反复重试回调 | 上一次 Worker 返回了非 `success` 文本（比如 500） | 看 `wrangler tail` 日志，修 bug 后 PayJS 会在 5 分钟/30 分钟/24 小时各重试一次 |

---

## 六、回滚（10 秒）

万一 PayJS 这边临时出问题，想快速切回 Demo 模式：

```toml
# _worker/wrangler.toml
PAYMENT_MODE = "mock"
```

```powershell
npx wrangler deploy
```

数据库里已经 paid 的订单不受影响，新订单会回到 Demo 流程。
