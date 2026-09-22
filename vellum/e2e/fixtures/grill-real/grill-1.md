# Grill: Issue #139 : quelle couverture de rendu pour la page de vellum (rien de plus, vues pures sans DOM, happy-dom, ou vrai navigateur), et où s'arrête chaque outil

Started 2026-09-21 14:52 · session 4cbe3fc8

## Round 1

### Claude

❓ **Q1** - **Classes à couvrir**: Quelles classes de défauts une vérification automatique doit-elle attraper ? (1) Le comportement des composants à hooks : focus, `inert`, transitions d'état. (2) La géométrie et le CSS : débordement, largeur du panneau, position d'un popover après un reflow. (3) Le démarrage de `app.tsx` : `readWindow()` avant le premier rendu.

➡️ Je recommande les trois. J'ai lu six défauts nommés dans les commits de correction de #125 : quatre relèvent de la géométrie, deux du comportement. Aujourd'hui, seul un contrôle en direct à 800px tient l'appel à `readWindow()`. Couvrir la classe 1 seule laisse la majorité des défauts connus à une revue faite à la main. Le choix d'outil viendra au tour suivant, une fois mesurés Playwright et happy-dom sous `bun test` : deux agents les mesurent en ce moment.

---

❓ **Q2** - **Où vit une dépendance de test**: Si une dépendance de test entre (happy-dom ou Playwright), où la déclarer : dans les `devDependencies` du `package.json` racine, ou dans `vellum/package.json` ?

➡️ Je recommande la racine. `vellum/package.json` part avec le plugin, et un `bun install` tourne dans le cache du plugin chez chaque utilisateur. Je n'ai pas mesuré si ce `bun install` exclut les devDependencies. La racine porte déjà les outils de dev (`oxlint`, `tsgo`, `@types/bun`). Le prix : une suite de `vellum/` résout un paquet hors du dossier du plugin. `src/standalone.spec.ts` ne sert que la page, donc ce prix ne touche pas le plugin installé.

---

❓ **Q3** - **L'échelle introuvable**: `vellum/AGENTS.md` exige qu'une nouvelle dépendance passe d'abord par « l'échelle » (ladder) du `AGENTS.md` racine. Cette échelle n'y a jamais existé : `git log -S ladder -- AGENTS.md` ne renvoie rien. Que fait-on ?

➡️ Je recommande de l'écrire dans le `AGENTS.md` racine, dans ce changement, en une ligne : le projet, la bibliothèque standard, la plateforme, les dépendances installées, puis seulement une nouvelle dépendance. Cette issue est la première à ajouter peut-être une dépendance, donc la première à suivre cette échelle. Ta version existe dans tes instructions globales privées, mais un agent Codex ou un autre contributeur ne les lit pas. L'autre option : retirer le renvoi, et ouvrir un TODO.

---

Le tour 1 est posé sur la page (Q1 à Q3). Deux mesures tournent en fond.

### Reviewer

Q1: As recommended.

Q2: Je pense que au contraire ça doit faire partie du plugin lui-même. Aujourd'hui j'ai commencé  développer ce plugin dans ce monorepo qui contient d'autres plugins qui en fin de compte ne sont plus ou moins que des scripts avec des skills. Mais l c'est la première fois que je fais un plugin qui utilise vraiment l'API interne de Cloud Code Docs et ça commence  être un projet  part entière et d'ailleurs on voit bien sur l'historique le plugin est en train de prendre énormément de place. A mon avis le plugin doit être un peu isolé de la code base et je vais probablement migrer ce plugin en dehors de la code base tout en gardant évidemment toute la configuration du plugin, les linter, les type checkers et tout ce qui va avec. Mais bon ça c'est l'étape d'après. Donc  mon avis la dépendance elle doit vivre dansle package JSON du plugin lui-même.

Q3: Et bien justement, il faut oublier ces vieilles règles de merde parce que justement c'est du slop qui a été fait par d'autres agents avant toi et du coup qui met des bâtons dans les roues à tous les agents Et en fait le truc c'est que je me rends compte que ces règles de merde que je n'ai jamais validées ont un impact et du coup de plus en plus d'agents voient des règles et du coup partent du principe que c'est une bible qui a été écrite par un humain alors que non, ça a été du slop généré par d'autres agents avant toi Et ça c'est pas bon Nous on veut pouvoir itérer rapidement sans forcément avoir des contraintes de ce type que je trouve ridiculeD'ailleurs ça rejoint le fait que je pense que Velum doit devenir un repo a priori et à part entière.

## Round 2

### Claude

❓ **Q4** - **Playwright seul, ou avec happy-dom**: Q1 impose Playwright, car seul un vrai navigateur voit la géométrie. Faut-il ajouter happy-dom pour les tests de comportement, plus rapides, ou Playwright suffit-il pour les trois classes ?

➡️ Je recommande Playwright seul. Mesuré : sous `bun test`, deux tests Playwright passent en 1,44 s. Sans l'appel à `readWindow()`, celui à 800px échoue : panneau de 310px, sans `inert`. Playwright voit aussi le focus et `inert`, donc happy-dom n'ajouterait aucune classe. Il ajouterait en revanche quatre coûts mesurés. Préchargé comme Bun le recommande, il fait échouer 45 tests serveur, car son `fetch` refuse les requêtes. Il faut donc l'enregistrer suite par suite. `freshStore` n'atteint pas le store des composants, donc chaque suite DOM doit le remettre à zéro elle-même. Enfin, un port oublié ne plante plus : `matchMedia` répond `false` en silence. C'est la question dont je suis le moins sûr. Je n'ai mesuré que deux tests Playwright, à environ 0,5 s chacun. Avec trente scénarios, le coût n'est pas mesuré.

---

❓ **Q5** - **Où tourne la suite navigateur**: La suite navigateur est-elle un `*.spec.ts` ordinaire, lancé par `bun test vellum`, donc en pre-push et en CI ? Ou une gate séparée, lancée à la demande ou en CI seulement ?

➡️ Je recommande un `*.spec.ts` ordinaire. Le pre-commit ne lance déjà pas `bun test`, donc les commits ne ralentissent pas. Il n'y a pas de nouvelle gate à câbler dans `scripts/run-gates.ts` ni en CI. Le prix : sans Chrome ni Chromium sur le poste, `bun test` échoue. Le runner `ubuntu-latest` fournit Google Chrome 152, d'après la doc des runner-images. Ton poste a Chromium 152, et `channel: "chrome"` s'y lance. Sans décision contraire, je prends le navigateur du système (`channel: "chrome"`) plutôt que les 318 MB du Chromium de Playwright.

---

❓ **Q6** - **Ce que livre ce changement**: L'issue exclut d'écrire les tests. Ce changement livre-t-il seulement la décision (dans `tests.md`, plus une issue de suivi) ? Ou aussi la dépendance, l'outillage de la suite, et le premier test, celui qui tient `readWindow()` à 800px ?

➡️ Je recommande la décision, la dépendance, l'outillage et ce seul test. Une règle qui décrit un outil absent du dépôt est une règle que personne n'a vérifiée, exactement ce que tu reproches aux anciennes règles. Ce test est déjà écrit et mesuré dans le spike : le serveur démarre, le panneau est vérifié à 800px et à 1400px. Il tient aussi le seul point qu'aucune suite ne tient aujourd'hui. Les scénarios des défauts de #125 (focus, débordement de 1px, composer après un reflow) vont dans l'issue de suivi.

---

Le tour 2 est posé sur la page, avec Q4 à Q6.

### Reviewer

Q4: As recommended.

Q5: As recommended, by default.

Q6: As recommended, by default.

Note: Plus concrètemen j'aimerais que tu me dises simplemen à la limite t'as le droit de créer un artefac pour m'expliquer pourquoi l'issue existe et quel est le problème elle soulign parce que là ça reste trop abstrai encore une fois tu me poses plein de questions et tu pars du principe que je comprends tou mais j'ai pas assez de contexte pour trancher et répondre à tes questions.

## Round 3

### Claude

❓ **Q7** - **Quand le test navigateur tourne (Q5 reformulée)**: Contexte : `pourquoi-issue-139.md`, section « Les deux questions qui restent ». Le test navigateur tourne-t-il avec les autres tests (`bun test`, donc avant chaque push et en CI), ou à part (en CI seulement, ou à la demande) ?

➡️ Je recommande de le lancer avec les autres tests. Il coûte 1,44 s aujourd'hui, et le pre-commit ne lance pas `bun test`, donc les commits ne ralentissent pas. Un défaut apparaît ainsi avant le push, pas seulement en CI. Le prix : il faut Chrome ou Chromium sur la machine. Ta machine et le runner GitHub en ont un.

---

❓ **Q8** - **Ce que livre ce changement (Q6 reformulée)**: Ce changement livre-t-il seulement la décision écrite et une issue de suivi, sans code ? Ou aussi Playwright installé et le test des deux captures (panneau replié à 800px, ouvert à 1400px) ?

➡️ Je recommande de livrer aussi Playwright et ce test. Une règle qui décrit un outil absent du dépôt n'est vérifiée par personne. Ce test tient la ligne `readWindow()`, qu'aucune gate ne tient aujourd'hui. Les scénarios de #125 (Tab dans le panneau replié, 1px, bulle mal placée) vont dans l'issue de suivi.

---

J'ai ajouté l'explication `pourquoi-issue-139.md` sur ta page, avec deux captures à 800px de large. Q5 et Q6 reviennent en clair sous les numéros Q7 et Q8.

### Reviewer

Q7: As recommended, by default.

Q8: As recommended, by default.

---

Closed 2026-09-21 15:12 · page
