# TFT 胜率与阵容排名调研

更新日期：2026-09-02

## 结论

Riot 没有提供“阵容胜率排行榜”这一成品 API。Riot 官方提供的是：

- `TFT Match-V5`：对局详情，包括每位玩家的名次、英雄、装备、羁绊、强化符文和版本。
- `TFT League-V1`：大师、宗师、王者等段位榜单。
- `TFT Summoner-V1` / `Account-V1`：把召唤师或账号映射到 PUUID。
- Data Dragon / CommunityDragon：英雄、装备、羁绊等静态数据，不包含胜率。

因此，DataTFT、TFTable 一类网站必须在原始对局数据之上自建聚合逻辑。它们是否完全使用 Riot Match-V5、是否混用了合作数据或其他采集渠道，公开页面没有足够信息可以确认，不应把它们的排行榜接口当作 Riot 官方接口。

官方文档：

- <https://developer.riotgames.com/apis#tft-match-v1>
- <https://developer.riotgames.com/apis#tft-league-v1>
- <https://developer.riotgames.com/apis#tft-summoner-v1>
- <https://developer.riotgames.com/apis#account-v1>

## 自建排名需要什么

1. 使用 Riot 开发者密钥，通过 `TFT League-V1` 获取高段位玩家。
2. 通过 `TFT Summoner-V1` 获取这些玩家的 PUUID。
3. 使用 `TFT Match-V5` 批量读取近期对局 ID，再按对局 ID 去重并读取详情。
4. 用 `game_version`、队列、时间窗口和段位过滤，只聚合同一补丁的数据。
5. 用 `character_id + 星级` 生成阵容 key，统计：对局数、第一名率、前四率、平均名次。
6. 用 CommunityDragon 静态数据把 ID 翻译成人类可读的英雄、装备和羁绊名称。

建议至少展示样本数 `N`。没有样本数的胜率很容易把小样本误认为强势阵容；个人看板可以先使用最近 24 小时或 7 天、钻石以上、每个阵容至少 50 局的过滤条件。

## 成本和限制

- API 请求需要 `X-Riot-Token`，密钥不能提交到 GitHub，应放在部署平台环境变量中。
- 开发密钥有较低的请求频率和总量限制，且通常需要定期更换；生产密钥需要申请更高额度。
- Match-V5 是按对局读取，抓取大量玩家时请求量会很快超过个人开发额度，必须做 SQLite/磁盘缓存和对局去重。
- 同一套阵容的定义并不唯一。完整 8 人阵容、核心 3 星单位、装备和强化符文的组合都会影响排名，DataTFT/TFTable 的归一化算法属于各自实现。
- Riot 的区域路由主要覆盖 `americas`、`asia`、`europe`、`sea` 及各平台服。中国大陆服没有公开的 Riot Match-V5 路由，不能假设全球 Riot API 能直接代表国服数据；国服需要腾讯/合作数据源或第三方聚合数据。

## 对 Daily Board 的取舍

当前看板只接 CommunityDragon 的静态 TFT 数据，因此能展示版本、可上场英雄、羁绊和装备，但不能计算胜率排名。这部分不是再加一个静态接口就能完成的功能。

后续有三种路线：

1. **个人自建采样**：配置 Riot API key，定时抓取少量非国服高段位对局，自己计算排名。数据透明可解释，但覆盖有限。
2. **第三方接口**：购买或接入提供已聚合 TFT 统计的服务，开发量较小，但要接受额度、授权和数据口径限制。
3. **继续使用 DataTFT/TFTable 页面**：不抓取其站点内部接口，只提供版本匹配后的直达入口，维护成本最低。

不建议直接高频抓取 DataTFT/TFTable 页面或逆向其内部接口：接口可能随时变化，也可能违反站点使用条款；除非获得明确授权，否则不应作为看板的核心数据依赖。

当前代码已加入可选的 NA 采样适配器：配置 `RIOT_API_KEY` 后，默认从 `na1` 的 Challenger 榜单取少量玩家，经 `americas` Match-V5 读取近期对局，按同一 `game_version` 聚合完整单位集合，并返回对局数、第一名率、前四率和平均名次。默认规模为 8 名玩家、最多 50 局对局详情；没有 key 时该来源保持缓存/未配置状态，不影响其他栏目。
