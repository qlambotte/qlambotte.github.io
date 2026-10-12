# Rapport de validation P4 — page de pilotage de classe

## Résultat

| Contrôle | Résultat |
|---|---|
| Tests unitaires (`node --test tests/unit.test.js`) | 38 / 38 |
| Tests navigateur (`python3 -m unittest tests/test_pilotage.py`, Chromium, vraies `prof.js` et `vote*.js` patchées) | 39 / 39 |
| Captures tablette 1180×820 et portrait 820×1180 | `captures/` : créneau / hors créneau × avec / sans point d'arrêt, aperçu « autre endroit », 6TTi |
| Cours utilisé | Limites (5UAA3), classe simulée 5TTy ; 6TTi avec 6UAA4 (données de test) |

Couvert : détection pour chacun des 4 créneaux aux bornes (−16 / −15 / début / fin / +10 / +11 min), hors créneau, week-end, congé
(jour et période), passage à l'heure d'hiver (26/10/2026), fuseau indépendant de la machine ; tirage reproductible (graine) pour
rien de vu, début de chapitre, après plusieurs séances, « à reprendre » (≥ 3× plus fréquent), ↻, alternance de l'exercice, niveau 5e/6e,
banque pauvre ; journal (3 lignes, pluriels, aucun échauffement, aucune marque, annulation, revisite, isolation classe/cours) ;
devoirs (exercices dans les sections, exercices groupés en fin de chapitre, format réglable) ; copie du journal et des devoirs séparées
(presse-papiers) ; brouillons persistants ; interros (compte à rebours, passées et autres classes exclues) ; hors ligne (service worker,
puis sans service worker avec copies Cache API/localStorage, puis donnée jamais consultée) ; export/import (restauration, fusion, aucun
doublon, fichiers invalides, événements mal formés, uniquement des champs du schéma) ; configuration invalide (messages) ; clavier
(Tab atteint les actions) ; texte ≥ 16 px, aucun gris de texte clair ; ajouts à `prof.js`/`vote.js` ; classes et effectifs de la page
prioritaires sur `prof-config.json` du site (qui garde ses anciennes classes sans conséquence).

## Écarts et points non vérifiés (à lire)

1. **Données : fixtures, pas le vrai site.** Aucun site Limites construit ici (typst et quarto absents). La structure du vrai
   `index.json` (189 éléments) a été lue par résumé : 4 chapitres, 44 exercices, 18 `maison`, exercices regroupés en fin de
   chapitre 2 à 4 ; les fixtures la reproduisent. Les titres d'encadrés et la banque de classe (14 QCM, dont 8 d'échauffement) sont inventés.
   La vraie banque de Limites compte 8 QCM (rapport P3) : si aucun n'a `usage: echauffement`, la carte Échauffement sera vide
   (message explicite) jusqu'à P6.
2. **Devoirs et exercices regroupés.** Dans les chapitres 2 à 4 de Limites, les exercices sont dans une section « Exercices » finale,
   donc jamais « dans la matière vue » : le champ Devoirs reste vide et un bouton propose les exercices `maison` du chapitre. Une
   règle plus fine demanderait un lien exercice → section de cours (champ à ajouter côté P0). À décider.
3. **Titres d'exercices.** `index.json` ne donne que « Exercice 2.1 » : format par défaut `Exercice {num}` (le « : <titre> » n'apparaît
   que si un titre descriptif existe).
4. **Formules.** Les énoncés de la carte Échauffement sont un aperçu en texte (MathJax non chargé sur cette page) ; l'écran de vote, lui,
   compose les formules comme en P3.
5. **Non exécuté** : `typweb portail` (le patch de `moteur/portail.py` est vérifié par compilation et par un test isolé de la liste
   de ressources, pas de bout en bout) ; la publication Quarto de `pilotage/` (`resources:`) ; tout test sur une vraie tablette (tactile,
   plein écran, écran allumé) ; le service worker sur GitHub Pages (HTTPS, portée `/pilotage/`).
6. **Reconstruction des cours.** Nécessaire une seule fois pour embarquer le `prof.js`/`vote.js` à jour (4 fonctions ajoutées), pas à chaque
   changement de classe. Avant cette reconstruction, la page charge l'ancien `prof.js` du site : `definirClasses` manque et l'écriture/
   l'import sont inactifs.
7. **Aucun commit.** Cette session n'a pas de shell sur ta machine : fichiers déposés dans tes dossiers, commits à faire (messages dans la réponse).
8. Les effectifs de `config.json` (20) sont provisoires. `6TTi` n'a pas de cours configuré (adresse du site de 6e inconnue).
9. Les congés et interros de `config.json` sont vides (rien d'inventé).

## Fichiers modifiés hors `pilotage/`

`typweb/site/js/prof.js` (`exporter`, `importer`, `definirClasses`), `typweb/site/js/vote.js` (`vote.ajouterBanque`),
`typweb/doc/couche-prof.md`, `typweb/moteur/portail.py` (`[pilotage]`), `portail/portail.toml` (`[pilotage]`).
