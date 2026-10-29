# Speedrive V34 — Plan de synchronisation (brouillon technique)

**Statut : non déployé.** Branche `firebase-v34-preparation`, application V33 inchangée.
Firebase Web `speedrive-7e77c`; Firestore édition Standard, règles actuellement
`allow read, write: if false` dans la console. NE PAS remplacer pour l'instant.

## Espaces et permissions

- `households/{hid}` : un propriétaire authentifié dont l'e-mail a été vérifié.
- `households/{hid}/members/{uid}` : deuxième utilisateur ajouté **uniquement**
  par le propriétaire connaissant l'UID exact du compte.
- `households/{hid}/records/{rid}` : seules les personnes autorisées peuvent lire
  et créer/modifier des documents versionnés. Suppression physique interdite.
- Les identifiants `hid` doivent être aléatoires et non devinables.
- La première invitation du second iPhone : connexion + vérification de son
  e-mail, copie du code utilisateur (UID), ajout par le premier iPhone et
  ouverture d'un espace via un code d'espace. À simplifier ensuite dans l'UI.
- Les règles jointes doivent être exécutées dans l'émulateur Firebase et
  revues avant toute publication. Ne jamais utiliser `allow read, write: if request.auth != null`.

## Répartition des données, par élément

`records/{kind}:{encoded-id}` avec `kind`, `payload`, `version`,
`deleted`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

- `recipe:{id}`, `recipePhoto:{id}`, `product:{id}`, `ingredient:{id}`,
  `staple:{id}`.
- `weekMeta:{YYYY-MM-DD}`; `weekMeal:{week}:{0..13}` pour les 14 cases
  distinctes; `weekExtra:{week}:{id}` pour les ajouts ponctuels.
- `weekChecked:{week}:{key}`, `weekExcluded:{week}:{key}`,
  `weekPantry:{week}:{key}`, `weekPantryUnit:{week}:{key}`.
- `settings:general`, `preference:{key}` pour les autres préférences.
- Photos compressées séparées des recettes. Refuser toute image qui ferait
  dépasser la taille maximale d'un document Firestore (1 Mio).
- Les actions « Générer les repas » et « Générer les courses » restent explicites.

## Concurrence / doublons

- Toute écriture en ligne utilise une transaction avec numéro de version connu.
  Si le serveur contient une version plus récente : erreur `SyncConflict`,
  ne jamais remplacer silencieusement la version distante.
- Les transactions Firestore échouent hors connexion. Il faut une **file durable
  d'opérations locales** (IndexedDB), rejouée une par une à la reconnexion,
  et un écran de résolution des conflits.
- Déduplication EAN pour produits, nom normalisé + unité pour ingrédients ;
  correspondances de recettes proposées mais pas fusionnées automatiquement.
  Prévoir un registre de clés uniques atomique côté serveur avant lancement.
- Conserver les identifiants et références croisées de l'ancienne V33 ; migration
  par aperçu/détection des doublons avant tout envoi de données.

## Sauvegardes (encore NON mises en place)

1. Sauvegardes automatiques chiffrées indépendantes de Firestore + photos,
   stockage externe sécurisé, et contrôle d'intégrité.
2. Historique de révisions et restauration sans écrasement silencieux.
3. Test obligatoire de restauration complète, à deux téléphones, y compris
   après 15 jours sans utilisation.
4. Ne pas traiter la présence de deux caches iPhone comme une sauvegarde.
5. Ne pas activer la V34 ni migrer les données V33 avant validation des points 1–4.

## Statut de cette étape

- SDK Firebase Web configuré dans `firebase-v34.js` (non chargé).
- `firebase/firestore.rules` : règles candidates, **non publiées**.
- `firebase/sync-api-v34.js` : interface réseau de développement, **non chargée**.
- Pas de synchronisation automatique active, pas de comptes créés, pas
  de changements en production. Les tests de sécurité et de concurrence
  sont à réaliser avant intégration UI.
