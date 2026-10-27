/* cle-ui.js — clé de synchronisation : un petit fichier (jeton chiffré par une phrase secrète, dépôt, nom d'appareil)
   qui remet la synchronisation en service quand le navigateur a effacé ses données (Brave « effacer à la fermeture »).
   - Réglages › « Clé de synchronisation » : enregistrer la clé dans un fichier, en charger une.
   - Vue de la classe : bandeau « Synchronisation inactive » avec « Charger ma clé… » tant que rien n'est configuré.
   Après chargement : mode prof activé, restauration de l'état des classes depuis le dépôt, puis synchronisation.
   Le jeton n'est jamais affiché ni écrit en clair dans le fichier ; la phrase n'est gardée nulle part.
   Tout le texte est inséré avec textContent. Cryptographie : js/sync.js (exporterCle, lireCle, importerCle). */
(function () {
  "use strict";
  var Pi = window.Pilotage = window.Pilotage || {};
  var CLE_MASQUE = "pilotage.reprise.masquee", CLE_DERNIERE = "pilotage.cle.derniere";

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function bouton(txt, cls, f, id) { var b = el("button", cls || "btn", txt); b.type = "button"; if (id) b.id = id; b.addEventListener("click", f); return b; }
  function champ(libelle, attrs) {
    var l = el("label"), i = el("input");
    l.appendChild(el("span", "", libelle));
    Object.keys(attrs).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    l.appendChild(i);
    return { label: l, input: i };
  }
  function stock(f) { try { return f(localStorage); } catch (e) { return null; } }
  function dateFr(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" }); }

  function init(o) {
    var S = o.sync, zone = document.getElementById("cle-contenu"), dlg = document.getElementById("dialogue-cle"), reprise = document.getElementById("reprise");
    if (!S || !S.exporterCle || !zone || zone.getAttribute("data-pret")) return;
    zone.setAttribute("data-pret", "1");
    var toast = o.toast || function () {};

    /* ---------- réglages : enregistrer, charger ---------- */
    var ui = el("div", "cle-ui");
    ui.appendChild(el("p", "", "Un petit fichier qui contient le dépôt, le nom de l'appareil et le jeton, chiffré par ta phrase secrète."));
    ui.appendChild(el("p", "sub", "Si le navigateur efface ses données, « Charger ma clé » suffit : la page se reconnecte et récupère l'état des classes depuis le dépôt."));
    ui.appendChild(el("h3", "", "Enregistrer une clé"));
    var champs = el("div", "champs");
    var f1 = champ("Phrase secrète (8 caractères au moins)", { type: "password", autocomplete: "new-password", spellcheck: "false", id: "cle-phrase" });
    var f2 = champ("Confirme la phrase secrète", { type: "password", autocomplete: "new-password", spellcheck: "false", id: "cle-phrase2" });
    champs.appendChild(f1.label); champs.appendChild(f2.label);
    ui.appendChild(champs);
    var bEnr = bouton("Enregistrer la clé dans un fichier…", "btn cu", enregistrer, "cle-enregistrer");
    ui.appendChild(bEnr);
    var aide = el("div", "sub"); ui.appendChild(aide);
    var msg = el("div", "sub"); msg.id = "cle-msg"; msg.setAttribute("role", "status");
    ui.appendChild(msg);
    ui.appendChild(el("h3", "", "Charger une clé"));
    ui.appendChild(bouton("Charger une clé…", "btn t", function () { ouvrirDialogue(); }, "cle-charger"));
    var derniere = el("p", "sub"); ui.appendChild(derniere);
    ui.appendChild(el("p", "sub", "Garde ce fichier hors des dépôts et des dossiers publiés (clé USB, dossier Documents). Sans la phrase, il est inutilisable ; " +
      "phrase oubliée : crée un nouveau jeton et une nouvelle clé."));
    zone.appendChild(ui);

    function enregistrer() {
      var a = f1.input.value, b = f2.input.value;
      if (a.length < 8) { msg.textContent = "Phrase secrète trop courte (8 caractères au moins)."; return; }
      if (a !== b) { msg.textContent = "Les deux phrases secrètes sont différentes."; return; }
      bEnr.disabled = true; msg.textContent = "Chiffrement…";
      S.exporterCle(a).then(function (texte) {
        var inf = S.infos(), nom = "cle-pilotage-" + (inf.appareil || "appareil") + ".json";
        var lien = document.createElement("a");
        lien.href = URL.createObjectURL(new Blob([texte], { type: "application/json" }));
        lien.download = nom;
        document.body.appendChild(lien); lien.click();
        setTimeout(function () { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
        f1.input.value = f2.input.value = "";
        stock(function (s) { s.setItem(CLE_DERNIERE, JSON.stringify({ date: new Date().toISOString(), fichier: nom })); });
        msg.textContent = "Clé enregistrée : « " + nom + " » (dossier des téléchargements). Range-la en lieu sûr.";
        toast("Clé de synchronisation enregistrée");
        maj();
      }, function (e) { msg.textContent = e.message; }).then(function () { bEnr.disabled = false; maj(); });
    }

    /* ---------- dialogue : ouvrir une clé ---------- */
    var feuille = el("section", "feuille");
    var tete = el("div", "feuille-tete"), titre = el("h2", "", "Charger ma clé de synchronisation"); titre.id = "dcle-titre";
    tete.appendChild(titre); tete.appendChild(bouton("✕", "btn discret", fermerDialogue));
    feuille.appendChild(tete);
    feuille.appendChild(el("p", "sub", "1. Choisis le fichier de la clé · 2. tape la phrase secrète · 3. l'état des classes revient du dépôt."));
    var fichier = el("input"); fichier.type = "file"; fichier.accept = "application/json,.json"; fichier.hidden = true; fichier.id = "cle-fichier";
    var lFichier = el("div", "ligne"), bFichier = bouton("Choisir le fichier…", "btn t", function () { fichier.click(); }), nomFichier = el("span", "sub", "aucun fichier choisi");
    lFichier.appendChild(bFichier); lFichier.appendChild(nomFichier);
    feuille.appendChild(fichier); feuille.appendChild(lFichier);
    var fp = champ("Phrase secrète de la clé", { type: "password", autocomplete: "off", spellcheck: "false", id: "cle-ouvrir-phrase" });
    var fa = champ("Nom de cet appareil", { type: "text", autocomplete: "off", spellcheck: "false", id: "cle-appareil", placeholder: "tablette" });
    var caseCh = el("label", "case"), cbCh = el("input"); cbCh.type = "checkbox"; cbCh.id = "cle-garder-chiffre";
    caseCh.appendChild(cbCh); caseCh.appendChild(el("span", "", "Garder le jeton chiffré sur cet appareil (phrase à retaper à chaque session)"));
    feuille.appendChild(fp.label); feuille.appendChild(fa.label); feuille.appendChild(caseCh);
    var lAct = el("div", "ligne"), bOuvrir = bouton("Ouvrir la clé", "btn cu", ouvrirCle, "cle-ouvrir");
    lAct.appendChild(bOuvrir); lAct.appendChild(bouton("Annuler", "btn", fermerDialogue));
    feuille.appendChild(lAct);
    var dmsg = el("div", "sub"); dmsg.setAttribute("role", "status"); dmsg.id = "cle-dmsg"; feuille.appendChild(dmsg);
    if (dlg) { vider(dlg); dlg.appendChild(feuille); dlg.addEventListener("click", function (e) { if (e.target === dlg) fermerDialogue(); }); }
    var texteCle = null;
    fichier.addEventListener("change", function () {
      var f = fichier.files[0]; if (!f) return;
      var lecteur = new FileReader();
      lecteur.onload = function () {
        texteCle = String(lecteur.result); fichier.value = "";
        try {
          var k = S.lireCle(texteCle);
          nomFichier.textContent = f.name + " · dépôt " + k.depot + " · appareil « " + k.appareil + " »" + (k.cree ? " · " + dateFr(k.cree) : "");
          if (!fa.input.value) fa.input.value = k.appareil;
          dmsg.textContent = ""; fp.input.focus();
        } catch (e) { texteCle = null; nomFichier.textContent = f.name; dmsg.textContent = e.message; }
      };
      lecteur.readAsText(f);
    });
    fp.input.addEventListener("keydown", function (e) { if (e.key === "Enter") ouvrirCle(); });
    function ouvrirDialogue() { if (!dlg) return; dlg.hidden = false; dmsg.textContent = ""; bFichier.focus(); }
    function fermerDialogue() { if (dlg) dlg.hidden = true; fp.input.value = ""; }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg && !dlg.hidden) fermerDialogue(); });

    function ouvrirCle() {
      if (!texteCle) { dmsg.textContent = "Choisis d'abord le fichier de la clé."; return; }
      if (!fp.input.value) { dmsg.textContent = "Tape la phrase secrète de la clé."; fp.input.focus(); return; }
      bOuvrir.disabled = true; dmsg.textContent = "Déchiffrement…";
      S.importerCle(texteCle, fp.input.value, { appareil: fa.input.value.trim() || undefined, garderChiffre: cbCh.checked }).then(function (r) {
        fp.input.value = "";
        if (o.etat && o.etat.activerModeProf) o.etat.activerModeProf();
        toast("Synchronisation rétablie : " + r.depot + " (« " + r.appareil + " »)");
        if (!(o.etat && o.etat.couche)) { dmsg.textContent = "Clé chargée. Couche prof absente : recharge la page avec une connexion pour récupérer l'état des classes."; return S.synchroniser(); }
        dmsg.textContent = "Clé chargée. Récupération de l'état des classes…";
        return S.restaurer().then(function (b) {
          var t = "Clé chargée · " + b.ajoutes + " événement(s) récupéré(s) du dépôt" + (b.classes.length ? " · " + b.classes.join(", ") : "") + ".";
          dmsg.textContent = t; toast(t);
          if (o.rendre) o.rendre();
          return S.synchroniser();
        }).then(function () { fermerDialogue(); });
      }, function (e) { dmsg.textContent = e.message; }).then(function () { bOuvrir.disabled = false; maj(); }, function (e) { bOuvrir.disabled = false; dmsg.textContent = e && e.message ? e.message : "Opération impossible"; maj(); });
    }

    /* ---------- bandeau de reprise (vue de la classe) ---------- */
    if (reprise) {
      document.getElementById("reprise-cle").addEventListener("click", ouvrirDialogue);
      document.getElementById("reprise-masquer").addEventListener("click", function () { stock(function (s) { s.setItem(CLE_MASQUE, "1"); }); maj(); });
    }

    function maj() {
      var st = S.statut(), inf = S.infos();
      var actif = st.etat !== "inactif";
      bEnr.disabled = !actif || inf.verrouille;
      f1.input.disabled = f2.input.disabled = bEnr.disabled;
      aide.textContent = !actif ? "Configure d'abord la synchronisation, ou charge une clé." :
        inf.verrouille ? "Jeton verrouillé : déverrouille-le (Synchronisation) pour enregistrer une clé." : "";
      var d = stock(function (s) { return JSON.parse(s.getItem(CLE_DERNIERE) || "null"); });
      derniere.textContent = d && d.date ? "Dernière clé enregistrée sur cet appareil : " + dateFr(d.date) + " · " + d.fichier : "";
      if (reprise) reprise.hidden = actif || stock(function (s) { return s.getItem(CLE_MASQUE); }) === "1";
      if (actif) stock(function (s) { s.removeItem(CLE_MASQUE); });
    }
    S.abonner(maj);
    maj();
    Pi.cle.ouvrir = ouvrirDialogue;
  }

  Pi.cle = { init: init };
})();
