# 老板 SBTI（静态页）

内容来源：《老板SBTI图鉴》题库与图鉴条目。纯 HTML/CSS/JS，无构建步骤。

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
