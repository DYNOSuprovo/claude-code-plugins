# Pourquoi l'issue 139 existe

## Le problème en une phrase

Aucun test automatique ne regarde ce que la page de vellum affiche. Un défaut visible à l'écran passe donc toutes les gates, et seul un humain ou un agent qui ouvre un navigateur le trouve.

## Ce que les tests voient aujourd'hui

La page que tu lis en ce moment a deux couches.

| Couche | Exemple | Testée ? |
|---|---|---|
| Le calcul | « sous 900px de large, le panneau doit être replié » : `commentsOpen` vaut `false` | oui, par `bun test` (`state.spec.ts`) |
| L'écran | le panneau est replié, on ne peut plus tabuler dedans, il ne cache pas le plan | non, aucun test |

Un test peut vérifier que le calcul dit « replié ». Aucun test ne vérifie que l'écran l'est.

## Deux cas réels

### 1. PR #125, le panneau de commentaires repliable

Toutes les gates étaient vertes. Ensuite, un agent a ouvert la page dans un navigateur et a trouvé des défauts. Trois exemples, lus dans les commits de correction :

- Le panneau est replié, mais la touche Tab atteint encore le bouton Delete et la zone de texte cachés. Un lecteur d'écran lit encore le panneau.
- Les éléments du panneau sont plus larges de 1px que leur boîte.
- Après un repli, la bulle de commentaire reste sous un autre texte que celui qu'elle cite.

Aucune gate ne pouvait voir ces défauts.

### 2. Une ligne que personne ne surveille

`app.tsx` appelle `readWindow()` avant le premier affichage. Cet appel lit la largeur de la fenêtre et replie le panneau sous 900px. Sans cette ligne, toutes les gates restent vertes. Les deux captures sont prises à 800px de large, dans le même navigateur :

- [capture-800px-aujourdhui.png](capture-800px-aujourdhui.png) : le code actuel. Le panneau est replié, et seule sa poignée dépasse à droite.
- [capture-800px-sans-readWindow.png](capture-800px-sans-readWindow.png) : la ligne en moins. Le panneau s'ouvre sur 310px et cache le texte du plan.

Sans cette ligne, un second effet existe, lu dans le code mais non mesuré : les diagrammes Mermaid et les maquettes HTML restent en couleurs claires sur une page sombre.

## Ce que l'issue demande

Elle demande de choisir comment la page obtient des tests qui regardent l'écran. Trois familles d'outils existent, et chacune voit une partie différente.

| Outil | Voit le calcul | Voit le contenu de la page (attributs, focus) | Voit les tailles et les positions |
|---|---|---|---|
| Tests actuels, sans DOM | oui | non | non |
| happy-dom : un faux navigateur en mémoire | oui | oui | non |
| Playwright : un vrai Chrome piloté par le test | oui | oui | oui |

Chaque défaut ci-dessus, avec les outils qui l'attrapent :

- Tab atteint un panneau replié : happy-dom ou Playwright.
- Les éléments sont plus larges de 1px, la bulle est mal placée, le panneau cache le plan : Playwright seulement.

## Ce qu'on a mesuré aujourd'hui, dans une copie jetable

- Playwright lance Chrome depuis `bun test`. Un test à 800px et un test à 1400px passent en 1,44 s. Sans `readWindow()`, le test à 800px échoue et donne la largeur du panneau, 310px.
- happy-dom affiche le panneau et bloque le focus dans un panneau `inert`. Chargé pour toutes les suites, comme le conseille Bun, il fait échouer 45 tests du serveur. Il ne voit aucune taille.

## Ce qui est déjà décidé

- Q1 : couvrir les trois classes, c'est-à-dire le comportement, la géométrie et le démarrage.
- Q2 : la dépendance vit dans `vellum/package.json`.
- Q3 : on retire le renvoi à « l'échelle », qui n'existe pas.
- Q4 : on prend Playwright seul.

## Les deux questions qui restent, en clair

**Quand le test navigateur tourne-t-il ?**
- Option A : avec les autres tests (`bun test`), donc avant chaque push et en CI. La machine doit avoir Chrome ou Chromium, sinon `bun test` échoue.
- Option B : à part, en CI seulement ou à la demande. Un push ne dépend pas de Chrome, mais un défaut n'apparaît qu'en CI.

**Qu'est-ce que ce changement livre ?**
- Option A : la décision écrite, plus une issue de suivi. Aucun code.
- Option B : la décision, Playwright installé, et le test des deux captures. Les autres scénarios vont dans l'issue de suivi.
