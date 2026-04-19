# 老板 SBTI（静态页）

内容来源：《老板SBTI图鉴》题库与图鉴条目。纯 HTML/CSS/JS，无构建步骤。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库（例如 `boss-sbti`），**不要**勾选添加 README（避免推送冲突）。
2. 在本文件夹执行（把 `YOUR_USER` / `YOUR_REPO` 换成你的）：

```bash
git init
git branch -M main
git add .
git commit -m "Initial site for GitHub Pages"
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

3. 打开 GitHub 仓库：**Settings → Pages**。
4. **Build and deployment** 里 **Source** 选 **GitHub Actions**（不要选 Deploy from a branch）。
5. 等待 **Actions** 里「Deploy GitHub Pages」跑绿；Pages 设置页会显示站点地址，一般为：

`https://YOUR_USER.github.io/YOUR_REPO/`

若仓库名为 `YOUR_USER.github.io`，则站点在根域：`https://YOUR_USER.github.io/`。

## 换老板头图

将图片放入 `assets/`（如 `boss-hero.jpg`），并修改 `index.html` 里 `<img src="...">` 即可。
