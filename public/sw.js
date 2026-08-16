// Deliberately does no caching — this app needs live data from Firestore
// anyway, so there's no real offline mode to build. It exists only because
// some browsers require a service worker to be present before they'll
// offer "Add to Home Screen" / "Install app".
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
