const state = {
  items: [],
  section: "ai",
  source: "all",
  marketScope: "all",
  gameSubsection: "steam",
  query: "",
  sort: "time",
  payload: null,
};

const gameSubsectionLabels = {
  steam: "Steam 折扣",
  tft: "云顶之弈",
};

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
  $("#date-label").textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  $("#day-number").textContent = String(now.getDate()).padStart(2, "0");
  $("#day-month").textContent = now.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
}

function renderCards() {
  const query = state.query.trim().toLowerCase();
  const filtered = currentSectionItems()
    .filter((item) => state.source === "all" || item.source_id === state.source)
    .filter((item) => !query || `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(query))
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
      <span class="map-caption">GLOBAL SESSION / ${escapeHtml(formatDate(indexItems[0]?.published_at || ""))}</span>
      ${renderWorldSvg(indexItems)}
    </div>
    <div class="market-readout">
      <div class="readout-head"><span>MARKET PULSE / ${escapeHtml(scopeLabel)}</span><span>${indexItems.length} 个品种</span></div>
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
    <div class="sector-board-head"><span>SECTOR BREADTH / ${escapeHtml(scopeLabel)}</span><span>板块涨跌</span></div>
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
  return `<section class="finance-news"><div class="finance-news-head"><span>FINANCE SIGNALS</span><span>资讯流</span></div><div class="finance-news-grid">${rows}</div></section>`;
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
    <div class="steam-deals-head"><span>STEAM DEALS</span><span>当前商店价格</span></div>
    ${rows}
    <p class="steam-note">折扣来自 Steam 商店当前价格；历史最低价需要接入价格历史服务后再标注。</p>
  </div>`;
}

function renderTftPanel(items) {
  const grid = $("#feed-grid");
  const versionItem = items.find((item) => item.version || item.title.includes("云顶之弈"));
  const version = versionItem?.version || versionItem?.title.split(" · ")[1] || "待同步";
  const versionUrl = safeUrl(versionItem?.patch_url || (versionItem?.version ? officialTftPatchUrl(version) : versionItem?.url || officialTftPatchUrl(version)));
  const versionSource = versionItem?.version_source || "待连接 Riot 数据";
  const tftData = versionItem?.tft_data || {};
  const dataCounts = tftData.counts || {};
  const dataSamples = tftData.samples || {};
  const dataLabels = ["英雄", "装备", "羁绊", "强化符文"];
  const hasTftData = Object.keys(dataCounts).length > 0;
  const dataState = hasTftData ? "已接入" : versionItem?.sample ? "示例" : "未获取";
  const dataStats = dataLabels.map((label) => `<div class="tft-stat"><span>${label}</span><strong>${dataCounts[label] ? Number(dataCounts[label]).toLocaleString("zh-CN") : "--"}</strong></div>`).join("");
  const dataPreview = dataLabels.filter((label) => (dataSamples[label] || []).length).map((label) => `<div class="tft-data-line"><span>${label}</span><b>${escapeHtml(dataSamples[label].slice(0, 4).join(" · "))}</b></div>`).join("");
  grid.innerHTML = `<div class="tft-panel">
    <div class="tft-hero">
      <div><p class="tft-kicker">TEAMFIGHT TACTICS / LIVE PATCH</p><h3>版本 ${escapeHtml(version)}</h3><p>当前版本：${escapeHtml(versionSource)}。公告可能按主版本号命名，小版本后缀不代表数据错误。</p></div>
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
      <div class="tft-data-head"><span>TFT DATA SNAPSHOT</span><span>${dataState}</span></div>
      <div class="tft-stats">${dataStats}</div>
      ${dataPreview ? `<div class="tft-data-preview">${dataPreview}</div>` : `<p class="tft-data-empty">${versionItem?.sample ? "当前是示例缓存，外部 TFT 数据源连接后会替换。" : "当前缓存只有版本号，明细接口没有返回；点击右上角刷新即可重试，不需要继续等待。"}</p>`}
    </div>
    <div class="tft-checks">
      <div class="tft-check-head"><span>INFORMATION EDGE</span><span>今日检查清单</span></div>
      <div class="tft-check"><span><i>01</i>版本变化</span><a href="${escapeHtml(versionUrl)}" target="_blank" rel="noreferrer">对应补丁公告 <span aria-hidden="true">↗</span></a></div>
      <div class="tft-check"><span><i>02</i>阵容强度</span><a href="https://www.datatft.com/" target="_blank" rel="noreferrer">DataTFT <span aria-hidden="true">↗</span></a></div>
      <div class="tft-check"><span><i>03</i>环境差异</span><a href="https://tftable.com/" target="_blank" rel="noreferrer">TFTable <span aria-hidden="true">↗</span></a></div>
    </div>
    <p class="tft-note">版本号来自 CommunityDragon 的 TFT live 数据，不再把英雄联盟 Data Dragon 版本列表当作云顶版本。公告链接按当前主版本 ${escapeHtml(version.split(".").slice(0, 2).join("."))} 定位。</p>
  </div>`;
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
    gameFilters.innerHTML = Object.entries(gameSubsectionLabels).map(([subsection, label]) => `<button class="game-subfilter${state.gameSubsection === subsection ? " is-active" : ""}" type="button" data-game-subsection="${subsection}">${label}</button>`).join("");
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
    sample: ["示例", "status-sample"],
  };
  $("#source-status-list").innerHTML = statuses.map((status) => {
    const [label, className] = labels[status.state] || ["等待", "status-pending"];
    const reason = status.error ? " · 源失败" : "";
    return `<div class="status-line"${status.error ? ` title="${escapeHtml(status.error)}"` : ""}><span>${escapeHtml(status.name)}</span><span class="${className}">${label} · ${status.count || 0}${reason}</span></div>`;
  }).join("");
}

function setConnectionState(statuses = []) {
  const liveCount = statuses.filter((status) => status.state === "live").length;
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
    renderSourceFilters();
    renderCounts();
    renderCards();
    renderStatuses(state.payload.statuses);
    const stamp = new Date(state.payload.fetched_at);
    $("#last-sync").textContent = `最近同步 ${stamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    setConnectionState(state.payload.statuses || []);
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
    eyebrow: "NEXT MODULE / MARKET",
    title: "市场数据",
    copy: "沪深、港股、美股、黄金与板块行情将在这里汇总。",
    sources: ["指数与板块", "黄金现货", "自选列表"],
  },
  game: {
    eyebrow: "DEALS & PATCHES / GAME",
    title: "游戏",
    copy: "Steam 折扣和云顶之弈版本、数据集中在这里。",
    sources: ["Steam 折扣", "云顶之弈"],
  },
  sports: {
    eyebrow: "NEXT MODULE / COMPETITION",
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
    ai: ["CURATED FEED", "AI 信号"],
    market: ["LIVE SNAPSHOT / FINANCE", "金融市场"],
    game: ["DEALS & PATCHES", "游戏"],
    sports: ["SCORES & FIXTURES", "竞技赛果"],
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
