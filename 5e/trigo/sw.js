/* sw.js — GÉNÉRÉ par typweb : NE PAS ÉDITER. Mode hors-ligne du site.
   - pages (HTML) : réseau d'abord (toujours la dernière version), sinon copie
     gardée ; toutes les pages sont mises de côté à la première visite ;
   - le reste (scripts, styles, figures, polices, MathJax) : copie gardée,
     rafraîchie en arrière-plan. Les PDF ne sont pas mis de côté (trop lourds). */
var VERSION = "c4da886732";
// un cache par cours (tous les cours partagent le même domaine) : chaque cours ne vide que les siens
var PREFIXE = "typweb-trigo-";
var CACHE = PREFIXE + VERSION;
var PAGES = ["./", "index.html", "index.json", "autoeval.html", "ch1-tourner-angles-arcs/1-la-cabine-du-london-eye.html", "ch1-tourner-angles-arcs/2-longueur-dun-arc-aire-dun.html", "ch1-tourner-angles-arcs/3-le-radian-mesurer-un-arc.html", "ch1-tourner-angles-arcs/4-angles-orientes-plusieurs-tours.html", "ch1-tourner-angles-arcs/index.html", "ch2-le-cercle-trigonomet/1-enrouler-la-droite-reelle-sur.html", "ch2-le-cercle-trigonomet/2-valeurs-remarquables-et-symetries.html", "ch2-le-cercle-trigonomet/3-equations-sin-x-a-et.html", "ch2-le-cercle-trigonomet/4-la-tangente.html", "ch2-le-cercle-trigonomet/5-equations-tan-x-a.html", "ch2-le-cercle-trigonomet/index.html", "ch3-les-fonctions-trigon/1-du-cercle-au-graphique-sinus.html", "ch3-les-fonctions-trigon/2-la-fonction-tangente.html", "ch3-les-fonctions-trigon/3-resoudre-graphiquement-choisir-son-outil.html", "ch3-les-fonctions-trigon/index.html", "ch4-la-fonction-x-a-sin/1-role-de-a-et-de.html", "ch4-la-fonction-x-a-sin/2-role-de-c-phase-et.html", "ch4-la-fonction-x-a-sin/3-tracer-apparier-retrouver-lexpression.html", "ch4-la-fonction-x-a-sin/4-equations-a-sin-b-x.html", "ch4-la-fonction-x-a-sin/index.html", "ch5-modeliser-des-phenom/1-des-sinusoides-partout.html", "ch5-modeliser-des-phenom/2-retour-au-london-eye-les.html", "ch5-modeliser-des-phenom/index.html", "ch6-module-derivees-trig/1-derivees-de-sinus-cosinus-et.html", "ch6-module-derivees-trig/2-derivees-de-composees-vitesse-dun.html", "ch6-module-derivees-trig/index.html", "essentiel.html", "mode-emploi.html", "nouveautes.html", "objectifs.html", "sources.html"];

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
