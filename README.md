# Content Portal POS + Inventory (Firestore + HTML5)

A single-page app (no React/Vue/Angular) for:
- Point of sale with FIFO/FEFO/FMFO inventory tracking
- Employee management: users, attendance, basic payroll
- Marketplace and services listing
- Multi-company websites with theme & cover management

Frontend only (HTML5 + JS modules) using Firebase Firestore and Storage.

## Quick start

1) Open Firebase Console and create a Web App under the project `maynilatekdo`. Ensure Firestore and Storage are enabled.

2) Firestore rules for development (insecure; replace for production):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}
```

3) Serve this folder with XAMPP (Apache) or any static server. For XAMPP on Windows, files live at `c:/xampp/htdocs/contentPortal` so visit:

- http://localhost/contentPortal/index.html

## Collections (data model)

- users: { email, salt, passHash, role, firstName, lastName, companyId, profile, createdAt }
- companies: { name, description, email, phone, themeColor, coverUrl, createdAt, ownerUid }
- products: { name, brand, kind: 'product'|'service', type: 'wet'|'dry'|'gadget'|'appliance'|'clothes', price, description, companyId, createdAt }
- inventoryBatches: { productId, quantity, remain, receivedAt, mfgDate, expDate, companyId, uid, status }
- sales: { companyId, uid, items: [{productId,name,price,qty}], total, createdAt, status }
- attendance: { uid, companyId, action:'in'|'out', at }
- notifications: { companyId, level, text, createdAt }
- payroll (optional): { uid, companyId, periodStart, periodEnd, hours, rate, gross }

## FIFO / FEFO / FMFO

- Wet goods: FIFO by `receivedAt`
- Dry goods: FEFO by earliest `expDate`, tie-breaker by `receivedAt`
- Gadgets/Appliances/Clothes: by earliest `mfgDate` (fallback to `receivedAt`)

Allocation happens on checkout; batches decremented inside a Firestore transaction.

## Limitations and notes

- Authentication: This demo uses a Firestore-only email/password (hashed with Web Crypto). Without Firebase Auth, Firestore security rules cannot enforce per-user permissions. Use the dev rules above only for local testing. For production, adopt Firebase Auth + rules, or an alternative identity layer.
- Social inbox (Facebook/Instagram/TikTok): Accessing external messages requires platform APIs and secure server tokens. This frontend-only app cannot fetch those directly. Consider a backend microservice or manual inbox within the portal.
- Printing QR/barcodes: Use the Inventory page generator; you can right-click and save/print.

## Try it

- Register an admin account (choose role and optionally set companyId).
- Create a company via sidebar (or open a company by id).
- Add products (choose kind 'product' or 'service' and type for inventory rules).
- Receive stock in Inventory; generate QR/barcode if needed.
- Open POS, add to cart, and checkout; verify stock decremented.
- Attendance: check-in/out; Payroll: compute hours and gross.

## Tech

- Firebase JS SDK v10 (Firestore + Storage)
- Chart.js (charts), JsBarcode (barcode), qrcode (QR)
- Vanilla JS modules with a basic hash router
