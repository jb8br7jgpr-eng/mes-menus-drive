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
