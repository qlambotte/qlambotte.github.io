/* sw.js — service worker de la page de pilotage : la page, sa configuration et les fichiers des cours
   déjà consultés (index.json, classe.json, prof.js…) restent utilisables sans réseau.
   Stratégie : réseau d'abord (délai 4 s s'il existe une copie), sinon la dernière copie. Même domaine uniquement. */
var VERSION = "pilotage-v3";
var COQUILLE = ["./", "index.html", "scan.html", "pilotage.css", "config.json", "sw.js",
  "js/lecteur-aruco.js", "js/qr-code.js", "js/qr-votes.js",
  "js/outils.js", "js/config.js", "js/horaire.js", "js/ev.js", "js/indexcours.js", "js/tirage.js", "js/journal.js",
  "js/etat.js", "js/donnees.js", "js/sync.js", "js/synchro-ui.js", "js/app.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(COQUILLE.map(function (u) { return c.add(new Request(u, { cache: "reload" })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("pilotage-v") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function garder(req, rep) {
  if (rep && rep.ok) { var copie = rep.clone(); caches.open(VERSION).then(function (c) { c.put(req, copie); }); }
  return rep;
}
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || /\.pdf$/i.test(url.pathname)) return;
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (copie) {
    var reseau = fetch(req).then(function (r) { return garder(req, r); });
    if (!copie) return reseau;
    var delai = new Promise(function (_, rejet) { setTimeout(rejet, 4000); });
    return Promise.race([reseau, delai]).catch(function () { return copie; });
  }));
});
