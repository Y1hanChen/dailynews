const state = {
  items: [],
  section: "ai",
  source: "all",
  marketScope: "all",
  gameSubsection: "steam",
  animeMode: "airing",
  animeRegion: "jp",
  animeYear: new Date().getFullYear(),
  animeMonth: [10, 7, 4, 1].find((month) => month <= new Date().getMonth() + 1) || 1,
  bangumiAiringItems: [],
  bangumiCompletedItems: [],
  bangumiRequestId: 0,
  animeLoading: false,
  animeError: "",
  query: "",
  sort: "time",
  payload: null,
};

const gameSubsectionLabels = {
  steam: "Steam 折扣",
  tft: "云顶之弈",
};

function enabledGameSubsectionLabels() {
  return state.payload?.features?.tft_enabled === false
    ? { steam: gameSubsectionLabels.steam }
    : gameSubsectionLabels;
}

// CommunityDragon returns stable English identifiers even when the rest of
// the dashboard is localized. Keep the mapping in the client so old cache
// entries are localized immediately, without requiring a data refresh.
const TFT_NAME_ZH = Object.freeze({
  "A.M.P.": "A.M.P.",
  "Alistar": "阿利斯塔",
  "Anima Squad": "动物小队",
  "Annie": "安妮",
  "Aphelios": "厄斐琉斯",
  "Aurora": "奥萝拉",
  "Bastion": "堡垒",
  "Brand": "布兰德",
  "Braum": "布隆",
  "Bruiser": "斗士",
  "Cho'Gath": "科加斯",
  "Cyberboss": "赛博老大",
  "Darius": "德莱厄斯",
  "Divinicorp": "天神集团",
  "Dr. Mundo": "蒙多医生",
  "Draven": "德莱文",
  "Dynamo": "脉冲",
  "Ekko": "艾克",
  "Elise": "伊莉丝",
  "Exotech": "源计划",
  "Fiddlesticks": "费德提克",
  "Galio": "加里奥",
  "Golden Ox": "黄金之牛",
  "Gragas": "古拉加斯",
  "Graves": "格雷福斯",
  "Illaoi": "俄洛伊",
  "Jarvan IV": "嘉文四世",
  "Jax": "贾克斯",
  "Jhin": "烬",
  "Jinx": "金克丝",
  "Kindred": "千珏",
  "Kobuko": "科布科",
  "Kog'Maw": "克格莫",
  "LeBlanc": "乐芙兰",
  "Leona": "蕾欧娜",
  "Marksman": "狙神",
  "Milio": "米利欧",
  "Miss Fortune": "厄运小姐",
  "Mordekaiser": "莫德凯撒",
  "Morgana": "莫甘娜",
  "Naafiri": "纳亚菲利",
  "Neeko": "妮蔻",
  "Nidalee": "奈德丽",
  "Nitro": "氮气",
  "Poppy": "波比",
  "Rapidfire": "迅击",
  "Rengar": "雷恩加尔",
  "Renekton": "雷克顿",
  "Rhaast": "拉斯特",
  "Samira": "莎弥拉",
  "Sena": "赛娜",
  "Senna": "赛娜",
  "Sejuani": "瑟庄妮",
  "Seraphine": "萨勒芬妮",
  "Shaco": "萨科",
  "Shyvana": "希瓦娜",
  "Skarner": "斯卡纳",
  "Slayer": "杀手",
  "Street Demon": "街头恶魔",
  "Sylas": "塞拉斯",
  "Techie": "技术专家",
  "Twisted Fate": "卡牌大师",
  "Varus": "韦鲁斯",
  "Vanguard": "重装战士",
  "Vayne": "薇恩",
  "Veigar": "维迦",
  "Vi": "蔚",
  "Viego": "佛耶戈",
  "Xayah": "霞",
  "Yuumi": "悠米",
  "Zed": "劫",
  "Zeri": "泽丽",
  "Zyra": "婕拉",
  "Reunion": "重聚",
  "Unlikely Duo": "奇异搭档",
  "Domination": "统御",
  "Crimson Pact": "赤色契约",
  "Rocket Collection": "火箭收藏家",
  "Bruiser Crown": "斗士之冕",
  "Golem": "石甲虫",
  "Krug": "石甲虫",
  "Murk Wolf": "魔沼狼",
  "Murkwolf": "魔沼狼",
  "Razorbeak": "锋喙鸟",
  "Rift Herald": "峡谷先锋",
  "Small Prize": "小奖品",
  "Large Prize": "大奖品",
  "Golden Chest": "黄金宝箱",
  "Golden Book": "黄金之书",
  "Golden Sword": "黄金之剑",
  "Golden Bag": "黄金福袋",
});

function localizeTftName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (Object.prototype.hasOwnProperty.call(TFT_NAME_ZH, raw)) return TFT_NAME_ZH[raw];
  const traitMatch = raw.match(/^Trait:\s*(.+)$/i);
  if (traitMatch) return `羁绊：${localizeTftName(traitMatch[1])}`;
  const lower = raw.toLowerCase();
  const key = Object.keys(TFT_NAME_ZH).find((name) => name.toLowerCase() === lower);
  return key ? TFT_NAME_ZH[key] : raw;
}

function tftUnitIconUrl(unit) {
  if (unit?.icon_url) return safeUrl(unit.icon_url);
  const apiName = String(unit?.api_name || "").trim();
  if (!apiName) return "#";
  return safeUrl(`https://raw.communitydragon.org/latest/game/assets/ux/tft/champions/${apiName.toLowerCase()}.png`);
}

function tftUnitInitial(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase();
}

let worldFeatures = null;
let worldMapPromise = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function itemSection(item) {
  if (item.section === "steam" || item.section === "tft") return "game";
  if (item.source_id === "steam-specials" || item.source_id === "tft-riot-version") return "game";
  return item.section || "ai";
}

function itemGameSubsection(item) {
  if (item.subsection) return item.subsection;
  return item.source_id === "tft-riot-version" || item.section === "tft" ? "tft" : "steam";
}

function currentSectionItems() {
  return state.items.filter((item) => itemSection(item) === state.section)
    .filter((item) => state.section !== "game" || itemGameSubsection(item) === state.gameSubsection);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知时间";
  const now = new Date();
  const sameDay = date.toLocaleDateString("zh-CN") === now.toLocaleDateString("zh-CN");
  if (sameDay) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function updateDate() {
  const now = new Date();
  $("#date-label").textContent = now.toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  $("#day-number").textContent = String(now.getDate()).padStart(2, "0");
  $("#day-month").textContent = now.toLocaleDateString("zh-CN", { month: "long", year: "numeric" });
}

function renderCards() {
  const query = state.query.trim().toLowerCase();
  const scopedItems = currentSectionItems()
    .filter((item) => state.source === "all" || item.source_id === state.source)
    .filter((item) => !query || `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(query));

  // Entertainment has its own ranking (region, score, then Bangumi rank),
  // instead of the date sort used by the news feed.
  if (state.section === "entertainment") {
    renderEntertainment(scopedItems);
    return;
  }

  const filtered = scopedItems
    .sort((a, b) => state.sort === "heat"
      ? (b.heat || 0) - (a.heat || 0) || b.published_at.localeCompare(a.published_at)
      : b.published_at.localeCompare(a.published_at));

  const grid = $("#feed-grid");
  if (!filtered.length) {
    grid.innerHTML = `<div class="state-panel"><span>没有匹配的内容</span></div>`;
    return;
  }

  if (state.section === "market") {
    renderMarketMap(filtered);
    return;
  }

  if (state.section === "game" && state.gameSubsection === "steam") {
    renderSteamDeals(filtered);
    return;
  }

  if (state.section === "game" && state.gameSubsection === "tft") {
    renderTftPanel(filtered);
    return;
  }

  grid.innerHTML = filtered.map((item) => {
    const metrics = Object.entries(item.metrics || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([label, value]) => `<span>${escapeHtml(label)} <strong>${Number(value).toLocaleString("zh-CN")}</strong></span>`)
      .join("");
    const sample = item.sample ? `<span class="sample-note">示例缓存</span>` : "";
    const url = safeUrl(item.url);
    return `
      <article class="news-card">
        <div class="card-top">
          <div class="source-name"><span class="source-dot ${escapeHtml(item.tone)}"></span><span>${escapeHtml(item.source)}</span></div>
          <time class="card-time" datetime="${escapeHtml(item.published_at)}">${escapeHtml(formatDate(item.published_at))}</time>
        </div>
        <h3><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></h3>
        <p class="card-summary">${escapeHtml(item.summary || "暂无摘要")}</p>
        <div class="card-bottom">
          <div class="metrics">${metrics || `<span>${escapeHtml(item.category || "AI")}</span>`}${sample}</div>
          <a class="open-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">打开 <span aria-hidden="true">↗</span></a>
        </div>
      </article>`;
  }).join("");
}

const marketPositions = [
  { match: "上证", icon: "中", className: "mainland" },
  { match: "深证", icon: "深", className: "mainland south" },
  { match: "恒生", icon: "港", className: "hong-kong" },
  { match: "标普", icon: "美", className: "united-states" },
  { match: "纳斯达克", icon: "纳", className: "united-states west" },
  { match: "黄金", icon: "金", className: "gold" },
];

const marketScopeLabels = {
  all: "全部市场",
  cn: "A股",
  hk: "港股",
  us: "美股",
  gold: "黄金",
};

function marketItemScope(item) {
  if (item.market_scope) return item.market_scope;
  if (item.category === "板块") return "cn";
  const title = item.title || "";
  if (title.includes("上证") || title.includes("深证")) return "cn";
  if (title.includes("恒生")) return "hk";
  if (title.includes("标普") || title.includes("纳斯达克")) return "us";
  if (title.includes("黄金")) return "gold";
  return "other";
}

function officialTftPatchUrl(version) {
  const match = String(version || "").match(/\d+\.\d+(?:\.\d+)?/);
  if (!match) return "https://teamfighttactics.leagueoflegends.com/zh-cn/news/game-updates/";
  const majorMinor = match[0].split(".").slice(0, 2).join("-");
  return `https://teamfighttactics.leagueoflegends.com/zh-cn/news/game-updates/teamfight-tactics-patch-${majorMinor}-notes/`;
}

function marketMeta(item) {
  const match = marketPositions.find((position) => item.title.includes(position.match));
  const pct = Number(item.metrics?.["涨跌%"] || 0);
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const titleParts = item.title.split(" · ");
  return {
    icon: match?.icon || "·",
    className: match?.className || "other",
    name: titleParts[0] || item.title,
    value: titleParts[1] || "--",
    pct,
    direction,
  };
}

function pctFor(items, matcher) {
  const values = items.filter((item) => matcher(item)).map((item) => Number(item.metrics?.["涨跌%"] || 0));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function directionFor(pct) {
  return pct > 0 ? "up" : pct < 0 ? "down" : "flat";
}

function projectMapPoint(lon, lat) {
  return [((lon + 180) / 360) * 960, ((90 - lat) / 180) * 430];
}

function ringPath(ring) {
  return ring.map(([lon, lat], index) => {
    const [x, y] = projectMapPoint(lon, lat);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

function geometryPath(geometry) {
  if (!geometry) return "";
  if (geometry.type === "Polygon") return geometry.coordinates.map(ringPath).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat().map(ringPath).join(" ");
  return "";
}

function renderWorldSvg(indexItems) {
  if (!worldFeatures) {
    return `<div class="map-loading"><span class="spinner" aria-hidden="true"></span><span>正在加载世界边界</span></div>`;
  }
  const chinaPct = pctFor(indexItems, (item) => item.title.includes("上证") || item.title.includes("深证"));
  const hkPct = pctFor(indexItems, (item) => item.title.includes("恒生"));
  const usPct = pctFor(indexItems, (item) => item.title.includes("标普") || item.title.includes("纳斯达克"));
  const signals = { CN: chinaPct, HK: hkPct, US: usPct };
  const paths = worldFeatures.map((feature) => {
    const code = feature.properties?.["ISO3166-1-Alpha-2"] || "";
    const name = feature.properties?.name || "";
    const pct = signals[code];
    const signalClass = Object.prototype.hasOwnProperty.call(signals, code) ? directionFor(pct) : "neutral";
    return `<path class="country ${signalClass}" d="${geometryPath(feature.geometry)}"><title>${escapeHtml(name)}${Object.prototype.hasOwnProperty.call(signals, code) ? ` · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""}</title></path>`;
  }).join("");
  const labels = [
    [105, 35, "中", directionFor(chinaPct)],
    [114, 22, "港", directionFor(hkPct)],
    [-100, 39, "美", directionFor(usPct)],
    [34, 14, "金", "gold"],
  ].map(([lon, lat, label, tone]) => {
    const [x, y] = projectMapPoint(lon, lat);
    return `<g class="map-label ${tone}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><circle r="12"></circle><text y="4">${label}</text></g>`;
  }).join("");
  return `<svg class="world-map" viewBox="0 0 960 430" role="img" aria-label="全球国家轮廓和市场涨跌"><g class="country-layer">${paths}</g><g class="map-label-layer">${labels}</g></svg><div class="map-legend"><span><i class="legend-dot up"></i>上涨</span><span><i class="legend-dot down"></i>下跌</span><span><i class="legend-dot neutral"></i>无报价</span></div>`;
}

function ensureWorldMap() {
  if (worldFeatures || worldMapPromise) return;
  worldMapPromise = fetch("/assets/world.geojson", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`World map HTTP ${response.status}`);
      return response.json();
    })
    .then((geojson) => {
      worldFeatures = geojson.features || [];
      renderCards();
    })
    .catch((error) => console.warn("World map unavailable", error));
}

function renderMarketMap(items) {
  const grid = $("#feed-grid");
  const scope = state.marketScope;
  const scopeLabel = marketScopeLabels[scope] || marketScopeLabels.all;
  const indexItems = items.filter((item) => item.category === "市场" && (scope === "all" || marketItemScope(item) === scope));
  const sectorItems = items.filter((item) => item.category === "板块" && (scope === "all" || marketItemScope(item) === scope));
  const newsItems = items.filter((item) => item.category === "金融");
  const rows = indexItems.map((item) => {
    const meta = marketMeta(item);
    const sign = meta.pct > 0 ? "+" : "";
    return `<div class="market-row">
      <span class="market-row-name"><i class="market-row-icon ${meta.direction}">${escapeHtml(meta.icon)}</i>${escapeHtml(meta.name)}</span>
      <strong>${escapeHtml(meta.value)}</strong>
      <span class="market-change ${meta.direction}">${sign}${meta.pct.toFixed(2)}%</span>
    </div>`;
  }).join("");
  grid.innerHTML = `<div class="market-map">
    <div class="market-canvas" aria-label="全球市场行情地图">
      <span class="map-caption">全球交易时段 / ${escapeHtml(formatDate(indexItems[0]?.published_at || ""))}</span>
      ${renderWorldSvg(indexItems)}
    </div>
    <div class="market-readout">
      <div class="readout-head"><span>市场脉搏 / ${escapeHtml(scopeLabel)}</span><span>${indexItems.length} 个品种</span></div>
      ${rows}
      ${indexItems.length ? "" : `<p class="sector-empty">暂无该市场指数快照</p>`}
      <p class="readout-note">红色代表上涨，绿色代表下跌。数据为个人看板快照，不构成交易依据。</p>
    </div>
  </div>${renderSectorBoard(sectorItems)}${renderFinanceNews(newsItems)}`;
  ensureWorldMap();
}

function sectorRow(item) {
  const pct = Number(item.metrics?.["涨跌%"] || 0);
  const sign = pct > 0 ? "+" : "";
  const width = Math.min(100, Math.abs(pct) * 16 + 12);
  return `<a class="sector-row" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer"><span class="sector-name">${escapeHtml(item.title.split(" · ")[0])}</span><span class="sector-bar"><i class="${pct >= 0 ? "up" : "down"}" style="width:${width}%"></i></span><strong class="${pct >= 0 ? "up" : "down"}">${sign}${pct.toFixed(2)}%</strong></a>`;
}

function renderSectorBoard(items) {
  const sorted = [...items].sort((a, b) => Number(b.metrics?.["涨跌%"] || 0) - Number(a.metrics?.["涨跌%"] || 0));
  const rising = sorted.filter((item) => Number(item.metrics?.["涨跌%"] || 0) >= 0).slice(0, 5);
  const falling = sorted.filter((item) => Number(item.metrics?.["涨跌%"] || 0) < 0).sort((a, b) => Number(a.metrics?.["涨跌%"] || 0) - Number(b.metrics?.["涨跌%"] || 0)).slice(0, 5);
  const scopeLabel = marketScopeLabels[state.marketScope] || marketScopeLabels.all;
  const emptyLabel = state.marketScope === "all" || state.marketScope === "cn" ? "暂无板块数据" : "该市场暂未接入板块接口";
  return `<section class="sector-board">
    <div class="sector-board-head"><span>板块宽度 / ${escapeHtml(scopeLabel)}</span><span>板块涨跌</span></div>
    <div class="sector-columns">
      <div class="sector-column"><div class="sector-column-title"><span class="sector-signal up"></span>领涨</div>${rising.length ? rising.map(sectorRow).join("") : `<p class="sector-empty">${emptyLabel}</p>`}</div>
      <div class="sector-column"><div class="sector-column-title"><span class="sector-signal down"></span>领跌</div>${falling.length ? falling.map(sectorRow).join("") : `<p class="sector-empty">${emptyLabel}</p>`}</div>
    </div>
  </section>`;
}

function renderFinanceNews(items) {
  if (!items.length) return "";
  const rows = [...items].sort((a, b) => b.published_at.localeCompare(a.published_at)).map((item) => {
    const metrics = Object.entries(item.metrics || {}).map(([label, value]) => `<span>${escapeHtml(label)} <strong>${Number(value).toLocaleString("zh-CN")}</strong></span>`).join("");
    return `<article class="finance-news-row"><div class="finance-news-meta"><span class="source-dot ${escapeHtml(item.tone)}"></span><span>${escapeHtml(item.source)}</span><time>${escapeHtml(formatDate(item.published_at))}</time></div><a class="finance-news-title" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a><p>${escapeHtml(item.summary)}</p><div class="finance-news-bottom"><span class="metrics">${metrics || "金融"}</span>${item.sample ? `<span class="sample-note">示例缓存</span>` : ""}<a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">打开 <span aria-hidden="true">↗</span></a></div></article>`;
  }).join("");
  return `<section class="finance-news"><div class="finance-news-head"><span>金融信号</span><span>资讯流</span></div><div class="finance-news-grid">${rows}</div></section>`;
}

function renderSteamDeals(items) {
  const grid = $("#feed-grid");
  const rows = items.map((item) => {
    const discount = Number(item.discount_percent || item.metrics?.["折扣%"] || 0);
    const finalPrice = Number(item.final_price);
    const originalPrice = Number(item.original_price);
    const hasPrice = Number.isFinite(finalPrice);
    const price = hasPrice ? `¥${(finalPrice / 100).toFixed(2)}` : "查看特惠";
    const original = Number.isFinite(originalPrice) && originalPrice > finalPrice ? `¥${(originalPrice / 100).toFixed(2)}` : "";
    const url = safeUrl(item.url);
    const image = item.image_url
      ? `<img src="${escapeHtml(safeUrl(item.image_url))}" alt="" loading="lazy" />`
      : `<span class="steam-thumb-fallback">S</span>`;
    return `<article class="steam-row">
      <a class="steam-thumb" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${image}</a>
      <div class="steam-copy"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a><span>${escapeHtml(item.summary || "Steam 商店当前特惠")}</span></div>
      <div class="steam-discount ${discount > 0 ? "has-discount" : ""}">${discount > 0 ? `-${discount}%` : "特惠"}</div>
      <div class="steam-price"><strong>${escapeHtml(price)}</strong>${original ? `<del>${escapeHtml(original)}</del>` : ""}</div>
      <a class="steam-open" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(item.title)}">↗</a>
    </article>`;
  }).join("");
  grid.innerHTML = `<div class="steam-deals">
    <div class="steam-deals-head"><span>Steam 折扣</span><span>当前商店价格</span></div>
    ${rows}
    <p class="steam-note">折扣来自 Steam 商店当前价格；历史最低价需要接入价格历史服务后再标注。</p>
  </div>`;
}

function renderTftPanel(items) {
  const grid = $("#feed-grid");
  const versionItem = items.find((item) => item.version || item.title.includes("云顶之弈"));
  const metaItem = items.find((item) => item.tft_meta);
  const version = versionItem?.version || versionItem?.title.split(" · ")[1] || "待同步";
  const versionUrl = safeUrl(versionItem?.patch_url || (versionItem?.version ? officialTftPatchUrl(version) : versionItem?.url || officialTftPatchUrl(version)));
  const versionSource = versionItem?.version_source || "等待版本数据";
  const tftData = versionItem?.tft_data || {};
  const dataCounts = tftData.counts || {};
  const dataSamples = tftData.samples || {};
  const dataLabels = ["英雄", "装备", "羁绊", "强化符文"];
  const hasTftData = Object.keys(dataCounts).length > 0;
  const dataState = hasTftData ? "已接入" : versionItem?.sample ? "示例" : "未获取";
  const dataStats = dataLabels.map((label) => `<div class="tft-stat"><span>${label}</span><strong>${dataCounts[label] ? Number(dataCounts[label]).toLocaleString("zh-CN") : "--"}</strong></div>`).join("");
  const dataPreview = dataLabels.filter((label) => (dataSamples[label] || []).length).map((label) => `<div class="tft-data-line"><span>${label}</span><b>${escapeHtml(dataSamples[label].slice(0, 4).map(localizeTftName).join(" · "))}</b></div>`).join("");
  const unitDetails = Array.isArray(tftData.units) ? tftData.units : [];
  const lineups = Array.isArray(tftData.lineups) ? tftData.lineups : [];
  const rankedComps = Array.isArray(metaItem?.tft_meta?.comps) ? metaItem.tft_meta.comps : [];
  const playableUnits = unitDetails.filter((unit) => unit && unit.name && Array.isArray(unit.traits) && unit.traits.length);
  const unitRows = playableUnits.slice(0, 60).map((unit) => {
    const name = localizeTftName(unit.name);
    const traits = (unit.traits || []).map(localizeTftName).join(" · ") || "未标注羁绊";
    const iconUrl = tftUnitIconUrl(unit);
    const image = iconUrl !== "#" ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : "";
    return `<article class="tft-unit-card"><div class="tft-unit-avatar"><span>${escapeHtml(tftUnitInitial(name))}</span>${image}</div><div class="tft-unit-copy"><strong>${escapeHtml(name)}</strong><span>${unit.cost ? `${escapeHtml(unit.cost)} 费` : "英雄"}</span><small>${escapeHtml(traits)}</small></div></article>`;
  }).join("");
  const lineupRows = lineups.slice(0, 6).map((lineup) => `<div class="tft-lineup-row"><strong>${escapeHtml(localizeTftName(lineup.name))}</strong><span>${escapeHtml((lineup.units || []).map(localizeTftName).join(" · "))}</span></div>`).join("");
  const rankedRows = rankedComps.slice(0, 8).map((comp, index) => `<div class="tft-rank-row"><i>${String(index + 1).padStart(2, "0")}</i><div><strong>${escapeHtml((comp.units || []).map(localizeTftName).join(" · "))}</strong><span>场次 ${Number(comp.games || 0).toLocaleString("zh-CN")} · 前四 ${Number(comp.top4_rate || 0).toFixed(1)}% · 吃鸡 ${Number(comp.win_rate || 0).toFixed(1)}% · 平均排名 ${Number(comp.avg_placement || 0).toFixed(2)}</span></div></div>`).join("");
  const rankSummary = metaItem?.tft_meta ? `美服 / ${escapeHtml(metaItem.tft_meta.patch || "当前补丁")} · ${Number(metaItem.tft_meta.sample_games || 0).toLocaleString("zh-CN")} 条对局记录` : "尚未配置 Riot API";
  grid.innerHTML = `<div class="tft-panel">
    <div class="tft-hero">
      <div><p class="tft-kicker">云顶之弈 / 当前版本</p><h3>版本 ${escapeHtml(version)}</h3><p>当前版本：${escapeHtml(versionSource)}。公告可能按主版本号命名，小版本后缀不代表数据错误。</p></div>
      <a class="tft-patch-link" href="${escapeHtml(versionUrl)}" target="_blank" rel="noreferrer">对应补丁公告 <span aria-hidden="true">↗</span></a>
    </div>
    <div class="tft-links">
      <a class="tft-link datatft" href="https://www.datatft.com/" target="_blank" rel="noreferrer">
        <span class="tft-link-icon">D</span><span><b>DataTFT</b><small>阵容、英雄、装备与强化符文数据</small></span><span class="tft-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="tft-link tftable" href="https://tftable.com/" target="_blank" rel="noreferrer">
        <span class="tft-link-icon">T</span><span><b>TFTable</b><small>环境、阵容强度与版本参考</small></span><span class="tft-arrow" aria-hidden="true">↗</span>
      </a>
    </div>
    <div class="tft-data">
      <div class="tft-data-head"><span>数据快照</span><span>${dataState}</span></div>
      <div class="tft-stats">${dataStats}</div>
      ${dataPreview ? `<div class="tft-data-preview">${dataPreview}</div>` : `<p class="tft-data-empty">${versionItem?.sample ? "当前是示例缓存，外部 TFT 数据源连接后会替换。" : "当前缓存只有版本号，明细接口没有返回；点击右上角刷新即可重试，不需要继续等待。"}</p>`}
    </div>
    <div class="tft-composition">
      <div class="tft-data-head"><span>英雄与羁绊</span><span>可上场 ${playableUnits.length} 位</span></div>
      ${unitRows ? `<div class="tft-unit-list">${unitRows}</div>` : `<p class="tft-data-empty">当前数据没有可识别的可上场英雄。</p>`}
    </div>
    <div class="tft-rankings">
      <div class="tft-data-head"><span>阵容排行</span><span>${rankSummary}</span></div>
      <div class="tft-rank-links"><a href="https://tftable.com/" target="_blank" rel="noreferrer">TFTable 阵容排行 <span aria-hidden="true">↗</span></a><a href="https://www.datatft.com/" target="_blank" rel="noreferrer">DataTFT 阵容排行 <span aria-hidden="true">↗</span></a></div>
      ${rankedRows ? `<div class="tft-rank-list">${rankedRows}</div>` : lineupRows ? `<div class="tft-lineup-list">${lineupRows}</div>` : `<p class="tft-data-empty">未配置 Riot API 密钥，当前只显示静态单位关系；配置后会按美服高段位对局计算前四率、吃鸡率和平均名次。</p>`}
    </div>
    <div class="tft-checks">
      <div class="tft-check-head"><span>信息差</span><span>今日检查清单</span></div>
      <div class="tft-check"><span><i>01</i>版本变化</span><a href="${escapeHtml(versionUrl)}" target="_blank" rel="noreferrer">对应补丁公告 <span aria-hidden="true">↗</span></a></div>
      <div class="tft-check"><span><i>02</i>阵容强度</span><a href="https://www.datatft.com/" target="_blank" rel="noreferrer">DataTFT <span aria-hidden="true">↗</span></a></div>
      <div class="tft-check"><span><i>03</i>环境差异</span><a href="https://tftable.com/" target="_blank" rel="noreferrer">TFTable <span aria-hidden="true">↗</span></a></div>
    </div>
    <p class="tft-note">版本号来自 CommunityDragon 的 TFT live 数据，不再把英雄联盟 Data Dragon 版本列表当作云顶版本。公告链接按当前主版本 ${escapeHtml(version.split(".").slice(0, 2).join("."))} 定位。</p>
  </div>`;
}

function entertainmentImage(item) {
  const imageUrl = safeUrl(item.image_url);
  return imageUrl !== "#"
    ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
    : `<span class="entertainment-poster-fallback">${escapeHtml(String(item.title || "文").slice(0, 1))}</span>`;
}

function animeRegionOf(item) {
  if (item.region) return item.region;
  const originalTitle = String(item.original_title || item.title || "");
  return /[\u3040-\u30ff]/.test(originalTitle) ? "jp" : "unknown";
}

const jikanSeasonNames = { 1: "winter", 4: "spring", 7: "summer", 10: "fall" };

function jikanSeasonUrl(year, month) {
  const season = jikanSeasonNames[Number(month)];
  return season ? `https://api.jikan.moe/v4/seasons/${encodeURIComponent(year)}/${season}?sfw=true&limit=60` : "";
}

function parseJikanItems(payload, airingState) {
  const entries = Array.isArray(payload?.data) ? payload.data : [];
  return entries
    .filter((entry) => entry && (airingState !== "completed" || entry.status === "Finished Airing"))
    .filter((entry) => airingState !== "airing" || entry.status !== "Finished Airing")
    .map((entry) => {
      const aired = entry.aired && typeof entry.aired === "object" ? entry.aired : {};
      const images = entry.images && typeof entry.images === "object" ? entry.images : {};
      const jpg = images.jpg && typeof images.jpg === "object" ? images.jpg : {};
      const score = Number(entry.score || 0);
      const rank = Number(entry.rank || 0);
      const title = String(entry.title || entry.title_english || "未命名番剧").trim();
      return {
        id: `bangumi-anime-jikan-${entry.mal_id || title}`,
        source_id: "bangumi-anime",
        source: "Bangumi 番剧 · Jikan 备用",
        tone: "coral",
        section: "entertainment",
        category: "文娱",
        entertainment_kind: "anime",
        airing_state: airingState,
        title,
        original_title: String(entry.title_japanese || title),
        summary: String(entry.synopsis || (airingState === "completed" ? "Jikan 完结番条目" : "Jikan 当季番条目")),
        url: String(entry.url || "https://myanimelist.net/anime/" + (entry.mal_id || "")),
        published_at: String(aired.from || new Date().toISOString()),
        heat: score * 10,
        metrics: rank ? { "评分": score, "排名": rank } : { "评分": score },
        score,
        rank,
        region: entry.title_japanese ? "jp" : "unknown",
        region_label: entry.title_japanese ? "日本动画" : "地区未标注",
        region_source: "Jikan 元数据",
        air_date: String(aired.from || "").slice(0, 10),
        air_weekday: "",
        image_url: String(jpg.large_image_url || jpg.image_url || ""),
        fallback: true,
      };
    });
}

async function fetchJikanItems(url, airingState) {
  if (!url) throw new Error("Jikan 季度地址无效");
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || `Jikan HTTP ${response.status}`);
  return parseJikanItems(payload, airingState);
}

async function loadBangumiBrowserFallback() {
  if (state.bangumiAiringItems.length) return;
  try {
    const items = await fetchJikanItems("https://api.jikan.moe/v4/seasons/now?sfw=true&limit=60", "airing");
    if (!items.length || state.animeMode !== "airing") return;
    state.bangumiAiringItems = items;
    if (state.animeRegion === "jp" && !items.some((item) => animeRegionOf(item) === "jp")) state.animeRegion = "all";
    replaceBangumiItems(items);
    updateBangumiStatus("fallback", items.length, "服务器无法访问 Bangumi，已由浏览器直连 Jikan");
  } catch (error) {
    console.warn("Bangumi browser fallback unavailable", error);
  }
}

function renderEntertainment(items) {
  const grid = $("#feed-grid");
  const allAnime = items.filter((item) => item.entertainment_kind === "anime");
  const anime = allAnime
    .filter((item) => state.animeRegion === "all" || animeRegionOf(item) === state.animeRegion)
    .sort((a, b) => {
      const regionRank = { jp: 0, other: 1, unknown: 2, cn: 3 };
      return (regionRank[animeRegionOf(a)] ?? 2) - (regionRank[animeRegionOf(b)] ?? 2)
        || Number(b.score || b.metrics?.["评分"] || 0) - Number(a.score || a.metrics?.["评分"] || 0)
        || (Number(a.rank || a.metrics?.["排名"] || 999999) - Number(b.rank || b.metrics?.["排名"] || 999999))
        || String(b.air_date || "").localeCompare(String(a.air_date || ""));
    })
    .slice(0, 30);
  const animeRows = anime.map((item, index) => {
    const score = Number(item.score || item.metrics?.["评分"] || 0);
    const rank = Number(item.rank || item.metrics?.["排名"] || 0);
    const airLabel = state.animeMode === "completed"
      ? ["完结", item.air_date].filter(Boolean).join(" · ")
      : [item.air_weekday, item.air_date].filter(Boolean).join(" · ");
    const regionLabel = item.region_label || ({ jp: "日本动画", cn: "中国动画", other: "其他地区" }[animeRegionOf(item)] || "地区未标注");
    const title = item.original_title && item.original_title !== item.title ? `${item.title} / ${item.original_title}` : item.title;
    return `<article class="entertainment-anime-card"><a class="entertainment-anime-main" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer"><div class="entertainment-poster">${entertainmentImage(item)}<i>${rank || String(index + 1).padStart(2, "0")}</i></div><div class="entertainment-copy"><strong title="${escapeHtml(title)}">${escapeHtml(item.title)}</strong><span>${escapeHtml(regionLabel)}${score ? ` · 评分 ${score.toFixed(1)}` : " · 暂无评分"}${airLabel ? ` · ${escapeHtml(airLabel)}` : ""}</span><small>${escapeHtml(item.summary || (state.animeMode === "completed" ? "Bangumi 完结番条目" : "Bangumi 放送中新番"))}</small></div></a></article>`;
  }).join("");
  const nowYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: nowYear - 2010 + 1 }, (_, index) => nowYear - index).map((year) => `<option value="${year}"${Number(state.animeYear) === year ? " selected" : ""}>${year} 年</option>`).join("");
  const seasonOptions = [1, 4, 7, 10].map((month) => `<option value="${month}"${Number(state.animeMonth) === month ? " selected" : ""}>${month} 月番</option>`).join("");
  const seasonLabel = `${state.animeYear} 年 ${state.animeMonth} 月番`;
  const regionOptions = [["jp", "日本动画"], ["all", "全部地区"], ["cn", "中国动画"], ["other", "其他地区"]];
  const regionLabel = regionOptions.find(([value]) => value === state.animeRegion)?.[1] || "全部地区";
  const regionControls = `<div class="entertainment-region-tabs" role="tablist" aria-label="番剧地区">${regionOptions.map(([value, label]) => `<button type="button" class="${state.animeRegion === value ? "is-active" : ""}" data-anime-region="${value}">${label}${value === "all" ? ` <span>${allAnime.length}</span>` : ""}</button>`).join("")}</div>`;
  const modeControls = `<div class="entertainment-mode-controls"><div class="entertainment-mode-tabs" role="tablist" aria-label="番剧范围"><button type="button" class="${state.animeMode === "airing" ? "is-active" : ""}" data-anime-mode="airing">放送中</button><button type="button" class="${state.animeMode === "completed" ? "is-active" : ""}" data-anime-mode="completed">完结番</button></div>${state.animeMode === "completed" ? `<label>季度<select id="bangumi-season">${seasonOptions}</select></label><label>年份<select id="bangumi-year">${yearOptions}</select></label>` : ""}</div>`;
  const animeContent = state.animeLoading
    ? `<p class="entertainment-empty">正在加载 ${state.animeMode === "completed" ? seasonLabel : "放送中的番剧"}…</p>`
    : state.animeError
      ? `<p class="entertainment-empty">${escapeHtml(state.animeError)}</p>`
      : animeRows || `<p class="entertainment-empty">${state.animeMode === "completed" ? `${seasonLabel}暂无番剧条目。` : `${regionLabel}暂无放送中的番剧，切换“全部地区”查看其他条目。`}</p>`;
  grid.innerHTML = `<div class="entertainment-board">
    <section class="entertainment-feature">
      <div class="entertainment-head"><span>${state.animeMode === "completed" ? "完结番评分" : "放送中新番"}</span><a href="https://bgm.tv/anime" target="_blank" rel="noreferrer">打开 Bangumi ↗</a></div>
      ${modeControls}
      ${regionControls}
      ${animeRows && !state.animeLoading && !state.animeError ? `<div class="entertainment-anime-grid">${animeRows}</div>` : animeContent}
    </section>
  </div>`;
  bindEntertainmentEvents();
}

function bindEntertainmentEvents() {
  $$('[data-anime-mode]').forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.animeMode;
    state.animeMode = mode;
    state.animeError = "";
    if (mode === "airing") {
      state.bangumiRequestId += 1;
      state.animeLoading = false;
      replaceBangumiItems(state.bangumiAiringItems);
    } else {
      loadBangumiCompleted();
    }
  }));
  $$('[data-anime-region]').forEach((button) => button.addEventListener("click", () => {
    state.animeRegion = button.dataset.animeRegion || "all";
    renderCards();
  }));
  $("#bangumi-year")?.addEventListener("change", (event) => {
    state.animeYear = Number(event.target.value);
    loadBangumiCompleted();
  });
  $("#bangumi-season")?.addEventListener("change", (event) => {
    state.animeMonth = Number(event.target.value);
    loadBangumiCompleted();
  });
}

function replaceBangumiItems(items) {
  state.items = state.items.filter((item) => item.source_id !== "bangumi-anime").concat(items || []);
  if (state.payload) state.payload.items = state.items;
  renderSourceFilters();
  renderCounts();
  renderCards();
}

async function loadBangumiCompleted() {
  state.animeMode = "completed";
  state.animeLoading = true;
  state.animeError = "";
  const requestId = ++state.bangumiRequestId;
  replaceBangumiItems([]);
  try {
    const response = await fetch(`/api/bangumi?mode=completed&year=${encodeURIComponent(state.animeYear)}&month=${encodeURIComponent(state.animeMonth)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (requestId !== state.bangumiRequestId) return;
    state.bangumiCompletedItems = Array.isArray(payload.items) ? payload.items : [];
    if (!state.bangumiCompletedItems.length) throw new Error("Bangumi 完结番接口返回空结果");
    if (state.animeRegion === "jp" && state.bangumiCompletedItems.length && !state.bangumiCompletedItems.some((item) => animeRegionOf(item) === "jp")) {
      state.animeRegion = "all";
    }
    updateBangumiStatus(state.bangumiCompletedItems.some((item) => item.fallback) ? "fallback" : "live", state.bangumiCompletedItems.length);
  } catch (error) {
    if (requestId !== state.bangumiRequestId) return;
    try {
      state.bangumiCompletedItems = await fetchJikanItems(jikanSeasonUrl(state.animeYear, state.animeMonth), "completed");
      if (requestId !== state.bangumiRequestId) return;
      if (!state.bangumiCompletedItems.length) throw new Error("Jikan 该季度没有已完结条目");
      state.animeError = "";
      if (state.animeRegion === "jp" && !state.bangumiCompletedItems.some((item) => animeRegionOf(item) === "jp")) state.animeRegion = "all";
      updateBangumiStatus("fallback", state.bangumiCompletedItems.length, "服务器无法访问 Bangumi，已由浏览器直连 Jikan");
    } catch (fallbackError) {
      state.bangumiCompletedItems = [];
      state.animeError = `完结番加载失败：${fallbackError.message || error.message || "Bangumi 接口暂不可用"}`;
      updateBangumiStatus("sample", 0, fallbackError.message || error.message || "Bangumi 接口暂不可用");
    }
  } finally {
    if (requestId === state.bangumiRequestId) {
      state.animeLoading = false;
      replaceBangumiItems(state.bangumiCompletedItems);
    }
  }
}

function renderCounts() {
  const sectionItems = currentSectionItems();
  const counts = sectionItems.reduce((acc, item) => {
    acc[item.source_id] = (acc[item.source_id] || 0) + 1;
    return acc;
  }, {});
  $("#all-count").textContent = sectionItems.length;
  $$('[data-count-for]').forEach((node) => {
    node.textContent = counts[node.dataset.countFor] || 0;
  });
  $("#total-count").textContent = sectionItems.length;
  $("#progress-fill").style.width = `${Math.min(100, sectionItems.length / 30 * 100)}%`;
}

function bindSourceEvents() {
  $$(".source-filter").forEach((button) => button.addEventListener("click", () => {
    state.source = button.dataset.source;
    $$(".source-filter").forEach((node) => node.classList.toggle("is-active", node === button));
    renderCards();
  }));
}

function bindMarketScopeEvents() {
  $$(".market-scope-filter").forEach((button) => button.addEventListener("click", () => {
    state.marketScope = button.dataset.marketScope;
    $$(".market-scope-filter").forEach((node) => node.classList.toggle("is-active", node === button));
    renderCards();
  }));
}

function bindGameSubsectionEvents() {
  $$(".game-subfilter").forEach((button) => button.addEventListener("click", () => {
    state.gameSubsection = button.dataset.gameSubsection;
    $$(".game-subfilter").forEach((node) => node.classList.toggle("is-active", node === button));
    renderCounts();
    renderCards();
  }));
}

function renderSourceFilters() {
  const container = $("#source-filters");
  const sources = (state.payload?.sources || []).filter((source) => source.section === state.section);
  const counts = state.items.reduce((acc, item) => {
    acc[item.source_id] = (acc[item.source_id] || 0) + 1;
    return acc;
  }, {});
  container.hidden = state.section === "game";
  container.innerHTML = `<button class="source-filter is-active" type="button" data-source="all">全部 <span id="all-count">${currentSectionItems().length}</span></button>`
    + sources.map((source) => `<button class="source-filter" type="button" data-source="${escapeHtml(source.id)}">${escapeHtml(source.short_name || source.name)} <span data-count-for="${escapeHtml(source.id)}">${counts[source.id] || 0}</span></button>`).join("");
  if (state.section !== "game") bindSourceEvents();
  const gameFilters = $("#game-subfilters");
  gameFilters.hidden = state.section !== "game";
  if (state.section === "game") {
    const availableSubsections = enabledGameSubsectionLabels();
    if (!Object.prototype.hasOwnProperty.call(availableSubsections, state.gameSubsection)) state.gameSubsection = "steam";
    gameFilters.innerHTML = Object.entries(availableSubsections).map(([subsection, label]) => `<button class="game-subfilter${state.gameSubsection === subsection ? " is-active" : ""}" type="button" data-game-subsection="${subsection}">${label}</button>`).join("");
    bindGameSubsectionEvents();
  } else {
    gameFilters.innerHTML = "";
  }
  const marketFilters = $("#market-scope-filters");
  marketFilters.hidden = state.section !== "market";
  if (state.section === "market") {
    marketFilters.innerHTML = Object.entries(marketScopeLabels).map(([scope, label]) => `<button class="market-scope-filter${state.marketScope === scope ? " is-active" : ""}" type="button" data-market-scope="${scope}">${label}</button>`).join("");
    bindMarketScopeEvents();
  } else {
    marketFilters.innerHTML = "";
  }
}

function renderStatuses(statuses = []) {
  const labels = {
    live: ["实时", "status-live"],
    cached: ["缓存", "status-cached"],
    fallback: ["备用", "status-cached"],
    sample: ["示例", "status-sample"],
  };
  $("#source-status-list").innerHTML = statuses.map((status) => {
    const [label, className] = labels[status.state] || ["等待", "status-pending"];
    const reason = status.error ? " · 源失败" : "";
    return `<div class="status-line"${status.error ? ` title="${escapeHtml(status.error)}"` : ""}><span>${escapeHtml(status.name)}</span><span class="${className}">${label} · ${status.count || 0}${reason}</span></div>`;
  }).join("");
}

function updateBangumiStatus(stateName, count, error = "") {
  const status = state.payload?.statuses?.find((item) => item.id === "bangumi-anime");
  if (!status) return;
  status.state = stateName;
  status.count = count;
  if (error) status.error = error;
  else delete status.error;
  renderStatuses(state.payload.statuses);
  setConnectionState(state.payload.statuses);
}

function setConnectionState(statuses = []) {
  const liveCount = statuses.filter((status) => ["live", "fallback"].includes(status.state)).length;
  const isBusy = $("#refresh-button").classList.contains("is-busy");
  const dot = $(".live-dot");
  dot.classList.toggle("is-error", liveCount === 0);
  if (!isBusy) {
    $("#sync-status").textContent = liveCount ? `已同步 ${state.items.length} 条` : "使用本地缓存";
  }
}

async function loadData(force = false) {
  const button = $("#refresh-button");
  button.classList.add("is-busy");
  $("#sync-status").textContent = "正在同步";
  try {
    const response = await fetch(`/api/dashboard${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.payload = await response.json();
    state.items = state.payload.items || [];
    state.animeMode = "airing";
    state.animeLoading = false;
    state.animeError = "";
    state.bangumiAiringItems = state.items.filter((item) => item.source_id === "bangumi-anime");
    // Keep an old cache visible if it predates region metadata; users can then
    // explicitly choose 日本动画 after the next successful refresh.
    if (state.animeRegion === "jp" && state.bangumiAiringItems.length && !state.bangumiAiringItems.some((item) => item.region === "jp")) {
      state.animeRegion = "all";
    }
    state.bangumiCompletedItems = [];
    renderSourceFilters();
    renderCounts();
    renderCards();
    renderStatuses(state.payload.statuses);
    const stamp = new Date(state.payload.fetched_at);
    $("#last-sync").textContent = `最近同步 ${stamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    setConnectionState(state.payload.statuses || []);
    if (!state.bangumiAiringItems.length) void loadBangumiBrowserFallback();
  } catch (error) {
    $("#sync-status").textContent = "同步失败";
    $(".live-dot").classList.add("is-error");
    $("#feed-grid").innerHTML = `<div class="state-panel is-error"><span>暂时无法读取数据源，请稍后刷新</span></div>`;
    console.error(error);
  } finally {
    button.classList.remove("is-busy");
  }
}

const placeholderContent = {
  market: {
    eyebrow: "下一模块 / 金融",
    title: "市场数据",
    copy: "沪深、港股、美股、黄金与板块行情将在这里汇总。",
    sources: ["指数与板块", "黄金现货", "自选列表"],
  },
  game: {
    eyebrow: "折扣与版本 / 游戏",
    title: "游戏",
    copy: "Steam 折扣和云顶之弈版本、数据集中在这里。",
    sources: ["Steam 折扣", "云顶之弈"],
  },
  sports: {
    eyebrow: "下一模块 / 竞技",
    title: "竞技赛果",
    copy: "NBA、英雄联盟的赛程和比赛结果会集中在这里。",
    sources: ["NBA", "英雄联盟", "赛程提醒"],
  },
};

function selectSection(section) {
  $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.section === section));
  state.section = section;
  state.source = "all";
  state.marketScope = "all";
  state.gameSubsection = "steam";
  $("#feed-section").hidden = false;
  $("#placeholder-section").hidden = true;
  const headings = {
    ai: ["精选信息流", "AI 信号"],
    market: ["实时行情 / 金融", "金融市场"],
    game: ["折扣与版本", "游戏"],
    sports: ["赛果与赛程", "竞技赛果"],
    entertainment: ["文娱榜单", "文娱"],
  };
  const [eyebrow, title] = headings[section] || headings.ai;
  $("#section-eyebrow").textContent = eyebrow;
  $("#section-title").textContent = title;
  renderSourceFilters();
  renderCounts();
  renderCards();
}

function bindEvents() {
  $("#refresh-button").addEventListener("click", () => loadData(true));
  $("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderCards();
  });
  $("#sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderCards();
  });
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => selectSection(tab.dataset.section)));
}

updateDate();
bindEvents();
loadData();
