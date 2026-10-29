# Sauvegarde externe Speedrive V34 — non activée

L'objectif est une **copie chiffrée et privée distincte de Firebase**, restaurable
même si le projet Firebase est indisponible ou supprimé.

## Ce qui est déjà préparé (sur branche de développement)

- `v34-backup-archive.mjs` : assemble et vérifie une photographie Firestore,
  les recettes, produits, semaines, photos et checksums SHA-256, puis chiffre
  le tout avec **AES-256-GCM** et le compresse.
- `export-firestore.mjs` : collecteur de dernière révision confirmée
  via un compte serveur Firebase en lecture, vérifie l'archive chiffrée par
  déchiffrement local, puis l'écrit dans un répertoire privé.
- `v34-backup-archive.test.mjs` : tests de déchiffrement, clés incorrectes,
  corruption de données et photos manquantes.

## Activation future : prérequis indispensables

1. Créer **un dépôt GitHub privé séparé** ou autre destination privée
   dédiée aux copies (jamais le dépôt public `mes-menus-drive`).
2. Configurer dans ce dépôt privé un workflow planifié quotidien et
   ses autorisations minimales, avec stockage privé des archives.
3. Fournir au workflow **une identité Firebase en lecture seule** :
   idéalement Workload Identity Federation / OIDC, sans clé permanente ;
   si un secret de service est nécessaire, il doit être dans les
   paramètres chiffrés de GitHub Actions, jamais dans ChatGPT ou le code.
4. Configurer une clé de chiffrement aléatoire AES-256 **différente** des
   identifiants Firebase, conserver une copie sécurisée indépendante de
   GitHub et prévoir un moyen de la retrouver (sans la publier).
5. Définir une conservation **au moins 30 jours**, avec un contrôle
   automatique du dernier export et une alerte si la tâche échoue.
6. Effectuer une **restauration réelle de test**, sur environnement de
   test, à partir d'une archive historique ; vérifier recettes,
   photos, liens produits, menus, cases cochées.
7. Confirmer que le flux planifié, l'archivage privé et sa rétention
   restent dans les quotas gratuits des fournisseurs. Toute
   facturation éventuelle exige un accord explicite préalable.

## Contraintes de sécurité

- Les archives restent chiffrées, y compris lorsqu'elles sont stockées
  dans un dépôt privé. Les fichiers sont inutilisables sans la clé AES.
- Ne jamais placer d'archive, de mot de passe ou de clé Firebase dans
  `mes-menus-drive`, GitHub Pages, les issues, les journaux Actions.
- Un export Firestore snapshot `head/current` n'est valide qu'après
  le contrôle du nombre de blocs, du hash JSON et de toutes les photos.
- Le collecteur ne modifie jamais Firebase ; l'opération de restauration
  sera **séparée**, confirmée manuellement et testée.
- Un ancien snapshot dans Firebase seul ne constitue pas une sauvegarde
  indépendante.
- Le code est préparatoire : **aucune tâche planifiée, dépôt privé de
  sauvegarde ou secret n'a été configuré**.

## Lancer les tests hors ligne

Sur un ordinateur de développement ou une CI Node 22+ :

```bash
node --test firebase/v34-session-core.test.mjs
node --test firebase/backup/v34-backup-archive.test.mjs
```

Ces tests ne requièrent aucune connexion à Firebase.

## Nouveaux outils disponibles dans la branche V34

- `v34-restore.mjs` : contrôle d'une archive chiffrée et plan de restauration
  des recettes, produits, menus et photos. Les écritures sont **strictement
  interdites hors d'un émulateur Firestore local avec autorisation explicite**.
- `restore-emulator.mjs` : commande de restauration dans un environnement
  `demo-` isolé. Ne peut pas restaurer directement la production.
- `restore-smoke-emulator.mjs` : scénario de bout en bout sur données
  fictives ; réimport puis relecture des documents et des photos dans
  l'émulateur Firebase.
- `v34-retention-plan.mjs` : sélection en **lecture seule** des anciens
  snapshots éventuellement supprimables APRÈS sauvegarde externe validée ;
  conserve toujours les 60 plus récents (défaut), la version courante,
  celle sauvegardée, et les documents récents de moins de 14 jours.
  **Aucun nettoyage réel n'est automatisé**.
- `PRIVATE-REPO-WORKFLOW.template.yml` : modèle à copier plus tard
  dans un dépôt séparé **privé**. Plan quotidien, archive chiffrée,
  publication privée en pièce jointe d'une release, re-téléchargement
  et comparaison SHA-256, copie GitHub Actions à rétention 90 jours.
  Le modèle ne contient pas de secret et ne s'exécute pas dans le
  dépôt public Speedrive.

### Préparation depuis un iPhone

1. Sur GitHub, créer un **nouveau dépôt privé** (par exemple
   `speedrive-sauvegardes-privees`). Ne pas utiliser le dépôt public
   `mes-menus-drive` pour les archives.
2. Conserver le dépôt privé **vide pour l'instant**. Le workflow ne sera
   installé qu'après validation du code et des règles Firestore, ainsi
   que du stockage et des limites GitHub.
3. Les identifiants Firebase, la clé AES et l'identifiant du compte
   doivent être créés/configurés directement comme secrets du dépôt
   privé. Ne jamais les transmettre dans un chat ni les enregistrer
   dans un fichier public.
4. La clé AES-256 doit aussi être stockée dans un gestionnaire sécurisé
   indépendant : sans elle, les archives chiffrées sont inutilisables.
5. Tester une sauvegarde privée réelle puis une restauration complète
   en environnement isolé **avant** d'activer le fonctionnement V34.

Le modèle utilise une référence de code GitHub épinglée à un commit
révisé et NON une branche mouvante ; après chaque changement du code
de sauvegarde, ce commit doit être revu et repinné explicitement.

**État à cette date :** modèles et tests créés, mais **aucun dépôt de sauvegarde
privé ni tâche planifiée n'a été créé ou activé**. La première sauvegarde
réelle doit encore être effectuée et restaurée pour validation.
