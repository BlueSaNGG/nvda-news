"use strict";

const DATA_URL = "data/news.json";
const REFRESH_MS = 5 * 60 * 1000;

let currentCat = "全部";
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
  return (
    '<div class="card-meta">' +
      "<span>" + esc(s.source) + "</span>" +
      "<span>·</span>" +
      "<span>" + esc(relTime(s.published_at)) + "</span>" +
      badge(s) +
    "</div>"
  );
}

function summaryRow(s) {
  return s.zh_summary
    ? '<p class="card-summary">' + esc(s.zh_summary) + "</p>"
    : "";
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
      '<h2 class="card-title">' + esc(s.title) + "</h2>" +
      summaryRow(s) +
      metaRow(s) +
    "</a>"
  );
}

function storyCard(s) {
  return (
    '<a class="card" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
      '<h2 class="card-title">' + esc(s.title) + "</h2>" +
      summaryRow(s) +
      metaRow(s) +
    "</a>"
  );
}

function render(data) {
  const timeline = document.getElementById("timeline");
  const empty = document.getElementById("empty");
  const updatedEl = document.getElementById("updated-at");

  updatedEl.textContent = fmtUpdated(data.updated_at);

  const stories = Array.isArray(data.stories) ? data.stories : [];
  const filtered = currentCat === "全部"
    ? stories
    : stories.filter((s) => (s.category || "其他") === currentCat);

  if (filtered.length === 0) {
    timeline.innerHTML = "";
    empty.hidden = false;
    empty.querySelector("p").textContent =
      stories.length === 0 ? "暂无新闻数据" : "该分类暂无新闻";
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

initTabs();
load();
setInterval(load, REFRESH_MS);
