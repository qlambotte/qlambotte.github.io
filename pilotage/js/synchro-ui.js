/* synchro-ui.js — interface de la synchronisation (P5) dans la page de pilotage.
   Pastille d'état toujours visible dans le bandeau ; au clic, la vue « Réglages » s'ouvre : état et détail, synchronisation à la demande,
   restauration depuis le dépôt, configuration de l'appareil (jeton, dépôt, nom d'appareil, test de connexion, chiffrement
   facultatif du jeton), « Oublier ce jeton ». Le jeton n'est saisi que dans un champ « mot de passe » : jamais dans
   l'adresse, jamais dans le code publié, jamais affiché. Tout le texte est inséré avec textContent. */
(function () {
  "use strict";
  var Pi = window.Pilotage = window.Pilotage || {};
  var ORIGINES = { depot: "dépôt privé (à jour)", "depot-copie": "dépôt privé (copie gardée sur cet appareil)", site: "fichier du site", copie: "copie du fichier du site gardée sur cet appareil" };

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function champ(libelle, attrs) {
    var l = el("label"), i = el("input");
    l.appendChild(el("span", "", libelle));
    Object.keys(attrs).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    l.appendChild(i);
    return { label: l, input: i };
  }
  function bouton(txt, cls, f) { var b = el("button", cls || "", txt); b.type = "button"; b.addEventListener("click", f); return b; }

  function init(o) {
    var S = o.sync, zone = document.getElementById("synchro"), puce = document.getElementById("sync-etat");
    if (!S || !zone || !puce || zone.getAttribute("data-pret")) return;
    zone.setAttribute("data-pret", "1");
    var couche = !!(o.etat && o.etat.couche), toast = o.toast || function () {};
    var occupe = false;

    /* ---- squelette ---- */
    var rapportEtat = el("div", "rapport"); rapportEtat.setAttribute("role", "status");
    var detail = el("ul", "detail");
    var configInfo = el("div", "sub");
    var lAction = el("div", "ligne");
    var bSync = bouton("Synchroniser maintenant", "primaire", function () { agir(bSync, S.synchroniser().then(function (r) { toast(r.ok ? "Synchronisé" : "Synchronisation impossible : " + r.erreur); })); });
    var bRest = bouton("Restaurer depuis le dépôt", "", restaurer);
    var bPub = bouton("Envoyer la configuration du site vers le dépôt", "petit", publier);
    lAction.appendChild(bSync); lAction.appendChild(bRest); lAction.appendChild(bPub);
    var compte = el("div", "rapport"); compte.hidden = true; compte.setAttribute("role", "status");

    var blocVerrou = el("div", "bloc-sync"); blocVerrou.hidden = true;
    var phraseV = champ("Phrase secrète (le jeton est verrouillé)", { type: "password", autocomplete: "off", spellcheck: "false" });
    var msgV = el("div", "sub");
    blocVerrou.appendChild(phraseV.label);
    blocVerrou.appendChild(bouton("Déverrouiller", "primaire", function () {
      S.deverrouiller(phraseV.input.value).then(function () { phraseV.input.value = ""; msgV.textContent = ""; toast("Jeton déverrouillé pour cette session"); S.synchroniser(); },
        function (e) { msgV.textContent = e.message; });
    }));
    blocVerrou.appendChild(msgV);

    zone.appendChild(rapportEtat); zone.appendChild(detail); zone.appendChild(configInfo);
    zone.appendChild(el("p")); zone.appendChild(lAction); zone.appendChild(compte); zone.appendChild(blocVerrou);

    zone.appendChild(el("h3", "", "Configurer cet appareil"));
    var form = el("div", "bloc-sync");
    var fJeton = champ("Jeton GitHub (« fine-grained », limité à un seul dépôt)", { type: "password", autocomplete: "off", spellcheck: "false", autocapitalize: "off", name: "jeton-sync" });
    var fDepot = champ("Dépôt (compte/nom)", { type: "text", autocomplete: "off", spellcheck: "false", autocapitalize: "off", placeholder: "compte/suivi-classes" });
    var fApp = champ("Nom de cet appareil", { type: "text", autocomplete: "off", spellcheck: "false", placeholder: "tablette" });
    var caseCh = el("label", "case"), cbCh = el("input"); cbCh.type = "checkbox";
    caseCh.appendChild(cbCh); caseCh.appendChild(el("span", "", "Chiffrer le jeton avec une phrase secrète (à saisir à chaque session)"));
    var fPhrase = champ("Phrase secrète (8 caractères au moins)", { type: "password", autocomplete: "new-password", spellcheck: "false" });
    var fPhrase2 = champ("Confirme la phrase secrète (si tu l'oublies, il faudra recréer le jeton)", { type: "password", autocomplete: "new-password", spellcheck: "false" });
    fPhrase.label.hidden = fPhrase2.label.hidden = true;
    cbCh.addEventListener("change", function () { fPhrase.label.hidden = fPhrase2.label.hidden = !cbCh.checked; });
    var lBtn = el("div", "ligne"), tests = el("div"), msgCfg = el("div", "sub"); msgCfg.setAttribute("role", "status");
    var bTest = bouton("Tester la connexion", "", function () { tester(); });
    var bEnr = bouton("Enregistrer et activer", "primaire", enregistrer);
    var bOubli = bouton("Oublier ce jeton", "", oublier);
    lBtn.appendChild(bTest); lBtn.appendChild(bEnr); lBtn.appendChild(el("span", "ressort")); lBtn.appendChild(bOubli);
    [fJeton.label, fDepot.label, fApp.label, caseCh, fPhrase.label, fPhrase2.label, lBtn, tests, msgCfg].forEach(function (n) { form.appendChild(n); });
    zone.appendChild(form);
    zone.appendChild(el("p", "sub", "Le jeton reste dans le stockage local de cet appareil. Il n'est jamais placé dans une adresse, ni dans un export, ni dans le dépôt. " +
      "Perte de l'appareil : révoque le jeton sur GitHub (voir « mise en place du dépôt et du jeton »)."));

    /* ---- valeurs par défaut ---- */
    var info = S.infos();
    var hote = location.hostname.match(/^([^.]+)\.github\.io$/);
    fDepot.input.value = info.depot || (hote ? hote[1] + "/suivi-classes" : "");
    fApp.input.value = info.appareil || "";

    /* ---- actions ---- */
    function agir(bouton, promesse) {
      if (occupe) return;
      occupe = true; bouton.disabled = true;
      var fini = function () { occupe = false; bouton.disabled = false; maj(); };
      promesse.then(fini, function (e) { toast(e && e.message ? e.message : "Opération impossible"); fini(); });
    }
    function afficherEtapes(r) {
      vider(tests);
      (r.etapes || []).forEach(function (e) { tests.appendChild(el("div", "etape" + (e.ok ? "" : " ko"), e.texte)); });
    }
    function saisie() { return { jeton: fJeton.input.value.trim(), depot: fDepot.input.value.trim(), appareil: fApp.input.value.trim() }; }
    function tester() {
      var c = saisie();
      msgCfg.textContent = "Test en cours…"; vider(tests);
      agir(bTest, S.tester({ jeton: c.jeton || undefined, depot: c.depot }).then(function (r) {
        afficherEtapes(r); msgCfg.textContent = r.ok ? "Connexion vérifiée : le jeton ne donne accès qu'à ce dépôt privé." : "Test échoué : " + (r.erreur || "");
      }));
    }
    function enregistrer() {
      var c = saisie();
      if (cbCh.checked) {
        if (fPhrase.input.value.length < 8) { msgCfg.textContent = "Phrase secrète trop courte (8 caractères au moins)."; return; }
        if (fPhrase.input.value !== fPhrase2.input.value) { msgCfg.textContent = "Les deux phrases secrètes sont différentes."; return; }
      }
      msgCfg.textContent = "Vérification…"; vider(tests);
      agir(bEnr, S.tester({ jeton: c.jeton || undefined, depot: c.depot }).then(function (r) {
        afficherEtapes(r);
        if (!r.ok) { msgCfg.textContent = "Rien n'est enregistré : " + (r.erreur || "test échoué"); return null; }
        return S.configurer({ jeton: c.jeton || undefined, depot: c.depot, appareil: c.appareil, phrase: cbCh.checked ? fPhrase.input.value : undefined }).then(function (res) {
          fJeton.input.value = ""; fPhrase.input.value = ""; fPhrase2.input.value = ""; cbCh.checked = false; fPhrase.label.hidden = fPhrase2.label.hidden = true;
          if (o.etat && o.etat.activerModeProf) o.etat.activerModeProf();
          msgCfg.textContent = "Enregistré : appareil « " + res.appareil + " », dépôt " + res.depot + ". Couche prof activée sur cet appareil.";
          toast("Synchronisation activée");
          S.synchroniser();
        }, function (e) { msgCfg.textContent = e.message; });
      }));
    }
    function oublier() {
      S.oublierJeton();
      fJeton.input.value = "";
      msgCfg.textContent = "Jeton oublié sur cet appareil. La file d'attente est conservée ; rien n'est plus envoyé. Pense à le révoquer sur GitHub.";
      maj();
    }
    function restaurer() {
      if (!couche) { compte.hidden = false; compte.textContent = "La couche prof n'est pas chargée (ouvre la page avec une connexion, puis réessaie)."; return; }
      compte.hidden = false; compte.textContent = "Restauration en cours…";
      agir(bRest, S.restaurer().then(function (b) {
        var t = b.ajoutes + " événement(s) ajouté(s) sur cet appareil (" + b.evenements + " lu(s) dans " + b.lots + " lot(s) du dépôt)";
        if (b.classes.length) t += " · classe(s) : " + b.classes.join(", ");
        if (b.deJour) t += " · du " + b.deJour + " au " + b.aJour;
        t += b.configuration ? " · configuration du dépôt récupérée." : " · pas de configuration dans le dépôt.";
        if (b.invalides) t += " " + b.invalides + " élément(s) illisible(s) ignoré(s).";
        if (b.tronque) t += " Attention : la liste du dépôt est tronquée par GitHub.";
        compte.textContent = t;
        if (o.rendre) o.rendre();
      }, function (e) { compte.textContent = "Restauration impossible : " + e.message; }));
    }
    function publier() {
      var txt = null;
      agir(bPub, fetch("config.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("config.json du site illisible (HTTP " + r.status + ")"); return r.text(); })
        .then(function (t) { txt = t; if (o.source && Pi.config && !Pi.config.valider(t).ok) throw new Error("config.json du site n'est pas valide : rien n'est envoyé."); return S.publierConfig(t); })
        .then(function () { toast("Configuration envoyée vers config/pilotage.json"); }));
    }

    /* ---- affichage ---- */
    function maj() {
      var st = S.statut(), inf = S.infos();
      puce.textContent = st.etat === "inactif" ? "Synchro : non configurée" : "Synchro : " + st.texte;
      puce.setAttribute("data-etat", st.etat);
      rapportEtat.textContent = st.texte;
      vider(detail); st.detail.forEach(function (l) { detail.appendChild(el("li", "", l)); });
      var org = o.source && o.source.origine;
      var ligne = org ? "Configuration de la page : " + (ORIGINES[org] || org) + "." : "";
      if (o.source && o.source.refus) ligne += " La copie du dépôt est invalide et a été écartée : " + o.source.refus.slice(0, 3).join(" ; ");
      configInfo.textContent = ligne;
      var actif = st.etat !== "inactif";
      bSync.disabled = bPub.disabled = !actif || occupe || !!o.seul;
      bRest.disabled = !actif || occupe || !!o.seul;
      bOubli.disabled = !inf.jeton;
      blocVerrou.hidden = !inf.verrouille;
      lAction.hidden = !actif;
    }
    puce.addEventListener("click", function () { if (Pi.vues) Pi.vues.ouvrir("reglages"); });
    S.abonner(maj);
    maj();
    Pi.synchro.maj = maj;
  }

  Pi.synchro = { init: init };
})();
