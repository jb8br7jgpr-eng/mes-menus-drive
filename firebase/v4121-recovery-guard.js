// V41.12.1 — résolution volontaire d'une divergence entre deux iPhone.
// L'ancienne version locale doit être archivée DURABLEMENT avant tout
// remplacement par l'état officiel du serveur. Aucun upload automatique.
export async function restoreLatestServerSafely({storage,session,userId,confirmation}) {
 if(confirmation!=="ABANDONNER_LE_BROUILLON")
  throw Error("Confirmation explicite requise.");
 if(!userId||!session||!storage)
  throw Error("Compte ou session de sauvegarde indisponible.");
 if(session.status().phase!=="recovery")
  throw Error("La synchronisation n'est pas en mode récupération.");
 const draft=await storage.readDraft(userId);
 if(!draft?.state||typeof draft.state!=="object")
  throw Error("Brouillon local introuvable. Aucun changement effectué.");
 // L'écriture de l'archive échoue => la récupération est refusée.
 // Ne jamais effacer le brouillon pour contourner un conflit.
 await storage.saveRecoveryArchive(userId,draft);
 return session.resolveWithServer({confirmation});
}
