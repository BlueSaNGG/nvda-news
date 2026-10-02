"use strict";

const DATA_URL = "data/news.json";
const REFRESH_MS = 5 * 60 * 1000;

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

function render(data) {
  const timeline = document.getElementById("timeline");
  const empty = document.getElementById("empty");
  const updatedEl = document.getElementById("updated-at");

  updatedEl.textContent = fmtUpdated(data.updated_at);

  const stories = Array.isArray(data.stories) ? data.stories : [];
  if (stories.length === 0) {
    timeline.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  timeline.innerHTML = stories.map((s) => {
    const badge = s.outlets_count > 1
      ? '<span class="badge">' + s.outlets_count + " 家媒体报道</span>"
      : "";
    return (
      '<a class="card" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
        '<h2 class="card-title">' + esc(s.title) + "</h2>" +
        '<div class="card-meta">' +
          "<span>" + esc(s.source) + "</span>" +
          "<span>·</span>" +
          "<span>" + esc(relTime(s.published_at)) + "</span>" +
          badge +
        "</div>" +
      "</a>"
    );
  }).join("");
}

async function load() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    render(await res.json());
  } catch (e) {
    const updatedEl = document.getElementById("updated-at");
    if (updatedEl) updatedEl.textContent = "加载失败，稍后重试";
  }
}

load();
setInterval(load, REFRESH_MS);
