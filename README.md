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

