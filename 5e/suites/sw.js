/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "afd850a322";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-suites-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "autoeval.html", "ch1-generalites-sur-les/1-deux-situations-pour-commencer.html", "ch1-generalites-sur-les/2-quest-ce-quune-suite-numerique.html", "ch1-generalites-sur-les/3-representer-une-suite.html", "ch1-generalites-sur-les/4-generer-une-suite.html", "ch1-generalites-sur-les/5-variations-dune-suite.html", "ch1-generalites-sur-les/6-limite-dune-suite.html", "ch1-generalites-sur-les/7-exercices.html", "ch1-generalites-sur-les/index.html", "ch2-suites-arithmetiques/1-une-pyramide-de-verre.html", "ch2-suites-arithmetiques/2-definition.html", "ch2-suites-arithmetiques/3-representation-et-variation.html", "ch2-suites-arithmetiques/4-generer-une-suite-arithmetique.html", "ch2-suites-arithmetiques/5-caracteristiques-variation-limite.html", "ch2-suites-arithmetiques/6-somme-des-n-premiers-termes.html", "ch2-suites-arithmetiques/7-exercices.html", "ch2-suites-arithmetiques/index.html", "ch3-suites-geometriques/1-le-pliage-dune-feuille.html", "ch3-suites-geometriques/2-definition.html", "ch3-suites-geometriques/3-representation-et-variation.html", "ch3-suites-geometriques/4-generer-une-suite-geometrique.html", "ch3-suites-geometriques/5-caracteristiques-variation-limite.html", "ch3-suites-geometriques/6-somme-des-n-premiers-termes.html", "ch3-suites-geometriques/7-exercices.html", "ch3-suites-geometriques/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html"];

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
