"use strict";

const NEWS_URL = "data/news.json";
const EARNINGS_URL = "data/earnings.json";
const ROADMAP_URL = "data/roadmap.json";
const THESIS_URL = "data/thesis.json";
const REFRESH_MS = 5 * 60 * 1000;

let currentScreen = "today";
let currentCat = "全部";
let currentQuery = "";
let cachedNews = null;
let cachedExtra = null;

/* ---------- utils ---------- */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relTime(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (isNaN(then) || diff < 0) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return mins + " 分钟前";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " 小时前";
  const days = Math.floor(hours / 24);
  return days + " 天前";
}

function fmtUpdated(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "未知";
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "";
  return (d.getMonth() + 1) + "月" + d.getDate() + "日";
}

/* ---------- screen routing ---------- */
function showScreen(name, save) {
  currentScreen = name;
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.dataset.screen !== name;
  });
  document.querySelectorAll("[data-screen].tnav, [data-screen].bnav").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === name);
  });
  if (save !== false) {
    try { localStorage.setItem("nvda_screen", name); } catch (e) {}
  }
  window.scrollTo(0, 0);
}

function initNav() {
  document.querySelectorAll("[data-screen].tnav, [data-screen].bnav, #goto-news").forEach((el) => {
    el.addEventListener("click", () => {
      showScreen(el.id === "goto-news" ? "news" : el.dataset.screen);
    });
  });
  let saved = null;
  try { saved = localStorage.getItem("nvda_screen"); } catch (e) {}
  if (saved === "news" || saved === "track" || saved === "today") {
    showScreen(saved, false);
  }
}

/* ---------- story cards (shared) ---------- */
function badge(s) {
  return s.outlets_count > 1
    ? '<span class="badge">' + s.outlets_count + " 家媒体报道</span>"
    : "";
}

function metaRow(s) {
  const session = s.session
    ? '<span class="session">' + esc(s.session) + "</span>"
    : "";
  return (
    '<div class="card-meta">' +
      "<span>" + esc(s.source) + "</span>" +
      "<span>·</span>" +
      "<span>" + esc(relTime(s.published_at)) + "</span>" +
      session +
      badge(s) +
      reactionTag(s) +
      sentiDot(s) +
    "</div>"
  );
}

function reactionTag(s, big) {
  const pr = s.price_reaction;
  if (!pr || typeof pr.pct !== "number") return "";
  const cls = pr.pct > 0.05 ? "up" : pr.pct < -0.05 ? "down" : "flat";
  const sign = pr.pct > 0 ? "+" : "";
  const win = pr.window_h >= 1.95 ? "2h" : pr.window_h + "h";
  return '<span class="react' + (big ? " big" : "") + " " + cls + '">' +
    "发布后" + win + " " + sign + pr.pct.toFixed(1) + "%</span>";
}

function sentiDot(s) {
  if (typeof s.sentiment !== "number") return "";
  const label = s.sentiment > 0 ? "利多" : s.sentiment < 0 ? "利空" : "中性";
  const cls = s.sentiment > 0 ? "up" : s.sentiment < 0 ? "down" : "flat";
  return '<span class="senti ' + cls + '">' + label + "</span>";
}

function summaryRow(s) {
  return s.zh_summary
    ? '<p class="card-summary">' + esc(s.zh_summary) + "</p>"
    : "";
}

function titleHtml(s) {
  if (s.title_zh) {
    return '<h2 class="card-title">' + esc(s.title_zh) + "</h2>" +
      '<p class="card-title-en">' + esc(s.title) + "</p>";
  }
  return '<h2 class="card-title">' + esc(s.title) + "</h2>";
}

const ACTION_BADGE_CLASS = { "上调": "up", "下调": "down" };

function analystCard(s) {
  const a = s.analyst;
  const cls = ACTION_BADGE_CLASS[a.action] || "flat";
  const targetRow = a.target
    ? '<div class="analyst-target"><span class="target-num num">' +
      esc(a.target) + '</span><span class="target-label">目标价</span></div>'
    : "";
  const ratingRow = a.rating
    ? '<span class="analyst-rating">评级 ' + esc(a.rating) + "</span>"
    : "";
  return (
    '<a class="card analyst-card" href="' + esc(s.url) +
    '" target="_blank" rel="noopener">' +
      '<div class="analyst-head">' +
        '<span class="firm">' + esc(a.firm) + "</span>" +
        '<span class="abadge ' + cls + '">' + esc(a.action) + "</span>" +
        ratingRow +
      "</div>" +
      targetRow +
      titleHtml(s) +
      summaryRow(s) +
      metaRow(s) +
    "</a>"
  );
}

function breakingCard(s) {
  const big = reactionTag(s, true);
  return (
    '<a class="card breaking-card" href="' + esc(s.url) +
    '" target="_blank" rel="noopener">' +
      '<span class="breaking-badge">突发</span>' +
      (big ? '<div class="breaking-react">' + big + "</div>" : "") +
      titleHtml(s) +
      summaryRow(s) +
      metaRow(s) +
    "</a>"
  );
}

function storyCard(s) {
  return (
    '<a class="card" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
      titleHtml(s) +
      summaryRow(s) +
      metaRow(s) +
    "</a>"
  );
}

/* ---------- header market line ---------- */
function renderMarket(market) {
  const el = document.getElementById("quote-line");
  if (!market) { el.hidden = true; return; }
  let html = "";
  if (typeof market.price === "number") {
    const up = market.change_pct >= 0;
    html += "<strong>$" + market.price.toFixed(2) + "</strong> " +
      '<span class="chg ' + (up ? "up" : "down") + '">' +
      (up ? "▲" : "▼") + " " + (up ? "+" : "") +
      market.change_pct.toFixed(2) + "%</span>";
  }
  const ne = market.next_earnings;
  if (ne && ne.date) {
    const earn = ne.days_left > 0
      ? "距离 " + esc(ne.label) + " 财报还有 " + ne.days_left + " 天"
      : esc(ne.label) + "财报即将到来";
    html += (html ? '<span class="quote-sep">·</span>' : "") +
      '<span class="earn">' + earn + "</span>";
  }
  const ds = daySentimentHtml(market);
  if (ds) {
    html += (html ? '<span class="quote-sep">·</span>' : "") + ds;
  }
  el.innerHTML = html;
  el.hidden = !html;
}

function daySentimentHtml(market) {
  const ds = market && market.day_sentiment;
  if (!ds || typeof ds.avg !== "number") return "";
  const avg = ds.avg;
  const label = avg >= 0.5 ? "偏多" : avg <= -0.5 ? "偏空" : "中性";
  const cls = avg >= 0.5 ? "up" : avg <= -0.5 ? "down" : "flat";
  const filled = Math.max(0, Math.min(4, Math.round(((avg + 2) / 4) * 4)));
  let dots = "";
  for (let i = 0; i < 5; i++) {
    dots += '<span class="dot' + (i <= filled ? " on " + cls : "") + '"></span>';
  }
  return '<span class="day-senti">今日情绪<span class="dots">' + dots +
    '</span><b class="' + cls + '">' + label + "</b>" +
    '<span class="ds-n">n=' + ds.count + "</span></span>";
}

/* ---------- 今日屏 ---------- */
function signalCardHtml(market) {
  const sig = market && market.daily_signal;
  const el = document.getElementById("signal-card");
  if (!sig || !Array.isArray(sig.dims)) {
    el.innerHTML = '<div class="signal-card"><p class="signal-empty">信号计算中…</p></div>';
    return;
  }
  const vcls = sig.verdict === "偏多" ? "up" : sig.verdict === "偏空" ? "down" : "flat";
  const dims = sig.dims.map((d) => {
    const c = d.score > 0 ? "up" : d.score < 0 ? "down" : "flat";
    return '<div class="dim"><span class="dot ' + c + '"></span>' +
      "<b>" + esc(d.key) + "</b><span>" + esc(d.note) + "</span></div>";
  }).join("");
  el.innerHTML =
    '<div class="signal-card">' +
      '<p class="eyebrow">DAILY SIGNAL · 每日信号</p>' +
      '<div class="signal-verdict ' + vcls + '">' + esc(sig.verdict) +
        '<span class="signal-score">' +
        (sig.score > 0 ? "+" : "") + sig.score + " / 5</span></div>" +
      '<div class="signal-dims">' + dims + "</div>" +
      '<p class="disclaimer">信号由公开数据规则生成，仅供参考，不构成投资建议</p>' +
    "</div>";
}

function briefHtml(meta) {
  const el = document.getElementById("daily-brief");
  const b = meta && meta.daily_brief;
  if (!b || !b.text) {
    el.innerHTML = '<div class="brief-card"><p class="eyebrow">TODAY IN ONE LINE · 今日一句话</p>' +
      '<p class="brief-pending">今日简报生成中…</p></div>';
    return;
  }
  el.innerHTML = '<div class="brief-card"><p class="eyebrow">TODAY IN ONE LINE · 今日一句话</p>' +
    '<p class="brief-text">' + esc(b.text) + "</p>" +
    '<p class="brief-date">' + esc(fmtDay(b.date)) + "</p></div>";
}

function newSinceHtml(stories) {
  const el = document.getElementById("new-since");
  let last = null;
  try { last = localStorage.getItem("nvda_last_visit"); } catch (e) {}
  if (!last) {
    try { localStorage.setItem("nvda_last_visit", new Date().toISOString()); } catch (e) {}
    el.hidden = true;
    return;
  }
  const t = new Date(last).getTime();
  const n = stories.filter((s) => new Date(s.published_at).getTime() > t).length;
  try { localStorage.setItem("nvda_last_visit", new Date().toISOString()); } catch (e) {}
  if (n <= 0) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "自你上次打开新增 <b class=\"num\">" + (n > 99 ? "99+" : n) + "</b> 条新闻";
}

function breakingStories(data) {
  const stories = Array.isArray(data.stories) ? data.stories : [];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return stories.filter((s) =>
    s.breaking && new Date(s.published_at).getTime() >= cutoff);
}

function renderToday(data) {
  const market = data.market || {};
  const meta = data.meta || {};
  const stories = Array.isArray(data.stories) ? data.stories : [];

  document.getElementById("updated-at").textContent = fmtUpdated(data.updated_at);
  renderMarket(market);
  signalCardHtml(market);
  briefHtml(meta);
  newSinceHtml(stories);

  // 突发区（仅今日屏）
  const breakingSec = document.getElementById("breaking");
  const breakingList = document.getElementById("breaking-list");
  const breaking = breakingStories(data);
  breakingSec.hidden = breaking.length === 0;
  if (breaking.length > 0) {
    breakingList.innerHTML = breaking.map(breakingCard).join("");
  }

  // 今日新增 top3
  const top3 = document.getElementById("today-top3");
  const breakingIds = new Set(breaking.map((s) => s.id));
  const rest = stories.filter((s) => !breakingIds.has(s.id)).slice(0, 3);
  top3.innerHTML = rest.map((s) =>
    s.analyst ? analystCard(s) : storyCard(s)).join("");
}

/* ---------- 新闻屏 ---------- */
function matchesQuery(s, q) {
  const hay = [s.title, s.title_zh, s.zh_summary, s.source]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function renderNews(data) {
  const timeline = document.getElementById("timeline");
  const empty = document.getElementById("empty");
  const countEl = document.getElementById("search-count");

  const stories = Array.isArray(data.stories) ? data.stories : [];
  const q = currentQuery.toLowerCase();
  const filtered = stories.filter((s) => {
    if (currentCat !== "全部" && (s.category || "其他") !== currentCat) return false;
    if (q && !matchesQuery(s, q)) return false;
    return true;
  });

  if (q) {
    countEl.hidden = false;
    countEl.textContent = "找到 " + filtered.length + " 条";
  } else {
    countEl.hidden = true;
  }

  if (filtered.length === 0) {
    timeline.innerHTML = "";
    empty.hidden = false;
    empty.querySelector("p").textContent =
      stories.length === 0 ? "暂无新闻数据"
      : q ? "没有匹配的新闻，换个关键词试试"
      : "该分类暂无新闻";
    return;
  }
  empty.hidden = true;
  timeline.innerHTML = filtered.map((s) =>
    s.analyst ? analystCard(s) : storyCard(s)
  ).join("");
}

/* ---------- 跟踪屏 ---------- */
function renderEarnings(eq) {
  const el = document.getElementById("earnings");
  const qs = (eq && eq.quarters) || [];
  if (!qs.length) { el.innerHTML = '<p class="track-empty">财报数据加载中…</p>'; return; }
  el.innerHTML = qs.map((q, i) => {
    const latest = i === 0;
    const rev = q.revenue_b != null ? "$" + q.revenue_b + "B" : "—";
    const dc = q.dc_revenue_b != null ? "$" + q.dc_revenue_b + "B" : "—";
    const gm = q.gm_pct != null ? q.gm_pct.toFixed(1) + "%" : "—";
    const eps = q.eps_non_gaap != null ? "$" + q.eps_non_gaap : "—";
    const guide = q.guidance_next_q_b != null ? "$" + q.guidance_next_q_b + "B" : "—";
    return '<div class="earn-card' + (latest ? " latest" : "") + '">' +
      '<div class="earn-head"><b>' + esc(q.quarter) + "</b>" +
      (latest ? '<span class="latest-badge">最新</span>' : "") +
      '<span class="earn-date">' + esc(q.reported || "") + "</span></div>" +
      '<div class="earn-grid num">' +
        metric("营收", rev, q.revenue_yoy_pct != null ? "+" + q.revenue_yoy_pct + "% YoY" : "") +
        metric("数据中心", dc, q.dc_yoy_pct != null ? "+" + q.dc_yoy_pct + "% YoY" : "") +
        metric("毛利率", gm, "") +
        metric("EPS(non-GAAP)", eps, "") +
        metric("下季指引", guide, "") +
      "</div>" +
      (q.note ? '<p class="earn-note">' + esc(q.note) + "</p>" : "") +
    "</div>";
  }).join("");
}

function metric(label, val, sub) {
  return '<div class="metric"><span class="m-label">' + esc(label) + "</span>" +
    '<span class="m-val">' + esc(val) + "</span>" +
    (sub ? '<span class="m-sub">' + esc(sub) + "</span>" : "") + "</div>";
}

function renderRoadmap(rm) {
  const el = document.getElementById("roadmap");
  const items = (rm && rm.items) || [];
  if (!items.length) { el.innerHTML = '<p class="track-empty">路线图加载中…</p>'; return; }
  const cls = { "已发布": "shipped", "量产中": "ramping", "计划中": "planned" };
  el.innerHTML = '<div class="roadmap">' + items.map((it) =>
    '<div class="rm-item">' +
      '<span class="rm-dot ' + (cls[it.status] || "planned") + '"></span>' +
      '<div class="rm-body">' +
        '<div class="rm-head"><b>' + esc(it.name) + "</b>" +
          '<span class="rm-status ' + (cls[it.status] || "planned") + '">' +
          esc(it.status) + "</span></div>" +
        '<p class="rm-year num">' + esc(it.year) + "</p>" +
        '<p class="rm-note">' + esc(it.note) + "</p>" +
      "</div>" +
    "</div>"
  ).join("") + "</div>";
}

function renderValuation(market) {
  const el = document.getElementById("valuation");
  const sig = market && market.daily_signal;
  if (!sig) { el.innerHTML = '<p class="track-empty">估值数据计算中…</p>'; return; }
  const med = sig.target_median != null
    ? '<div class="val-row"><span>分析师目标价中位数</span><b class="num">$' +
      sig.target_median.toFixed(0) + '</b><span class="val-sub">' +
      sig.target_count + ' 家 · 隐含空间 ' +
      (sig.implied_upside_pct >= 0 ? "+" : "") + sig.implied_upside_pct + '%</span></div>'
    : "";
  const pct = sig.price_52w_pct;
  const bar = pct != null
    ? '<div class="val-row"><span>52周价格分位</span></div>' +
      '<div class="pct-bar"><div class="pct-fill" style="width:' + pct + '%"></div>' +
      '<div class="pct-marker" style="left:' + pct + '%"></div></div>' +
      '<p class="val-sub num">现价处于52周区间 ' + pct + '% 分位' +
      (market.price != null ? ' · $' + market.price.toFixed(2) : "") + "</p>"
    : "";
  el.innerHTML = '<div class="val-card num">' + med + bar + "</div>";
}

function thesisGroup(title, items, cls) {
  const rows = items.map((it) =>
    '<details class="thesis-item"><summary>' +
      '<span class="th-title">' + esc(it.title) + "</span>" +
      '<span class="th-tags"><span class="th-tag">' + esc(it.horizon) + "</span>" +
      '<span class="th-tag ' + (it.strength === "强" ? "strong" : "") + '">' +
      esc(it.strength || "") + "</span></span>" +
    "</summary><p>" + esc(it.detail) + "</p></details>"
  ).join("");
  return '<div class="thesis-col ' + cls + '"><h3>' + title + "</h3>" + rows + "</div>";
}

function renderThesis(th) {
  const el = document.getElementById("thesis");
  if (!th || !th.bull) { el.innerHTML = '<p class="track-empty">投资逻辑加载中…</p>'; return; }
  el.innerHTML = '<div class="thesis">' +
    thesisGroup("看多 · BULL", th.bull || [], "bull") +
    thesisGroup("看空 · BEAR", th.bear || [], "bear") +
  "</div>";
}

function renderTrack() {
  renderEarnings(cachedExtra && cachedExtra.earnings);
  renderRoadmap(cachedExtra && cachedExtra.roadmap);
  renderValuation(cachedNews && cachedNews.market);
  renderThesis(cachedExtra && cachedExtra.thesis);
}

/* ---------- load ---------- */
async function fetchJson(url) {
  const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function load() {
  try {
    const [news, earnings, roadmap, thesis] = await Promise.all([
      fetchJson(NEWS_URL),
      fetchJson(EARNINGS_URL).catch(() => null),
      fetchJson(ROADMAP_URL).catch(() => null),
      fetchJson(THESIS_URL).catch(() => null),
    ]);
    cachedNews = news;
    cachedExtra = { earnings, roadmap, thesis };
    renderToday(news);
    renderNews(news);
    renderTrack();
  } catch (e) {
    const updatedEl = document.getElementById("updated-at");
    if (updatedEl) updatedEl.textContent = "加载失败，稍后重试";
  }
}

function initTabs() {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t === btn));
    currentCat = btn.dataset.cat;
    if (cachedNews) renderNews(cachedNews);
  });
}

function initSearch() {
  const input = document.getElementById("search");
  const clear = document.getElementById("search-clear");
  input.addEventListener("input", () => {
    currentQuery = input.value.trim();
    clear.hidden = !currentQuery;
    if (cachedNews) renderNews(cachedNews);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    currentQuery = "";
    clear.hidden = true;
    if (cachedNews) renderNews(cachedNews);
    input.blur();
  });
}

initNav();
initTabs();
initSearch();
load();
setInterval(load, REFRESH_MS);
