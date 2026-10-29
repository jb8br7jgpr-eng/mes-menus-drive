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

## Écran V34 — état du 29/10/2026

- Panneau `firebase/v34-ui.js` / CSS autonome intégré uniquement à la branche
  de préparation : bouton « Connexion familiale V34 » dans Paramètres.
- `ENABLE_ACCOUNT_SETUP = false` : **aucune création de compte ni écriture
  Firestore possible à partir du prototype**, même si on ouvre le panneau.
- Interface préparée : création/connexion email, vérification, copie d'UID,
  création d'espace, autorisation du second UID, rejoint par code.
- `userProfiles/{uid}` donne au compte un pointeur côté serveur vers son espace ;
  l'UID seul ne donne aucun droit sur les données (contrôle du membre obligatoire).
- Auth SDK JS 13.1.0 officiel ; persistance locale configurée lors de la connexion.
- Aucun changement sur `developpement-v1`, `main`, ou `sw.js`.
- Tests de parsing JS et tests purs de la prévisualisation effectués en environnement
  isolé ; tests navigateur iOS et émulateur Firestore **pas encore réalisés**.

## File d'attente et unicité (29/10/2026)

- `firebase/v34-outbox.js` : IndexedDB dédié `speedrive-v34-outbox`,
  modifications en attente partitionnées par UID Firebase + espace familial.
- Les modifications en attente du même élément sont regroupées ; une création
  non encore envoyée peut être annulée localement sans créer de document.
- Tentatives de transmission uniquement au premier plan (ouverture, visibilité,
  reconnexion, contrôle périodique si page ouverte). **Aucune promesse de
  synchronisation iOS lorsque la PWA est fermée.**
- Révision `version` et `lastMutationId` sur chaque enregistrement ; une
  requête rejouée après perte de réponse reste idempotente.
- Une seconde modification concurrente produit un conflit et reste conservée
  dans la file ; jamais de remplacement silencieux.
- Clés `uniqueKeys` créées atomiquement avec les produits et ingrédients.
  Ces réservations ne sont pas automatiquement libérées à la suppression
  logique : récupération et renommage nécessitent des opérations contrôlées.
- Limite de la version préparatoire : l'empreinte principale privilégie l'EAN
  pour les produits qui en possèdent un ; les ressemblances EAN/nom ou les
  variantes de noms doivent être détectées par la revue des doublons.
- Création d'espace familial + pointeur de compte dans un batch atomique.
- Tests exécutés en **simulateur mémoire uniquement**, pas dans l'émulateur
  Firebase : regroupement, synchronisation, conflit, résolution, annulation,
  isolation du compte. L'émulateur sécurité, deux vrais appareils, la
  restauration et la migration intégrale restent impérativement à tester.
- **Règles toujours non publiées** ; la V33 n'importe aucun de ces modules.

## Prévisualisation locale de la migration

- Le panneau V34 de test contient « Analyser mes données locales sans les
  envoyer ». Il lit une copie de la V33 depuis le navigateur et affiche
  uniquement des compteurs de recettes, produits, photos, semaines, éléments,
  doublons potentiels et avertissements.
- Il **ne crée aucun compte, n'envoie aucune photo ni donnée, ne remplace rien**.
- Ce bouton est sur `firebase-v34-preparation` uniquement, pas sur la V33
  publiée. Le panneau de connexion est toujours verrouillé.
- La prévisualisation doit être testée sur le vrai iPhone avant tout import.
- Ne jamais utiliser le dépôt GitHub Pages public comme destination de
  sauvegardes de recettes ou photos personnelles. Une sauvegarde indépendante
  doit rester privée et chiffrée, avec restauration vérifiée.
