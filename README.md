# Menus & Drive

Une application mobile pour préparer les menus de la semaine et la liste de courses en quelques minutes. Conçue pour un seul iPhone et pour les achats au **Carrefour Drive École-Valentin**.

## Fonctionnalités de la première version (branche `developpement-v1`)

- **Mes plats** : ajouter, modifier et supprimer les plats, avec ingrédients, quantités, catégorie et photo facultative. Pas d'étapes de préparation.
- **Mes menus** : calendrier du lundi au dimanche, midi et soir (14 cases). Choix manuel, génération d'une semaine, remplissage des cases vides, reprise de la semaine précédente et case « Restes ».
- **Portions** : deux personnes par défaut, nombre de personnes ajustable sur chaque repas.
- **Mes courses** : somme des quantités pour tous les plats, conversion kg/g et l/ml/cl, produits manuels, favoris réutilisables, coches et retrait des produits déjà présents à la maison.
- **Mon Drive** : récapitulatif des produits, copie de la liste et ouverture du site Carrefour.

## État de l'intégration Carrefour

**Le panier automatique n'est pas disponible dans cette version.** L'application ne se connecte pas à Carrefour, ne connaît ni les stocks ni les prix, ne choisit pas les références de produits et ne modifie aucun panier réel. Une intégration dédiée sera évaluée séparément.

## Données et confidentialité

- Pas de Supabase, pas de compte utilisateur, pas de synchronisation.
- Les données sont conservées **sur l'iPhone utilisé**, dans IndexedDB (ou localStorage de secours si nécessaire).
- Les sauvegardes JSON peuvent être **exportées** et **réimportées** depuis la roue dentée de l'application. Les photos éventuellement ajoutées sont incluses dans la sauvegarde.
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

1. Ajouter un plat pour deux personnes avec plusieurs ingrédients.
2. Affecter le plat à plusieurs repas ; modifier les portions d'un repas.
3. Vérifier la somme des ingrédients et les conversions d'unités.
4. Ajouter manuellement un produit d'hygiène et le retrouver parmi les favoris.
5. Générer une semaine, conserver les choix déjà faits, créer des restes.
6. Exporter puis restaurer une sauvegarde et contrôler les données retrouvées.
7. Vérifier le fonctionnement sur Safari iPhone, notamment après fermeture et réouverture de l'application.

## Notes

La génération automatique est volontairement simple dans cette première version : elle répartit les plats disponibles en essayant d'éviter les doublons sur la même semaine. Elle ne connaît pas encore vos goûts, les habitudes d'achat ni les dates de consommation. Les courses non achetées, les quantités et les substitutions Carrefour demandent une vérification humaine.
