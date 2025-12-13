/* sw.js */
const APP_CACHE_VERSION = "tfr-v3"; // ★更新したら必ず上げる
const APP_CACHE = APP_CACHE_VERSION;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./notify.mp3",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./favicon.ico", // あるなら。無いなら消してOK
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === APP_CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ✅ Range(部分取得) はそのままネットへ（206問題回避）
  if (req.headers.has("range")) {
    event.respondWith(fetch(req));
    return;
  }

  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");

  // HTMLはNetwork First、それ以外はCache First（ただし失敗時に落ちない）
  event.respondWith(isHTML ? networkFirstSafe(req) : cacheFirstSafe(req));
});

async function networkFirstSafe(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.status !== 206) {
      try { await cache.put(req, fresh.clone()); } catch {}
    }
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || caches.match("./index.html");
  }
}

async function cacheFirstSafe(req) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.status !== 206) {
      try { await cache.put(req, fresh.clone()); } catch {}
    }
    return fresh;
  } catch {
    // ✅ ここが大事：fetch失敗でも落とさない
    const fallback = await cache.match(req);
    return fallback || new Response("", { status: 504, statusText: "Offline" });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

document.getElementById("lockNowBtn")?.addEventListener("click", async () => {
  await window.TFR_LOCK_NOW?.();
});