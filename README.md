# Ledgerly — Expense Manager (web + Android)

One React + TypeScript codebase that runs as a website (installable as a PWA) and as an Android app via Capacitor.

## Features
- PIN lock; all data encrypted on the device with AES-256-GCM (key derived from the PIN with PBKDF2-SHA256, 310k iterations). Auto-locks after 5 minutes in the background.
- Records: expense / income / transfer, categories, accounts, date & time, notes; edit and delete; search; month view grouped by day.
- Dashboard: total balance, month income/expense, accounts, monthly budget, recent records.
- Reports: week / month / year, spending or income by category (donut + ranked list), income vs expense trend.
- Budgets: overall monthly budget and per-category limits with progress and "per day left".
- Accounts: cash / bank / wallet / card / savings with starting balances; debts & loans (lent / borrowed, due dates, settle).
- Settings: name, currency, change PIN, encrypted backup & restore, CSV export, erase.

## Run locally
```bash
npm install
npm run dev            # http://localhost:5173
```

## Build the website
```bash
npm run build          # -> dist/  (static files: upload to any web host, works in a sub-folder)
```
Serve over **HTTPS** (needed for encryption and offline/"Install app").

## Build the Android APK
Needs Android Studio (or the Android SDK) and Java 21.
```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
Or push this repo to GitHub: `.github/workflows/android-apk.yml` builds the APK on every push to `main`
(Actions tab → latest run → Artifacts → `ledgerly-debug-apk`).

For the Play Store you'll need a signed release build (`./gradlew bundleRelease` with your keystore).

## Code map
- `src/vault.ts` – encryption and storage
- `src/store.tsx` – app state, saves encrypted on every change
- `src/screens/` – Home, Records, AddRecord, Reports, Budgets, Accounts, Settings, Lock
- `src/seed.ts` – default categories and the optional sample data

## Website contact form

The contact form on the website saves messages to the `feedback` collection in Firestore (project `ledgerly-f2170`). Read them in the Firebase console under Firestore Database → `feedback`.

Add this block inside `match /databases/{database}/documents { … }` in your Firestore rules. It lets anyone create a message but nobody read, change or delete one from outside the console:

```
match /feedback/{id} {
  allow create: if request.resource.data.keys().hasOnly(['kind', 'name', 'email', 'message', 'source', 'createdAt'])
    && request.resource.data.kind in ['feedback', 'idea', 'problem', 'question']
    && request.resource.data.message is string
    && request.resource.data.message.size() > 0 && request.resource.data.message.size() <= 2000
    && request.resource.data.name is string && request.resource.data.name.size() <= 100
    && request.resource.data.email is string && request.resource.data.email.size() <= 200
    && request.resource.data.source == 'website'
    && request.resource.data.createdAt is timestamp;
  allow read, update, delete: if false;
}
```
