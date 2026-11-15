/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "6864835965";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-exp-log-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "autoeval.html", "ch1-fonctions-exponentie/1-croissance-exponentielle.html", "ch1-fonctions-exponentie/2-construire-une-fonction-exponentielle.html", "ch1-fonctions-exponentie/3-definition-de-la-fonction-exponentielle.html", "ch1-fonctions-exponentie/4-proprietes-et-caracteristiques-graphique.html", "ch1-fonctions-exponentie/5-multiples-dune-fonction-exponentielle.html", "ch1-fonctions-exponentie/6-des-graphes-tous-semblables-vers.html", "ch1-fonctions-exponentie/7-le-nombre-e-et-lexponentielle.html", "ch1-fonctions-exponentie/8-resoudre-des-equations-exponentielles-si.html", "ch1-fonctions-exponentie/9-exercices-supplementaires.html", "ch1-fonctions-exponentie/index.html", "ch2-fonctions-logarithmi/1-du-probleme-e-x-3.html", "ch2-fonctions-logarithmi/2-definition-du-logarithme-de-base.html", "ch2-fonctions-logarithmi/3-proprietes-graphiques-par-deduction.html", "ch2-fonctions-logarithmi/4-proprietes-algebriques-a-decouvrir.html", "ch2-fonctions-logarithmi/5-utiliser-les-proprietes.html", "ch2-fonctions-logarithmi/6-equations-logarithmiques.html", "ch2-fonctions-logarithmi/7-resoudre-les-equations-exponentielles-a.html", "ch2-fonctions-logarithmi/8-modeliser-avec-les-logarithmes.html", "ch2-fonctions-logarithmi/index.html", "ch3-derivees-et-limites/1-deriver-lexponentielle.html", "ch3-derivees-et-limites/2-deriver-le-logarithme.html", "ch3-derivees-et-limites/3-limites-de-base.html", "ch3-derivees-et-limites/4-croissance-comparee-et-theoreme-de.html", "ch3-derivees-et-limites/index.html", "ch4-echelles-logarithmiq/1-construire-une-echelle-logarithmique.html", "ch4-echelles-logarithmiq/2-repere-semi-logarithmique-la-signature.html", "ch4-echelles-logarithmiq/3-repere-log-log-la-signature.html", "ch4-echelles-logarithmiq/4-choisir-le-bon-repere-et.html", "ch4-echelles-logarithmiq/5-pour-aller-plus-loin-les.html", "ch4-echelles-logarithmiq/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html"];

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
