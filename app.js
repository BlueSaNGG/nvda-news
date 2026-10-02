"use strict";

const NEWS_URL = "data/news.json";
const EARNINGS_URL = "data/earnings.json";
const ROADMAP_URL = "data/roadmap.json";
const THESIS_URL = "data/thesis.json";
const FIN_URL = "data/financials_annual.json";
const PRICE_URL = "data/price_history.json";
const HIST_URL = "data/company_history.json";
const TARGETS_URL = "data/analyst_targets.json";
const GLOSS_URL = "data/glossary.json";
const SIG_URL = "data/signal_history.json";
const FRESH_URL = "data/freshness.json";
const REFRESH_MS = 5 * 60 * 1000;

let currentScreen = "today";
let currentCat = "全部";
let currentQuery = "";
let cachedNews = null;
let cachedExtra = null;
let glossary = [];          // [{term, en, explain}]，按 term 长度降序
let glossaryMap = {};       // 小写 term -> term 对象

/* ---------- 术语表 ---------- */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setGlossary(data) {
  glossary = [];
  glossaryMap = {};
  const terms = (data && data.terms) || [];
  terms.forEach(function (t) {
    if (t && t.term && t.explain) glossary.push(t);
  });
  glossary.sort(function (a, b) { return b.term.length - a.term.length; });
  glossary.forEach(function (t) {
    glossaryMap[t.term.toLowerCase()] = t;
  });
}

// 对已转义的纯文本做术语标注（最长优先、单次替换，避免重复包裹）
function escTag(s) {
  const t = esc(s == null ? "" : s);
  if (!glossary.length) return t;
  const re = new RegExp(
    "(" + glossary.map(function (g) { return escapeRe(g.term); }).join("|") + ")",
    "gi"
  );
  return t.replace(re, function (m) {
    const g = glossaryMap[m.toLowerCase()];
    if (!g) return m;
    return '<span class="term" data-term="' + esc(g.term) + '">' + m + "</span>";
  });
}

function openTermSheet(term) {
  const g = glossaryMap[String(term).toLowerCase()];
  if (!g) return;
  document.getElementById("term-title").textContent =
    g.term + (g.en ? " · " + g.en : "");
  document.getElementById("term-explain").textContent = g.explain;
  document.getElementById("term-backdrop").hidden = false;
  document.getElementById("term-sheet").hidden = false;
  document.body.classList.add("sheet-open");
}

function closeTermSheet() {
  document.getElementById("term-backdrop").hidden = true;
  document.getElementById("term-sheet").hidden = true;
  document.body.classList.remove("sheet-open");
}

function initGlossary() {
  const wrap = document.createElement("div");
  wrap.innerHTML =
    '<div class="term-backdrop" id="term-backdrop" hidden></div>' +
    '<div class="term-sheet" id="term-sheet" hidden role="dialog" aria-modal="true">' +
      '<div class="term-grip"></div>' +
      '<p class="term-title" id="term-title"></p>' +
      '<p class="term-explain" id="term-explain"></p>' +
      '<button class="term-close" id="term-close">知道了</button>' +
    "</div>";
  document.body.appendChild(wrap);
  document.addEventListener("click", function (e) {
    const t = e.target.closest ? e.target.closest(".term") : null;
    if (t) {
      // 术语可能嵌在新闻链接里：拦截跳转，只弹解释
      e.preventDefault();
      e.stopPropagation();
      openTermSheet(t.dataset.term);
      return;
    }
    if (e.target.closest &&
        (e.target.closest("#term-backdrop") || e.target.closest("#term-close"))) {
      closeTermSheet();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeTermSheet();
  });
}

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

const SCREENS = ["today", "news", "track", "start"];

function initNav() {
  document.querySelectorAll("[data-screen].tnav, [data-screen].bnav, #goto-news").forEach((el) => {
    el.addEventListener("click", () => {
      showScreen(el.id === "goto-news" ? "news" : el.dataset.screen);
    });
  });
  // 首访：弹出分流浮层，由用户选择，不自动跳转
  if (initFirstVisit()) return;
  let saved = null, home = null;
  try {
    saved = localStorage.getItem("nvda_screen");
    home = localStorage.getItem("nvda_home");
  } catch (e) {}
  // 老用户行为不变：上次 tab 优先；其次用记住的偏好首页
  const target = SCREENS.indexOf(saved) >= 0 ? saved
    : SCREENS.indexOf(home) >= 0 ? home : null;
  if (target) showScreen(target, false);
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
    ? '<p class="card-summary">' + escTag(s.zh_summary) + "</p>"
    : "";
}

function titleHtml(s) {
  if (s.title_zh) {
    return '<h2 class="card-title">' + escTag(s.title_zh) + "</h2>" +
      '<p class="card-title-en">' + escTag(s.title) + "</p>";
  }
  return '<h2 class="card-title">' + escTag(s.title) + "</h2>";
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
      (q.note ? '<p class="earn-note">' + escTag(q.note) + "</p>" : "") +
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
        '<p class="rm-note">' + escTag(it.note) + "</p>" +
        (it.next_milestone
          ? '<p class="rm-next">下一里程碑：' + esc(it.next_milestone.label) +
            " · " + esc(it.next_milestone.date) + "</p>"
          : "") +
        (it.history && it.history.length
          ? '<details class="rm-hist"><summary>状态时间线</summary>' +
            it.history.map(function (h) {
              return '<p class="rm-hist-row"><span class="num">' + esc(h.date) +
                "</span> " + escTag(h.event) + "</p>";
            }).join("") + "</details>"
          : "") +
      "</div>" +
    "</div>"
  ).join("") + "</div>";
}

/* ---------- 路线图：最近里程碑倒计时 ---------- */
function renderRmCountdown() {
  const el = document.getElementById("rm-countdown");
  const items = (cachedExtra && cachedExtra.roadmap && cachedExtra.roadmap.items) || [];
  let best = null; // {chip, date, exact, label}
  items.forEach(function (it) {
    const nm = it.next_milestone;
    if (!nm || !nm.date) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nm.date);
    let key, exact = false, days = null;
    if (m) {
      exact = true;
      const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      days = Math.round((t - Date.now()) / 86400000);
      key = t;
    } else {
      const y = /^(\d{4})(?:-H([12]))?$/.exec(nm.date);
      if (!y) return;
      key = new Date(+y[1], y[2] === "2" ? 6 : 0, 1).getTime();
    }
    if (key > Date.now() - 86400000 && (!best || key < best.key)) {
      best = { chip: it.name, label: nm.label, date: nm.date, key: key,
               exact: exact, days: days };
    }
  });
  if (!best) { el.innerHTML = ""; return; }
  const when = best.exact
    ? (best.days >= 0 ? "约 " + best.days + " 天" : "已到")
    : "预计 " + best.date.replace("H1", "年上半年").replace("H2", "年下半年");
  el.innerHTML = '<p class="rm-countdown">下一里程碑 · <b>' + esc(best.chip) +
    " " + esc(best.label) + "</b> " + when + "</p>";
}

/* ---------- 跟踪屏 chips 导航 ---------- */
let trackChipsInit = false;
function initTrackChips() {
  if (trackChipsInit) return;
  trackChipsInit = true;
  document.getElementById("track-chips").addEventListener("click", function (e) {
    const b = e.target.closest(".tchip");
    if (!b) return;
    const sec = document.getElementById(b.dataset.sec);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  const sent = market.valuation_sentence
    ? '<p class="val-sentence">' + esc(market.valuation_sentence) + "</p>"
    : "";
  el.innerHTML = '<div class="val-card num">' + med + bar + sent + "</div>";
}

/* ---------- 信号历史 ---------- */
function renderSignalHistory() {
  const el = document.getElementById("chart-signal");
  const entries = (cachedExtra && cachedExtra.signal && cachedExtra.signal.entries) || [];
  if (!entries.length) { el.innerHTML = TRACK_EMPTY; return; }
  const H = 150, PT = 12, PB = 20, PL = 26, PR = 8;
  const W = CW - PL - PR, n = entries.length;
  const YMAX = 5;
  const X = function (i) { return PL + (n === 1 ? W / 2 : W * i / (n - 1)); };
  const Y = function (v) { return PT + (H - PT - PB) * (1 - (v + YMAX) / (2 * YMAX)); };
  const vcolor = { "偏多": "#76b900", "中性": "#8a8f98", "偏空": "#ff5c5c" };
  let s = "";
  // verdict 背景带
  const bands = [];
  entries.forEach(function (e, i) {
    const b = bands[bands.length - 1];
    if (b && b.v === e.verdict) b.j = i; else bands.push({ v: e.verdict, i: i, j: i });
  });
  bands.forEach(function (b) {
    const x0 = X(b.i) - (n === 1 ? 0 : W / (n - 1) / 2), x1 = X(b.j) + (n === 1 ? 0 : W / (n - 1) / 2);
    s += '<rect x="' + Math.max(PL, x0).toFixed(1) + '" y="' + PT + '" width="' +
      (Math.min(PL + W, x1) - Math.max(PL, x0)).toFixed(1) + '" height="' + (H - PT - PB) +
      '" class="sig-band" fill="' + (vcolor[b.v] || "#8a8f98") + '"/>';
  });
  // 零线
  s += '<line x1="' + PL + '" y1="' + Y(0).toFixed(1) + '" x2="' + (PL + W) +
    '" y2="' + Y(0).toFixed(1) + '" class="grid"/>';
  // 阶梯线
  let d = "";
  entries.forEach(function (e, i) {
    const x = X(i), y = Y(Math.max(-YMAX, Math.min(YMAX, e.score)));
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    if (i < n - 1) d += "L" + X(i + 1).toFixed(1) + " " + y.toFixed(1) + " ";
  });
  s += '<path d="' + d + '" class="sig-line"/>';
  entries.forEach(function (e, i) {
    s += '<circle cx="' + X(i).toFixed(1) + '" cy="' +
      Y(Math.max(-YMAX, Math.min(YMAX, e.score))).toFixed(1) + '" r="2.6" class="sig-dot" fill="' +
      (vcolor[e.verdict] || "#8a8f98") + '"/>';
  });
  // x 轴日期（稀疏标注）
  const step = Math.max(1, Math.ceil(n / 5));
  for (let i = 0; i < n; i += step) {
    s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) +
      '" class="xlab" text-anchor="middle">' + esc(entries[i].date.slice(5)) + "</text>";
  }
  const last = entries[n - 1];
  s += '<text x="' + (PL + W) + '" y="' + (PT - 2) + '" class="xlab" text-anchor="end">最新：' +
    esc(last.verdict) + "（" + last.score + "分）</text>";
  el.innerHTML = chartSvg(H, s);
}

function thesisGroup(title, items, cls) {
  const stCls = { "数据支持": "st-ok", "待验证": "st-wait", "被证伪": "st-bad" };
  const rows = items.map((it) =>
    '<details class="thesis-item"><summary>' +
      '<span class="th-title">' + escTag(it.title) + "</span>" +
      '<span class="th-tags"><span class="th-tag">' + esc(it.horizon) + "</span>" +
      '<span class="th-tag ' + (it.strength === "强" ? "strong" : "") + '">' +
      esc(it.strength || "") + "</span>" +
      (it.status ? '<span class="th-status ' + (stCls[it.status] || "st-wait") + '">' +
        esc(it.status) + "</span>" : "") +
      "</span></summary><p>" + escTag(it.detail) + "</p>" +
      (it.evidence ? '<p class="th-evidence">复核依据：' + esc(it.evidence) + "</p>" : "") +
    "</details>"
  ).join("");
  return '<div class="thesis-col ' + cls + '"><h3>' + title + "</h3>" + rows + "</div>";
}

function renderThesis(th) {
  const el = document.getElementById("thesis");
  if (!th || !th.bull) { el.innerHTML = '<p class="track-empty">投资逻辑加载中…</p>'; return; }
  const rev = document.getElementById("thesis-reviewed");
  if (rev) rev.textContent = th.reviewed
    ? "上次复核 " + th.reviewed + " · 每财报季复核" : "";
  el.innerHTML = '<div class="thesis">' +
    thesisGroup("看多 · BULL", th.bull || [], "bull") +
    thesisGroup("看空 · BEAR", th.bear || [], "bear") +
  "</div>";
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
  renderFinCharts();
  renderCompany(cachedExtra && cachedExtra.history);
  renderPriceCtl();
  renderPriceChart();
  renderPE();
  renderTargets();
  renderRoadmap(cachedExtra && cachedExtra.roadmap);
  renderRmCountdown();
  renderValuation(cachedNews && cachedNews.market);
  renderSignalHistory();
  renderThesis(cachedExtra && cachedExtra.thesis);
  initTrackChips();
}

/* Freshness suffixes on track-section eyebrows (data/freshness.json).
   Missing file -> leave spans empty (graceful). */
function daysAgoChicago(iso) {
  try {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return null;
    var now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var rev = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(0, Math.round((day - rev) / 86400000));
  } catch (e) { return null; }
}

function renderFresh() {
  var fr = cachedExtra && cachedExtra.fresh;
  if (!fr || !fr.sections) return;  // missing file: suffixes stay hidden
  fr.sections.forEach(function (s) {
    var el = document.getElementById("fresh-" + s.id);
    if (!el) return;
    el.className = "fresh";
    var txt = "";
    if (s.status === "stale") {
      txt = "· 待复核";
      el.className = "fresh stale";
    } else if (s.status === "attention") {
      txt = "· " + (s.note || "需关注");
      el.className = "fresh attention";
    } else {
      var n = daysAgoChicago(s.reviewed);
      txt = (n === 0) ? "· 今日已复核" : "· " + n + "天前复核";
    }
    el.textContent = txt;
  });
}

/* ---------- 跟踪屏：图表 ---------- */
const CW = 360;
const TRACK_EMPTY = '<p class="track-empty">图表数据加载中…</p>';

function qShort(q) {
  return String(q).replace(" FY20", "'").replace(" FY19", "'");
}

function fmtTick(v, unit) {
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === "$") return "$" + (v >= 100 ? Math.round(v) : v.toFixed(2));
  if (unit === "x") return (v >= 100 ? Math.round(v) : v.toFixed(1)) + "x";
  if (unit === "B") return "$" + v.toFixed(1) + "B";
  return String(Math.round(v * 10) / 10);
}

function chartSvg(h, inner) {
  return '<svg viewBox="0 0 ' + CW + " " + h + '" class="csvg" role="img">' +
    inner + "</svg>";
}

/* 通用折线图：data=[{label, v}]，v 可为 null */
function renderLine(elId, data, o) {
  o = o || {};
  const el = document.getElementById(elId);
  const t = o.log ? function (v) { return Math.log10(v); }
                  : function (v) { return v; };
  const inv = o.log ? function (v) { return Math.pow(10, v); }
                    : function (v) { return v; };
  const vals = data.map(function (d) { return d.v; })
    .filter(function (v) { return v != null && (!o.log || v > 0); });
  if (!vals.length) { el.innerHTML = TRACK_EMPTY; return; }
  let lo = o.ymin != null ? o.ymin : Math.min.apply(null, vals);
  let hi = o.ymax != null ? o.ymax : Math.max.apply(null, vals);
  if (hi <= lo) hi = lo + 1;
  const pad = (t(hi) - t(lo)) * 0.14 || 1;
  // 显式 ymin（如 P/E 的 0 轴）不向下 padding，避免画出无意义的负刻度
  const tlo = o.ymin != null ? t(lo) : t(lo) - pad, thi = t(hi) + pad;
  const H = o.h || 150, PT = 8, PB = 18, PL = 36, PR = 8;
  const W = CW - PL - PR, n = data.length;
  const X = function (i) { return PL + W * (n === 1 ? 0.5 : i / (n - 1)); };
  const Y = function (v) { return PT + (H - PT - PB) * (1 - (t(v) - tlo) / (thi - tlo)); };
  let s = "";
  for (let g = 0; g <= 3; g++) {
    const tv = tlo + (thi - tlo) * g / 3, y = Y(inv(tv));
    s += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (PL + W) +
      '" y2="' + y.toFixed(1) + '" class="grid"/>' +
      '<text x="' + (PL - 4) + '" y="' + (y + 3).toFixed(1) +
      '" class="ylab" text-anchor="end">' + fmtTick(inv(tv), o.unit) + "</text>";
  }
  let d = "", started = false;
  data.forEach(function (p, i) {
    if (p.v == null || (o.log && p.v <= 0)) { started = false; return; }
    d += (started ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1) + " ";
    started = true;
  });
  s += '<path d="' + d + '" class="cline" stroke="' + (o.color || "#76b900") + '"/>';
  if (n <= 30) {
    data.forEach(function (p, i) {
      if (p.v == null || (o.log && p.v <= 0)) return;
      s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) +
        '" r="2.2" class="cdot"/>';
    });
  }
  const step = Math.max(1, Math.ceil(n / 5));
  for (let i = 0; i < n; i += step) {
    s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 5) +
      '" class="xlab" text-anchor="middle">' + esc(data[i].label) + "</text>";
  }
  el.innerHTML = chartSvg(H, s);
}

/* 通用柱状图：data=[{label, v, top}]，top 为柱顶文字 */
function renderBars(elId, data, o) {
  o = o || {};
  const el = document.getElementById(elId);
  const vals = data.map(function (d) { return d.v; })
    .filter(function (v) { return v != null; });
  if (!vals.length) { el.innerHTML = TRACK_EMPTY; return; }
  const hi = Math.max.apply(null, vals) * 1.18;
  const H = o.h || 160, PT = 16, PB = 18, PL = 30, PR = 6;
  const W = CW - PL - PR, n = data.length;
  const bw = W / n;
  const X = function (i) { return PL + bw * i + bw * 0.5; };
  const Y = function (v) { return PT + (H - PT - PB) * (1 - v / hi); };
  let s = "";
  for (let g = 0; g <= 2; g++) {
    const v = hi * g / 2, y = Y(v);
    s += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (PL + W) +
      '" y2="' + y.toFixed(1) + '" class="grid"/>' +
      '<text x="' + (PL - 4) + '" y="' + (y + 3).toFixed(1) +
      '" class="ylab" text-anchor="end">' + fmtTick(v, o.unit) + "</text>";
  }
  data.forEach(function (p, i) {
    if (p.v == null) return;
    const x = X(i), y = Y(p.v), w = Math.min(34, bw * 0.62);
    s += '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + w.toFixed(1) + '" height="' + (H - PB - y).toFixed(1) +
      '" class="cbar"/>';
    if (p.top) {
      s += '<text x="' + x.toFixed(1) + '" y="' + (y - 4).toFixed(1) +
        '" class="toplab" text-anchor="middle">' + esc(p.top) + "</text>";
    }
  });
  const step = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i += step) {
    s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 5) +
      '" class="xlab" text-anchor="middle">' + esc(data[i].label) + "</text>";
  }
  el.innerHTML = chartSvg(H, s);
}

function chronoQuarters() {
  const qs = (cachedExtra && cachedExtra.earnings && cachedExtra.earnings.quarters) || [];
  return qs.slice().reverse();
}

/* ---------- 入门屏：业务营收结构 ---------- */
const MIX_SEGS = [
  { key: "dc",     label: "数据中心",  color: "#76b900" },
  { key: "gaming", label: "游戏",      color: "#4a9eff" },
  { key: "proviz", label: "专业可视化", color: "#b07fe8" },
  { key: "auto",   label: "汽车",      color: "#f0a13c" },
  { key: "oem",    label: "OEM及其他", color: "#8a8f98" },
  { key: "edge",   label: "边缘计算*", color: "#5cc8c8" },
];

function segColor(key) {
  for (let i = 0; i < MIX_SEGS.length; i++) {
    if (MIX_SEGS[i].key === key) return MIX_SEGS[i].color;
  }
  return "#8a8f98";
}

function segLabel(key) {
  for (let i = 0; i < MIX_SEGS.length; i++) {
    if (MIX_SEGS[i].key === key) return MIX_SEGS[i].label;
  }
  return key;
}

/* 各季度 segments_b -> 有序分段（从下往上堆） */
function mixSegsFor(q) {
  const s = q.segments_b || {};
  if (q.segment_framework === "dc_edge") {
    return [{ key: "dc", v: s.dc }, { key: "edge", v: s.edge }];
  }
  return [
    { key: "dc", v: s.dc },
    { key: "gaming", v: s.gaming },
    { key: "proviz", v: s.proviz },
    { key: "auto", v: s.auto },
    { key: "oem", v: s.oem },
  ];
}

/* 100% 堆叠条形图：12 个季度营收结构变化 */
function renderMixChart() {
  const el = document.getElementById("mix-chart");
  if (!el) return;
  const qs = chronoQuarters().filter(function (q) { return q.segments_b; });
  if (!qs.length) { el.innerHTML = TRACK_EMPTY; return; }
  const H = 168, PT = 8, PB = 20, PL = 4, PR = 4;
  const W = CW - PL - PR, n = qs.length, bh = H - PT - PB;
  const bw = W / n;
  let s = "";
  qs.forEach(function (q, i) {
    const segs = mixSegsFor(q).filter(function (x) { return x.v != null && x.v > 0; });
    const tot = segs.reduce(function (a, x) { return a + x.v; }, 0);
    const x = PL + bw * i + bw * 0.5, w = Math.min(26, bw * 0.68);
    let y = PT + bh;
    segs.forEach(function (sg) {
      const frac = tot > 0 ? sg.v / tot : 0;
      const h = bh * frac;
      y -= h;
      s += '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + Math.max(h, 0.5).toFixed(1) +
        '" fill="' + segColor(sg.key) + '"/>';
    });
    // 数据中心占比标注在绿色段中央
    const dcFrac = tot > 0 ? segs[0].v / tot : 0;
    if (dcFrac > 0.2) {
      s += '<text x="' + x.toFixed(1) + '" y="' +
        (PT + bh - bh * dcFrac / 2 + 3).toFixed(1) +
        '" class="mixpct" text-anchor="middle">' + Math.round(dcFrac * 100) + "%</text>";
    }
  });
  const step = Math.max(1, Math.ceil(n / 4));
  for (let i = 0; i < n; i += step) {
    const x = PL + bw * i + bw * 0.5;
    s += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) +
      '" class="xlab" text-anchor="middle">' + esc(qShort(qs[i].quarter)) + "</text>";
  }
  el.innerHTML = chartSvg(H, s);
  const lg = document.getElementById("mix-legend");
  if (lg) {
    lg.innerHTML = MIX_SEGS.map(function (m) {
      return '<span class="mix-lg"><i style="background:' + m.color + '"></i>' +
        esc(m.label) + "</span>";
    }).join("");
  }
}

/* 最新一季环形图：各业务占比明细 */
function renderMixDonut() {
  const el = document.getElementById("mix-donut");
  if (!el) return;
  const qs = chronoQuarters().filter(function (q) { return q.segments_b; });
  const q = qs[qs.length - 1];
  if (!q) { el.innerHTML = TRACK_EMPTY; return; }
  const segs = mixSegsFor(q).filter(function (x) { return x.v != null && x.v > 0; });
  const tot = segs.reduce(function (a, x) { return a + x.v; }, 0);
  const cx = 70, cy = 70, r = 50, sw = 24;
  let s = "", ang = -Math.PI / 2;
  segs.forEach(function (sg) {
    const frac = tot > 0 ? sg.v / tot : 0;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    s += '<path d="M' + x0.toFixed(1) + " " + y0.toFixed(1) +
      " A" + r + " " + r + " 0 " + large + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) +
      '" fill="none" stroke="' + segColor(sg.key) + '" stroke-width="' + sw + '"/>';
    ang = a1;
  });
  const dcPct = tot > 0 ? (segs[0].v / tot * 100) : 0;
  s += '<text x="' + cx + '" y="' + (cy - 1) + '" text-anchor="middle" class="donut-big">' +
    dcPct.toFixed(1) + "%</text>" +
    '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" class="xlab">数据中心</text>';
  const rows = segs.map(function (sg) {
    const pct = tot > 0 ? sg.v / tot * 100 : 0;
    return '<div class="donut-row"><i style="background:' + segColor(sg.key) + '"></i>' +
      '<span class="donut-lab">' + esc(segLabel(sg.key)) + "</span>" +
      '<span class="donut-val num">$' + sg.v.toFixed(1) + "B · " + pct.toFixed(1) + "%</span></div>";
  }).join("");
  el.innerHTML = '<svg viewBox="0 0 140 140" class="csvg donut-svg" role="img">' + s + "</svg>" +
    '<div class="donut-side"><p class="donut-title">最新一季（' + esc(qShort(q.quarter)) +
    "）营收结构</p>" + rows + "</div>";
}

function renderFinCharts() {
  const qs = chronoQuarters();
  if (!qs.length) return;
  renderLine("chart-gm", qs.map(function (q) {
    return { label: qShort(q.quarter), v: q.gm_pct };
  }), { h: 140, unit: "%" });
  renderBars("chart-dc", qs.map(function (q) {
    return {
      label: qShort(q.quarter), v: q.dc_revenue_b,
      top: q.dc_yoy_pct != null ? "+" + q.dc_yoy_pct + "%" : ""
    };
  }), { h: 160, unit: "B" });
  // 营收 vs 上季指引
  var rg = qs.map(function (q, i) {
    return {
      label: qShort(q.quarter), v: q.revenue_b,
      guide: i > 0 && qs[i - 1].guidance_next_q_b != null
        ? qs[i - 1].guidance_next_q_b : null
    };
  });
  (function () {
    const el = document.getElementById("chart-revguide");
    const vals = [];
    rg.forEach(function (p) {
      if (p.v != null) vals.push(p.v);
      if (p.guide != null) vals.push(p.guide);
    });
    if (!vals.length) { el.innerHTML = TRACK_EMPTY; return; }
    const hi = Math.max.apply(null, vals) * 1.15;
    const H = 160, PT = 10, PB = 18, PL = 30, PR = 6;
    const W = CW - PL - PR, n = rg.length, bw = W / n;
    const X = function (i) { return PL + bw * i + bw * 0.5; };
    const Y = function (v) { return PT + (H - PT - PB) * (1 - v / hi); };
    let s = "";
    for (let g = 0; g <= 2; g++) {
      const v = hi * g / 2, y = Y(v);
      s += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (PL + W) +
        '" y2="' + y.toFixed(1) + '" class="grid"/>' +
        '<text x="' + (PL - 4) + '" y="' + (y + 3).toFixed(1) +
        '" class="ylab" text-anchor="end">' + fmtTick(v, "B") + "</text>";
    }
    rg.forEach(function (p, i) {
      if (p.v == null) return;
      const x = X(i), y = Y(p.v), w = Math.min(30, bw * 0.58);
      s += '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + (H - PB - y).toFixed(1) +
        '" class="cbar"/>';
      if (p.guide != null) {
        const gy = Y(p.guide);
        s += '<line x1="' + (x - w / 2 - 4).toFixed(1) + '" y1="' + gy.toFixed(1) +
          '" x2="' + (x + w / 2 + 4).toFixed(1) + '" y2="' + gy.toFixed(1) +
          '" class="guide-line"/>';
      }
    });
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) {
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 5) +
        '" class="xlab" text-anchor="middle">' + esc(rg[i].label) + "</text>";
    }
    s += '<g class="legend"><rect x="' + PL + '" y="2" width="10" height="8" class="cbar"/>' +
      '<text x="' + (PL + 14) + '" y="9" class="xlab">实际营收</text>' +
      '<line x1="' + (PL + 84) + '" y1="6" x2="' + (PL + 100) + '" y2="6" class="guide-line"/>' +
      '<text x="' + (PL + 104) + '" y="9" class="xlab">上季指引</text></g>';
    el.innerHTML = chartSvg(H, s);
  })();
}

/* ---------- 全历史股价 ---------- */
let priceRange = "all", priceLog = false;

function renderPriceCtl() {
  const el = document.getElementById("price-ctl");
  const ranges = [["all", "全部"], ["10", "10年"], ["5", "5年"], ["2", "2年"], ["1", "1年"]];
  el.innerHTML = ranges.map(function (r) {
    return '<button class="pctl' + (priceRange === r[0] ? " active" : "") +
      '" data-r="' + r[0] + '">' + r[1] + "</button>";
  }).join("") + '<button class="pctl' + (priceLog ? " active" : "") +
    '" data-r="log">对数</button>';
  el.querySelectorAll(".pctl").forEach(function (b) {
    b.addEventListener("click", function () {
      const r = b.dataset.r;
      if (r === "log") priceLog = !priceLog; else priceRange = r;
      renderPriceCtl();
      renderPriceChart();
    });
  });
}

function renderPriceChart() {
  const el = document.getElementById("chart-price");
  const all = (cachedExtra && cachedExtra.price && cachedExtra.price.points) || [];
  if (!all.length) { el.innerHTML = TRACK_EMPTY; return; }
  let data = all;
  if (priceRange !== "all") {
    const months = parseInt(priceRange, 10) * 12;
    const lm = all[all.length - 1].m.split("-");
    let cy = parseInt(lm[0], 10), cm = parseInt(lm[1], 10) - months;
    while (cm <= 0) { cm += 12; cy -= 1; }
    const cutoff = cy + "-" + String(cm).padStart(2, "0");
    data = all.filter(function (p) { return p.m >= cutoff; });
  }
  renderLine("chart-price", data.map(function (p) {
    return { label: p.m.slice(2), v: p.c };
  }), { h: 170, unit: "$", log: priceLog, color: "#76b900" });
}

/* ---------- TTM P/E ---------- */
function renderPE() {
  const fin = (cachedExtra && cachedExtra.financials && cachedExtra.financials.years) || [];
  const epsMap = {};
  fin.forEach(function (y) {
    if (y.eps_gaap != null && y.eps_gaap > 0) epsMap[y.fy] = y.eps_gaap;
  });
  // FY2027 TTM：近 4 季 GAAP 净利润 / 最新稀释股数
  const eq = (cachedExtra && cachedExtra.earnings && cachedExtra.earnings.quarters) || [];
  const ttmNames = ["Q3 FY2026", "Q4 FY2026", "Q1 FY2027", "Q2 FY2027"];
  let ttmNI = 0, ok = true;
  ttmNames.forEach(function (nm) {
    const q = eq.filter(function (x) { return x.quarter === nm; })[0];
    if (!q || q.net_income_b == null) ok = false; else ttmNI += q.net_income_b;
  });
  const ttmEPS = ok ? ttmNI / 24.285 : null; // Q2 FY2027 稀释股数 24.285B
  const pts = ((cachedExtra && cachedExtra.price && cachedExtra.price.points) || [])
    .filter(function (p) { return p.m >= "2010-02"; })
    .map(function (p) {
      const sp = p.m.split("-"), y = parseInt(sp[0], 10), mo = parseInt(sp[1], 10);
      const fy = mo >= 2 ? y + 1 : y; // 财年：2月–次年1月
      const eps = fy >= 2027 ? ttmEPS : epsMap[fy];
      return { label: p.m.slice(2), v: eps ? p.c / eps : null };
    });
  renderLine("chart-pe", pts, { h: 150, unit: "x", ymin: 0, color: "#4cc3ff" });
}

/* ---------- 分析师目标价分布（条带图） ---------- */
function targetAction(t) {
  const s = (t.source_title || "") + " " + (t.rating || "");
  if (/下调/.test(s)) return "下调";
  if (/上调/.test(s)) return "上调";
  if (/维持|重申/.test(s)) return "维持";
  return "—";
}
function openInfoSheet(title, body) {
  document.getElementById("term-title").textContent = title;
  document.getElementById("term-explain").textContent = body;
  document.getElementById("term-backdrop").hidden = false;
  document.getElementById("term-sheet").hidden = false;
  document.body.classList.add("sheet-open");
}
function renderTargets() {
  const el = document.getElementById("chart-targets");
  const cap = document.getElementById("targets-cap");
  const ts = ((cachedExtra && cachedExtra.targets && cachedExtra.targets.targets) || [])
    .filter(function (t) { return t.target_num > 0 && t.date; })
    .sort(function (a, b) { return a.target_num - b.target_num; });
  if (ts.length < 5) {
    el.innerHTML = '<p class="track-empty">研报目标价数据积累中（' + ts.length + " 条）</p>";
    if (cap) cap.textContent = "目标价数据积累中。";
    return;
  }
  const vs = ts.map(function (t) { return t.target_num; });
  const cur = cachedExtra && cachedNews && cachedNews.market && cachedNews.market.price;
  let lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  if (cur) { lo = Math.min(lo, cur); hi = Math.max(hi, cur); }
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;
  const med = (vs[(vs.length - 1) >> 1] + vs[vs.length >> 1]) / 2;
  const H = 200, PT = 16, PB = 22, PL = 40, PR = 12;
  const W = CW - PL - PR, LANES = 5, laneH = (H - PT - PB) / LANES;
  const X = function (v) { return PL + W * (v - lo) / (hi - lo); };
  let s = "";
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4, x = X(v);
    s += '<line x1="' + x.toFixed(1) + '" y1="' + PT + '" x2="' + x.toFixed(1) +
      '" y2="' + (H - PB) + '" class="grid"/>' +
      '<text x="' + x.toFixed(1) + '" y="' + (H - 7) +
      '" class="xlab" text-anchor="middle">' + fmtTick(v, "$") + "</text>";
  }
  const medX = X(med);
  s += '<line x1="' + medX.toFixed(1) + '" y1="' + PT + '" x2="' + medX.toFixed(1) +
    '" y2="' + (H - PB) + '" class="med-line"/>' +
    '<text x="' + Math.min(medX + 4, CW - PR - 60).toFixed(1) + '" y="' + (PT - 4) +
    '" class="med-lab">中位数 $' + med.toFixed(0) + "</text>";
  if (cur) {
    const cx = X(cur);
    s += '<line x1="' + cx.toFixed(1) + '" y1="' + PT + '" x2="' + cx.toFixed(1) +
      '" y2="' + (H - PB) + '" class="cur-line"/>' +
      '<text x="' + Math.max(cx - 4, PL + 44).toFixed(1) + '" y="' + (PT - 4) +
      '" class="xlab cur-lab" text-anchor="end">现价 $' + cur.toFixed(0) + "</text>";
  }
  ts.forEach(function (t, i) {
    const lane = (i * 2 + 1) % LANES; // 确定性分 lane，相邻点错开
    const y = PT + laneH * (lane + 0.5), x = X(t.target_num);
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
      '" r="5" class="tdot"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
      '" r="14" class="thit" data-ti="' + i + '"/>';
  });
  el.innerHTML = chartSvg(H, s);
  el.onclick = function (e) {
    const hit = e.target.closest ? e.target.closest(".thit") : null;
    if (!hit) return;
    const t = ts[parseInt(hit.dataset.ti, 10)];
    if (!t) return;
    const d = new Date(t.date);
    openInfoSheet(t.firm + " · $" + t.target_num.toFixed(0),
      "目标价 $" + t.target_num.toFixed(0) + " ｜ " + targetAction(t) +
      " ｜ " + (d.getMonth() + 1) + "/" + d.getDate() +
      (t.rating ? " ｜ 评级 " + t.rating : ""));
  };
  if (cap) cap.textContent = ts.length + " 家研报目标价分布；点击圆点看详情。绿线为当前价，蓝线为中位数。数据来自媒体报道整理。";
}

/* ---------- 公司史 ---------- */
function renderCompany(h) {
  const el = document.getElementById("company");
  if (!h || !h.milestones) { el.innerHTML = TRACK_EMPTY; return; }
  const ceo = h.ceo || {};
  let html = '<div class="ceo-card"><p class="ceo-eyebrow">CEO · 创始人</p>' +
    '<p class="ceo-name">' + esc(ceo.name || "") +
    (ceo.name_en ? ' <span class="ceo-en">' + esc(ceo.name_en) + "</span>" : "") + "</p>" +
    '<p class="ceo-desc">' + escTag(ceo.desc || "") + "</p></div>";
  html += '<div class="hist">' + h.milestones.map(function (m) {
    return '<div class="hist-item"><span class="hist-dot"></span><div class="hist-body">' +
      '<p class="hist-date num">' + esc(m.date) + '</p>' +
      '<p class="hist-title">' + escTag(m.title) + '</p>' +
      '<p class="hist-desc">' + escTag(m.desc) + "</p></div></div>";
  }).join("") + "</div>";
  el.innerHTML = html;
}

/* ---------- 入门屏 ---------- */
function startNum(label, val, term) {
  const lab = term
    ? '<span class="term" data-term="' + esc(term) + '">' + esc(label) + "</span>"
    : esc(label);
  return '<div class="start-num"><span class="sn-label">' + lab + "</span>" +
    '<b class="sn-val">' + val + "</b></div>";
}

function renderStart() {
  const numsEl = document.getElementById("start-nums");
  const risksEl = document.getElementById("start-risks");
  const eq = cachedExtra && cachedExtra.earnings;
  const qs = (eq && eq.quarters) || [];
  const sig = cachedNews && cachedNews.market && cachedNews.market.daily_signal;

  if (qs.length) {
    const q = qs[0];
    const dcShare = (q.dc_revenue_b != null && q.revenue_b)
      ? (q.dc_revenue_b / q.revenue_b * 100).toFixed(0) + "%" : "—";
    const upside = sig && sig.implied_upside_pct != null
      ? (sig.implied_upside_pct >= 0 ? "+" : "") + sig.implied_upside_pct + "%" : "—";
    numsEl.innerHTML =
      startNum("最新季营收", q.revenue_b != null ? "$" + q.revenue_b + "B" : "—", null) +
      startNum("数据中心营收占比", dcShare, "数据中心营收占比") +
      startNum("毛利率", q.gm_pct != null ? q.gm_pct.toFixed(1) + "%" : "—", "毛利率") +
      startNum("分析师目标价隐含空间", upside, "分析师评级");
  } else {
    numsEl.innerHTML = '<p class="track-empty">数字加载中…</p>';
  }

  const th = cachedExtra && cachedExtra.thesis;
  const bears = (th && th.bear) || [];
  if (bears.length) {
    // 强风险优先，取 3 条
    const top = bears.slice().sort(function (a, b) {
      return (b.strength === "强" ? 1 : 0) - (a.strength === "强" ? 1 : 0);
    }).slice(0, 3);
    risksEl.innerHTML = top.map(function (it) {
      return '<details class="thesis-item"><summary>' +
        '<span class="th-title">' + escTag(it.title) + "</span>" +
        '<span class="th-tags"><span class="th-tag ' +
          (it.strength === "强" ? "strong" : "") + '">' +
          esc(it.strength || "") + "</span></span>" +
      "</summary><p>" + escTag(it.detail) + "</p></details>";
    }).join("");
  } else {
    risksEl.innerHTML = '<p class="track-empty">加载中…</p>';
  }
  renderMixChart();
  renderMixDonut();
}

function initStartCtas() {
  document.getElementById("goto-today").addEventListener("click", function () {
    showScreen("today");
  });
  document.getElementById("goto-history").addEventListener("click", function () {
    showScreen("track");
    setTimeout(function () {
      const c = document.getElementById("company");
      if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  });
  const setHome = document.getElementById("set-home");
  try {
    if (localStorage.getItem("nvda_home") === "today") {
      setHome.textContent = "✓ 已设为默认进「今日」";
    }
  } catch (e) {}
  setHome.addEventListener("click", function () {
    try { localStorage.setItem("nvda_home", "today"); } catch (e) {}
    setHome.textContent = "✓ 已设为默认进「今日」";
  });
}

/* ---------- 首访分流 ---------- */
function initFirstVisit() {
  let seen = null;
  try { seen = localStorage.getItem("nvda_pulse_seen"); } catch (e) {}
  if (seen) return false;
  const fv = document.getElementById("first-visit");
  fv.hidden = false;
  fv.querySelectorAll(".fv-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      const h = b.dataset.home === "start" ? "start" : "today";
      try {
        localStorage.setItem("nvda_pulse_seen", "1");
        localStorage.setItem("nvda_home", h);
      } catch (e) {}
      fv.hidden = true;
      showScreen(h);
    });
  });
  return true;
}

/* ---------- load ---------- */
async function fetchJson(url) {
  const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function load() {
  try {
    const [news, earnings, roadmap, thesis, financials, price, history, targets, gloss, signal, fresh] = await Promise.all([
      fetchJson(NEWS_URL),
      fetchJson(EARNINGS_URL).catch(() => null),
      fetchJson(ROADMAP_URL).catch(() => null),
      fetchJson(THESIS_URL).catch(() => null),
      fetchJson(FIN_URL).catch(() => null),
      fetchJson(PRICE_URL).catch(() => null),
      fetchJson(HIST_URL).catch(() => null),
      fetchJson(TARGETS_URL).catch(() => null),
      fetchJson(GLOSS_URL).catch(() => null),
      fetchJson(SIG_URL).catch(() => null),
      fetchJson(FRESH_URL).catch(() => null),
    ]);
    cachedNews = news;
    cachedExtra = { earnings, roadmap, thesis, financials, price, history, targets, signal, fresh };
    setGlossary(gloss);
    renderToday(news);
    renderNews(news);
    renderTrack();
    renderFresh();
    renderStart();
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
initGlossary();
initStartCtas();
load();
setInterval(load, REFRESH_MS);
