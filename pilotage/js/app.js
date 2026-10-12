/* app.js — page de pilotage de classe (P4). Assemble les modules purs et l'interface.
   Documentation : README.md. La page ne stocke rien elle-même sauf des brouillons de texte (journal, devoirs)
   et la classe choisie à la main (sessionStorage) ; tout l'état de la classe passe par window.typwebProf. */
(function () {
  "use strict";
  var Pi = window.Pilotage, O = Pi.outils, C = Pi.config, H = Pi.horaire, E = Pi.ev, X = Pi.indexcours,
      T = Pi.tirage, J = Pi.journal, D = Pi.donnees;
  var $ = function (s) { return document.querySelector(s); };
  var CLE_MANUEL = "pilotage.classe.manuelle";
  var A = { config: null, code: "", auto: false, creneau: null, cours: null, coursSource: null, index: null, indexBrut: null,
            banques: {}, manuel: false, etat: null, tir: { n: 0, rempl: {}, res: null, retire: false }, copies: 0, pret: false, notes: [] };

  /* ---------- utilitaires ---------- */
  function maintenant() {
    var m = new URLSearchParams(location.search).get("maintenant");          // aide aux essais : ?maintenant=2026-10-15T10:00+02:00
    var d = m ? new Date(m) : null;
    return d && !isNaN(d) ? d : new Date();
  }
  function jourCourant() { return O.jourDe(maintenant(), A.config.fuseau); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  var toastT = null;
  function toast(t) { var e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove("on"); }, 2600); }
  function stock(f) { try { return f(localStorage); } catch (e) { return null; } }
  function classeCfg() { return C.classe(A.config, A.code); }
  function jourFr(ymd) { return O.JOURS[O.jourSemaine(ymd)] + " " + O.dateFr(ymd); }
  function copier(zone, msg) {
    var t = zone.value;
    var repli = function () { zone.focus(); zone.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} toast(ok ? msg : "Texte sélectionné : copie avec Ctrl+C"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(msg); }, repli);
    else repli();
  }

  /* ---------- modules à venir ---------- */
  Pi.modules = Pi.modules || [];
  Pi.enregistrerModule = function (m) { Pi.modules.push(m); if (A.pret) rendreModules(); };
  function rendreModules() {
    var zone = $("#modules-contenu");
    if (!Pi.modules.length) return;
    vider(zone);
    Pi.modules.forEach(function (m) {
      var bloc = el("div", "module"); bloc.id = "module-" + m.id; zone.appendChild(bloc);
      try { m.rendre(bloc, { classe: A.code, uaa: A.cours && A.cours.uaa, etat: A.etat, config: A.config, index: A.index, jour: jourCourant() }); }
      catch (e) { bloc.textContent = "Module « " + m.id + " » : erreur (" + e.message + ")"; }
    });
  }

  /* ---------- chargement ---------- */
  function chargerProf(c) {
    return new Promise(function (resolve) {
      if (!c) return resolve(null);
      window.TYPWEB = { uaa: c.uaa, index: C.adresse(c, c.index), classe: C.adresse(c, c.classe) };
      window.SITE_OFFSET = c.url;
      var s = document.createElement("script");
      s.src = C.adresse(c, "js/prof.js"); s.async = true;
      s.onload = function () { resolve(window.typwebProf || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }
  function attendreVote(ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function essai() {
        var v = A.etat && A.etat.vote();
        if (v) return resolve(v);
        if (Date.now() - t0 > (ms || 8000)) return resolve(null);
        setTimeout(essai, 100);
      })();
    });
  }
  function chargerCours(c) {
    if (!c) return Promise.resolve();
    var banque = D.chargerJson(C.adresse(c, c.classe)).then(function (r) { if (r.copie) A.copies++; A.banques[c.uaa] = r.json; }, function (e) { A.notes.push("Banque de classe : " + e.message); });
    var idx = D.chargerJson(C.adresse(c, c.index)).then(function (r) { if (r.copie) A.copies++; A.indexBrut = r.json; }, function (e) { A.notes.push("Index du cours : " + e.message); });
    return Promise.all([banque, idx]).then(function () { A.index = X.creer(A.indexBrut); });
  }
  // Banques des autres UAA déjà vues par la classe (révision espacée).
  function chargerBanquesVues() {
    var cfg = classeCfg(), vues = E.uaasVues(E.etat(A.etat.evenements(), A.code, A.config.fuseau));
    return Promise.all(vues.map(function (u) {
      var c = (cfg.cours || []).filter(function (k) { return k.uaa === u; })[0];
      if (!c || A.banques[u]) return null;
      return D.chargerJson(C.adresse(c, c.classe)).then(function (r) { if (r.copie) A.copies++; A.banques[u] = r.json; }, function (e) { A.notes.push("Banque " + u + " : " + e.message); });
    })).then(function () {
      var v = A.etat.vote();
      if (v && v.ajouterBanque) Object.keys(A.banques).forEach(function (u) { if (!A.cours || u !== A.cours.uaa) { try { v.ajouterBanque(A.banques[u]); } catch (e) {} } });
    });
  }

  /* ---------- classe courante ---------- */
  function choisirClasse() {
    var cfg = A.config, now = maintenant(), p = new URLSearchParams(location.search).get("classe");
    var codes = cfg.classes.map(function (c) { return c.code; });
    var cren = H.detecter(cfg, now);
    A.creneau = cren;
    var manuel = stock(function (s) { return sessionStorage.getItem(CLE_MANUEL); });
    A.manuel = !!(manuel && codes.indexOf(manuel) >= 0);
    if (p && codes.indexOf(p) >= 0) { A.code = p; A.auto = !!(cren && cren.classe === p); return; }
    if (manuel && codes.indexOf(manuel) >= 0) { A.code = manuel; A.auto = !!(cren && cren.classe === manuel); return; }
    if (cren) { A.code = cren.classe; A.auto = true; return; }
    var memo = Pi.etat.classeMemorisee();
    if (memo && codes.indexOf(memo) >= 0) { A.code = memo; return; }
    var pro = H.prochaine(cfg, now);
    A.code = pro ? pro.creneau.classe : codes[0];
  }

  /* ---------- rendu : en-tête ---------- */
  function rendreEntete() {
    var cfg = A.config, now = maintenant(), cl = classeCfg();
    $("#classe-titre").textContent = A.code;
    var parts = [], cren = A.creneau && A.creneau.classe === A.code ? A.creneau : null;
    if (cren) parts.push("Local " + cren.local, H.libelle(cren));
    else parts.push("Hors créneau");
    parts.push(A.cours ? A.cours.uaa + " · " + A.cours.titre : "aucun cours en cours");
    if (cren) parts.push("créneau détecté"); else if (A.manuel) parts.push("classe choisie à la main");
    $("#classe-sous").textContent = parts.join(" · ");
    var pro = H.prochaine(cfg, now);
    $("#prochaine").textContent = (!cren && pro) ? "Prochaine séance : " + H.libelleSeance(pro) + " (" + pro.creneau.classe + ")" : "";
    var sel = $("#choix-classe");
    if (sel.options.length !== cfg.classes.length) {
      vider(sel);
      cfg.classes.forEach(function (c) { var o = el("option", "", c.code + " · " + c.niveau); o.value = c.code; sel.appendChild(o); });
    }
    sel.value = A.code;
    var prof = A.etat && A.etat.modeProf(), mp = $("#modeprof");
    mp.textContent = prof ? "mode prof : activé" : "mode prof : désactivé";
    mp.className = "puce " + (prof ? "on" : "alerte");
    var hl = !navigator.onLine || A.copies > 0;
    $("#hl").hidden = !hl;
    $("#hl").title = navigator.onLine ? "Données lues depuis la copie gardée sur cette tablette" : "Pas de réseau : la page fonctionne avec les copies locales";
    if (!cl) return;
  }
  function sansCours(carteId, message) {
    var c = $(carteId); c.querySelectorAll("button, a.bouton, textarea").forEach(function (b) { if (b.tagName === "A") b.setAttribute("aria-disabled", "true"); else b.disabled = true; });
    return message;
  }

  /* ---------- rendu : échauffement ---------- */
  function calculerTirage() {
    var c = classeCfg();
    A.tir.res = T.tirer({ classe: c, uaa: A.cours.uaa, banques: A.banques, index: A.index, ev: A.etat.evenements(), fuseau: A.config.fuseau,
                          jour: jourCourant(), graine: A.code + "|" + jourCourant() + "|" + A.tir.n, rempl: A.tir.rempl });
  }
  var ROLES = { precedent: "Séance précédente", prerequis: "Prérequis", espace: "Révision espacée" };
  function rendreEchauffement() {
    var liste = $("#ech-liste"), sub = $("#ech-sub"), msg = $("#ech-msg");
    vider(liste); msg.textContent = "";
    ["#ech-lancer", "#ech-retirer", "#ech-refaire"].forEach(function (s) { $(s).disabled = false; });
    if (!A.cours) { sub.textContent = "Aucun cours configuré pour " + A.code + " (config.json › classes › cours)."; ["#ech-lancer", "#ech-retirer", "#ech-refaire"].forEach(function (s) { $(s).disabled = true; }); return; }
    if (A.tir.retire) {
      sub.textContent = "Échauffement retiré pour cette séance.";
      $("#ech-lancer").disabled = true; $("#ech-retirer").textContent = "Rétablir"; return;
    }
    $("#ech-retirer").textContent = "Tout retirer";
    if (!A.tir.res) calculerTirage();
    var r = A.tir.res;
    sub.textContent = r.rienVu ? "Rien n'a encore été vu avec cette classe : prérequis seulement." : "Construit sur ce qui a déjà été vu : précédent, prérequis, révision espacée.";
    if (!r.items.length) { sub.textContent = "Aucun élément d'échauffement disponible dans la banque de classe."; $("#ech-lancer").disabled = true; }
    r.items.forEach(function (it) {
      var q = el("div", "q"), tete = el("div", "tete");
      tete.appendChild(el("span", "chip", it.kind === "exercice" ? "Exercice · " + (ROLES[it.role] || "") : (ROLES[it.role] || it.role || "QCM")));
      tete.appendChild(el("span", "sub", it.kind === "exercice" ? it.id : it.id));
      tete.appendChild(el("span", "ressort"));
      var b = el("button", "petit", "↻ Remplacer"); b.type = "button"; b.setAttribute("aria-label", "Remplacer : " + (ROLES[it.role] || it.id));
      b.addEventListener("click", function () {
        var cle = it.slot, pr = A.tir.rempl[cle] || { n: 0, exclus: [] };
        pr.exclus = pr.exclus.concat([T.cleExclusion(it)]); pr.n += 1; A.tir.rempl[cle] = pr; calculerTirage(); rendreEchauffement();
      });
      tete.appendChild(b); q.appendChild(tete);
      q.appendChild(el("div", "texte", it.apercu));
      q.appendChild(el("div", "sub", it.raison));
      liste.appendChild(q);
    });
    if (r.notes.length) msg.textContent = r.notes.join(" ");
  }
  function lancerEchauffement() {
    var msg = $("#ech-msg"), vote = A.etat.vote();
    if (!A.tir.res || !A.tir.res.items.length) return;
    if (!vote) { msg.textContent = "Les écrans de vote ne sont pas chargés (couche prof indisponible ou hors ligne). Ouvre une page du cours avec une connexion, puis recharge."; return; }
    if (vote.ajouterBanque) Object.keys(A.banques).forEach(function (u) { if (u !== A.cours.uaa) { try { vote.ajouterBanque(A.banques[u]); } catch (e) {} } });
    try {
      var p = vote.start({ mode: "echauffement", items: T.versVote(A.tir.res.items), titre: "Échauffement", classe: A.code,
                           apres: function () { A.tir.res = null; A.tir.rempl = {}; rendreTout(); } });
      if (p && p.catch) p.catch(function (e) { msg.textContent = "Impossible de lancer : " + (e && e.message ? e.message : e); });
    } catch (e) { msg.textContent = "Impossible de lancer : " + e.message; }
  }

  /* ---------- rendu : poursuivre le cours ---------- */
  function ctx(jour) {
    return { ev: A.etat.evenements(), classe: A.code, uaa: A.cours && A.cours.uaa, index: A.index || X.creer(null), jour: jour || jourCourant(),
             fuseau: A.config.fuseau, format: A.config.format.devoirs };
  }
  function titreEl(id) { var e = A.index && A.index.parId[id]; return e ? e.titre : id; }
  function rendreArret() {
    var zone = $("#arret"), lien = $("#reprendre"), der = $("#derniere");
    vider(zone); vider(der);
    if (!A.cours) { zone.textContent = "Aucun cours configuré pour " + A.code + "."; lien.setAttribute("aria-disabled", "true"); lien.removeAttribute("href"); $("#ailleurs").disabled = true; return; }
    $("#ailleurs").disabled = !A.index || A.index.vide;
    lien.removeAttribute("aria-disabled");
    var etat = E.etat(A.etat.evenements(), A.code, A.config.fuseau), d = E.dernier(etat, A.cours.uaa);
    zone.appendChild(el("b", "", A.cours.uaa + " · " + A.cours.titre)); zone.appendChild(document.createElement("br"));
    if (!d) {
      zone.appendChild(document.createTextNode("Aucun point d'arrêt : le cours n'est pas commencé avec cette classe."));
      lien.textContent = "Commencer le cours"; lien.href = A.cours.url;
    } else {
      var s = A.index && A.index.sectionDe(d.el), e = A.index && A.index.parId[d.el];
      zone.appendChild(document.createTextNode("Dernier point d'arrêt : "));
      zone.appendChild(el("b", "", s ? s.titre : (e ? e.titre : d.el)));
      if (e && s && e.id !== s.id) zone.appendChild(el("div", "sub", e.titre));
      lien.textContent = "Reprendre ici";
      if (e) { var u = new URL(e.ancre, A.cours.url); u.searchParams.set("reprise", "1"); lien.href = u.href; } else lien.href = A.cours.url;
      var b = J.bornes(ctx(d.jour)), t0 = J.titreDebut(ctx(d.jour), b), t1 = b.fin ? J.titreSection(A.index, b.fin.el) : null;
      der.textContent = "Dernière séance : " + jourFr(d.jour) + (t1 ? ", de « " + t0 + " » à « " + t1 + " »" : "") + ".";
    }
    if (!A.etat.modeProf()) {
      var w = el("div", "alerte", "Le mode prof est désactivé sur cet appareil : le cours s'ouvrira sans la couche prof. ");
      var ab = el("button", "petit", "Activer le mode prof"); ab.type = "button";
      ab.addEventListener("click", function () { A.etat.activerModeProf(); rendreTout(); toast("Mode prof activé sur cet appareil"); });
      w.appendChild(ab); der.appendChild(w);
    }
  }
  function rendreApercu() {
    var zone = $("#apercu-liste"); vider(zone);
    if (!A.index || A.index.vide) return;
    var etat = E.etat(A.etat.evenements(), A.code, A.config.fuseau), d = E.dernier(etat, A.cours.uaa);
    var courant = d && A.index.sectionDe(d.el);
    $("#apercu-sub").textContent = A.etat.couche ? "Touche « Point d'arrêt ici » : la classe est considérée comme arrivée à la fin de cette section (un ✓ est écrit sur son dernier élément)." : "Couche prof indisponible : lecture seule.";
    A.index.sectionsOrdonnees().forEach(function (s) {
      var ligne = el("div", "bloc" + (s.type === "chapitre" ? " chap" : "") + (courant && courant.id === s.id ? " cur" : ""));
      ligne.appendChild(el("span", "", s.titre));
      if (s.type === "section") {
        var b = el("button", "petit", courant && courant.id === s.id ? "Point d'arrêt actuel" : "Point d'arrêt ici"); b.type = "button"; b.disabled = !A.etat.couche;
        b.addEventListener("click", function () {
          var cible = A.index.dernierMarquable(s.id) || s;
          if (A.etat.marquer(cible.id)) toast("Point d'arrêt : " + s.titre); else toast("Écriture impossible (journal en lecture seule ?)");
        });
        ligne.appendChild(b);
      }
      zone.appendChild(ligne);
    });
  }

  /* ---------- rendu : journal et devoirs ---------- */
  function cleBrouillon(nom) { return "pilotage.brouillon." + A.code + "." + jourCourant() + "." + nom; }
  function lireBrouillon(nom) { return stock(function (s) { return s.getItem(cleBrouillon(nom)); }); }
  function ecrireBrouillon(nom, v) { stock(function (s) { v === null ? s.removeItem(cleBrouillon(nom)) : s.setItem(cleBrouillon(nom), v); }); }

  function rendreJournal() {
    var z = $("#jdc"), sub = $("#jdc-sub");
    z.disabled = $("#jdc-regen").disabled = $("#jdc-copier").disabled = !A.cours;
    if (!A.cours) { z.value = ""; sub.textContent = "Aucun cours configuré pour " + A.code + "."; return; }
    var b = lireBrouillon("jdc");
    z.value = b !== null ? b : J.texteJournal(ctx());
    sub.textContent = b !== null ? "Texte modifié à la main (↻ pour recalculer d'après les marques du jour)." : "Calculé d'après les marques ✓ de la séance du jour.";
  }
  function rendreDevoirs() {
    var z = $("#dev"), sub = $("#dev-sub"), bc = $("#dev-chapitre");
    z.disabled = $("#dev-regen").disabled = $("#dev-copier").disabled = !A.cours;
    bc.hidden = true;
    if (!A.cours) { z.value = ""; sub.textContent = "Aucun cours configuré pour " + A.code + "."; return; }
    var d = J.devoirs(ctx()), b = lireBrouillon("dev");
    z.value = b !== null ? b : d.texte;
    sub.textContent = b !== null ? "Texte modifié à la main (↻ pour recalculer)." :
      (d.lignes.length ? "Exercices « à la maison » situés dans la matière vue pendant la séance." : "Aucun exercice « à la maison » dans la matière vue (les exercices regroupés en fin de chapitre n'en font pas partie).");
    if (b === null && !d.lignes.length && d.propositionChapitre.length) {
      bc.hidden = false; bc.textContent = "Proposer les " + d.propositionChapitre.length + " exercices « maison » du chapitre";
      bc.onclick = function () { z.value = J.texteDevoirs(d.propositionChapitre, A.config.format.devoirs); ecrireBrouillon("dev", z.value); sub.textContent = "Proposition : tous les exercices « maison » du chapitre " + (d.chapitre ? d.chapitre.num : "") + " (à adapter)."; bc.hidden = true; };
    }
  }
  function rendreInterros() {
    var zone = $("#interros"); vider(zone);
    var auj = jourCourant();
    var l = A.config.interros.filter(function (i) { return i.classe === A.code && i.date >= auj; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!l.length) { zone.appendChild(el("div", "sub", "Aucune interro planifiée pour " + A.code + ".")); return; }
    l.forEach(function (i) {
      var n = O.ecartJours(auj, i.date), ligne = el("div", "iro");
      ligne.appendChild(el("span", "", jourFr(i.date) + " · " + i.uaa + " · " + i.type));
      ligne.appendChild(el("span", "j" + (n <= 14 ? " proche" : ""), n === 0 ? "aujourd'hui" : "J−" + n));
      zone.appendChild(ligne);
    });
  }

  /* ---------- assemblage ---------- */
  function rendreDynamique() { rendreArret(); rendreApercu(); rendreJournal(); rendreDevoirs(); }
  function rendreTout() { rendreEntete(); rendreEchauffement(); rendreDynamique(); rendreInterros(); rendreModules(); }

  function brancher() {
    $("#ech-lancer").addEventListener("click", lancerEchauffement);
    $("#ech-retirer").addEventListener("click", function () { A.tir.retire = !A.tir.retire; rendreEchauffement(); });
    $("#ech-refaire").addEventListener("click", function () { A.tir.n++; A.tir.rempl = {}; A.tir.res = null; A.tir.retire = false; rendreEchauffement(); });
    $("#ailleurs").addEventListener("click", function () {
      var a = $("#apercu"); a.hidden = !a.hidden; $("#ailleurs").setAttribute("aria-expanded", String(!a.hidden));
      if (!a.hidden) { rendreApercu(); a.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    $("#jdc").addEventListener("input", function () { ecrireBrouillon("jdc", $("#jdc").value); $("#jdc-sub").textContent = "Texte modifié à la main (↻ pour recalculer d'après les marques du jour)."; });
    $("#dev").addEventListener("input", function () { ecrireBrouillon("dev", $("#dev").value); $("#dev-sub").textContent = "Texte modifié à la main (↻ pour recalculer)."; });
    $("#jdc-regen").addEventListener("click", function () { ecrireBrouillon("jdc", null); rendreJournal(); });
    $("#dev-regen").addEventListener("click", function () { ecrireBrouillon("dev", null); rendreDevoirs(); });
    $("#jdc-copier").addEventListener("click", function () { copier($("#jdc"), "Journal copié"); });
    $("#dev-copier").addEventListener("click", function () { copier($("#dev"), "Devoirs copiés"); });
    $("#choix-classe").addEventListener("change", function (e) {
      var nouveau = e.target.value, ancien = A.code;
      stock(function (s) { sessionStorage.setItem(CLE_MANUEL, nouveau); });
      A.etat.fixerClasse(nouveau);
      var cA = C.classe(A.config, ancien), cN = C.classe(A.config, nouveau);
      var uA = (C.coursEnCours(cA) || {}).uaa, uN = (C.coursEnCours(cN) || {}).uaa;
      if (uA !== uN) { location.reload(); return; }       // autre cours : recharger la couche prof du bon cours
      A.manuel = true; A.code = nouveau; A.auto = !!(A.creneau && A.creneau.classe === nouveau); A.cours = C.coursEnCours(cN);
      A.tir = { n: 0, rempl: {}, res: null, retire: false };
      chargerBanquesVues().then(rendreTout);
    });
    $("#exporter").addEventListener("click", function () {
      var charge = JSON.stringify(A.etat.exporter(), null, 1), a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([charge], { type: "application/json" }));
      a.download = "etat-pilotage-" + jourCourant() + ".json";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
    $("#importer").addEventListener("click", function () { $("#fichier").click(); });
    $("#fichier").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var lecteur = new FileReader();
      lecteur.onload = function () {
        var r = A.etat.importer(String(lecteur.result));
        toast(r.ok ? "Import : " + r.ajoutes + " événement(s) ajouté(s), " + r.ignores + " ignoré(s)" : "Import impossible : " + r.erreur);
        e.target.value = ""; A.tir.res = null; rendreTout();
      };
      lecteur.readAsText(f);
    });
    window.addEventListener("online", rendreEntete); window.addEventListener("offline", rendreEntete);
    A.etat.abonner(function () { rendreDynamique(); });
    setInterval(function () {                                         // le créneau peut changer pendant que la page reste ouverte
      var c = H.detecter(A.config, maintenant());
      if (new URLSearchParams(location.search).get("maintenant")) return;
      var manuel = stock(function (s) { return sessionStorage.getItem(CLE_MANUEL); });
      if (!manuel && c && c.classe !== A.code) location.reload();
      A.creneau = c; rendreEntete();
    }, 60000);
  }

  function afficherErreurs(erreurs) {
    var z = $("#erreur-config"); vider(z); z.hidden = false;
    z.appendChild(el("b", "", "config.json : " + erreurs.length + " problème(s) à corriger"));
    var ul = el("ul"); erreurs.forEach(function (e) { ul.appendChild(el("li", "", e)); }); z.appendChild(ul);
    $("#entete").hidden = true; $("#grille").hidden = true;
  }

  function init(options) {
    options = options || {};
    if ("serviceWorker" in navigator && !options.sansSW) navigator.serviceWorker.register("sw.js").catch(function () {});
    return (options.source || C.sourceFichier).charger().then(function (brut) {
      var v = C.valider(brut);
      if (!v.ok) { afficherErreurs(v.erreurs); return; }
      A.config = v.config; choisirClasse();
      A.cours = C.coursEnCours(classeCfg());
      // cours dont on charge la couche prof : celui de la classe, sinon le premier cours connu (journal, export)
      A.coursSource = A.cours || A.config.classes.reduce(function (acc, c) { return acc || (c.cours && c.cours[0]) || null; }, null);
      return Promise.all([chargerProf(A.coursSource), chargerCours(A.cours)]).then(function (r) {
        A.etat = options.etat || Pi.etat.creer(r[0]);
        A.etat.definirClasses(A.config.classes.map(function (c) { return { code: c.code, effectif: c.effectif }; }));
        A.etat.fixerClasse(A.code);
        return chargerBanquesVues();
      }).then(function () {
        brancher(); rendreTout(); A.pret = true; window.PilotageEtat = A;
        document.documentElement.setAttribute("data-pret", "1");
      });
    }, function (e) { afficherErreurs(["Impossible de lire config.json : " + e.message]); });
  }
  Pi.app = { init: init, etat: A };
  if (!window.PILOTAGE_MANUEL) init();
})();
