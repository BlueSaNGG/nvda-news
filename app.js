"use strict";

const DATA_URL = "data/news.json";
const REFRESH_MS = 5 * 60 * 1000;

let currentCat = "全部";
let currentQuery = "";
let cachedData = null;

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
    "</div>"
  );
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
    ? '<div class="analyst-target"><span class="target-num">' +
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
  return (
    '<a class="card breaking-card" href="' + esc(s.url) +
    '" target="_blank" rel="noopener">' +
      '<span class="breaking-badge">突发</span>' +
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
  el.innerHTML = html;
  el.hidden = !html;
}

function breakingStories(data) {
  const stories = Array.isArray(data.stories) ? data.stories : [];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return stories.filter((s) =>
    s.breaking && new Date(s.published_at).getTime() >= cutoff);
}

function matchesQuery(s, q) {
  const hay = [s.title, s.title_zh, s.zh_summary, s.source]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function render(data) {
  const timeline = document.getElementById("timeline");
  const empty = document.getElementById("empty");
  const updatedEl = document.getElementById("updated-at");
  const breakingSec = document.getElementById("breaking");
  const breakingList = document.getElementById("breaking-list");
  const countEl = document.getElementById("search-count");

  updatedEl.textContent = fmtUpdated(data.updated_at);
  renderMarket(data.market);

  const stories = Array.isArray(data.stories) ? data.stories : [];
  const breaking = breakingStories(data);
  const breakingIds = new Set(breaking.map((s) => s.id));
  const showBreaking =
    breaking.length > 0 && currentCat === "全部" && !currentQuery;
  breakingSec.hidden = !showBreaking;
  if (showBreaking) {
    breakingList.innerHTML = breaking.map(breakingCard).join("");
  }

  const q = currentQuery.toLowerCase();
  const filtered = stories.filter((s) => {
    if (breakingIds.has(s.id)) return false;
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

function initTabs() {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t === btn));
    currentCat = btn.dataset.cat;
    if (cachedData) render(cachedData);
  });
}

async function load() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    cachedData = await res.json();
    render(cachedData);
  } catch (e) {
    const updatedEl = document.getElementById("updated-at");
    if (updatedEl) updatedEl.textContent = "加载失败，稍后重试";
  }
}

function initSearch() {
  const input = document.getElementById("search");
  const clear = document.getElementById("search-clear");
  input.addEventListener("input", () => {
    currentQuery = input.value.trim();
    clear.hidden = !currentQuery;
    if (cachedData) render(cachedData);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    currentQuery = "";
    clear.hidden = true;
    if (cachedData) render(cachedData);
    input.blur();
  });
}

initTabs();
initSearch();
load();
setInterval(load, REFRESH_MS);
