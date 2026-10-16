# Flash Maths

Web app (PWA) de flash cards de maths pour un·e lycéen·ne (1ère générale + révisions de Seconde), installée sur iPhone via « Sur l'écran d'accueil ». Aucun serveur : la progression reste dans le `localStorage` de l'iPhone.

- `cards.js` : chapitres et cartes (QCM à 4 choix, une ou plusieurs bonnes réponses, formules LaTeX entre `$...$`).
- `app.js` : écrans, répétition espacée, XP/séries/badges, paramètres. `style.css`, `sw.js` (hors-ligne), `manifest.webmanifest`, `icons/`.
- Test local : `python3 -m http.server 8765` dans ce dossier.

## Ajouter des cartes (circuit convenu avec l'utilisateur)

1. L'utilisateur indique le sujet, le chapitre et l'année.
2. Proposer les cartes **une par une ou par petit lot** et **demander à chaque fois s'il faut les ajouter** avant d'écrire quoi que ce soit.
3. Une carte par définition ou théorème, **dans les deux sens** (ex. 3 identités remarquables → 6 cartes).
4. Toujours 4 choix ; renseigner la notion (`n`) et une courte explication (`e`).
5. Ajouter avec un **id neuf** ; ne jamais renommer ni réutiliser l'id d'une carte existante (la progression y est attachée).
6. Republier ; l'appli de l'élève affiche « nouvelles cartes » au prochain lancement et garde sa progression.

## Règles de révision (paramétrables dans l'appli)

Paliers par défaut 1, 1, 3, 7, 15, 30, 90 jours. Bonne réponse : +1 palier. Erreur : retour au 1er palier. Bonne réponse juste après une erreur : +2 paliers.
