/* sw.js — service worker du tableau de bord : la page, sa configuration et les fichiers du pilotage qu'elle réutilise
   (style, thème, dates) restent utilisables sans réseau. Réseau d'abord (délai 4 s s'il existe une copie), sinon la dernière copie.
   Même domaine uniquement ; jamais l'API GitHub (autre domaine). */
var VERSION = "board-v1";
var COQUILLE = ["./", "index.html", "unif.html", "board.css", "config.json", "sw.js",
  "js/ics.js", "js/depot.js", "js/taches.js", "js/board.js", "js/accueil.js", "js/unif.js",
  "../pilotage/pilotage.css", "../pilotage/js/theme.js", "../pilotage/js/outils.js", "../pilotage/js/horaire.js"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(COQUILLE.map(function (u) { return c.add(new Request(u, { cache: "reload" })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("board-v") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function garder(req, rep) {
  if (rep && rep.ok) { var copie = rep.clone(); caches.open(VERSION).then(function (c) { c.put(req, copie); }); }
  return rep;
}
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (copie) {
    var reseau = fetch(req).then(function (r) { return garder(req, r); });
    if (!copie) return reseau;
    var delai = new Promise(function (_, rejet) { setTimeout(rejet, 4000); });
    return Promise.race([reseau, delai]).catch(function () { return copie; });
  }));
});
