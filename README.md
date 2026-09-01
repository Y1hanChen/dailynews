# Daily Board

个人每日信息看板的第一版。当前先接入 AI 栏目：

- Thinking Machines Lab：官方研究博客与公告 RSS
- 机器之心：知乎官方专栏接口

市场、游戏和竞技栏目已经预留界面，后续按同一套数据源适配器接入。

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

## 目录

| 文件 | 作用 |
| --- | --- |
| `server.py` | 静态文件服务、数据抓取、统一 JSON 接口和缓存 |
| `index.html` | 看板页面结构 |
| `styles.css` | 响应式视觉样式 |
| `app.js` | 筛选、排序、栏目切换和刷新交互 |
| `.cache.json` | 运行时生成的本地缓存，不提交 Git |

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

## 接口

看板页面调用：

```text
GET /api/dashboard
GET /api/dashboard?refresh=1
GET /api/health
```

两个新闻源被归一为以下字段：

```json
{
  "id": "stable-source-id",
  "source_id": "thinking-machines",
  "source": "Thinking Machines Lab",
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
- [x] 机器之心知乎源
- [x] 同源代理、缓存、降级
- [x] AI 来源筛选、关键词搜索、时间/热度排序
- [x] 移动端布局和非 AI 栏目占位

### P1：个人可用性

- [ ] 保存用户关键词和来源偏好（优先 `localStorage`）
- [ ] 每日摘要导出为 Markdown
- [ ] 定时任务或系统通知
- [ ] 加入 arXiv / Hugging Face Papers 作为高频论文源

### P2：其他栏目

- [ ] 行情：指数、黄金、自选股和板块快照
- [ ] 游戏：云顶之弈版本信息、Steam 折扣和史低记录
- [ ] 竞技：NBA、英雄联盟赛程与结果
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

## 维护约定

每次新增数据源时同步更新本 README 的“数据源”和“迭代路线”，并在提交信息中说明来源和是否需要鉴权。若某个来源连续失败，应保留缓存并在页面标记状态，而不是返回空白列表。
