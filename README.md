# 老板 SBTI

> 2026-04 更新（v2）：新增付费墙、社交分享面板、管理员 Terminal 后台。
>
> - 前端仍是纯 HTML/CSS/JS 静态站，GitHub Pages 托管 `bosssbti.com`。
> - 动态逻辑（session 落库、付费订单、分享埋点、管理后台）走
>   **Cloudflare Worker + D1 + KV**，代码在 [`_worker/`](_worker/)。
> - 首期为了能立即上线、不依赖商户号审核，支付使用 **mock** 模式（Demo 解锁按钮）。
>   Phase 2 改 `PAYMENT_MODE=xunhupay` 即可切真实微信/支付宝聚合支付。
>
> 2026-04 早期更新：题库 / 图鉴 / 判定引擎已对齐《老板SBTI图鉴 new.docx》与《老板SBTI测评小问卷_新版答题逻辑与结果.docx》。结果池从 30 种缩减为 28 种（删除 NULL/CLOWN/GHOST/TOXIC），新增 Q25 感恩教育、Q26 企业文化朝圣、Q27 表格奴隶主、Q28 末代皇帝；引擎加入「好老板保护规则」。24 张老板插画已随 docx 导入到 `assets/bosses/<CODE>.jpg`。

内容来源：《老板SBTI图鉴》题库与图鉴条目。纯 HTML/CSS/JS，无构建步骤。

## 三个页面

| 路径 | 谁访问 | 干嘛 |
|---|---|---|
| `/` | 访客 | 答题 → 完成后看到锁壳预览 → 点 ¥0.99 解锁 |
| `/report.html?sid=…` | 已付费用户 | 完整报告 + 10 种社交平台分享 |
| `/terminal.html` | 管理员 | 输入密码 → 看指标卡、趋势图、人格分布、最近订单、最近 session |

## 后端 Worker

部署见 [`_worker/README.md`](_worker/README.md)。一次性命令清单：

```powershell
cd _worker
npm install
npx wrangler login
npx wrangler d1 create boss-sbti          # 把 database_id 填回 wrangler.toml
npx wrangler kv namespace create KV       # 把 id 填回 wrangler.toml
npm run d1:init
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_JWT_SECRET
npx wrangler secret put IP_HASH_SALT
npx wrangler secret put MOCK_WEBHOOK_SECRET
npx wrangler deploy
```

- 正式域名：**https://bosssbti.com/**（及 `https://www.bosssbti.com/`）
- GitHub 仓库：<https://github.com/566benli/boss-sbti>
- 默认 Pages 地址（兜底）：https://566benli.github.io/boss-sbti/

域名注册商：Cloudflare Registrar；DNS：Cloudflare；托管：GitHub Pages（`main` 分支根目录）。

## DNS 记录（Cloudflare，`Proxy status = DNS only` 灰云）

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | 566benli.github.io |

待 GitHub Pages 的 HTTPS 证书颁发完成（首次约几分钟）后，Cloudflare **SSL/TLS mode 设为 Full** 即可选择启用橙云 CDN。

## 本地改动 → 线上

```powershell
Set-Location -LiteralPath "c:\Users\Administrator\Desktop\老板SBTI"
git add -A
git commit -m "<本次改动说明>"
git push
```

约 30–90 秒后 https://bosssbti.com/ 会自动更新。

## 换老板头图

把图放到 `assets/`（例如 `assets/boss-hero.jpg`），改 [`index.html`](index.html) 里 `<img src="assets/boss-hero.svg">` 为新文件名，然后 commit + push。
