# Page de pilotage de classe (P4)

Page statique, ouverte sur la tablette : elle détecte la classe d'après l'horaire, lit où en est la classe
(marques ✓ de la couche prof) et propose l'échauffement, la poursuite du cours, le journal de classe, les devoirs
et les interros planifiées. Publiée sur `qlambotte.github.io/pilotage/` (même domaine que les cours : le stockage
local est partagé avec la couche prof). Aucune donnée d'élève : seulement des codes de classe et des identifiants d'éléments.

## Présentation (charte « Ardoise et cuivre », 2026-10)

- **Une page, deux vues.** Vue « classe » (par défaut) et vue « Réglages » (`…/pilotage/#reglages`) : même page, même état.
  Le bandeau du haut porte le titre « Pilotage » et, en dessous, quatre icônes : **Réglages** (roue), **Scanner** (`scan.html`,
  sur le smartphone), **Exporter**, **Importer**. Plus de menu latéral.
- **Vue classe** : bandeau (date, classe, puces local · horaire · cours, anneau du temps de la séance, choix de la classe, pastille de
  synchronisation) puis trois cartes : Échauffement (questions numérotées, rôle en couleur, bilan de la dernière fois en points de
  couleur), Reprendre le cours (point d'arrêt, « Autre endroit » ouvre une feuille par-dessus la page, prochaines interros), Journal
  de classe et devoirs. Sur une tablette en paysage (1180×820), **tout tient sur l'écran** ; en portrait, deux colonnes ; sur
  smartphone, une colonne qui défile, le cours à reprendre en premier.
- **Vue Réglages** : Synchronisation (`js/synchro-ui.js`), Clé de synchronisation (`js/cle-ui.js`), Cet appareil (`js/reglages.js` :
  apparence, conservation des données, mode prof, export/import, classes et horaire).
- **Apparence** : « Jour » (par défaut), « Soir » (sombre), « Automatique » (suit l'appareil) ; `js/theme.js`, choix gardé sur l'appareil.
- **Couleurs** : l'ardoise structure et agit, le cuivre attire l'attention (temps, échéances, clé, révéler), l'olive confirme
  (réussi, synchronisé). Textes à 4,5:1 au moins, en jour comme en soir (test `test_contraste_des_textes_jour_et_soir`).

## Installation (option A : intégrée au portail)

`portail.toml` contient `[pilotage] dossier = "pilotage"`. `typweb portail` ajoute alors à `_quarto.yml` (généré) les
fichiers de la page comme ressources, copiées telles quelles à la racine du site (`/pilotage/`) ; ni lien dans le menu,
ni indexation (`noindex`). `tests/`, `README.md` et les captures ne sont pas publiés.

```bash
python3 typweb/typweb.py portail ../portail --preview   # vérifier que /pilotage/ est servi
python3 typweb/typweb.py portail ../portail --publier
```

Les cours doivent avoir été reconstruits **une fois** avec le `prof.js` et le `vote.js` à jour (fonctions ajoutées
ci-dessous) : c'est la seule reconstruction nécessaire, et elle ne dépend d'aucune classe.

## Configuration : `config/pilotage.json` (dépôt privé) et `config.json` (site public)

**Depuis la relecture d'octobre 2026**, la configuration complète (horaire, locaux, congés, interros) vit seulement dans le
dépôt privé `suivi-classes/config/pilotage.json`, lu avec le jeton (copie gardée pour le hors-ligne). Le `config.json` publié
avec la page ne contient plus que les classes et leurs cours (pas d'horaire, de local ni d'interro : un élève pourrait le lire) ;
sans jeton configuré, la page fonctionne donc sans détection d'horaire. Les tests utilisent `tests/fixtures/config-horaire.json`.

Validée au chargement (erreurs listées une par une, avec le chemin du champ).

| Clé | Contenu |
|---|---|
| `fuseau` | fuseau horaire (`Europe/Brussels`) |
| `classes[]` | `code`, `niveau` (`5e`/`6e`), `effectif`, `coursEnCours` (UAA), `cours[]` : `uaa`, `titre`, `url` (terminée par `/`), `index` (adresse relative à `url`) ; `classe` facultatif (ancienne banque publiée : la banque est lue dans le dépôt privé, `banques/<UAA>/classe.json`) |
| `creneaux[]` | `jour` (lundi…samedi), `debut`, `fin` (`HH:MM`), `classe`, `local` ; même horaire chaque semaine |
| `conges[]` | `"AAAA-MM-JJ"` ou `{ "du", "au", "motif" }` ; aucun créneau détecté ces jours-là |
| `interros[]` | `date`, `classe`, `uaa`, `type` ; rappels seulement (les passées disparaissent) |
| `format.devoirs` | modèle d'une ligne de devoirs : `{num}`, `{titre}`, `{id}` ; un groupe `[ … ]` est supprimé si un champ y est vide. Défaut : `Exercice {num}[ : {titre}]` |

Ajouter un cours à une classe : une entrée dans `classes[].cours` (elle sert aussi à la révision espacée : les banques
des UAA déjà vues par la classe sont chargées d'après cette liste) ; changer le cours en cours : `coursEnCours`.
`6TTi` n'a pas encore de cours configuré : ajouter l'entrée du cours de 6e (adresse du site, `uaa`) puis `coursEnCours`.
Les effectifs de `config.json` sont à vérifier (20, valeur provisoire). Les classes et effectifs de `config.json`
**remplacent** ceux de `prof-config.json` (la page les écrit dans le stockage local via `definirClasses`).

Source isolée : `js/config.js › sourceFichier` (lecture) et `js/etat.js` (état). Avec la synchronisation (P5, ci-dessous), la
configuration est lue d'abord dans `config/pilotage.json` du dépôt privé quand l'appareil est configuré.

## Détection de la classe

Créneau en cours = de **15 minutes avant le début à 10 minutes après la fin** (bornes comprises), heure de `fuseau`, hors congés.
Deux cours qui se suivent : un cours **en cours** l'emporte toujours ; la classe suivante n'est détectée qu'à la fin du premier
(jamais 15 min avant). La page ne se recharge jamais pendant qu'un écran de vote est ouvert.
Sinon : « Hors créneau », prochaine séance (jour, heure, local) ; la classe proposée est celle de la prochaine séance du jour si
elle commence dans l'heure, sinon la classe mémorisée.
Changer la classe ici change la classe active des onglets du cours ouverts sur la tablette : ils l'affichent (avis noir et blanc).
Le sélecteur de classe reste toujours disponible ; un choix manuel prime jusqu'à la fermeture de l'onglet.
Aide aux essais : `?maintenant=2026-10-15T10:00+02:00` simule l'heure, `?classe=5TTy` force la classe.

## Règles de tirage de l'échauffement

Trois éléments, tirés de façon reproductible (graine = classe + jour + n° de tirage ; « Tirer à nouveau » change le n°).
Banque : `classe.json` (P2), questions `usage: echauffement`, par rôle.

1. **`precedent`** : QCM de rôle `precedent` dont `sur` fait partie de la matière de la dernière séance (éléments marqués ce
   jour-là et leurs sections parentes ; à défaut, de tout ce que la classe a déjà vu dans ce cours).
2. **`prerequis`** : QCM de rôle `prerequis` de l'UAA en cours. Une fois sur deux (si le dernier échauffement n'en comptait
   pas), il est remplacé par un **exercice d'algèbre** (P2) d'un sous-type du niveau de la classe, variante jamais posée si possible.
3. **`espace`** : QCM de rôle `espace` des **autres** UAA déjà vues par la classe (au moins un ✓ dans cette UAA), banques
   chargées d'après `classes[].cours`.

Poids : `1 / (1 + nombre de fois posée)²` ; ×0,05 si posée au dernier échauffement. Un élément **« à reprendre »** (dernier
niveau noté = « peu ») ignore le malus de fois posée et pèse **×4** (×1 s'il était au dernier échauffement). Éléments
distincts. Si un rôle n'a rien à proposer (rien vu, début de chapitre), on complète avec d'autres prérequis ; si la banque
est trop pauvre, la carte est plus courte et une note l'indique. « ↻ Remplacer » change un élément sans toucher aux autres
et ne le remplace jamais par un élément déjà montré à cet emplacement. « Tout retirer » masque l'échauffement.
« Lancer » appelle `typwebProf.vote.start({ mode: "echauffement", items, titre, classe })`.

## Journal de classe et devoirs

Journal (3 lignes, sans date ni jour, modifiable, « Régénérer », « Copier le journal ») :

```
Échauffement : 3 QCM            (+ « + 1 exercice » le cas échéant ; « aucun » sans échauffement du jour)
Matière : de « … » à « … »      (sections ; début = point d'arrêt d'avant la séance, sinon première section du cours ; arrivée = dernier ✓ du jour)
Exercices : 1.1, 1.4            (numéros des exercices cochés aujourd'hui)
```

Devoirs : champ **séparé**, bouton « Copier les devoirs » propre. Exercices étiquetés `maison` situés, dans l'ordre du cours,
entre le point d'arrêt de début (exclu) et le dernier élément marqué (inclus). Dans les chapitres où les exercices sont
regroupés en fin de chapitre (cas de Limites, chapitres 2 à 4), rien n'est « dans » la matière : le champ reste vide et un
bouton propose les exercices `maison` du chapitre (à adapter). Les brouillons modifiés à la main sont gardés par classe et par
jour (`pilotage.brouillon.*`, stockage local).

## Fonctions d'état utilisées (`window.typwebProf`)

Tout passe par `js/etat.js` : `evenements`, `classe`, `fixerClasse`, `marquer` (point d'arrêt manuel : `vu` sur le dernier élément
marquable de la section choisie), `abonner`, `exporter`, `importer`, `definirClasses`, `vote.start`, `vote.ajouterBanque`.
**Ajoutées en P4, rétrocompatibles** (documentées dans `typweb/doc/couche-prof.md`) : `exporter()`, `importer()`,
`definirClasses()` dans `prof.js` ; `vote.ajouterBanque()` dans `vote.js`. Sans couche prof (hors ligne, première visite) :
le journal brut est lu en lecture seule, les boutons d'écriture sont inactifs.
« Exporter l'état » télécharge `etat-pilotage-AAAA-MM-JJ.json` (même format que « Exporter les marques ») ; « Importer » fusionne
sans doublon ni perte.

## Synchronisation avec le dépôt privé (P5)

Sauvegarde et historique de l'état dans le dépôt privé `suivi-classes`, sans serveur (API REST de GitHub, jeton « fine-grained »
limité à ce dépôt). **Rien n'est actif tant qu'aucun jeton n'est configuré sur l'appareil.** Mise en place :
`typweb/doc/mise-en-place-depot.md` ; fonctionnement détaillé : `typweb/doc/couche-prof.md` (« Synchronisation »).

- **Pastille d'état** (bandeau, toujours visible) : « Synchro : Synchronisé », « À synchroniser (n) », « Hors ligne · n en
  attente », « Erreur : … », « Jeton verrouillé », « non configurée ». Un clic ouvre les Réglages : détail (dépôt, appareil, file, lots
  connus, dernier envoi, dernière erreur et prochain essai), « Synchroniser maintenant », « Restaurer depuis le dépôt » (fusionne tous
  les lots, avec compte rendu : événements, classes, dates), « Envoyer la configuration du site vers le dépôt ».
- **Configuration de l'appareil** : jeton (champ masqué, jamais dans l'adresse), dépôt (`compte/suivi-classes`), nom de l'appareil
  (libre : « tablette »), « Tester la connexion » (dépôt accessible et privé, droit d'écriture, jeton limité à ce seul dépôt, jeton
  « classique » refusé), « Enregistrer et activer » (n'enregistre que si le test réussit, vide le champ du jeton, active le mode prof
  sur l'appareil), chiffrement facultatif du jeton par phrase secrète, « Oublier ce jeton ».
- **Quand ça part** : toutes les 5 minutes si connecté, au retour du réseau, quand la page est masquée, à la fin du créneau de la classe
  (fin de séance), à la demande. Les échecs sont repris avec un délai croissant ; l'usage en classe n'attend jamais le réseau.
- **Configuration** (`config/pilotage.json` du dépôt) : lue au démarrage ; si elle est valide elle l'emporte sur `config.json` du site
  (modifier l'horaire depuis le PC = éditer ce fichier dans le dépôt). Hors ligne, la dernière copie gardée sur la tablette sert.
- **Export / import** (« Exporter l'état », « Importer ») : conservés comme dernier recours. Un import alimente la file de synchronisation
  (sans doublon).
- **Clé de synchronisation** (navigateur qui efface ses données, Brave « effacer à la fermeture ») : Réglages → « Enregistrer la clé
  dans un fichier… » produit `cle-pilotage-<appareil>.json` : dépôt, nom d'appareil et jeton **chiffré par une phrase secrète**
  (PBKDF2-SHA256 250 000 tours, AES-GCM ; le dépôt sert de données associées). Le jeton n'y est jamais en clair ; la phrase n'est
  gardée nulle part. Quand la synchronisation est inactive, la vue classe affiche « Synchronisation inactive sur ce navigateur ·
  Charger ma clé… » : fichier, phrase, nom de l'appareil (modifiable), puis la page se reconnecte, active le mode prof, **restaure
  l'état des classes depuis le dépôt** et synchronise. Garder la clé hors de tout dépôt et dossier publié (clé USB, Documents).
  Le bandeau se masque (✕) ; il revient de lui-même si le navigateur efface encore tout.
- **Conservation des données** : la page demande au navigateur un stockage persistant (`navigator.storage.persist`) dès que la
  synchronisation est configurée ; sous Brave, Réglages › Cet appareil indique quel site ajouter aux exceptions.
- **Fichiers** : `js/sync.js` (copie **identique** de `typweb/site/js/sync.js`, à recopier si celui-ci change : un test le vérifie),
  `js/synchro-ui.js` (interface), `js/cle-ui.js` (clé), `js/reglages.js` (vues et « Cet appareil »), `js/theme.js` (apparence).
  `sw.js` (version `pilotage-v4`) les garde pour le hors ligne.

## Naviguer dans le temps (jour affiché)

Par défaut la page montre **aujourd'hui**. Dans le bandeau, des flèches rondes de part et d'autre de la date passent au jour
précédent / suivant ; un clic sur la date ouvre le calendrier natif (champ date caché + `showPicker()`, repli focus/clic) ;
les touches ← et → font de même (ignorées dans les champs de saisie, les réglages et les feuilles ouvertes). Hors aujourd'hui,
une pastille « ↩ Aujourd'hui · il y a N j » (ou « dans N j ») ramène au jour même ; le bloc temps réel (heure, « dans X min »)
est masqué. Le bandeau ne grandit pas : aucune barre en plus. Un bouton **Accueil** (`../board/index.html`) est en tête des outils.

- **Adresse** : `…/pilotage/?jour=AAAA-MM-JJ` ; `?maintenant=` et `?classe=` sont conservés ; sans paramètre (ou si le jour
  est celui d'aujourd'hui, ou invalide) = aujourd'hui. Sans `?classe=`, une adresse avec `?jour=` choisit la classe qui a cours ce jour-là.
- **Jour passé** (lecture seule) : tout est « fait » ; le journal et les devoirs sont reconstitués avec la règle de `ev.js`
  (dernier événement par élément, ordre `(t, appareil, id)`) **arrêtée à la fin de ce jour-là** (`journal.finDeJour`, paramètre
  `jusque`) ; point d'arrêt = celui de la fin de ce jour ; échauffement = celui enregistré ce jour-là ; aucune écriture
  (champs en lecture seule, boutons désactivés, « Reprendre ici » masqué).
- **Jour à venir** : séance prévue (local, horaire), interros prévues (« J−n » compté depuis le jour affiché), rien de « fait »
  (journal et devoirs vides, échauffement non tiré).
- **Jour sans cours** : message avec les boutons vers le jour de cours précédent et suivant de la classe (congés exclus).
- **Cas limites** : les jours sont des dates de calendrier (`AAAA-MM-JJ`) : le passage à l'heure d'hiver (dimanche 25/10/2026, jour de
  25 h) ne saute ni ne double aucun jour, et la fin de ce jour est 25 h après son début. Une séance à cheval sur minuit est
  coupée au jour local de chaque marque. Un lot de synchronisation arrivé en retard est fusionné dans le journal : l'affichage d'un
  jour passé est recalculé (sauf texte modifié à la main, conservé). Si minuit passe pendant que la page est ouverte sur
  « aujourd'hui », elle suit le nouveau jour.
- Fichiers : `js/jour.js` (URL, écarts, pastille ; pur), `horaire.seancesDuJour` / `jourDeCours`, `journal.finDeJour`. Le format du
  journal et `sync.js` ne sont pas touchés.

## Hors ligne

`sw.js` (service worker, portée `/pilotage/`) garde la page, `config.json`, et tout fichier du même domaine déjà lu (`prof.js`,
`vote*.js`, `index.json`, `classe.json`) : réseau d'abord (4 s), sinon copie. `js/donnees.js` garde en plus une copie des
`index.json` et `classe.json` (Cache API) : si le service worker manque, les données restent lisibles. Indicateur discret
« hors ligne » ; jamais d'erreur bloquante. Première visite : ouvrir la page une fois avec une connexion.

## Lecture des cartes (P7) : `scan.html`

Page pour le **smartphone** (`<compte>.github.io/pilotage/scan.html`, icône « Scanner » du bandeau) : caméra,
détection ArUco (`js/lecteur-aruco.js`), une carte est retenue quand la même lettre est lue sur trois images de suite.
Champ « Élèves présents » (gardé pour la journée) : le bilan affiche « n cartes lues sur P présents ».
« Afficher le QR » : QR des votes et des présents (`js/qr-code.js`, `js/qr-votes.js`, format `TWV2`) et le même code en clair
dessous (`P22 3A 12C`). Sur la tablette : écran de vote → « Par carte » → « Lire le QR » ; échauffement → zone « Cartes » →
« Lire le QR » (ou « Taper un code »). Rien n'est envoyé ; aucun nom.
`js/lecteur-aruco.js`, `js/qr-code.js`, `js/qr-votes.js` et `js/sync.js` sont des copies de typweb (identiques :
`typweb/outils/verifier_copies.py`).

## Point d'arrêt

« Reprendre ici » et le « de … à … » du journal suivent l'élément vu **le plus avancé** dans le cours (ordre de `index.json`),
pas le dernier touché. « Point d'arrêt ici » sur une section antérieure retire, après confirmation, les ✓ situés plus loin.

## Avis

Sous le bandeau : les données indisponibles (banque, index) et une couche prof de cours trop ancienne (cours à reconstruire et
publier) sont signalées au lieu d'être ignorées.

## Modules à venir

`Pilotage.enregistrerModule({ id, rendre(conteneur, contexte) })` ajoute un module ; la carte « Modules » n'apparaît que s'il y en a un.

## Tests

```bash
node --test tests/unit.test.js                 # logique pure (config, horaire, tirage, journal, devoirs, façade)
python3 -m unittest tests/test_synchro.py -v   # synchronisation (P5) : vraie page + faux serveur GitHub (typweb/tests/fake-github.js ; Node requis)
python3 -m unittest tests/test_pilotage.py -v  # navigateur (Playwright, Chromium) : vraie couche prof, hors ligne, import/export, présentation (vues, jour/soir, contraste, un écran)
# typweb est cherché dans ../cours/typweb puis ../2026-2027/typweb ; sinon TYPWEB_JS=… et FAKE_GITHUB=…
python3 tests/captures_pilotage.py [DOSSIER]   # captures tablette (paysage, portrait), smartphone, jour et soir, réglages, clé
node tests/fixtures/generer.js                 # régénère les fixtures (index.json / classe.json fictifs)
```

Fixtures : structure fidèle au vrai `index.json` de Limites (4 chapitres, 44 exercices dont 18 `maison`, exercices regroupés
en fin de chapitre 2 à 4) ; titres d'encadrés, énoncés et questions inventés pour les tests.
