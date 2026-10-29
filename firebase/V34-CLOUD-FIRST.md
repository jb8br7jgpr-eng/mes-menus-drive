# Speedrive V34 — architecture cloud-first à un seul compte

**Décision utilisateur le 29 octobre 2026 :** deux iPhone utilisent la même
application successivement. Aucun besoin de collaboration simultanée.
Une base Firebase fait foi ; la V33 ne doit jamais être écrasée par accident.

## Ce que l'utilisateur doit observer

1. Première connexion une seule fois sur chaque iPhone avec le **même compte**
   Firebase Auth e-mail / mot de passe. Session mémorisée sur appareil.
2. À chaque ouverture / reprise, le téléphone lit **depuis le serveur** la version
   publiée et vérifie l'intégrité des données et des photos.
3. Tant que ce chargement n'est pas confirmé, **aucune modification autorisée**.
   Si Firebase est inaccessible : afficher le cache local en lecture seule et
   un message « Connexion nécessaire pour modifier ».
4. Après chaque action utilisateur, conserver la modification comme brouillon
   local jusqu'à confirmation de l'écriture serveur (état « Enregistrement… »).
   L'état « Enregistré sur le serveur » n'est affiché **qu'après confirmation**.
5. Si une ancienne version tente d'enregistrer, refuser le remplacement et
   conserver le brouillon local pour comparaison, rechargement ou intervention.
6. En fermant l'application puis en l'ouvrant sur le second iPhone quelques
   minutes ou semaines plus tard : obtenir l'état exact **du dernier
   enregistrement confirmé** sans transfert de fichiers.
7. Pas d'écriture hors connexion, pas de promesse de synchronisation iOS
   en arrière-plan lorsque l'application est fermée.

## Implémentation de préparation

- `firebase/v34-auth.js` : compte unique, session persistante.
- `firebase/v34-cloud-codec.js` : format d'état complet, découpé en blocs
  de 360 Ko, hash SHA-256 et photos dédupliquées séparées.
- `firebase/v34-cloud-first.js` : chargement serveur explicite,
  photographie immuable et point d'entrée `head/current` avec
  numéro de révision contrôlé en transaction.
- `firebase/firestore-cloud-first.rules` : règles **candidates, non publiées**
  limitant l'accès au seul compte Firebase propriétaire.
- `firebase/v34-ui.js` : interface simplifiée, connexion **désactivée**
  tant que les tests et sauvegardes ne sont pas terminés.
- Ancien prototype à deux comptes et file hors ligne conservés sur la branche
  `firebase-v34-preparation`, non requis dans cette version.

### Préparation d'une sauvegarde cloud

1. Prendre une copie de l'état local V33, sans la modifier.
2. Séparer les photos, vérifier leur taille et calculer leurs empreintes.
3. Envoyer uniquement les photos inédites, puis la nouvelle photographie
   des recettes / produits / menus / courses en blocs immuables.
4. Mettre à jour `head/current` **uniquement si** la version serveur lue
   au début correspond toujours, par transaction Firestore.
5. Si la transaction échoue, l'ancienne version officielle reste intacte.
   Les blocs orphelins ne sont pas publiés.
6. Vérifier intégralement les blocs et photos avant d'installer sur l'iPhone
   le nouvel état téléchargé.

### Limites du prototype

- Jusqu'à 8 Mo de données JSON hors photos par photographie ; blocs
  de 360 Ko. Photo de recette jusqu'à environ 750 Ko, sinon compresser.
- **Historique des anciennes photographies stocké dans Firebase uniquement :
  ce n'est PAS une sauvegarde indépendante.** Les anciennes photographies et
  photos doivent faire l'objet d'une politique de rétention et de nettoyage
  seulement APRÈS installation d'une solution de sauvegarde externe vérifiée.
- Des photos identiques ne sont stockées qu'une fois, mais de nombreuses
  photos peuvent faire croître le quota de stockage gratuit.
- Garde-fou contre l'import initial sans vérification explicite. Le premier
  iPhone fournit la base de référence ; le deuxième la télécharge et ne doit
  jamais importer automatiquement son propre ancien contenu.
- Contrôle basique des nouveaux doublons EAN / nom normalisé. Avant
  déploiement : vérifier aussi les variantes d'appellations et les liens
  produit-ingrédient, et tester les suppressions.
- Les règles sont écrites, **non testées par l'émulateur Firebase**, et
  toujours **non publiées** sur le projet utilisateur.
- Le code cloud-first est isolé, pas encore branché aux écrans V33
  ni à `persist()`. Aucun enregistrement en ligne actif.

## Condition absolue avant mise en service

1. Sauvegarde chiffrée, automatique, indépendante de Firebase, à destination
   privée (jamais dans le dépôt GitHub Pages public). Historique et procédure
   de restauration testés. Une simple photo immuable Firestore ne suffit pas.
2. Tests émulateur des règles, import/restauration réels, perte réseau,
   concurrence, doublons, Safari/PWA et quotas des photos.
3. UI d'état de synchronisation et blocage des modifications tant que
   la version serveur n'est pas confirmée.
4. Aucun déploiement ni copie de la V33 sans accord explicite.

**État réel :** code et tests locaux de protocole seulement. V33 en production
inchangée, règles Firebase actuellement `allow read, write: if false;`.
