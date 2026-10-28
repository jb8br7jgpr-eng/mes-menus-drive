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
