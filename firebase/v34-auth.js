// V34 — ONE family Firebase Auth account shared on two trusted iPhones.
// No household invitation, membership or server writes in this module.
import { firebaseAuth } from "../firebase-v34.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, reload, getIdToken
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

export const observeLogin = (callback,onError) => onAuthStateChanged(firebaseAuth,callback,onError);
async function persistLogin() {
  return setPersistence(firebaseAuth,browserLocalPersistence);
}
export async function signUp(email,password) {
  await persistLogin();
  const user=(await createUserWithEmailAndPassword(firebaseAuth,email,password)).user;
  await sendEmailVerification(user);
  return user;
}
export async function signIn(email,password) {
  await persistLogin();
  return (await signInWithEmailAndPassword(firebaseAuth,email,password)).user;
}
export async function resendVerification() {
  if (!firebaseAuth.currentUser) throw Error("Compte non connecté.");
  await sendEmailVerification(firebaseAuth.currentUser);
}
export async function refreshVerifiedAccount() {
  const user=firebaseAuth.currentUser;
  if (!user) throw Error("Compte non connecté.");
  await reload(user);
  if (user.emailVerified) await getIdToken(user,true);
  return user.emailVerified;
}
export const signOutAccount = () => signOut(firebaseAuth);
