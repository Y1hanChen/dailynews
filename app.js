const state = {
  items: [],
  section: "ai",
  source: "all",
  query: "",
  sort: "time",
  payload: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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
  const filtered = state.items
    .filter((item) => (item.section || "ai") === state.section)
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

  if (state.section === "games") {
    renderSteamDeals(filtered);
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

function renderMarketMap(items) {
  const grid = $("#feed-grid");
  const rows = items.map((item) => {
    const meta = marketMeta(item);
    const sign = meta.pct > 0 ? "+" : "";
    return `<div class="market-row">
      <span class="market-row-name"><i class="market-row-icon ${meta.direction}">${escapeHtml(meta.icon)}</i>${escapeHtml(meta.name)}</span>
      <strong>${escapeHtml(meta.value)}</strong>
      <span class="market-change ${meta.direction}">${sign}${meta.pct.toFixed(2)}%</span>
    </div>`;
  }).join("");
  const nodes = items.map((item) => {
    const meta = marketMeta(item);
    const sign = meta.pct > 0 ? "+" : "";
    return `<a class="market-node ${meta.className} ${meta.direction}" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">
      <span class="market-node-icon">${escapeHtml(meta.icon)}</span>
      <span class="market-node-copy"><b>${escapeHtml(meta.name)}</b><strong>${escapeHtml(meta.value)}</strong><em>${sign}${meta.pct.toFixed(2)}%</em></span>
    </a>`;
  }).join("");
  grid.innerHTML = `<div class="market-map">
    <div class="market-canvas" aria-label="全球市场行情地图">
      <span class="map-caption">GLOBAL SESSION / ${escapeHtml(formatDate(items[0]?.published_at || ""))}</span>
      <span class="map-line line-one" aria-hidden="true"></span><span class="map-line line-two" aria-hidden="true"></span>
      ${nodes}
    </div>
    <div class="market-readout">
      <div class="readout-head"><span>MARKET PULSE</span><span>${items.length} 个品种</span></div>
      ${rows}
      <p class="readout-note">红色代表上涨，绿色代表下跌。数据为个人看板快照，不构成交易依据。</p>
    </div>
  </div>`;
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

function renderCounts() {
  const sectionItems = state.items.filter((item) => (item.section || "ai") === state.section);
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

function renderSourceFilters() {
  const container = $("#source-filters");
  const sources = (state.payload?.sources || []).filter((source) => source.section === state.section);
  const counts = state.items.reduce((acc, item) => {
    acc[item.source_id] = (acc[item.source_id] || 0) + 1;
    return acc;
  }, {});
  container.innerHTML = `<button class="source-filter is-active" type="button" data-source="all">全部 <span id="all-count">${state.items.filter((item) => (item.section || "ai") === state.section).length}</span></button>`
    + sources.map((source) => `<button class="source-filter" type="button" data-source="${escapeHtml(source.id)}">${escapeHtml(source.short_name || source.name)} <span data-count-for="${escapeHtml(source.id)}">${counts[source.id] || 0}</span></button>`).join("");
  bindSourceEvents();
}

function renderStatuses(statuses = []) {
  const labels = {
    live: ["实时", "status-live"],
    cached: ["缓存", "status-cached"],
    sample: ["示例", "status-sample"],
  };
  $("#source-status-list").innerHTML = statuses.map((status) => {
    const [label, className] = labels[status.state] || ["等待", "status-pending"];
    return `<div class="status-line"><span>${escapeHtml(status.name)}</span><span class="${className}">${label} · ${status.count || 0}</span></div>`;
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
  games: {
    eyebrow: "NEXT MODULE / GAMES",
    title: "游戏情报",
    copy: "云顶之弈版本动态与 Steam 折扣历史会集中在这里。",
    sources: ["云顶之弈", "Steam 折扣", "史低提醒"],
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
  $("#feed-section").hidden = false;
  $("#placeholder-section").hidden = true;
  const headings = {
    ai: ["CURATED FEED", "AI 信号"],
    market: ["LIVE SNAPSHOT", "市场数据"],
    games: ["DEALS & PATCHES", "游戏情报"],
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
