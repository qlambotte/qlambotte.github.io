/* app.js — page de pilotage de classe (P4). Assemble les modules purs et l'interface.
   Documentation : README.md. La page ne stocke rien elle-même sauf des brouillons de texte (journal, devoirs)
   et la classe choisie à la main (sessionStorage) ; tout l'état de la classe passe par window.typwebProf. */
(function () {
  "use strict";
  var Pi = window.Pilotage, O = Pi.outils, C = Pi.config, H = Pi.horaire, E = Pi.ev, X = Pi.indexcours,
      T = Pi.tirage, J = Pi.journal, D = Pi.donnees, Jr = Pi.jour;
  var $ = function (s) { return document.querySelector(s); };
  var CLE_MANUEL = "pilotage.classe.manuelle";
  var A = { config: null, code: "", auto: false, creneau: null, cours: null, coursSource: null, index: null, indexBrut: null,
            banques: {}, manuel: false, jour: null, vuLe: "", etat: null, tir: { n: 0, rempl: {}, res: null, retire: false }, copies: 0, pret: false, notes: [] };

  /* ---------- utilitaires ---------- */
  function maintenant() {
    var m = new URLSearchParams(location.search).get("maintenant");          // aide aux essais : ?maintenant=2026-10-15T10:00+02:00
    var d = m ? new Date(m) : null;
    return d && !isNaN(d) ? d : new Date();
  }
  // Jour réel (horloge, ou ?maintenant=) et jour AFFICHÉ. A.jour = null : on suit l'horloge (aujourd'hui, même après minuit) ;
  // sinon un jour choisi (?jour=AAAA-MM-JJ), passé ou à venir. jourCourant() est le jour affiché.
  function aujourdhui() { return O.jourDe(maintenant(), A.config.fuseau); }
  function jourCourant() { return A.jour || aujourdhui(); }
  function estAujourdhui() { return !A.jour || A.jour === aujourdhui(); }
  function statutJour() { return Jr.statut(aujourdhui(), jourCourant()); }      // "passe" | "aujourdhui" | "avenir"
  // Instant limite de l'état affiché : fin du jour affiché pour un jour passé, sinon aucune limite (état actuel).
  function jusque() { return statutJour() === "passe" ? J.finDeJour(jourCourant(), A.config.fuseau) : undefined; }
  function seancesAffichees() { return H.seancesDuJour(A.config, jourCourant(), A.code); }
  function majUrl() {
    try { history.replaceState(history.state, "", location.pathname + Jr.urlAvec(location.search, A.jour, aujourdhui()) + location.hash); } catch (e) {}
  }
  // Affiche un autre jour (ymd valide). Revenir à aujourd'hui retire ?jour= de l'adresse.
  function aller(ymd) {
    if (!O.dateValide(ymd)) return;
    A.jour = ymd === aujourdhui() ? null : ymd;
    majUrl(); A.tir.res = null; rendreTout();
  }
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
    $("#modules").hidden = false;
    vider(zone);
    Pi.modules.forEach(function (m) {
      var bloc = el("div", "module"); bloc.id = "module-" + m.id; zone.appendChild(bloc);
      try { m.rendre(bloc, { classe: A.code, uaa: A.cours && A.cours.uaa, etat: A.etat, config: A.config, index: A.index, jour: jourCourant(), aujourdhui: aujourdhui(), lectureSeule: !estAujourdhui() }); }
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
    var banque = D.chargerBanque(c, C.adresse).then(function (r) { if (r.copie) A.copies++; A.banques[c.uaa] = r.json; }, function (e) { A.notes.push("Banque de classe : " + e.message); });
    var idx = D.chargerJson(C.adresse(c, c.index)).then(function (r) { if (r.copie) A.copies++; A.indexBrut = r.json; }, function (e) { A.notes.push("Index du cours : " + e.message); });
    return Promise.all([banque, idx]).then(function () { A.index = X.creer(A.indexBrut); });
  }
  // Banques des autres UAA déjà vues par la classe (révision espacée).
  function chargerBanquesVues() {
    var cfg = classeCfg(), vues = E.uaasVues(E.etat(A.etat.evenements(), A.code, A.config.fuseau));
    return Promise.all(vues.map(function (u) {
      var c = (cfg.cours || []).filter(function (k) { return k.uaa === u; })[0];
      if (!c || A.banques[u]) return null;
      return D.chargerBanque(c, C.adresse).then(function (r) { if (r.copie) A.copies++; A.banques[u] = r.json; }, function (e) { A.notes.push("Banque " + u + " : " + e.message); });
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
    if (A.jour) {                                   // jour choisi dans l'adresse : la classe qui a cours ce jour-là
      var sj = H.seancesDuJour(cfg, A.jour)[0];
      if (sj) { A.code = sj.classe; A.auto = false; return; }
    }
    if (cren) { A.code = cren.classe; A.auto = true; return; }
    var bientot = H.prochaine(cfg, now);
    if (bientot && bientot.ymd === O.jourDe(now, cfg.fuseau) &&
        O.minutes(bientot.creneau.debut) - O.local(now, cfg.fuseau).minutes <= 60) { A.code = bientot.creneau.classe; return; }
    var memo = Pi.etat.classeMemorisee();
    if (memo && codes.indexOf(memo) >= 0) { A.code = memo; return; }
    var pro = H.prochaine(cfg, now);
    A.code = pro ? pro.creneau.classe : codes[0];
  }

  /* ---------- rendu : en-tête ---------- */
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateLongue(ymd) {
    var j = O.JOURS[O.jourSemaine(ymd)], p = ymd.split("-");
    return j.charAt(0).toUpperCase() + j.slice(1) + " " + parseInt(p[2], 10) + " " + MOIS[parseInt(p[1], 10) - 1];
  }
  // Anneau du temps de la séance : part écoulée du créneau, heure, minutes restantes.
  function rendreTemps(cren, now) {
    var z = $("#temps");
    if (!cren || !estAujourdhui()) { z.hidden = true; return; }
    var l = O.local(now, A.config.fuseau), d = O.minutes(cren.debut), f = O.minutes(cren.fin), m = l.minutes;
    var part = Math.max(0, Math.min(1, (m - d) / Math.max(1, f - d))), circ = 2 * Math.PI * 24;
    $("#temps-arc").setAttribute("stroke-dasharray", (part * circ).toFixed(1) + " " + circ.toFixed(1));
    $("#heure").textContent = Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
    $("#reste").textContent = m < d ? "début dans " + (d - m) + " min" : m < f ? "encore " + (f - m) + " min" : "séance terminée";
    z.hidden = false;
  }
  function rendreEntete() {
    var cfg = A.config, now = maintenant(), cl = classeCfg();
    $("#classe-titre").textContent = A.code;
    var auj = estAujourdhui(), st = statutJour(), joursCours = seancesAffichees();
    $("#date-jour").textContent = dateLongue(jourCourant());
    $("#jour-choix").value = jourCourant();
    document.documentElement.setAttribute("data-jour", jourCourant());
    document.documentElement.setAttribute("data-statut-jour", st);
    var parts = [], cren = auj && A.creneau && A.creneau.classe === A.code ? A.creneau : null;
    if (auj) {
      if (cren) parts.push("Local " + cren.local, H.libelle(cren));
      else parts.push("Hors créneau");
    } else if (joursCours.length) {
      parts.push("Local " + joursCours[0].local, joursCours.map(H.libelle).join(" et "));
    } else parts.push("Pas de cours");
    parts.push(A.cours ? (auj ? A.cours.uaa + " · " + A.cours.titre : A.cours.uaa) : "aucun cours en cours");
    if (auj) { if (cren) parts.push("créneau détecté"); else if (A.manuel) parts.push("classe choisie à la main"); }
    else parts.push(st === "passe" ? "passé · lecture seule" : "à venir");
    // une puce par élément ; les séparateurs « · » restent dans le texte (lecteurs d'écran, copier-coller) mais pas à l'écran
    var sous = $("#classe-sous"); vider(sous);
    parts.forEach(function (t, i) { if (i) sous.appendChild(el("span", "sep", " · ")); sous.appendChild(el("span", "puce", t)); });
    if (!auj) {                                           // pastille de retour, dans la ligne des puces
      var retour = el("button", "pastille att retour", Jr.pastilleRetour(aujourdhui(), jourCourant()));
      retour.type = "button"; retour.id = "retour-auj"; retour.title = "Revenir à aujourd'hui";
      retour.addEventListener("click", function () { aller(aujourdhui()); });
      sous.appendChild(retour);
    }
    rendreTemps(cren, now);
    var pro = H.prochaine(cfg, now);
    $("#prochaine").textContent = auj && !cren && pro ? "Prochaine séance : " + H.libelleSeance(pro) + " (" + pro.creneau.classe + ")" : "";
    var sel = $("#choix-classe");
    if (sel.options.length !== cfg.classes.length) {
      vider(sel);
      cfg.classes.forEach(function (c) { var o = el("option", "", c.code + " · " + c.niveau); o.value = c.code; sel.appendChild(o); });
    }
    sel.value = A.code;
    var prof = A.etat && A.etat.modeProf(), mp = $("#modeprof");
    mp.textContent = prof ? "mode prof : activé" : "mode prof : désactivé";
    mp.hidden = !!prof;                                   // ne se montre que s'il faut agir
    rendreAvis();
    var hl = !navigator.onLine || A.copies > 0;
    $("#hl").hidden = !hl;
    $("#hl").title = navigator.onLine ? "Données lues depuis la copie gardée sur cette tablette" : "Pas de réseau : la page fonctionne avec les copies locales";
    if (!cl) return;
  }
  function rendreAvis() {
    var z = $("#avis"), l = A.notes.slice();
    if (A.etat && !A.etat.coucheAJour()) l.unshift("Le cours " + (A.coursSource ? A.coursSource.titre : "") + " publie une couche prof trop ancienne " +
      "(sans synchronisation ni banque privée) : reconstruis ce cours (typweb construire) et publie-le.");
    if (A.etat && !A.etat.couche) l.unshift("Couche prof du cours non chargée (hors ligne à la première visite ?) : lecture seule.");
    vider(z); z.hidden = !l.length;
    if (!l.length) return;
    var ul = el("ul"); l.forEach(function (t) { ul.appendChild(el("li", "", t)); }); z.appendChild(ul);
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
    if (A.tir.retire && estAujourdhui()) {
      sub.textContent = "Échauffement retiré pour cette séance.";
      $("#ech-lancer").disabled = true; $("#ech-retirer").textContent = "Rétablir"; return;
    }
    if (!estAujourdhui()) return rendreEchauffementJour();
    $("#ech-retirer").textContent = "Tout retirer";
    if (!A.tir.res) calculerTirage();
    var r = A.tir.res;
    sub.textContent = r.rienVu ? "Rien n'a encore été vu avec cette classe : prérequis seulement." : "Séance précédente, prérequis, révision espacée";
    if (!r.items.length) { sub.textContent = "Aucun élément d'échauffement disponible dans la banque de classe."; $("#ech-lancer").disabled = true; }
    r.items.forEach(function (it) {
      var q = el("div", "q"), tete = el("div", "tete");
      var chip = el("span", "chip", it.kind === "exercice" ? "Exercice · " + (ROLES[it.role] || "") : (ROLES[it.role] || it.role || "QCM"));
      chip.setAttribute("data-role", it.role || "");
      tete.appendChild(chip);
      tete.appendChild(el("span", "sub", it.kind === "exercice" ? it.id : it.id));
      tete.appendChild(el("span", "ressort"));
      var b = el("button", "petit", "↻"); b.type = "button"; b.setAttribute("aria-label", "Remplacer : " + (ROLES[it.role] || it.id)); b.title = "Remplacer cette question";
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
    rendreDerniereFois();
  }
  // Autre jour : lecture seule. Passé = l'échauffement enregistré ce jour-là ; à venir = rien (le tirage se fait le jour même).
  function rendreEchauffementJour() {
    var liste = $("#ech-liste"), sub = $("#ech-sub"), z = $("#ech-derniere");
    ["#ech-lancer", "#ech-retirer", "#ech-refaire"].forEach(function (s) { $(s).disabled = true; });
    $("#ech-retirer").textContent = "Tout retirer";
    vider(z); z.hidden = true;
    if (statutJour() === "avenir") { sub.textContent = "Pas encore tiré : l'échauffement se prépare le jour même, d'après ce qui aura été vu."; return; }
    var h = E.echauffements(A.etat.evenements(), A.code, A.config.fuseau).filter(function (x) { return x.jour === jourCourant(); }).pop();
    if (!h || !h.items.length) { sub.textContent = "Aucun échauffement enregistré ce jour-là."; return; }
    sub.textContent = "Échauffement du " + jourFr(h.jour) + " : " + h.items.length + " élément" + (h.items.length > 1 ? "s" : "") + ".";
    h.items.forEach(function (it) {
      if (!it || !it.id) return;
      var q = el("div", "q"), tete = el("div", "tete");
      tete.appendChild(el("span", "chip", it.type === "exercice" || it.kind === "exercice" ? "Exercice" : "QCM"));
      tete.appendChild(el("span", "sub", it.id));
      if (it.niveau === 0 || it.niveau === 1 || it.niveau === 2) { var pt = el("span", "pt n" + it.niveau); pt.title = "niveau " + it.niveau; tete.appendChild(pt); }
      q.appendChild(tete); liste.appendChild(q);
    });
  }
  // Points de couleur : comment la classe a réussi le dernier échauffement (niveau 2 / 1 / 0 enregistré après lecture des cartes).
  function rendreDerniereFois() {
    var z = $("#ech-derniere"), auj = aujourdhui(), der = null;
    vider(z); z.hidden = true;
    A.etat.evenements().forEach(function (e) {
      if (e.a === "echauffement" && e.c === A.code && Array.isArray(e.items) && O.jourDe(new Date(e.t), A.config.fuseau) < auj && (!der || e.t > der.t)) der = e;
    });
    if (!der) return;
    var notes = der.items.filter(function (i) { return i && (i.niveau === 0 || i.niveau === 1 || i.niveau === 2); });
    if (!notes.length) return;
    notes.forEach(function (i) { var s = el("span", "pt n" + i.niveau); s.title = i.id; z.appendChild(s); });
    var bien = notes.filter(function (i) { return i.niveau === 2; }).length;
    z.appendChild(el("span", "", "La dernière fois (" + O.dateFr(O.jourDe(new Date(der.t), A.config.fuseau)) + ") : " + bien + " sur " + notes.length + " bien réussie" + (bien > 1 ? "s" : "")));
    z.hidden = false;
  }
  function lancerEchauffement() {
    var msg = $("#ech-msg"), vote = A.etat.vote();
    if (!A.tir.res || !A.tir.res.items.length) return;
    if (!vote) { msg.textContent = "Les écrans de vote ne sont pas chargés (couche prof indisponible ou hors ligne). Ouvre une page du cours avec une connexion, puis recharge."; return; }
    // toutes les banques, y compris celle du cours : le tirage a été fait dans CES banques (plus fraîches que la
    // copie gardée par vote.js) ; sinon une question ajoutée depuis la copie serait « introuvable ».
    if (vote.ajouterBanque) Object.keys(A.banques).forEach(function (u) { try { vote.ajouterBanque(A.banques[u]); } catch (e) {} });
    try {
      var p = vote.start({ mode: "echauffement", items: T.versVote(A.tir.res.items), titre: "Échauffement", classe: A.code,
                           apres: function () { A.tir.res = null; A.tir.rempl = {}; rendreTout(); } });
      if (p && p.catch) p.catch(function (e) { msg.textContent = "Impossible de lancer : " + (e && e.message ? e.message : e); });
    } catch (e) { msg.textContent = "Impossible de lancer : " + e.message; }
  }

  /* ---------- rendu : poursuivre le cours ---------- */
  function ctx(jour) {
    return { ev: A.etat.evenements(), classe: A.code, uaa: A.cours && A.cours.uaa, index: A.index || X.creer(null), jour: jour || jourCourant(),
             jusque: jour ? undefined : jusque(), fuseau: A.config.fuseau, format: A.config.format.devoirs };
  }
  function titreEl(id) { var e = A.index && A.index.parId[id]; return e ? e.titre : id; }
  function rendreArret() {
    var zone = $("#arret"), lien = $("#reprendre"), der = $("#derniere");
    vider(zone); vider(der); lien.hidden = false;
    if (!A.cours) { zone.textContent = "Aucun cours configuré pour " + A.code + "."; lien.setAttribute("aria-disabled", "true"); lien.removeAttribute("href"); $("#ailleurs").disabled = true; return; }
    $("#ailleurs").disabled = !A.index || A.index.vide;
    lien.removeAttribute("aria-disabled");
    var auj = estAujourdhui(), etat = E.etat(A.etat.evenements(), A.code, A.config.fuseau, jusque()), d = E.dernier(etat, A.cours.uaa, undefined, A.index && A.index.pos);
    $("#cours-sub").textContent = auj ? "" : statutJour() === "passe" ? "Point d'arrêt à la fin du " + jourFr(jourCourant()) : "Point d'arrêt actuel (avant cette séance)";
    if (!d) {
      zone.appendChild(el("div", "r-titre", auj ? "Aucun point d'arrêt : le cours n'est pas commencé avec cette classe." : "Aucun point d'arrêt à cette date."));
      lien.textContent = "Commencer le cours"; lien.href = A.cours.url;
    } else {
      var s = A.index && A.index.sectionDe(d.el), e = A.index && A.index.parId[d.el];
      zone.appendChild(el("div", "r-titre", s ? s.titre : (e ? e.titre : d.el)));
      zone.appendChild(el("div", "r-el", "Dernier point d'arrêt" + (e && s && e.id !== s.id ? " : " + e.titre : "") + " · " + jourFr(d.jour)));
      var ch = A.index && A.index.chapitreDe ? A.index.chapitreDe(d.el) : null;
      if (ch && auj) $("#cours-sub").textContent = ch.titre;
      lien.textContent = "Reprendre ici";
      if (e) { var u = new URL(e.ancre, A.cours.url); u.searchParams.set("reprise", "1"); lien.href = u.href; } else lien.href = A.cours.url;
      var b = J.bornes(ctx(d.jour)), t0 = J.titreDebut(ctx(d.jour), b), t1 = b.fin ? J.titreSection(A.index, b.fin.el) : null;
      der.textContent = "Dernière séance : " + jourFr(d.jour) + (t1 ? ", de « " + t0 + " » à « " + t1 + " »" : "") + ".";
    }
    if (!auj) { lien.setAttribute("aria-disabled", "true"); lien.removeAttribute("href"); lien.hidden = true; }
    if (auj && !A.etat.modeProf()) {
      var w = el("div", "alerte", "Le mode prof est désactivé sur cet appareil : le cours s'ouvrira sans la couche prof. ");
      w.style.marginTop = "6px";
      var ab = el("button", "petit", "Activer le mode prof"); ab.type = "button";
      ab.addEventListener("click", function () { A.etat.activerModeProf(); rendreTout(); toast("Mode prof activé sur cet appareil"); });
      w.appendChild(ab); der.appendChild(w);
    }
  }
  function rendreApercu() {
    var zone = $("#apercu-liste"); vider(zone);
    if (!A.index || A.index.vide) return;
    var lecture = !estAujourdhui();
    var etat = E.etat(A.etat.evenements(), A.code, A.config.fuseau, jusque()), d = E.dernier(etat, A.cours.uaa, undefined, A.index.pos);
    var courant = d && A.index.sectionDe(d.el);
    $("#apercu-sub").textContent = lecture ? "Lecture seule : le point d'arrêt se fixe le jour même." : A.etat.couche ? "Touche « Point d'arrêt ici » : la classe est considérée comme arrivée à la fin de cette section (un ✓ est écrit sur son dernier élément)." : "Couche prof indisponible : lecture seule.";
    A.index.sectionsOrdonnees().forEach(function (s) {
      var ligne = el("div", "bloc" + (s.type === "chapitre" ? " chap" : "") + (courant && courant.id === s.id ? " cur" : ""));
      ligne.appendChild(el("span", "", s.titre));
      if (s.type === "section") {
        var b = el("button", "petit", courant && courant.id === s.id ? "Point d'arrêt actuel" : "Point d'arrêt ici"); b.type = "button"; b.disabled = !A.etat.couche || lecture;
        b.addEventListener("click", function () {
          var cible = A.index.dernierMarquable(s.id) || s, pc = A.index.pos[cible.id];
          // le point d'arrêt est l'élément vu le plus avancé : pour revenir en arrière, les marques au-delà sont retirées
          var etatC = E.etat(A.etat.evenements(), A.code, A.config.fuseau);
          var auDela = Object.keys(etatC).filter(function (id) { return E.dansCours(id, A.cours.uaa) && A.index.pos[id] > pc; });
          if (auDela.length && !window.confirm("Le point d'arrêt recule : " + auDela.length + " marque(s) ✓ plus loin dans le cours seront retirées pour " + A.code + ". Continuer ?")) return;
          auDela.forEach(function (id) { A.etat.annuler(id); });
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
    var b = lireBrouillon("jdc"), futur = statutJour() === "avenir";
    z.readOnly = !estAujourdhui(); $("#jdc-regen").disabled = z.readOnly && b === null;
    if (futur && b === null) { z.value = ""; sub.textContent = "Séance à venir : le journal se remplit au fil des marques ✓."; return; }
    z.value = b !== null ? b : J.texteJournal(ctx());
    sub.textContent = b !== null ? "Texte modifié à la main (↻ pour recalculer d'après les marques du jour)." :
      statutJour() === "passe" ? "Reconstitué d'après les marques ✓ de la séance du " + jourFr(jourCourant()) + "." : "Calculé d'après les marques ✓ de la séance du jour.";
  }
  function rendreDevoirs() {
    var z = $("#dev"), sub = $("#dev-sub"), bc = $("#dev-chapitre");
    z.disabled = $("#dev-regen").disabled = $("#dev-copier").disabled = !A.cours;
    bc.hidden = true;
    if (!A.cours) { z.value = ""; sub.textContent = "Aucun cours configuré pour " + A.code + "."; return; }
    var d = J.devoirs(ctx()), b = lireBrouillon("dev"), futur = statutJour() === "avenir";
    z.readOnly = !estAujourdhui(); $("#dev-regen").disabled = z.readOnly && b === null;
    if (futur && b === null) { z.value = ""; sub.textContent = "Séance à venir : rien n'est encore donné."; return; }
    z.value = b !== null ? b : d.texte;
    sub.textContent = b !== null ? "Texte modifié à la main (↻ pour recalculer)." :
      (d.lignes.length && statutJour() === "passe" ? "Exercices « à la maison » donnés ce jour-là (matière vue pendant la séance)." : d.lignes.length ? "Exercices « à la maison » situés dans la matière vue pendant la séance." : "Aucun exercice « à la maison » dans la matière vue (les exercices regroupés en fin de chapitre n'en font pas partie).");
    if (b === null && estAujourdhui() && !d.lignes.length && d.propositionChapitre.length) {
      bc.hidden = false; bc.textContent = "Proposer les " + d.propositionChapitre.length + " exercices « maison » du chapitre";
      bc.onclick = function () { z.value = J.texteDevoirs(d.propositionChapitre, A.config.format.devoirs); ecrireBrouillon("dev", z.value); sub.textContent = "Proposition : tous les exercices « maison » du chapitre " + (d.chapitre ? d.chapitre.num : "") + " (à adapter)."; bc.hidden = true; };
    }
  }
  function rendreInterros() {
    var zone = $("#interros"); vider(zone);
    var auj = jourCourant();
    var l = A.config.interros.filter(function (i) { return i.classe === A.code && i.date >= auj; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!l.length) { zone.appendChild(el("div", "sub", "Aucune interro planifiée pour " + A.code + (estAujourdhui() ? "." : " à partir de cette date."))); return; }
    l.forEach(function (i) {
      var n = O.ecartJours(auj, i.date), ligne = el("div", "iro"), p = i.date.split("-");
      var dt = el("span", "dt"); dt.setAttribute("aria-hidden", "true");
      dt.appendChild(el("b", "", String(parseInt(p[2], 10)))); dt.appendChild(el("span", "", MOIS_C[parseInt(p[1], 10) - 1]));
      ligne.appendChild(dt);
      var f = el("span", "f"); f.appendChild(el("span", "cache", jourFr(i.date) + " · ")); f.appendChild(document.createTextNode(i.uaa + " · " + i.type));
      ligne.appendChild(f);
      ligne.appendChild(el("span", "j" + (n <= 14 ? " proche" : ""), n === 0 ? (estAujourdhui() ? "aujourd'hui" : "ce jour-là") : "J−" + n));
      zone.appendChild(ligne);
    });
  }

  /* ---------- assemblage ---------- */
  function rendreDynamique() { rendreArret(); rendreApercu(); rendreJournal(); rendreDevoirs(); }
  // Jour sans cours (autre que le jour même) : message clair, avec les jours de cours précédent et suivant de la classe.
  function rendreSansCours() {
    var z = $("#sans-cours"); vider(z);
    z.hidden = estAujourdhui() || seancesAffichees().length > 0;
    if (z.hidden) return;
    var conge = H.estConge(A.config, jourCourant());
    z.appendChild(el("span", "r-texte", (conge ? "Congé" : "Pas de cours") + " pour " + A.code + " le " + dateLongue(jourCourant()).toLowerCase() + "."));
    [["Jour de cours précédent", H.jourDeCours(A.config, A.code, jourCourant(), -1)], ["Jour de cours suivant", H.jourDeCours(A.config, A.code, jourCourant(), 1)]].forEach(function (c, i) {
      if (!c[1]) return;
      var b = el("button", "btn t", i === 0 ? "‹ " + jourFr(c[1]) : jourFr(c[1]) + " ›");
      b.type = "button"; b.title = c[0]; b.setAttribute("aria-label", c[0] + " : " + dateLongue(c[1]));
      b.addEventListener("click", function () { aller(c[1]); });
      z.appendChild(b);
    });
  }
  function rendreTout() { A.vuLe = aujourdhui(); rendreEntete(); rendreSansCours(); rendreEchauffement(); rendreDynamique(); rendreInterros(); rendreModules(); }

  function brancher() {
    $("#ech-lancer").addEventListener("click", lancerEchauffement);
    $("#ech-retirer").addEventListener("click", function () { A.tir.retire = !A.tir.retire; rendreEchauffement(); });
    $("#ech-refaire").addEventListener("click", function () { A.tir.n++; A.tir.rempl = {}; A.tir.res = null; A.tir.retire = false; rendreEchauffement(); });
    function feuille(ouvrir) {
      var a = $("#apercu"); a.hidden = !ouvrir; $("#ailleurs").setAttribute("aria-expanded", String(ouvrir));
      if (ouvrir) { rendreApercu(); $("#apercu-fermer").focus(); var c = $("#apercu .bloc.cur"); if (c) c.scrollIntoView({ block: "center" }); }
      else $("#ailleurs").focus();
    }
    $("#ailleurs").addEventListener("click", function () { feuille($("#apercu").hidden); });
    $("#apercu-fermer").addEventListener("click", function () { feuille(false); });
    $("#apercu").addEventListener("click", function (e) { if (e.target.id === "apercu") feuille(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#apercu").hidden) feuille(false); });
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
      a.download = "etat-pilotage-" + aujourdhui() + ".json";
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
    $("#jour-prec").addEventListener("click", function () { aller(O.ajouterJours(jourCourant(), -1)); });
    $("#jour-suiv").addEventListener("click", function () { aller(O.ajouterJours(jourCourant(), 1)); });
    $("#date-jour").addEventListener("click", function () {      // calendrier natif : input date caché + showPicker(), repli focus/click
      var c = $("#jour-choix"); c.value = jourCourant();
      try { c.showPicker(); } catch (e) { try { c.focus(); c.click(); } catch (e2) {} }
    });
    $("#jour-choix").addEventListener("change", function (e) { if (e.target.value) aller(e.target.value); });
    document.addEventListener("keydown", function (e) {            // ← / → : ignorées dans les champs, les réglages et les feuilles ouvertes
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var t = e.target, v = A.etat && A.etat.vote();
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (location.hash === "#reglages" || !$("#apercu").hidden || !$("#dialogue-cle").hidden || (v && v.ouvert && v.ouvert())) return;
      e.preventDefault(); aller(O.ajouterJours(jourCourant(), e.key === "ArrowLeft" ? -1 : 1));
    });
    window.addEventListener("online", rendreEntete); window.addEventListener("offline", rendreEntete);
    A.etat.abonner(function () { rendreDynamique(); });
    setInterval(function () {                                         // le créneau peut changer pendant que la page reste ouverte
      if (A.jour && A.jour === aujourdhui()) { A.jour = null; majUrl(); }       // le jour choisi est devenu aujourd'hui (minuit passé)
      if (A.vuLe !== aujourdhui()) { A.tir.res = null; rendreTout(); }       // minuit passé : la page suit le nouveau jour
      var c = H.detecter(A.config, maintenant());
      if (new URLSearchParams(location.search).get("maintenant")) return;
      if (A.creneau && !c && window.typwebSync && window.typwebSync.estConfigure()) window.typwebSync.finSeance();   // fin de séance : sauvegarde (P5)
      var manuel = stock(function (s) { return sessionStorage.getItem(CLE_MANUEL); });
      var v = A.etat && A.etat.vote();
      if (!manuel && c && c.classe !== A.code && estAujourdhui()) {
        if (v && v.ouvert && v.ouvert()) return;                     // écran de vote ouvert : on attend sa fermeture
        location.reload();
      }
      A.creneau = c; rendreEntete();
    }, 60000);
  }

  function afficherErreurs(erreurs) {
    var z = $("#erreur-config"); vider(z); z.hidden = false;
    z.appendChild(el("b", "", "Configuration : " + erreurs.length + " problème(s) à corriger"));
    var ul = el("ul"); erreurs.forEach(function (e) { ul.appendChild(el("li", "", e)); }); z.appendChild(ul);
    $("#entete").hidden = true; $("#grille").hidden = true; $(".b-droite .temps").hidden = true;
  }

  function init(options) {
    options = options || {};
    if (Pi.vues) Pi.vues.demarrer();
    if ("serviceWorker" in navigator && !options.sansSW) navigator.serviceWorker.register("sw.js").catch(function () {});
    return (options.source || C.sourceFichier).charger().then(function (brut) {
      var v = C.valider(brut);
      if (!v.ok) {
        afficherErreurs(v.erreurs);
        if (Pi.synchro) Pi.synchro.init({ sync: window.typwebSync, toast: toast, source: C.sourceFichier, seul: true });
        if (Pi.cle) Pi.cle.init({ sync: window.typwebSync, toast: toast });
        if (Pi.reglages) Pi.reglages.init({ sync: window.typwebSync, toast: toast });
        return;
      }
      A.config = v.config;
      A.jour = Jr.dansUrl(location.search); if (A.jour === aujourdhui()) A.jour = null;
      if (!A.jour && /[?&]jour=/.test(location.search)) majUrl();            // ?jour= invalide ou égal à aujourd'hui : retiré de l'adresse
      choisirClasse();
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
        var rendreApresSync = function () { A.tir.res = null; rendreTout(); };
        if (Pi.synchro) Pi.synchro.init({ etat: A.etat, sync: window.typwebSync, toast: toast, source: C.sourceFichier, rendre: rendreApresSync, jour: aujourdhui });
        if (Pi.cle) Pi.cle.init({ etat: A.etat, sync: window.typwebSync, toast: toast, rendre: rendreApresSync });
        if (Pi.reglages) Pi.reglages.init({ etat: A.etat, sync: window.typwebSync, toast: toast, config: A.config, rendre: rendreTout });
        document.documentElement.setAttribute("data-pret", "1");
      });
    }, function (e) { afficherErreurs(["Impossible de lire la configuration : " + e.message]); });
  }
  Pi.app = { init: init, etat: A };
  if (!window.PILOTAGE_MANUEL) init();
})();
