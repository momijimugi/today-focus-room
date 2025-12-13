/* sw.js */
const APP_CACHE_VERSION = "tfr-v1";
const APP_CACHE = APP_CACHE_VERSION;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./notify.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    const results = await Promise.allSettled(
      CORE_ASSETS.map((p) => cache.add(p))
    );

    const failed = results
      .map((r, i) => ({ r, i }))
      .filter(x => x.r.status === "rejected")
      .map(x => CORE_ASSETS[x.i]);

    if (failed.length) {
      console.warn("⚠️ cache add failed:", failed);
    }

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

  // 同一オリジンだけ
  if (url.origin !== self.location.origin) return;

  // ✅ Range (206) はキャッシュしない（音声/動画で死にがち）
  if (req.headers.has("range")) {
    event.respondWith(fetch(req));
    return;
  }

  const isHTML = req.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirstSafe(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const fresh = await fetch(req);

    // cache.put が落ちてもページは返す
    try { await cache.put(req, fresh.clone()); } catch (_) {}

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

  const fresh = await fetch(req);

  // ✅ opaque / 206 / 失敗を飲み込む
  try { await cache.put(req, fresh.clone()); } catch (_) {}

  return fresh;
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
