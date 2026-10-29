// V34 — actions autorisées en lecture seule.
// Export et consultation des sauvegardes doivent rester disponibles
// même quand Firebase n'est pas joignable. Aucun bouton mutateur ici.
const SAFE_ACTIONS = new Set([
  "export-data",       // copie JSON locale vers Fichiers / iCloud
  "refresh-backups",   // lecture de l'historique local
  "close-modal"        // fermeture sans modifier les données
]);
export function isReadOnlySafeAction(action) {
  return typeof action === "string" && SAFE_ACTIONS.has(action);
}
