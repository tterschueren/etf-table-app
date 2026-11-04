// Service-Worker: Netzwerk zuerst, Cache als Offline-Fallback.
// So zieht die installierte iPhone-App bei jedem Oeffnen den aktuellen
// Stand (wichtig bei taeglichen Auto-Updates) und funktioniert offline.
const CACHE = "etf-table-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isPage = e.request.mode === "navigate" || e.request.destination === "document" || e.request.url.endsWith(".html");
  // Seiten: Netz zuerst (tagesaktuell), Cache nur wenn offline
  if (isPage) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }
  // Assets (gehasht vom Build): Cache zuerst, sonst Netz
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
