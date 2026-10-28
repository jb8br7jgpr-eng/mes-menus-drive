# Menus & Drive

Application web mobile **sans compte, sans Supabase, sans synchronisation** : un catalogue de plats, un planning de 14 repas (midi/soir du lundi au dimanche), une liste de courses calculée automatiquement et les produits du quotidien.

## Statut

**Prototype V1 sur la branche `developpement-v1`.** Ne pas fusionner ni activer GitHub Pages sans validation de l’interface.

### Fonctionnalités disponibles
- Ajout, modification et suppression de plats, ingrédients et photos locales.
- Quantités de base pour **2 personnes** avec adaptation ponctuelle par repas.
- Menus manuels, génération complète ou remplissage des cases vides, reprise de la semaine précédente et repas « Restes ».
- Addition des ingrédients par nom et unité compatible (kg/g ; l/cl/ml), liste à cocher, exclusion des produits déjà possédés.
- Ajout manuel de produits (papier toilette, baume à lèvres…), favoris réutilisables.
- Copie de liste et ouverture de Carrefour dans le navigateur.
- Sauvegarde locale IndexedDB et export/import JSON pour transférer/restaurer les données.
- PWA pour installation sur l’écran d’accueil après activation de GitHub Pages.

### Important : Carrefour Drive
La V1 **ne se connecte pas** au compte Carrefour, ne consulte **ni les prix ni les stocks en temps réel** et **ne crée pas** de panier. L’automatisation du panier nécessitera un prototype spécifique validé techniquement, sans divulguer d’identifiants ni stocker les mots de passe dans GitHub Pages. Carrefour École-Valentin est le magasin cible.

### Protection des données
Les recettes, photos, menus et listes restent **dans le navigateur utilisé**. GitHub Pages n’héberge que le code public, pas les données personnelles. Effacer les données du navigateur ou changer d’iPhone peut entraîner une perte des données : utiliser régulièrement **⚙ → Exporter une sauvegarde** et conserver le JSON dans Fichiers/iCloud. Le mode privé est déconseillé.

### Mise en service après validation
Fusionner `developpement-v1` dans `main`, activer Settings → Pages → Deploy from a branch → main, puis ouvrir l’URL fournie par GitHub. Sur iPhone, Safari → Partager → Sur l’écran d’accueil.

### Limites de V1
- Le choix « Restes » n’ajoute pas automatiquement de portions au repas précédent. Il faut indiquer davantage de personnes au repas cuisiné.
- Le rapprochement des ingrédients utilise leur nom normalisé : `tomate` et `tomates` sont distincts ; privilégier les mêmes libellés.
- Pas encore de liaison à un catalogue Carrefour, de gestion des conditionnements disponibles ou d’estimation des prix.

Aucune dépendance externe : HTML/CSS/JavaScript uniquement.
