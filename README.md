# Menus & Drive

Une application mobile pour préparer les menus de la semaine et la liste de courses en quelques minutes. Conçue pour un seul iPhone et pour les achats au **Carrefour Drive École-Valentin**.

## Fonctionnalités de la première version (branche `developpement-v1`)

- **Mes plats** : ajouter, modifier et supprimer les plats, avec ingrédients, quantités, catégorie et photo facultative. Possibilité d'associer une référence Carrefour enregistrée à un ingrédient. Pas d'étapes de préparation.
- **Mes produits** : catalogue permanent des articles habituels, marque, conditionnement, catégorie, quantité habituelle et lien Carrefour facultatif (HTTPS sur carrefour.fr). Ajout à la liste en un clic et association aux ingrédients des recettes.
- **Mes menus** : calendrier du lundi au dimanche, midi et soir (14 cases). Choix manuel, génération d'une semaine, remplissage des cases vides, reprise de la semaine précédente et case « Restes ».
- **Portions** : deux personnes par défaut, nombre de personnes ajustable sur chaque repas.
- **Mes courses** : somme des quantités pour tous les plats, conversion kg/g et l/ml/cl, produits manuels, favoris réutilisables, coches et retrait des produits déjà présents à la maison.
- **Mon Drive** : récapitulatif des produits, copie de la liste, ouverture du site Carrefour et liens directs des références associées.

## Améliorations : quantités et menus intelligents

- Sur la fiche **Mes produits**, les champs facultatifs « contenu d’un emballage » et « unité de contenu » permettent de préciser par exemple **1 kg par paquet** ou **12 rouleaux par paquet**.
- Quand un ingrédient est lié à une référence et que son unité est compatible avec le contenu du paquet, le nombre d’emballages est calculé automatiquement et arrondi à l’unité supérieure : **750 g de riz = 1 paquet de 1 kg**, **1 300 g = 2 paquets**.
- Les références sans taille de conditionnement restent affichées comme auparavant (quantité brute), sans supposer une taille inconnue.
- Un ajout volontaire du même produit depuis « Mes produits » s’ajoute à la quantité calculée à partir des recettes.
- La génération hebdomadaire évite autant que possible les plats déjà consommés dans les trois dernières semaines et équilibre les catégories de plats. Elle préserve les cases choisies manuellement lorsque l’option « Compléter » est utilisée.

## Sauvegarde automatique et restauration

- La base IndexedDB est conservée sous le nom existant `menus-drive-v1` et mise à niveau **de version 1 à version 2**, sans suppression du contenu.
- À chaque modification, l'état est enregistré automatiquement. L'application tente de conserver **jusqu’à 10 points de restauration locaux**, espacés de 10 minutes ; la sauvegarde locale principale reste prioritaire même en cas de quota insuffisant.
- Les points de restauration sont affichés sous ⚙️ et peuvent être restaurés après confirmation.
- Une copie est aussi prise avant les suppressions et restaurations importantes.
- **Limitation impérative :** les points de restauration sont sur le même iPhone ; ils ne protègent pas contre la perte du téléphone, sa réinitialisation ou l'effacement des données Safari. Une sauvegarde externe automatisée exigerait une connexion à un service distant ; cela **n'est pas encore implémenté**.
- L'exportation/importation manuelle JSON reste disponible et protège les données si le fichier est placé dans **iCloud Drive**. Ne pas supprimer ses anciens fichiers JSON.

## État de l'intégration Carrefour

**Le panier automatique n'est pas disponible dans cette version.** L'application ne se connecte pas à Carrefour, ne connaît ni les stocks ni les prix, ne choisit pas les références de produits et ne modifie aucun panier réel. Une intégration dédiée sera évaluée séparément.

## Données et confidentialité

- Pas de Supabase, pas de compte utilisateur, pas de synchronisation.
- Les données sont conservées **sur l'iPhone utilisé**, dans IndexedDB (ou localStorage de secours si nécessaire).
- Les sauvegardes JSON peuvent être **exportées** et **réimportées** depuis la roue dentée de l'application ; un historique de points de restauration locaux est désormais disponible. Le catalogue de produits est inclus ; les sauvegardes JSON de la version précédente sont également acceptées. Les photos éventuellement ajoutées sont incluses dans la sauvegarde.
- **Important** : effacer les données du navigateur, utiliser la navigation privée, changer de téléphone ou supprimer le stockage du site peut effacer les recettes et les menus. Exporter régulièrement une sauvegarde, par exemple dans l'application Fichiers ou iCloud Drive.
- Les données ne sont pas envoyées sur GitHub : GitHub Pages héberge uniquement le code public, sans les recettes personnelles enregistrées sur l'appareil.

## Architecture

Application statique HTML/CSS/JavaScript.

- `index.html` : structure et navigation.
- `styles.css` : interface iPhone.
- `app.js` : logique du planning, des recettes, des courses et stockage local.
- `manifest.webmanifest` : installation en raccourci sur l'écran d'accueil.
- `sw.js` : cache de l'interface pour une consultation hors ligne après le premier chargement.
- `icon.svg` : icône de l'application.

## Développement et validation

La branche `developpement-v1` sert aux essais et n'est pas la branche de production. Le déploiement via GitHub Pages et toute fusion vers `main` nécessitent une validation distincte.

Pour tester sans publier, télécharger les fichiers de la branche et utiliser un petit serveur web local HTTP. Les fonctionnalités de service worker et l'installation sur iPhone exigent une origine HTTPS compatible (par exemple GitHub Pages lorsqu'il sera activé).

### Points de vérification avant publication

1. Ajouter un produit du catalogue et sa fiche Carrefour ; l'ajouter aux courses puis l'associer à un ingrédient d'une recette.
2. Ajouter un plat pour deux personnes avec plusieurs ingrédients.
3. Affecter le plat à plusieurs repas ; modifier les portions d'un repas.
4. Vérifier la somme des ingrédients et les conversions d'unités.
5. Ajouter manuellement un produit d'hygiène et le retrouver parmi les favoris.
6. Générer une semaine, conserver les choix déjà faits, créer des restes.
7. Exporter puis restaurer une sauvegarde et contrôler les données retrouvées.
8. Vérifier le fonctionnement sur Safari iPhone, notamment après fermeture et réouverture de l'application.

## Notes

La génération automatique est volontairement simple dans cette première version : elle répartit les plats disponibles en essayant d'éviter les doublons sur la même semaine. Elle ne connaît pas encore vos goûts, les habitudes d'achat ni les dates de consommation. Les courses non achetées, les quantités et les substitutions Carrefour demandent une vérification humaine.


## Module Safari Carrefour — diagnostic en lecture seule

Fichier : `scripts/carrefour-diagnostic.user.js`. Ce module de test est **indépendant de l’application** et ne modifie jamais le panier.

**Installation sur iPhone :**

1. Installer l’application gratuite **Userscripts** depuis l’App Store, puis l’ouvrir une fois.
2. Dans Réglages → Apps → Safari → Extensions → Userscripts, activer l’extension. Lui donner l’autorisation d’exécution pour **carrefour.fr**.
3. Dans Safari, ouvrir `https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js`, puis ouvrir l’extension Userscripts depuis le menu de la page et accepter l’installation proposée. Si cette méthode échoue, enregistrer le fichier `.user.js` dans le dossier Userscripts sélectionné depuis l’application.
4. Ouvrir `https://www.carrefour.fr/` dans **Safari** (pas dans l’application web installée sur l’écran d’accueil) et chercher le bouton « 🧪 Test Menus & Drive ».
5. Appuyer sur le bouton. Le panneau affiche « Extension active », le nom de domaine et, uniquement pour les pages produits dont l’URL contient 13 chiffres, l’identifiant détecté dans l’adresse.

Aucun mot de passe, cookie, token ni donnée de compte n’est lu, enregistré ou transmis. Pas d’appel réseau, de recherche des produits ni d’action d’ajout au panier. Le Drive École-Valentin doit être sélectionné et vérifié **manuellement** sur le site. La correspondance entre chiffres d’URL et EAN n’est pas encore vérifiée avec le catalogue Carrefour.

**Suite du développement :** concevoir le transfert volontaire de la liste de courses depuis notre application vers le module Safari, puis seulement des essais d'identification de références en lecture seule. Un test d’ajout d’un article réel au panier nécessitera un nouvel accord explicite.



## Importer depuis une fiche Carrefour sur iPhone (script Safari 0.2)

- **Principe :** dans Safari sur un produit `https://www.carrefour.fr/p/...`, le userscript `scripts/carrefour-diagnostic.user.js` propose le bouton « ➕ Mes produits ».
- L'utilisateur appuie sur le bouton, vérifie l'aperçu et confirme « Ouvrir la fiche dans Menus & Drive ». Le script récupère uniquement les informations de la **page affichée** : nom (titre `h1` ou métadonnée), marque et contenance si les données structurées sont accessibles, code EAN-13 depuis l'adresse lorsqu'il est présent, lien direct de la fiche.
- Le transfert se fait **après clic** via un fragment d'URL vers `https://jb8br7jgpr-eng.github.io/mes-menus-drive/`, sans serveur, cookie, mot de passe, historique de compte ni requête réseau depuis le script.
- Dans Menus & Drive, un formulaire prérempli apparaît. L'utilisateur doit **enregistrer explicitement**. Aucun ajout aux courses ou au panier n'est fait automatiquement.
- Le nom, la marque et le conditionnement peuvent ne pas être détectés ; ils sont **corrigeables**. Un produit déjà connu par son URL ou son code est signalé pour limiter les doublons.
- Seuls les 13 chiffres présents dans l'adresse sont repris ; le code doit être vérifié en cas de doute. Il ne garantit ni le stock ni la disponibilité dans le Drive choisi.
- L'import est **expérimental** et fonctionne dans Safari sur le site GitHub Pages. Une application web installée sur l'écran d'accueil peut utiliser un stockage local distinct de celui de Safari sur iPhone : vérifier dans le catalogue où le produit est enregistré.
- **Installation de la nouvelle version du script :** si le diagnostic 0.1 est déjà installé, ouvrir l'URL raw du script `.user.js` dans Safari, ouvrir Userscripts et accepter la mise à jour 0.2. Ne pas créer deux copies actives du même script. La configuration d'auto-mise-à-jour a été ajoutée en version 0.2.
- **Sécurité :** aucune opération sur le panier Carrefour ; ne jamais fournir d'identifiants dans le script. Si le formulaire n'apparaît pas ou que les données détectées sont erronées, revenir et signaler le problème, sans supprimer le catalogue existant.



## iPhone : importer dans l’application installée (correctif stockage Safari séparé)

**Pourquoi :** sur iOS, le site ouvert dans Safari et l’application web ouverte depuis son icône ont des données IndexedDB différentes. Une fiche ajoutée dans Safari n’apparaîtra donc pas automatiquement dans l’application de l'écran d’accueil. Cette séparation est un comportement d’iOS.

**Nouvelle procédure recommandée (Userscripts 0.3 + app 0.6) :**
1. Ouvrir la fiche du produit sur Carrefour.fr dans **Safari**.
2. Appuyer sur le bouton vert **« ➕ Mes produits »**, puis **« 📋 Copier pour mon appli »**.
3. Revenir sur l’**écran d’accueil de l’iPhone**, et ouvrir l’icône déjà installée **Menus & Drive**. Ne pas la supprimer ni en créer une deuxième.
4. Dans l'onglet **Produits**, appuyer sur **« 📋 Coller un produit Carrefour »**, puis **« 📋 Coller et vérifier le produit »**. Safari peut afficher une demande d’autorisation de collage : sélectionner « Coller ».
5. Vérifier les données de la fiche préremplie. Appuyer sur **« Enregistrer le produit »**. L’enregistrement est effectué dans **l’espace local de l’application installée** et reste indépendant de Safari.

**Si l’autorisation de collage échoue :** sur le panneau d'import, appuyer longtemps dans le champ prévu puis choisir « Coller », et cliquer « Vérifier le texte collé ». Le script côté Carrefour affiche également le code à copier manuellement si l’accès au presse-papiers a échoué.

**Compatibilité :** l’ancienne méthode via lien `#carrefour-product=...` reste disponible pour les ouvertures dans Safari, mais ne partage pas ses données avec l’application de l’écran d’accueil. Le presse-papiers assure le passage de la fiche entre les deux applications sans serveur, sans compte, sans connexion à un service tiers et sans effacer les anciennes recettes.

**Sécurité :** transfert d'une seule fiche produit publique par action utilisateur ; jamais de cookies Carrefour, d’identifiant ou de mot de passe, ni d’ajout au panier. Les données envoyées au presse-papiers peuvent être lues par d’autres applications autorisées à y accéder ; recopier ensuite un autre texte si souhaité.


## Exporter la liste complète de courses vers Userscripts (v0.4, préparation du panier)

Le **mode aperçu est en lecture seule** et ne modifie ni le panier ni les données du compte Carrefour.

1. Dans l’icône iPhone **Menus & Drive**, ouvrir **Drive → Préparer mon panier Carrefour**.
2. Une fenêtre affiche le nombre de lignes prêtes (référence EAN-13 et quantité entière dans une unité achetable) et les lignes à associer ou à préciser.
3. Cliquer **Copier la liste pour Carrefour**. En cas d’échec, sélectionner puis copier le code depuis la zone dédiée.
4. Ouvrir **Carrefour.fr dans Safari** et le menu vert Userscripts. Cliquer **« Coller ma liste de courses »** puis autoriser le collage. Un champ manuel est disponible en cas de refus du presse-papiers.
5. Le script affiche **toutes les lignes** avec quantité, EAN lorsque disponible, et avertissements. Il **ne contacte pas** les API Carrefour et n’interroge ni prix ni stocks.
6. Toujours vérifier manuellement que le magasin Drive courant est **Carrefour École-Valentin**.

### Format d'échange

Préfixe `MD-DRIVE-LIST-V1:` suivi d'un JSON `{format:"mes-menus-drive-list",v:1,week,createdAt,items:[{name,qty,unit,ean,url,brand,packaging,needed,ready,reason}]}`.

L'export inclut exclusivement les lignes **ni cochées ni exclues** de la liste hebdomadaire. Les recettes liées à des produits et disposant d’un contenu par paquet compatible sont préconverties en emballages. Une référence EAN peut provenir de la fiche du catalogue ou, en secours, des 13 chiffres à la fin du lien produit Carrefour.

Les unités de masse et de volume non converties en nombre de colis restent **à associer** : une ligne « 750 g » n'est jamais envoyée comme « 750 paquets ». Les unités `pièce`, `paquet`, `boîte`, `rouleau`, `bouteille`, `pot`, `sachet` sont acceptées en quantités entières ; cela n'est **pas une validation de l'offre**, du stock ou du magasin.

Le script ne sauvegarde pas le texte copié côté Carrefour. Il ne fait que l'afficher localement après collage. Ne pas installer deux versions du même userscript. **Ne pas prendre le mode aperçu pour un panier Carrefour rempli.**

**Travail suivant :** identifier les références et la disponibilité dans le magasin sélectionné, en lecture seule et avec accord de l'utilisateur. Envisager ensuite des essais contrôlés d'ajout au panier, après validation explicite et sans jamais lancer le paiement.


## Import simplifié vers Carrefour : EAN-13 et quantité uniquement (Userscripts v0.5)

Les anciens transferts JSON `MD-DRIVE-LIST-V1:` ont été remplacés par un **texte brut** directement exploitable : **une ligne par référence Carrefour (13 chiffres), un espace, une quantité entière positive**. Exemple :

```text
3012345678901 2
1234567890123 1
```

Depuis l'icône iPhone : **Mon Drive → Préparer mon panier Carrefour → Copier les codes-barres et quantités**. Puis dans Safari sur Carrefour.fr, avec Userscripts v0.5 : **Coller mes codes-barres**. L’aperçu affiche seulement le code et la quantité.

Seuls les produits pour lesquels une référence EAN de 13 chiffres **et** une quantité entière d'unités d'achat cohérente avec l’unité du produit du catalogue sont transmis. Les ingrédients en grammes/ml non convertis, les références manquantes ou les unités incohérentes restent listés dans « Non transférés — à compléter » dans l'application, **sans être copiés**. Les doublons d’un EAN sont additionnés.

**Attention :** un code au format EAN-13 n’est pas nécessairement une référence actuellement vendue par Carrefour. Le script n'interroge pas les disponibilités, les prix ou les stocks et **ne touche jamais au vrai panier**. Le site Carrefour doit être ouvert avec le bon Drive sélectionné. Aucun paiement n'est possible depuis ce transfert de test.

Le précédent script v0.4 ne saura pas lire ce nouveau texte simplifié : installer/mettre à jour **v0.5**, en gardant une seule version active du script.



## Vérification des références Carrefour en lecture seule (Userscripts v0.6)

Après **Mon Drive → Copier les codes-barres et quantités** dans l'application installée, sur **Carrefour.fr dans Safari**, ouvrir Userscripts puis **« Coller mes codes-barres »**. Un nouveau bouton **« 🔎 Vérifier mes références sur Carrefour »** est proposé après le collage.

**Lors d'un clic explicite :**

1. Un `GET /api/cart` est utilisé **uniquement pour reconnaître l'identifiant du Drive actif**. Aucun ID de compte, ligne, quantité de panier ou montant du panier n'est affiché, transmis à un service tiers ou stocké par le script. Si aucun Drive réel n'est actif, le diagnostic s'arrête.
2. Le nom du magasin est lu **si** le site expose ce champ dans son état initial, et seulement s'il correspond à l'identifiant du Drive actif. Le nom doit être vérifié visuellement par l'utilisateur : **École-Valentin**. L'affichage peut indiquer « nom non lisible ».
3. Jusqu'à **15 EAN-13** sont recherchés séquentiellement avec `GET /autocomplete?q=<EAN>&maxResults=12&productCard=true` et l'en-tête `X-Requested-With: XMLHttpRequest`, côté Carrefour.fr uniquement. Il s'agit d'une API du site **non officielle et susceptible de changer**.
4. Le nom du produit est affiché seulement si l'EAN correspond **exactement**. Le prix n'est montré, comme prix indicatif, que si une offre se rapporte à l'identifiant du magasin actif. Les verdicts d'offre sont présentés avec prudence.
5. **Un EAN reconnu ou une offre affichée ne prouve pas le stock réel.** Les disponibilités positives remontées par la recherche Carrefour peuvent être périmées ou erronées. Il faut confirmer les produits en ouvrant leur vraie fiche avant tout futur ajout au panier.
6. Aucune requête `POST`, `PATCH` ou `DELETE` ; **aucun changement de panier**. Aucun paiement, authentification supplémentaire, ou lecture de mots de passe / cookies.

Le bouton de copie individuelle des fiches Carrefour vers l'application iPhone est conservé. Les tests locaux vérifient la classification « référence trouvée », « inconnue », « offre locale non confirmée » et « indiquée indisponible » sur des réponses simulées. **Il reste à valider en situation réelle** dans Safari, notamment la compatibilité de l'extension Userscripts iOS avec les réponses Carrefour.



## Ouverture directe Carrefour depuis l’application installée (Userscripts v0.7)

Le copier-coller entre l’icône iPhone et Safari n’est plus requis pour préparer une liste normale :

1. Dans l’icône iPhone **Menus & Drive → Mon Drive**, appuyer sur le bouton principal **« 🚀 Ouvrir Carrefour avec ma liste »**.
2. L’application calcule les lignes **EAN-13 + quantité achetable** non cochées/non exclues, puis ouvre `https://www.carrefour.fr/#md-drive-v1=<liste encodée>` dans Safari / navigateur externe.
3. Le script Userscripts v0.7 reconnaît **uniquement** ce fragment URL, retire son fragment de l’adresse visible, ouvre automatiquement le panneau, affiche les références et leurs quantités, puis lance la vérification **GET uniquement** (Drive actif + recherche Carrefour). Aucune opération d’écriture sur le panier.
4. Le bouton **« 📋 Détails et copie de secours »** dans Mon Drive reste disponible pour voir les produits incomplets et, si iOS n’injecte pas Userscripts après l’ouverture externe, copier manuellement les codes-barres.
5. Les fiches Carrefour peuvent toujours être copiées dans **Mes produits** via l’ancienne fonctionnalité indépendante.

**Limites :** le lien est volontairement plafonné à 120 références ou 2 900 caractères de données encodées pour ne pas dépendre de longues URL iPhone ; au-delà, la copie de secours reste accessible. Le fragment de lien contient uniquement EAN et quantité, pas de recettes, adresses, cookies, mots de passe ou identité. Un fragment d’URL n’est pas envoyé dans le chemin de la requête HTTP ; il reste toutefois visible au JavaScript du site Carrefour, puisque le script s’exécute dessus. L’ouverture d’un lien externe depuis une PWA iPhone vers Safari, et l’injection Userscripts sur cette navigation, devront être validées **sur le véritable iPhone**.

Le script n'ajoute aucun article au panier, ne vérifie pas définitivement les stocks et ne paie jamais. Si le script n'est pas installé ou encore à la version 0.6, la page Carrefour s'ouvre mais le transfert automatique ne sera pas intercepté. Mettre à jour **le script 0.7** et ne garder qu'une copie active.



## Constitution automatique du panier Carrefour — Userscripts v0.8 (test réel à valider)

**Le clic « 🛒 Constituer mon panier Carrefour » dans l'application installée déclenche désormais un essai d'ajout réel au panier du Drive Carrefour actif.** Seules les références complètes EAN-13 et les quantités entières achetables de la liste hebdomadaire sont envoyées. L'échange app → Safari continue à passer par le fragment d'URL (sans copier-coller).

### Garde-fous

- Sur Carrefour.fr, la nouvelle version v0.8 lit `GET /api/cart` pour identifier le **Drive actif** et son identifiant technique. Si le magasin affiché ne correspond pas à **École-Valentin / Besançon-Valentin**, **aucun article n'est ajouté**. Si le nom du Drive est inaccessible, une **confirmation manuelle explicite** est obligatoire après vérification visuelle sur Carrefour.
- Pour chaque EAN, une recherche Carrefour à correspondance **exacte** précède la consultation de la fiche réelle du produit. La disponibilité de l'offre doit être explicitement confirmée par les informations de la fiche pour **ce magasin et cet EAN**. Si le site ne répond pas, si la référence est inconnue ou si les informations sont ambiguës, **aucun ajout** pour cette ligne.
- Avant chaque écriture, une nouvelle lecture du panier vérifie que le Drive n'a pas changé ; les autres lignes du panier ne sont jamais supprimées ni diminuées. La quantité cible est **max(quantité déjà présente, quantité demandée)**. On ne cumule pas automatiquement d'unités supplémentaires lorsqu'on relance la même liste : une nouvelle tentative est **idempotente** pour les quantités déjà atteintes.
- Pour les références disponibles à compléter, le script tente `PATCH /api/cart` avec une quantité cible **absolue et strictement positive**. Il analyse ensuite la réponse Carrefour, notamment les limites de stock et les quantités réellement accordées. Des refus et quantités partielles sont signalés.
- Les erreurs d'autorisation, de protection HTTP 403/429, de panier non synchronisé HTTP 400 ou de changement de Drive arrêtent le transfert. Une erreur ponctuelle sur une fiche est signalée, sans affecter les autres produits.
- La fenêtre affiche un **bilan** : ajouté(s), déjà présent(s), indisponibles/inconnus, partiels/erreurs et le nombre de lignes restantes si le traitement est interrompu.
- Le script n'accède pas aux moyens de paiement et **n'effectue aucune commande, aucun paiement, aucune validation du créneau**. Le consommateur finalise lui-même sur Carrefour.fr.
- Les appels utilisent les API front-end privées de Carrefour, **non documentées et susceptibles de changer**. Le comportement de modification du panier est **testé avec des réponses simulées**, pas encore sur la session Carrefour personnelle de l'utilisateur. Une **validation réelle sur l'iPhone**, d'abord avec 1–2 articles, est indispensable. Vérifier l'icône panier Carrefour et les quantités après chaque essai.

### Utilisation

Mettre à jour l'unique script Userscripts vers **v0.8**, ouvrir l'application de l'écran d'accueil, vérifier que le catalogue associe les bonnes références, puis cliquer **« Constituer mon panier Carrefour »**. La navigation ouvre la page Carrefour avec la liste, la vérification et les tentatives d'ajout. **Contrairement aux versions v0.1–0.7, cette version peut modifier réellement le panier dès l'ouverture du lien.**

En cas de panne, la copie de secours reste disponible dans la fenêtre « Détails et copie de secours » ; après collage manuel dans Userscripts, il est possible de lancer l'ajout via le bouton explicite « Ajouter les produits disponibles au panier ».



## Ouverture DIRECTE dans Safari depuis l'icône iPhone — correction du navigateur intégré

Certaines versions d’iOS ouvrent un lien `https://www.carrefour.fr/...` depuis une application Web installée dans **Safari View Controller**, la petite fenêtre avec boutons Partager / Fermer, au lieu de l'application Safari elle-même. Cette fenêtre n'exécute pas nécessairement l'extension Userscripts configurée dans Safari : le transfert du panier peut alors échouer.

Le bouton principal **« 🛒 Constituer mon panier Carrefour »**, dans **Mon Drive** et dans la fenêtre de détails, appelle maintenant directement `openDriveInSafari()` lors du clic utilisateur. Sur iPhone/iPad en mode **application d'écran d'accueil** seulement, il tente d'ouvrir :

```text
x-safari-https://www.carrefour.fr/#md-drive-v1=<codes EAN+quantités encodés>
```

Le schéma `x-safari-https:` est reconnu par Safari sur plusieurs versions récentes d'iOS (notamment 17–26 selon des tests communautaires), mais son comportement dépend du système et n'est **pas garanti pour tous les iPhones / iOS**. Il faut valider l'ouverture directement **dans Safari sur le téléphone de l'utilisatrice**. En mode navigateur classique et hors iOS, le lien HTTPS ordinaire reste utilisé.

**Secours amélioré :** dans **Mon Drive → Détails et copie de secours**, cliquer **« 🔗 Copier le lien pour Safari (secours) »**, puis ouvrir l'application Safari soi-même et coller ce lien **directement dans la barre d’adresse**. Le lien contient déjà toutes les références et leurs quantités : pas de deuxième collage dans Userscripts. L'ancienne copie des EAN seuls reste disponible comme dernier secours.

Ni le format de transfert, ni le fonctionnement de l'extension Userscripts 0.8, ni les données locales (recettes, produits, sauvegardes) n'ont été modifiés. Pour que le panier se remplisse depuis Safari, le script Userscripts doit être installé et autorisé **sur chaque iPhone**. Aucune validation de commande ou paiement automatique.



## Bilan panier Carrefour — interface iPhone v0.9

Le script Userscripts conserve **exactement le même mécanisme d'ajout au panier que la v0.8**. La version 0.9 modernise uniquement le récapitulatif, en affichant sa progression et quatre compteurs : **ajoutés**, **déjà présents**, **indisponibles/erreurs**, **quantités partielles**. Les problèmes apparaissent en premier et sont dépliés. Les ajouts réussis et les articles déjà présents sont listés séparément, avec leur EAN, la quantité demandée et la quantité réellement accordée quand elle est connue. Les groupes de succès de plus de quatre références sont repliés pour faciliter la lecture sur iPhone.

Le bilan indique les lignes encore à traiter pendant l'exécution. Une fois terminé, il est ramené en haut du panneau pour être immédiatement visible. **Aucun mécanisme de paiement, aucune suppression d'article, aucune modification du moteur de calcul des quantités ou du stockage de Menus & Drive.**

La version doit être actualisée **sur chaque iPhone** depuis le même lien Userscripts habituel. Les tests d'interface utilisent des données simulées (ajouté / déjà présent / indisponible / partiel), tandis que les ajouts réels ont été confirmés auparavant sur un essai de deux produits. La robustesse sur un panier de 5 à 10 références, dont une indisponible et une partielle, reste à vérifier en situation réelle.



## Recettes préparées pour deux repas et courses Carrefour / Grand Frais

### Cuisine en deux fois pour deux personnes

- **Règle par défaut : 4 portions cuisinées une fois**, pour 2 personnes à deux repas. La recette du catalogue indique le nombre de portions correspondant à ses quantités d'ingrédients (4 par défaut pour les nouvelles recettes ; les anciennes fiches conservent leur base, souvent 2).
- Lorsqu'un plat est ajouté à un repas, l'application propose de **cuisiner 4 portions**. Le repas immédiatement suivant, **s'il est vide**, devient automatiquement **« Restes : [nom du plat] »**, lié au premier repas. On peut saisir **2 portions** pour cuisiner uniquement pour un repas. Rien n'est écrasé si le repas suivant est déjà occupé ou si l'on est en fin de semaine.
- **Liste de courses : la recette est comptée une seule fois**, selon le nombre de portions effectivement préparées. Par exemple une recette enregistrée pour 2 portions avec 300 g de poulet demande 600 g pour 4 portions, qu'on mange sur deux repas. Le créneau « Restes » n'ajoute **aucun ingrédient**.
- Modifier/supprimer le premier repas supprime seulement ses **restes automatiquement liés**, sans toucher aux autres plats ni aux restes ajoutés manuellement. La génération intelligente remplit les créneaux par paires plat + restes lorsque les deux sont libres et réserve d'abord les restes des recettes de 4 portions déjà planifiées. La génération ne remplace pas les repas manuels en mode « Compléter ».

### Répartition des courses entre deux magasins

- **Carrefour Drive** : uniquement les lignes affectées à Carrefour Drive sont transmises au système d'ajout automatique EAN-13, avec les mêmes calculs et contrôles qu'avant.
- **Grand Frais** : section séparée dans **Mes courses** et bouton **« 📋 Copier la liste Grand Frais pour Notes »**. La liste de texte contient noms et quantités des produits Grand Frais ni cochés ni marqués « déjà à la maison », et s'utilise par copier-coller dans Notes. **Aucun accès à Grand Frais ni connexion externe** pour cette liste.
- Chaque ligne de Mes courses comporte un **sélecteur magasin** (Carrefour Drive / Grand Frais). Les choix sont mémorisés **pour les semaines suivantes**, soit par produit du catalogue, soit par ingrédient/produit et unité. Chaque fiche du catalogue possède également un **magasin habituel**, modifiable ; un produit issu de l'import Carrefour reste Carrefour par défaut.
- Les produits frais **sans fiche de produit liée** de catégories Fruits et légumes et Viandes et poissons sont placés par défaut à **Grand Frais** ; les autres lignes non liées et les produits du catalogue existant restent par défaut sur Carrefour. Tout est modifiable.
- Les lignes affectées à Grand Frais sont filtrées **avant** le calcul des codes-barres et quantités Carrefour, même si un EAN Carrefour est renseigné sur la fiche. Cette séparation est une règle de sécurité.
- Les nouvelles préférences magasin résident dans `state.storePreferences` et les fiches `products[].store`. Elles sont incluses dans les **exports JSON** et réimportées lors d'une restauration. Les anciennes sauvegardes au schéma 1 demeurent valides et reçoivent les préférences par défaut. Les données ne se synchronisent toujours **pas automatiquement entre les deux iPhone** : transférer un export JSON pour répliquer le catalogue et les choix de magasin.

### Tests de non-régression

Contrôler : (1) nouvelle recette 4 portions → 2 repas / ingrédients une fois, (2) recette existante 2 portions → multiplication des ingrédients pour 4, (3) choix 2 portions → un seul repas, (4) mode générer / compléter, (5) affectation Grand Frais / Carrefour conservée après changement de semaine, (6) notes Grand Frais copiable, (7) transfert Carrefour ne contient **jamais** les produits affectés Grand Frais, (8) sauvegarde JSON compatible. Le script Userscripts v0.9 et le moteur réel du panier restent **inchangés**.



## Plusieurs plats par repas, portions individuelles et retrait des courses

Une case de calendrier peut désormais contenir **un ou plusieurs plats**. Au clic sur un repas, un formulaire permet de sélectionner un premier plat, préciser le **nombre de portions de celui-ci**, puis **ajouter un autre plat** avec son propre nombre de portions. Les plats déjà sélectionnés sont affichés chacun avec un contrôle de quantité et un bouton **Retirer** qui ne supprime pas la recette du catalogue.

Cas courants :
- **Un seul plat pour deux** : choisir 2 portions, pas de restes automatiques.
- **Une préparation pour deux repas** : choisir 4 portions, les 2 restantes deviennent un créneau « Restes » automatique si le repas suivant est libre.
- **Deux plats différents pour deux personnes** : choisir 1 portion du premier et 1 portion du second **dans le même créneau**. Chaque recette contribue à la liste de courses selon sa propre base de quantités ; aucun doublon implicite.
- **Un plat en 4 portions + un autre plat** : si un seul plat du créneau est prévu pour 4 portions ou plus, ses restes peuvent rester automatiquement liés au créneau suivant s'il est libre. Si plusieurs plats prévoient chacun 4 portions, le planificateur ne crée pas automatiquement un créneau de restes ambigu ; à organiser manuellement.

Compatibilité : une ancienne case `{type:'recipe',recipeId,people}` reste inchangée ; le nouveau format `{type:'multi',dishes:[{recipeId,people}, ...]}` n'est utilisé que pour les cases contenant **plusieurs** plats. Les sauvegardes JSON schéma 1, les menus historiques et les recettes existantes restent compatibles. Les calculs de courses, la génération de menus, les statistiques d'utilisation récente et la suppression d'une recette prennent en charge les deux formats.

### « Déjà chez nous » dans les courses

Sur chaque ligne des sections Carrefour Drive et Grand Frais apparaît une action explicite **« 🏠 Déjà chez nous · Retirer »**. Elle conserve le produit et la recette dans les catalogues, mais place la ligne dans la section « Déjà à la maison · retirés des achats ». Cette exclusion est enregistrée pour la semaine et la ligne disparaît immédiatement de la liste à copier Grand Frais et du transfert EAN/quantités vers le panier Carrefour. Bouton **Réintégrer** pour annuler, sans perte. La suppression définitive d'un produit du catalogue demeure une action différente.

Le moteur Carrefour/Userscripts est inchangé. Les nouveaux calculs sont validés avec des tests simulés avant vérification sur iPhone.



## Correction ergonomique — restes placés librement et saisie des ingrédients sur iPhone (28/10/2026, v15)

Cette mise à jour **remplace le précédent placement automatique des restes au créneau suivant**. Désormais, choisir une recette de 4 portions n'occupe **aucun autre créneau**. Dans le repas de son choix (un midi/soir **après le repas de cuisson**, même plusieurs jours plus tard), l'utilisateur touche **« 🍱 Placer des restes ici »** puis sélectionne le plat préparé ainsi que la quantité de portions. L'application indique la date du repas où le plat a été cuisiné et les portions encore disponibles. Les restes peuvent être placés dans une case vide **ou à côté d'un autre plat** prévu au même repas.

La quantité disponible correspond aux portions préparées moins celles consommées pendant le repas de cuisson (2 dans le cas d'un plat unique pour deux personnes, 1 de chaque plat lorsque plusieurs plats sont servis) et moins les restes déjà attribués. Exemple : 4 portions de poulet au curry préparées lundi midi → 2 mangées lundi → 2 disponibles pour jeudi soir. On ne peut pas attribuer plus de portions que le disponible. Un plat de 6 portions peut voir ses restes répartis sur plusieurs jours, sans double comptage d'ingrédients. Si l'on réduit les portions préparées ou supprime le plat source, les allocations de restes devenues impossibles sont supprimées ou réduites, sans toucher aux autres plats des mêmes cases.

Le **générateur de semaine** ne place plus non plus de restes automatiquement : il remplit les cases vides avec une recette pour deux portions, laissant toute liberté de créer ses propres repas de restes. Les anciennes données et les restes déjà placés continuent d'être lisibles sans migration destructive.

**Ajout de recettes sur iPhone :**
- le bouton **« ＋ Ajouter un ingrédient »** est désormais **sous toutes les lignes d'ingrédients**, juste au-dessus de l'enregistrement. À chaque ajout, la fenêtre défile légèrement pour maintenir le bouton à portée ;
- les champs texte / numériques et les menus déroulants du formulaire sont affichés à **16px au minimum** sur Safari iOS, afin d'éviter le zoom automatique au focus. Le zoom manuel reste autorisé ;
- le moteur Carrefour Drive (Userscripts v0.9), les préférences Grand Frais, les recettes, les sauvegardes JSON et les autres projets restent inchangés.

Tests simulés : cuisson lundi/consommation jeudi, 4 portions → 2 restes, deux plats au même repas dont un reste, aucun doublon d'ingrédients, réduction/suppression de la cuisson, 6 portions réparties entre deux repas de restes, génération sans restes automatiques, compatibilité d'anciens restes, conservation de la logique de transfert Carrefour et de Grand Frais. Contrôle visuel du focus/zoom et du scroll sur les deux iPhones encore nécessaire.



## Base de données unique d'ingrédients — Carrefour / Grand Frais (v16, 28 octobre 2026)

### Intention et structure des données

- **Base partagée** `state.ingredientCatalog` : un objet par ingrédient normalisé (`id`, `name`, `store`, `productId` facultatif). Comparaison de nom insensible à la casse et aux accents pour empêcher le double enregistrement de « Chorizo », « chorizo » et « CHORIZO ». Les recettes conservent chaque ligne et sa quantité propre, avec `ingredientId` pour pointer vers la même fiche de référence.
- L'onglet de navigation **Base** (anciennement **Produits**) propose deux rubriques : **Carrefour** et **Grand Frais**, ainsi qu'un formulaire d'ajout/édition de la fiche d'ingrédient. Modifier le magasin dans la base change son affectation dans toutes les recettes, sans duplication. On peut toujours changer le magasin depuis Mes courses.
- **Carrefour** : on associe à l'ingrédient une fiche produit déjà présente dans le catalogue, ou on clique **« Créer une fiche produit Carrefour pour cet ingrédient »**. La fiche conserve le nom commercial, marque, URL, EAN-13, quantité achetée et le contenu d'un emballage (`packAmount`, `packUnit`). Les produits existants (y compris les achats hors recettes, comme les produits habituels) restent présents et leurs boutons d'import et d'ajout aux courses sont conservés.
- **Grand Frais** : aucun lien, compte ou produit Carrefour n'est nécessaire. L'ingrédient et sa quantité totale sont envoyés uniquement dans la liste texte à copier dans Notes.
- **Saisie des recettes** : les ingrédients peuvent être recherchés dans les suggestions de la base par nom ; un nouveau nom est créé une seule fois lors de l'enregistrement de la recette, dans le magasin choisi sur sa ligne. Les ingrédients déjà connus sont réutilisés automatiquement. Chaque recette garde sa quantité et son unité propres, sans dupliquer l'enregistrement de l'ingrédient. Les champs de saisie continuent de rester adaptés à l'iPhone, avec le bouton « Ajouter un ingrédient » sous la liste.

### Exemple de calcul

- Pâtes au chorizo : **100 g** ; pizza au chorizo : **150 g**.
- Base unique **Chorizo** affectée à **Carrefour**, liée au produit **Chorizo [marque] 200 g** dont le code EAN et le conditionnement sont correctement renseignés.
- Courses calculées : **250 g de chorizo nécessaires**. L'application arrondit au paquet entier supérieur : **2 paquets de 200 g**. Elle transmet **une seule ligne EAN quantité 2** à Userscripts pour le panier Carrefour.
- Si cette même fiche est affectée à **Grand Frais** : la liste à copier dans Notes contient **« Chorizo — 250 g »**, et cet article n'est plus transféré à Carrefour, même s'il dispose d'un EAN.
- Si le produit Carrefour n'a pas de **contenu d'emballage** renseigné, ou si les unités ne sont pas compatibles, la quantité n'est pas transformée arbitrairement en paquets : il faut compléter la fiche ; le transfert EAN reste bloqué pour cette ligne. La disponibilité réelle est toujours vérifiée par Userscripts.

### Compatibilité et sécurité

La base utilise le **schéma JSON 1 existant**, avec un nouveau champ facultatif `ingredientCatalog`. Au premier chargement, `normalizeIngredientCatalog()` parcourt les recettes préexistantes, rassemble les ingrédients ayant le même nom normalisé, conserve les références produits déjà liées lorsque possible, et assigne des IDs d'ingrédients aux recettes. Les anciens choix de magasin sont respectés autant que possible. La migration n'efface ni recettes, ni photos, ni produits, ni semaines, ni sauvegardes. Les sauvegardes JSON exportées incluent la base ; les anciens JSON sans le champ sont toujours importables. L'historique local de versions reste conservé. Les données des deux iPhone demeurent indépendantes.

Le script Userscripts **v0.9**, la sélection du Drive École-Valentin, les protections du panier et l'absence de paiement automatisé restent inchangés. Tester l'interface sur les deux iPhone, notamment la recherche d'ingrédients dans la saisie d'une recette (datalist iOS), puis exporter un JSON vers iCloud Drive.

