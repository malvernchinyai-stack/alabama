# Alabama Electrical — Quotes, Invoices & BOQ App

An offline-first web app for **ALABAMA ELECTRICAL INCORPORATION (Pvt) Ltd** for generating **Quotations**, **Invoices** and **Bills of Quantities (BOQ)**, built as an installable PWA (Progressive Web App) so it can be packaged into an Android app via [PWABuilder](https://www.pwabuilder.com/).

All data (clients, catalog items, quotes, BOQs, invoices, settings) is stored **only on the device**, in the browser's IndexedDB. There is no server and no internet connection required to use the app once it's installed.

## Features

- **Quotes** — pick or add a client, add line items (from your catalog or typed freely), automatic subtotal/VAT/total, status tracking (Draft → Sent → Accepted/Declined/Expired), branded PDF export & share, one-tap **"Convert to Invoice"** once a client accepts.
- **Invoices** — due-date tracking, automatic Overdue flag, partial-payment support (**Record Payment** logs each payment and recalculates the balance due), payment-status badges (Unpaid / Partially Paid / Paid), a downloadable payment receipt for every payment recorded, branded PDF export & share.
- **Bill of Quantities (BOQ)** — itemised materials, equipment and labour costing per project, with a one-tap **"Convert to Quote"** so estimators never re-type the same items twice.
- **Clients** — simple contact directory reused across all documents.
- **Item & Price Catalog** — solar panels, inverters, batteries, solar packages, solar accessories, electrical-installation items and labour, pre-seeded with sensible defaults — edit freely to match your real price list.
- **Settings** — company details, logo & brand colours, banking details for payment instructions, VAT toggle (off by default), currency (USD by default, optional ZWG conversion display), document numbering prefixes, invoice due-date default.
- **Backup & Restore** — export all data to a `.json` file, or restore from one. There's also a "Reset All Data" option.
- Fully **offline-capable** (service worker caches the whole app shell) and **installable** on Android/desktop as a standalone app.

## Project structure

```
index.html                 App shell (single HTML entry point)
manifest.webmanifest        PWA manifest (name, icons, colours)
service-worker.js           Offline caching (cache-first, versioned)
css/styles.css               All app styling
js/
  app.js                     Router, app shell, theme, install prompt, SW registration
  db.js                      IndexedDB wrapper + default settings/catalog
  utils.js                   Formatting & helper functions
  ui.js                      Modal / confirm dialog helpers
  item-editor.js             Reusable line-item editor (used by Quotes, BOQ, Invoices)
  pdf.js                     Branded PDF generation (jsPDF) — quotes, BOQs, invoices, payment receipts
  views/
    dashboard.js, quotes.js, boq.js, invoices.js,
    clients.js, catalog.js, settings.js
vendor/jspdf.umd.min.js      PDF library, vendored locally (works fully offline)
assets/logo.png              Company logo placeholder (replace via Settings with your real logo)
icons/                       App icons generated from the logo (192, 512, maskable, favicon, apple touch)
```

No build step, no bundler, no npm install needed to run it — it's plain HTML/CSS/JS and can be opened directly or hosted as static files.

## 1. Put it on GitHub

```bash
cd alabama-electrical-app
git init
git add .
git commit -m "Initial commit: Alabama Electrical offline quotes/invoices/BOQ app"
git branch -M main
git remote add origin https://github.com/<your-username>/alabama-electrical-app.git
git push -u origin main
```

(If you used the zip provided, the git repo is already initialised for you — just add your remote and push.)

## 2. Host it with GitHub Pages (needed for PWABuilder)

1. On GitHub, open the repo → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)` → **Save**.
4. Wait a minute, then GitHub will give you a URL like:
   `https://<your-username>.github.io/alabama-electrical-app/`
5. Open that URL on your phone or desktop Chrome — you should see the app, and after a few seconds a **"📲 Install this app"** banner (or the browser's own install icon in the address bar).

> Because the whole app uses relative paths, it works correctly whether it's hosted at the root of a domain or in a subfolder like a GitHub Pages project site.

## 3. Build the Android app with PWABuilder

1. Go to **[pwabuilder.com](https://www.pwabuilder.com/)**.
2. Paste your GitHub Pages URL (from step 2) and click **Start**.
3. PWABuilder will score your manifest/service worker — it should show green checks for "Installable" and "Service Worker" (we've included both).
4. Click **Package for Stores** → choose **Android**.
5. Fill in the package details (package ID e.g. `com.alabamaelectrical.app`, app name, version). You can let PWABuilder generate a signing key for you, or supply your own if you already have one for the Play Store.
6. Download the generated package — you'll get a `.aab` (for Play Store submission) and/or a `.apk` (for direct install/testing on a device).
7. To test immediately: transfer the `.apk` to an Android phone and install it directly (you may need to allow "Install unknown apps" for your file manager/browser once).

This produces what's called a **Trusted Web Activity (TWA)** — a real, installable Android app that wraps your PWA and runs it full-screen with no browser UI, using Android's WebView. It still works fully offline because of the service worker.

## 4. First-time setup inside the app

Open **More → Settings** and fill in:

- Confirm the company address and registration number (phone, email, website and banking details are pre-filled).
- Upload your **real logo** to replace the placeholder "AE" mark — this updates the in-app header, the app icon, and every PDF automatically.
- Confirm the brand colours (navy + amber pre-set to match the website; adjust if you like).
- Leave **VAT** off until Alabama Electrical is VAT-registered — flip it on later from the same screen, at which point it will apply to all new documents.
- Currency defaults to USD; turn on the ZWG toggle if you want an approximate ZWG amount shown alongside totals (set the exchange rate).
- Adjust the default **Invoice Due (days)** and **Quote Validity (days)** if you don't want the 14/30-day defaults.

Then go to **More → Item & Price Catalog** and adjust the pre-loaded solar and electrical-installation items to match your actual price list.

## 5. Everyday use

- Create a **Quote** for a prospective job. Once the client accepts, open the quote and tap **Convert to Invoice** — it copies the line items across so nothing needs retyping.
- On the **Invoice**, tap **Mark as Sent** once you've delivered it, then **Record Payment** each time money comes in (full or partial). The invoice automatically shows Unpaid / Partially Paid / Paid, and flags itself **Overdue** once the due date passes with a balance still owing.
- Every payment gets its own downloadable **Receipt** PDF from the invoice screen.
- Use a **BOQ** for larger projects to cost out materials, equipment and labour first, then tap **Convert to Quote** when you're ready to send pricing to the client.

## 6. Updating the app later

Whenever you change any file, **bump `CACHE_VERSION`** at the top of `service-worker.js` (e.g. `v1` → `v2`) before pushing — this tells installed copies of the app to fetch the new files instead of serving the old cached ones. Commit, push, and (if using GitHub Pages) the live URL updates automatically within a minute or two; installed Android app users will get the update next time they open the app with a connection.

## Data & privacy

Everything is stored locally in the browser/WebView's IndexedDB on the device the app is installed on — nothing is sent anywhere. Use **More → Backup & Restore** regularly to export a `.json` backup (e.g. email it to yourself or save it to cloud storage), especially before switching devices or clearing browser data.
