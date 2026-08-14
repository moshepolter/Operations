# Moshe's Ops Board — standalone version

This is the same invoice / HPD violation / work order / directory app, rewired
to save data to a real database (Firebase) instead of Claude's storage — so it
can run on its own URL, independent of Claude entirely.

## 1. Set up Firebase (one-time, ~5 minutes)

1. Go to https://console.firebase.google.com and create a free project.
2. Click the **"</>"** (web app) icon to register a web app. Copy the
   `firebaseConfig` object it gives you.
3. Open `src/firebase.js` in this project and paste your values into the
   `FIREBASE_CONFIG` object at the top.
4. In the left sidebar: **Build > Firestore Database > Create database**
   (production mode, any region is fine).
5. In the left sidebar: **Build > Authentication > Get started**, then enable
   the **Anonymous** sign-in provider. This lets you and your boss both open
   the link and use the app with no login screen.
6. In Firestore, open the **Rules** tab and paste this, then click Publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /board/{doc} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

## 2. Run it locally to test

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Add a test invoice
and confirm it's still there after you refresh the page — that means Firebase
is working.

## 3. Put it on GitHub

```
git init
git add .
git commit -m "Ops board"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 4. Deploy it to a real URL

The easiest option is **Vercel** (free):

1. Go to https://vercel.com, sign up with your GitHub account.
2. Click "Add New Project," pick this repo.
3. Leave all settings as default (Vercel auto-detects Vite) and click Deploy.
4. You'll get a URL like `moshe-ops-board.vercel.app` — that's your
   independent, permanent link. Share that with your boss instead of a
   Claude link.

Any time you push new commits to GitHub, Vercel redeploys automatically.

## Notes

- Your data now lives in Firestore, not in this code and not in Claude —
  deleting or losing this code will NOT delete your data.
- Firebase's free tier is generous and plenty for this use case; you won't
  hit billing for normal day-to-day use.
- If you ever want to see your raw data, it's in the Firebase console under
  Firestore Database, in a collection called `board`.

## The boss-only link

Once deployed, your boss's link is just your normal URL with `/boss` on the
end, e.g. `https://moshe-ops-board.vercel.app/boss`. Opening that link:

- Skips straight to the invoice review screen — no tabs, no violations, no
  work orders, no directory. That data isn't even loaded on this page.
- Lets him Approve, Decline, or open a back-and-forth chat per invoice —
  he can ask a question, you reply from your own dashboard, and he sees your
  reply and can approve/decline or ask again, all in the same thread.
- Has no "exit" or menu — there's nowhere else for him to navigate to from
  that link.

Send him that exact link (not your main dashboard link). Anything he does
there shows up on your dashboard immediately, and any reply you send from
your dashboard shows up for him immediately too.
