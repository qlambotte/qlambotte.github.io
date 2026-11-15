/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "03514bc9a3";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-integrales-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "ch1-lintegrale-une-accum/1-accumuler-a-partir-dun-debit.html", "ch1-lintegrale-une-accum/2-debit-variable-approximations-par-defaut.html", "ch1-lintegrale-une-accum/3-lintegrale-definie.html", "ch1-lintegrale-une-accum/4-proprietes-de-lintegrale.html", "ch1-lintegrale-une-accum/5-references.html", "ch1-lintegrale-une-accum/index.html", "ch2-fonction-aire-et-pri/1-la-fonction-aire.html", "ch2-fonction-aire-et-pri/2-la-pente-de-la-fonction.html", "ch2-fonction-aire-et-pri/3-primitives.html", "ch2-fonction-aire-et-pri/4-calculer-une-integrale-avec-une.html", "ch2-fonction-aire-et-pri/index.html", "ch3-calculer-des-primiti/1-primitives-immediates.html", "ch3-calculer-des-primiti/2-fonctions-composees.html", "ch3-calculer-des-primiti/3-integration-par-parties.html", "ch3-calculer-des-primiti/4-calculer-des-integrales.html", "ch3-calculer-des-primiti/5-choisir-une-methode.html", "ch3-calculer-des-primiti/index.html", "ch4-aires-et-volumes/1-aire-dune-surface-plane.html", "ch4-aires-et-volumes/2-aire-entre-deux-courbes.html", "ch4-aires-et-volumes/3-volume-dun-solide-de-revolution.html", "ch4-aires-et-volumes/4-problemes.html", "ch4-aires-et-volumes/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html", "sources.html"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PAGES.map(function (p) {
      return c.add(new Request(p, { cache: "reload" })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIXE) === 0 && k !== CACHE; })
                         .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function garder(req, rep) {
  if (rep && (rep.ok || rep.type === "opaque")) {
    var copie = rep.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copie); });
  }
  return rep;
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/\.pdf$/i.test(url.pathname)) return;
  // pages, index.json et tous les scripts du site (js/*.js, js/*.css) : réseau d'abord,
  // copie si hors ligne (sinon, après une publication, la tablette garderait une visite l'ancien écran de vote)
  var page = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") >= 0
             || /(\.json|\/js\/[\w.-]+\.(js|css))$/.test(url.pathname);
  if (page) {
    e.respondWith(fetch(req).then(function (r) { return garder(req, r); }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        return r || caches.match(new URL("index.html", self.registration.scope).href);
      });
    }));
    return;
  }
  if (url.origin !== location.origin && !/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) return;
  e.respondWith(caches.match(req).then(function (enCache) {
    var reseau = fetch(req).then(function (r) { return garder(req, r); }).catch(function () { return enCache; });
    return enCache || reseau;
  }));
});
