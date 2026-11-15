/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "da644f5c0c";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-stats-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "ch1-deux-variables-un-nu/1-reactiver-une-variable-une-moyenne.html", "ch1-deux-variables-un-nu/2-une-serie-statistique-a-deux.html", "ch1-deux-variables-un-nu/3-le-nuage-de-points.html", "ch1-deux-variables-un-nu/4-le-point-moyen.html", "ch1-deux-variables-un-nu/5-decrire-un-nuage.html", "ch1-deux-variables-un-nu/6-exercices.html", "ch1-deux-variables-un-nu/index.html", "ch2-ajuster-un-nuage-par/1-pourquoi-ajuster.html", "ch2-ajuster-un-nuage-par/2-une-serie-qui-evolue-lecart.html", "ch2-ajuster-un-nuage-par/3-le-point-moyen-pivot-de.html", "ch2-ajuster-un-nuage-par/4-la-droite-de-mayer.html", "ch2-ajuster-un-nuage-par/5-faire-parler-les-ecarts-a.html", "ch2-ajuster-un-nuage-par/6-la-methode-des-moindres-carres.html", "ch2-ajuster-un-nuage-par/7-exercices.html", "ch2-ajuster-un-nuage-par/index.html", "ch3-mesurer-la-liaison-l/1-un-nombre-entre-1-et.html", "ch3-mesurer-la-liaison-l/2-lire-r-sur-un-nuage.html", "ch3-mesurer-la-liaison-l/3-calculer-r.html", "ch3-mesurer-la-liaison-l/4-correlation-nest-pas-causalite.html", "ch3-mesurer-la-liaison-l/5-exercices.html", "ch3-mesurer-la-liaison-l/index.html", "ch4-utiliser-un-ajusteme/1-prevoir-interpolation-et-extrapolation.html", "ch4-utiliser-un-ajusteme/2-les-limites-de-lextrapolation.html", "ch4-utiliser-un-ajusteme/3-un-vrai-document-a-critiquer.html", "ch4-utiliser-un-ajusteme/4-exercices.html", "ch4-utiliser-un-ajusteme/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html"];

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
