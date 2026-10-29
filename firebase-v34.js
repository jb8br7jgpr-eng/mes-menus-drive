// Speedrive V34 — Préparation Firebase (branche de test uniquement).
// Ce module n'est PAS chargé par index.html : aucune synchronisation n'est active.
// Les paramètres d'une application Web Firebase sont publics ; l'accès aux
// données doit être protégé par Firebase Authentication + règles Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDzFyZe88EK9GanlWtnOYng-viN4ov2l_o",
  authDomain: "speedrive-7e77c.firebaseapp.com",
  projectId: "speedrive-7e77c",
  storageBucket: "speedrive-7e77c.firebasestorage.app",
  messagingSenderId: "667391645783",
  appId: "1:667391645783:web:7687cf271b1b13d05d6b12",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);

// Ne jamais connecter les écritures Firestore à persist() en recopiant
// tout l'état local : cela écraserait des modifications de l'autre iPhone.
// Étapes suivantes : règles RLS Firestore par espace, modèle d'entités
// versionnées, file de modifications hors ligne, conflits et sauvegardes.
