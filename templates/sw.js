{% load static %}// Service worker for the AI Assistant PWA.
// Change CACHE_NAME (v1 -> v2) whenever you want everyone to get fresh files.
const CACHE_NAME = "ai-assistant-v1";
const CHAT_URL = "{% url 'chat' %}";
const BOOTSTRAP_CSS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";

const APP_SHELL = [
  CHAT_URL,
  "{% static 'assistant/style.css' %}",
  "{% static 'assistant/chat.js' %}",
  "{% static 'assistant/icons/icon-192.png' %}",
  "{% static 'assistant/icons/icon-512.png' %}",
];

// 1. Install: save the app shell so the page can open offline
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        // Bootstrap comes from another website, so save it separately
        try {
          const request = new Request(BOOTSTRAP_CSS, { mode: "no-cors" });
          await cache.put(request, await fetch(request));
        } catch (err) {
          /* the page still works without it, just less pretty */
        }
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate: remove caches from older versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

// 3. Fetch: try the network first, fall back to the saved copy when offline
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never touch POST (the AI questions)

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin && request.url !== BOOTSTRAP_CSS) return;
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === "opaque")) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    if (request.mode === "navigate") {
      const home = await cache.match(CHAT_URL);
      if (home) return home;
    }
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}