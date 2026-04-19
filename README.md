# 老板 SBTI（静态页）

内容来源：《老板SBTI图鉴》题库与图鉴条目。纯 HTML/CSS/JS，无构建步骤。

GitHub 账号：`566benli`，目标仓库名（建议）：`boss-sbti`。
默认上线地址：`https://566benli.github.io/boss-sbti/`

---

## 一、在 GitHub 网站上创建仓库（只做一次）

1. 登录 <https://github.com/566benli>
2. 右上角 **+ → New repository**
3. **Repository name** 填：`boss-sbti`
4. **Public**（Pages 免费版要求 Public）
5. **不要**勾 “Add a README file” / “Add .gitignore” / License（本地仓库已经有）
6. 点 **Create repository**

## 二、把本地代码推到该仓库（本机已经配好 remote，直接 push 即可）

在 PowerShell 里执行：

```powershell
Set-Location -LiteralPath "c:\Users\Administrator\Desktop\老板SBTI"
git push -u origin main
```

首次 push 会弹登录窗，推荐用 **Sign in with your browser** 授权。

## 三、打开 GitHub Pages（用 GitHub Actions 发布）

1. 打开仓库：<https://github.com/566benli/boss-sbti>
2. **Settings → Pages**
3. **Build and deployment → Source** 选 **GitHub Actions**（不要选 “Deploy from a branch”）
4. 切到仓库的 **Actions** 标签，等「Deploy GitHub Pages」工作流变成绿色勾（约 30–60 秒）
5. 回到 **Settings → Pages**，页面会显示：

```
Your site is live at https://566benli.github.io/boss-sbti/
```

打开即是线上站点，**所有人**都可以访问。

---

## 四、（可选）换成自己的品牌域名

1. 买域名（推荐 Cloudflare Registrar / Namecheap，或国内阿里云/DNSPod）。
2. 去 DNS 控制台加记录：
   - `A  @  185.199.108.153` `185.199.109.153` `185.199.110.153` `185.199.111.153`
   - `CNAME  www  566benli.github.io`
3. 在仓库 **Settings → Pages → Custom domain** 填你的域名并 Save。
4. 校验通过后勾选 **Enforce HTTPS**。
5. 在仓库根目录新增一个名为 `CNAME` 的文件，内容就是你的域名（GitHub 也会自动创建）。

## 五、换老板头图

把成品图放到 `assets/`（例如 `assets/boss-hero.jpg`），
修改 [`index.html`](index.html) 里 `<img src="assets/boss-hero.svg">` 为你的新文件名即可。
