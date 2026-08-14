// Firebase setup — this is the ONLY file you need to edit before running the app.
//
// 1. Go to https://console.firebase.google.com and create a free project.
// 2. In the project, click the "</>" (web app) icon to register a web app and
//    copy the firebaseConfig object it gives you into FIREBASE_CONFIG below.
// 3. In the left sidebar go to Build > Firestore Database > Create database
//    (start in production mode, pick any region).
// 4. In the left sidebar go to Build > Authentication > Get started >
//    enable the "Anonymous" sign-in provider. This lets you and your boss
//    both open the app link and write data without a login screen.
// 5. In Firestore, go to the "Rules" tab and paste the rules below so only
//    signed-in (including anonymous) visitors can read/write your board:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /board/{doc} {
//          allow read, write: if request.auth != null;
//        }
//      }
//    }
//
// That's it — save, then run `npm install` and `npm run dev` locally to test,
// or push to GitHub and deploy (see README.md).

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyABpWt6gE6vTm9xm8H7pMZPThTHuKx2vYA",
  authDomain: "ops-1-d3b60.firebaseapp.com",
  projectId: "ops-1-d3b60,
  storageBucket: "ops-1-d3b60.firebasestorage.app",
  messagingSenderId: "901313258434",
  appId: "1:901313258434:web:4149c1166ba263e542ec5b",
  measurementId: "G-1ZQJVHDT8W"
};

export const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);
