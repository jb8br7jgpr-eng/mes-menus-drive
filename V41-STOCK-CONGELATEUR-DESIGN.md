# Speedrive V41 — Stock maison, congélateur et consommation : plan de conception

**Statut : proposition en cours de validation. Aucune migration, écriture Firebase, suppression ou déploiement.**

## Objectifs d'usage

1. Ajouter un sixième onglet principal **Stock** (titre de page : Stock maison). Garder les 6 icônes/boutons lisibles sur un iPhone étroit et la barre de navigation sur une ligne.
2. Afficher dans **Stock** deux sous-vues de l'unique inventaire : **Placards / frigo** (ingrédients + achats du quotidien) et **Congélateur** (plats préparés avec portions).
3. Dans Stock, retrouver les **plats prévus cette semaine** avec deux actions très lisibles : **C'est mangé** et **Au congélateur**.
4. Dans **Menus**, une action **Remplacer** facilement accessible, notamment pour basculer d'un chili vers « Commandé / repas libre » sans consommer d'ingrédients.
5. Proposer les portions du congélateur pendant la planification, sans générer d'ingrédients à acheter et sans permettre de réserver deux fois la même portion.
6. Déduire le stock réel des besoins de Courses et garder une validation **Courses faites** unique et idempotente.
7. Corriger le filtre catégories qui ne montrait que les catégories effectivement attribuées ; toutes les catégories V39 sont désormais proposées, même vides. Les fiches conservant « Autres » ne sont **pas** reclassées automatiquement.

## Source unique de vérité : ne pas dupliquer les stocks

**État actuel** : getWeek().pantry représente une quantité déclarée pour une seule semaine. Le statut `checked` signifie « acheté », mais il n'ajoute rien à un inventaire permanent. Les restes dans Menus sont des portions issues d'un plat cuisiné la semaine même, distinctes d'un véritable congélateur persistant.

**Cible** : une liste globale `inventory` de quantités canoniques et un `freezerBatches` contenant des portions disponibles. Des événements d'entrée / sortie sont enregistrés pour garantir l'idempotence :
- entrée depuis Courses faites (uniquement achats réellement validés, après confirmation),
- sortie lors de la préparation effective d'un plat,
- entrée au congélateur lorsque des portions de ce plat ont réellement été préparées,
- sortie du congélateur lorsque les portions ont été mangées.

Chaque événement a un identifiant unique et un état appliqué / annulé, pour éviter une double addition ou une double déduction si le bouton est touché deux fois, si la fenêtre est rouverte ou si les deux iPhone sont utilisés successivement.

Les unités g/kg, ml/cl/l, pièce et nombre de boîtes sont converties via les **conditionnements déjà définis** dans Produits. Les unités incompatibles ne sont jamais additionnées silencieusement. Les ingrédients non liés doivent utiliser une identité stable (id ingrédient). Les produits indépendants utilisent leur id produit. Les achats ponctuels demandent une référence ou restent entrées indépendantes.

### Règles critiques

- **Planifier ≠ préparer ≠ manger**. La planification n'enlève rien au stock. L'action « C'est mangé » confirme que le plat a été préparé et mangé ; une éventuelle partie non mangée reste disponible comme reste ou est congelée. Les ingrédients du lot cuisiné ne sont décrémentés **qu'une fois**.
- « Au congélateur » sur un plat prévu correspond à la **préparation réelle** de ce plat et l'ajout de portions au congélateur ; déduire les ingrédients une seule fois. Si le plat a déjà été préparé / mangé, transférer uniquement les portions de restes encore disponibles (sans deuxième déduction).
- Un plat pris dans le congélateur ne génère **aucune course**. Le planifier réserve seulement des portions ; les portions seront réellement retirées lors de « C'est mangé ». Les réservations peuvent être annulées quand le menu change.
- « Courses faites » transfère seulement les lignes effectivement marquées **Acheté** (afficher leur nombre et une confirmation) ; les articles non achetés restent à acheter. La même ligne ne peut être créditée deux fois. Pour un produit en boîte de 6, 1 boîte achetée devient 6 pièces si son conditionnement est connu.
- **Stock maison déduit des courses** : calculer besoins bruts des menus (dont congélateur exclu) + ajouts manuels, moins stock disponible **non réservé / non consommé**, puis arrondir au conditionnement commercial. S'assurer que la déduction n'est jamais appliquée deux fois.
- **Retirer / remplacer** un plat prévu non préparé ne retire ni ingrédients ni portions. Si l'achat a déjà été fait, ne pas le supprimer automatiquement du stock. Si un plat a déjà été préparé, toute opération de retour en arrière demande confirmation et passe par un événement inverse.
- Si une quantité d'ingrédient manque ou une unité est inconnue, avertir et proposer de corriger la fiche ; ne pas produire de stock négatif silencieusement.
- Les repas de la semaine peuvent être **remplacés sans parcours supprimer puis ajouter**. Une entrée de type « repas commandé / libre » ne génère pas d'ingrédients et n'est pas un plat cuisiné.
- Conserver le bouton existant « Générer / Actualiser les courses » pour les menus modifiés, en signalant la liste périmée plutôt que de réécrire une liste déjà en cours d'achat sans confirmation.

## Compatibilité cloud et sécurité

Le codec Firestore V34 sauvegarde un `state` JSON `schema:1` complet (photos traitées à part). Des nouvelles propriétés optionnelles peuvent être enregistrées sans nouveau schéma Firestore **à condition de vérifier le chargement, les limites de taille et les règles en émulateur**. Aucune modification serveur ne doit être présumée nécessaire sans tests.
- Avant tout changement d'état réel, sauvegarde / point de restauration ; migration **en aperçu seulement**.
- Ne jamais sommer les `pantry` de toutes les semaines (risque de gonfler le stock). Proposer une initialisation explicite depuis la semaine choisie, avec affichage des quantités, puis garder la semaine comme archive.
- Ne pas modifier ni écraser les données autoritatives pendant une simple consultation ou un lancement de l'app.
- Tester un achat / une préparation sur deux sessions d'iPhone successives, erreurs de réseau, double-clic et reprise après échec.
- Préserver les statistiques de menus, restes, recettes, historiques, variantes de conditionnements, import Carrefour et sauvegardes privées.

## Phasage de validation proposé

**A.** Correction filtres catégories V39/V40, sécurité : préparée sur branche de test, sans reclasser les anciennes fiches.

**B.** Inventaire global + nouvel onglet Stock + transition prudente du `pantry` hebdomadaire existant ; aucune transaction de consommation avant validation de l'inventaire.

**C.** Courses faites et véritable entrée en stock avec déduplication / confirmations / tests boîte 6 ou 12, poids/volume et achats Grand Frais.

**D.** Congélateur de plats préparés (quantités, lots, dates facultatives), réservation puis consommation dans Menus, aucun ingrédient supplémentaire pour les repas congelés.

**E.** Boutons « C'est mangé » et « Au congélateur » dans Stock, journal des préparations, gestion des portions cuites / mangées / congelées et des restes sans double déduction.

**F.** Remplacement rapide des repas et option « repas commandé », actualisation sûre des besoins de courses. Vérifications transverses iPhone, Firebase Rules et sauvegardes.

Aucun déploiement avant approbation explicite ; aucune branche de test ne doit modifier l'environnement de production.
