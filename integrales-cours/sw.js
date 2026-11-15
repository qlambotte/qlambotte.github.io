/* sw.js — GÉNÉRÉ par typweb site : remplace le service worker de l'ancienne adresse (/integrales-cours/).
   Le navigateur le récupère de lui-même (il vérifie sw.js à chaque visite) : il vide les caches de
   l'ancien mode hors-ligne, se désinscrit et recharge les onglets ouverts, qui suivent alors la
   redirection vers la nouvelle adresse. Aucune interception des requêtes. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^typweb-[0-9a-f]{10}$/.test(k); })
                         .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: "window" }); })
    .then(function (cs) { cs.forEach(function (c) { try { c.navigate(c.url); } catch (err) {} }); }));
});
