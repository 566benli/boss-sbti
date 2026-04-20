# boss-sbti-api (Cloudflare Worker)

后端 API，为前端 bosssbti.com 提供：session 记录、付费闸、管理员 Terminal、分享埋点。

## 一次性部署（Phase 1，mock 支付）

> 前置：已登录 Cloudflare 账号、拥有 `bosssbti.com` zone。本机已安装 Node 18+。

```powershell
cd _worker
npm install
# 登录
npx wrangler login
```

### 1. 创建 D1 和 KV

```powershell
npx wrangler d1 create boss-sbti
# 复制输出里的 database_id，填入 wrangler.toml 的 d1_databases.database_id

npx wrangler kv namespace create KV
# 复制输出里的 id，填入 wrangler.toml 的 kv_namespaces.id
```

### 2. 初始化 D1 表结构

```powershell
npm run d1:init
```

### 3. 写入 Secret（至少这 3 个）

```powershell
npx wrangler secret put ADMIN_PASSWORD          # 管理员登录密码
npx wrangler secret put ADMIN_JWT_SECRET        # 任意强随机串
npx wrangler secret put IP_HASH_SALT            # 任意强随机串
npx wrangler secret put MOCK_WEBHOOK_SECRET     # demo 支付签名密钥（只有管理员知道）
```

Phase 2 真接支付时再加：

```powershell
npx wrangler secret put XUNHUPAY_APPID
npx wrangler secret put XUNHUPAY_APPSECRET
# 然后编辑 wrangler.toml 把 vars.PAYMENT_MODE 改成 "xunhupay"
```

### 4. 发布

```powershell
npx wrangler deploy
```

首次发布会同时把 `api.bosssbti.com/*` 路由挂到该 Worker（见 `wrangler.toml` 的 `[[routes]]`）。若 Cloudflare 报"route not found"，进 Cloudflare dashboard → bosssbti.com zone → DNS 里加一条：

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | api | `<你的 workers 子域>.workers.dev` | Proxied（橙云） |

再次 `npx wrangler deploy`。

### 5. 自检

```powershell
curl https://api.bosssbti.com/api/health      # -> ok
curl -X POST https://api.bosssbti.com/api/session/start
```

## API 列表

| Method | Path | 说明 |
|---|---|---|
| POST | /api/session/start | 建 session，返回 `{ sid }` |
| POST | /api/session/finish | 提交最终 mainType / subType / dim / answers |
| GET | /api/report/preview?sid= | 锁壳预览（给 index.html） |
| GET | /api/report/full?sid= | 仅付费后返回（给 report.html） |
| POST | /api/pay/create | 建单，返回 `{ orderId, payUrl, demo, demoSign }` |
| GET | /api/pay/status?orderId= | 前端轮询 |
| POST | /api/pay/webhook/mock?orderId=&sign= | Phase 1 demo 回调 |
| POST | /api/pay/webhook/xunhupay | Phase 2 真回调（占位） |
| POST | /api/share/click | `{ sid, platform }` 埋点 |
| POST | /api/admin/login | 管理员登录，种 JWT Cookie |
| POST | /api/admin/logout | 登出 |
| GET | /api/admin/me | 查当前登录态 |
| GET | /api/admin/stats | Terminal 看板聚合数据 |
| GET | /api/admin/orders?limit=50 | 最近订单 |
| GET | /api/admin/sessions?limit=50 | 最近 session |

## 切换到真实支付（Phase 2）

1. 注册虎皮椒 / PayJS 账号，拿到 APPID + APPSECRET，把通知地址设为
   `https://api.bosssbti.com/api/pay/webhook/xunhupay`
2. `wrangler secret put XUNHUPAY_APPID` / `XUNHUPAY_APPSECRET`
3. 编辑 `wrangler.toml`：`[vars].PAYMENT_MODE = "xunhupay"`
4. 补全 `src/lib/providers/xunhupay.js` 里的签名/验签（MD5）
5. `npx wrangler deploy`
6. 真实小额自测 0.99 × 2 笔
