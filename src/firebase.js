import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyABpWt6gE6vTm9xm8H7pMZPThTHuKx2vYA",
  authDomain: "ops-1-d3b60.firebaseapp.com",
  projectId: "ops-1-d3b60",
  storageBucket: "ops-1-d3b60.firebasestorage.app",
  messagingSenderId: "901313258434",
  appId: "1:901313258434:web:4149c1166ba263e542ec5b",
  measurementId: "G-1ZQJVHDT8W",
};

export const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);
