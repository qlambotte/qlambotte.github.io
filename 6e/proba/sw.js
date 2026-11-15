/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "001ad6bf9b";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-proba-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "autoeval.html", "ch1-compter-sur-de-petit/1-le-langage-des-ensembles.html", "ch1-compter-sur-de-petit/2-lister-avant-de-compter.html", "ch1-compter-sur-de-petit/3-additionner-multiplier.html", "ch1-compter-sur-de-petit/4-arrangements-et-permutations.html", "ch1-compter-sur-de-petit/5-combinaisons.html", "ch1-compter-sur-de-petit/6-permutations-avec-repetition-les-anagram.html", "ch1-compter-sur-de-petit/7-choisir-une-methode.html", "ch1-compter-sur-de-petit/8-exercices-supplementaires.html", "ch1-compter-sur-de-petit/index.html", "ch2-modeliser-le-hasard/1-frequences-et-probabilite.html", "ch2-modeliser-le-hasard/2-univers-et-evenements.html", "ch2-modeliser-le-hasard/3-le-modele-dequiprobabilite.html", "ch2-modeliser-le-hasard/4-proprietes-des-probabilites.html", "ch2-modeliser-le-hasard/5-denombrer-pour-calculer.html", "ch2-modeliser-le-hasard/6-exercices-supplementaires.html", "ch2-modeliser-le-hasard/index.html", "ch3-probabilite-conditio/1-probabilite-conditionnelle.html", "ch3-probabilite-conditio/2-arbres-de-probabilites.html", "ch3-probabilite-conditio/3-lire-un-test-de-depistage.html", "ch3-probabilite-conditio/4-independance.html", "ch3-probabilite-conditio/5-pour-aller-plus-loin.html", "ch3-probabilite-conditio/6-exercices-supplementaires.html", "ch3-probabilite-conditio/7-references.html", "ch3-probabilite-conditio/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html", "sources.html"];

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
