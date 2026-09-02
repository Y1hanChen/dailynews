# Daily Board

个人每日信息看板的第一版。当前接入以下栏目：

- Thinking Machines Lab：官方研究博客与公告 RSS
- 机器之心、量子位、新智元：知乎专栏接口
- 腾讯行情：主要指数和 COMEX 黄金快照，以区域行情地图展示
- 东方财富板块：领涨/领跌行业和涨跌家数（双向排序请求）
- 金融资讯：雪球、知乎、东方财富、财新入口和资讯流
- 游戏：Steam 当前特惠列表与云顶之弈 TFT 数据，作为两个子板块展示
- NBA：今日赛程和比分

市场、游戏和竞技栏目使用独立的数据源适配器，页面只消费统一后的条目结构。

## 启动

项目只依赖 Python 3.10+ 标准库：

```bash
cd daily-board
python3 server.py
```

浏览器打开 <http://127.0.0.1:8787>。可以用 `--host` 和 `--port` 指定监听地址，例如：

```bash
python3 server.py --host 0.0.0.0 --port 8787
```

也可以用一键脚本启动。首次运行会创建 `.venv`；如果当前终端没有设置 `RIOT_API_KEY`，脚本会隐藏输入提示，直接回车即可跳过：

```bash
chmod +x start.sh
./start.sh
```

也可以提前通过环境变量传入 key（不会写入仓库）：

```bash
RIOT_API_KEY='新生成的 key' ./start.sh
```

服务默认监听 `0.0.0.0:8787`，可用 `HOST` 和 `PORT` 覆盖。脚本不依赖第三方 Python 包；如果以后新增 `requirements.txt`，会在启动时自动安装。

如果当前机器访问外网需要工作区提供的代理，先执行：

```bash
source ../proxy.sh
python3 server.py
```

页面右上角和“数据源状态”会区分 `实时`、`缓存` 和 `示例`。看到 `示例` 时表示本次外站请求失败，并不代表数据源没有内容。

## 目录

| 文件 | 作用 |
| --- | --- |
| `server.py` | 静态文件服务、数据抓取、统一 JSON 接口和缓存 |
| `index.html` | 看板页面结构 |
| `styles.css` | 响应式视觉样式 |
| `app.js` | 筛选、排序、栏目切换和刷新交互 |
| `.cache.json` | 运行时生成的本地缓存，不提交 Git |
| `assets/world.geojson` | 本地国家边界，用于金融行情地图 |
| `THIRD_PARTY_NOTICES.md` | 地图边界数据来源和许可证说明 |
| `TFT_RANKING_RESEARCH.md` | Riot API、第三方阵容榜和自建聚合方案调研 |

## 数据源

### Thinking Machines Lab

```text
https://thinkingmachines.ai/index.xml
```

这是标准 RSS 2.0，当前不需要鉴权。条目包括标题、链接、发布时间和正文/摘要。它更新频率较低，定位是高质量研究博客和官方公告，不是实时新闻流。

### 机器之心 · 知乎

```text
https://www.zhihu.com/api/v4/columns/jiqizhixin/articles
```

这是知乎内部接口，目前可以返回标题、链接、时间、摘要、点赞数和评论数。接口没有公开稳定性承诺，服务端只低频请求最新 20 条，并保留磁盘缓存和示例降级内容。不要绕过验证码或高频抓取。

### 量子位、新智元 · 知乎

同样使用知乎专栏接口，当前配置的栏目 slug 是：

```text
量子位: qbitai
新智元: newzhiyuan（服务端会顺序探测 `xinzhiyuan`、`newzyuan`、`newzy`、`newai`、`aiera`）
```

这两个 slug 在首次刷新时会由来源状态显示为“实时”“缓存”或“示例”。如果某个专栏改过 URL，只需修改 `SOURCE_CONFIG` 对应的 `slug` 和 `url`，页面不需要改动。

### 其他栏目

- 市场使用腾讯行情的公开报价接口，适合个人低频快照，不是交易级行情。
- 东方财富板块使用公开板块列表接口，展示领涨/领跌和上涨/下跌家数。
- 金融地图使用本地 GeoJSON 国家轮廓，地图只做区域信号可视化，精确涨跌仍以底部读数为准。
- Steam 使用商店特惠接口，只提供当前折扣；历史最低价需要另接价格历史服务。页面用价格榜而不是资讯卡片展示。
- NBA 使用官方 CDN 赛果 JSON。赛季休赛期或接口风控时会显示缓存/示例。
- 云顶之弈优先使用 CommunityDragon 的 TFT live 数据文件（主地址不可用时尝试 `latest` 路径和 GitHub 镜像）；若文件没有版本元数据，则回退到 CommunityDragon 版本索引。面板会展示版本、可上场英雄及其羁绊、同羁绊单位构成、装备和强化符文数量，并提供 DataTFT、TFTable 的阵容统计入口。不再把英雄联盟 Data Dragon 的版本列表直接当作云顶版本。CommunityDragon 不提供阵容胜率/场次排名，排行榜继续以 DataTFT/TFTable 的实时页面为准。补丁公告按当前主版本号生成官方公告链接；例如 `16.17.1` 通常对应 `16.17` 补丁说明，小版本后缀可能不同。TFT 数据请求单次超时为 8 秒，避免外部源不可达时页面长时间等待。
- 金融栏目支持 `全部市场`、`A股`、`港股`、`美股`、`黄金` 点选切换。当前东方财富板块接口覆盖 A 股行业板块；港股、美股和黄金先展示指数/品种读数，页面会明确标注尚未接入板块接口。

### NA TFT 阵容排名

配置 `RIOT_API_KEY` 后，服务会从 NA 高段位榜单采样近期对局并计算阵容统计。默认使用 `na1` 平台和 `americas` 区域路由；可通过环境变量调整采样规模：

```text
RIOT_API_KEY=不要提交到仓库
RIOT_TFT_PLATFORM=na1
RIOT_TFT_ROUTING=americas
RIOT_TFT_PLAYERS=8
RIOT_TFT_MATCHES=50
RIOT_TFT_MIN_GAMES=2
```

没有配置 key 时，云顶栏目仍展示 CommunityDragon 静态数据，NA 排名状态会显示为未配置，不会阻塞其他栏目。

## 接口

看板页面调用：

```text
GET /api/dashboard
GET /api/dashboard?refresh=1
GET /api/health
```

所有来源都被归一为以下字段：

```json
{
  "id": "stable-source-id",
  "source_id": "thinking-machines",
  "source": "Thinking Machines Lab",
  "section": "ai",
  "category": "AI",
  "title": "...",
  "summary": "...",
  "url": "https://...",
  "published_at": "2026-07-31T00:00:00+00:00",
  "heat": 0,
  "metrics": {"赞": 0, "评": 0}
}
```

新增来源时，优先在 `SOURCE_CONFIG` 中增加配置，并实现一个小型解析函数，将结果转换成上述结构。不要让页面直接依赖第三方返回格式。

## 缓存和失败策略

- 进程内缓存 15 分钟，避免刷新页面时重复请求外站。
- 成功抓取后写入 `.cache.json`，服务重启仍可显示上次结果。
- 外部源失败时优先使用磁盘缓存，首次运行才显示内置示例。
- 页面只在用户点击刷新时强制绕过进程内缓存。

## 迭代路线

### P0：当前版本

- [x] Thinking Machines RSS
- [x] 机器之心、量子位、新智元知乎源
- [x] 腾讯行情、Steam 特惠、云顶 TFT 数据、NBA 赛果
- [x] 金融行情地图、板块涨跌和金融资讯入口
- [x] 同源代理、缓存、降级
- [x] 栏目切换、来源筛选、关键词搜索、时间/热度排序
- [x] 移动端布局和离线首屏

### P1：个人可用性

- [ ] 保存用户关键词和来源偏好（优先 `localStorage`）
- [ ] 每日摘要导出为 Markdown
- [ ] 定时任务或系统通知
- [ ] 加入 arXiv / Hugging Face Papers 作为高频论文源

### P2：其他栏目增强

- [ ] 行情：自选股、港股/美股板块接口和历史走势图
- [ ] 游戏：Steam 历史最低价、DataTFT/TFTable 结构化胜率接口
- [ ] 竞技：英雄联盟赛程与结果
- [ ] 各栏目独立数据源状态、更新时间和错误提示

## 推送到 GitHub

当前目录是独立应用，建议单独建仓库：

```bash
cd daily-board
git init
git add .
git commit -m "feat: add personal daily board MVP"
git branch -M main
git remote add origin https://github.com/<your-account>/daily-board.git
git push -u origin main
```

不要提交 `.cache.json`，也不要把任何平台 Cookie、Token 或个人数据写入仓库。

## 部署到 dochub.gxtree.com

本项目需要运行 Python 服务端来代理外部数据源，不能只作为纯静态页面发布。部署平台需要将仓库的 Web 进程指向：

```text
python3 server.py --host 0.0.0.0 --port $PORT
```

仓库已提供 `Procfile` 和 `Dockerfile`。将 `dochub.gxtree.com` 的 DNS/HTTPS 反向代理指向该服务的端口即可。域名解析、证书和平台登录权限不在代码仓库内，需在部署平台配置。

如果 Dochub 已绑定本仓库并启用 webhook，之后每次 `git push origin main` 会触发一次重新构建；构建完成后仍然访问同一个地址：

```text
https://dochub.gxtree.com/
```

这个地址可以在手机、平板和其他电脑打开。`http://127.0.0.1:8787` 只代表当前设备上的本地服务，其他设备无法通过这个地址访问。若暂时没有域名部署，也可以在同一局域网内用运行服务器电脑的局域网 IP 加端口访问，例如 `http://192.168.1.20:8787`，前提是服务绑定 `0.0.0.0` 且防火墙放行端口。

推送到 GitHub 不等于已经部署；如果推送后页面没有更新，需要在 Dochub 控制台确认仓库、分支 `main`、启动命令和 webhook/自动部署开关。

### 私有 GitHub 仓库

个人使用可以把仓库改为 `Private`，不会影响应用本身。需要在 Dochub 的 GitHub 集成中重新授权，或把该仓库授权给 Dochub 的 GitHub App；平台必须能读取私有仓库的 `main` 分支。若平台没有私有仓库读取权限，构建会在拉取代码阶段失败，改回 `Public` 或补充授权即可。

Riot 开发 key 通常约 24 小时自动过期。过期 key 不会继续产生费用，也不会被服务使用；需要启用 NA 阵容采样时，在 Dochub 的服务环境变量中配置新生成的 `RIOT_API_KEY`，不要写入仓库、日志或前端代码。

如果平台只支持静态托管，页面仍能打开，但 `/api/dashboard` 无法抓取数据；应改用支持 Python Web 进程的部署方式。

## 维护约定

每次新增数据源时同步更新本 README 的“数据源”和“迭代路线”，并在提交信息中说明来源和是否需要鉴权。若某个来源连续失败，应保留缓存并在页面标记状态，而不是返回空白列表。
