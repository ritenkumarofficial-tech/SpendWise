# SpendWise — Production Setup

Demo mode is disabled. The app requires a real Supabase project and does not create fake demo users or sample transactions.

## 1. Create Supabase project
Create a project at https://supabase.com. Keep the database password private. Copy the Project URL and anon/public key from Project Settings → API.

## 2. Install database schema
Open Supabase → SQL Editor → New query. Run the complete `sql/schema.sql` file. It creates the user-owned tables, RLS policies, private receipts bucket, signup profile/Main Wallet trigger and atomic wallet adjustment RPC.

## 3. Configure frontend
Edit `assets/js/config.js`:
```js
window.SPENDWISE_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
  DEFAULT_CURRENCY: "INR",
  DEMO_MODE: false
};
```
Only use the anon/public key in browser code. Never expose the service_role key or database password.

## 4. Authentication URLs
In Supabase → Authentication → URL Configuration:
- Site URL: `http://localhost:8000` for local testing.
- Add redirect URL: `http://localhost:8000/**`.
- Add production URL before deployment.
- Enable Email provider. Configure SMTP for reliable production email delivery.
Google OAuth button is present. To activate it, configure Google Cloud OAuth credentials and enable the Google provider in Supabase Authentication → Providers.

## 5. Run locally
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000`.

## Implemented modules in this build
- Email/password signup, sign-in, session restore and password reset.
- User profile, monthly income, currency and theme persistence.
- Transaction create/edit/delete and CSV export.
- Wallet create/delete, add-money and withdraw via atomic RPC/audit ledger.
- Budget create/delete and current-month expense calculation.
- Savings goal create/delete and contribution history.
- Custom categories create/delete; built-in categories are protected.
- Recurring payment create/delete.
- Notification centre, mark-all-read and per-user in-app preferences.
- Private receipt uploads (5 MB, JPEG/PNG/WEBP/PDF).
- RLS for user-owned data.
- Scroll reveal animations that replay when scrolling back into view; reduced-motion support.

## Not yet production-complete / requires separate integration
- The ZIP is not connected to your Supabase project until you add the URL/public key and run SQL.
- No live bank/UPI integration; balances are manually tracked.
- No automatic FX conversion service. Mixed-currency totals are excluded unless a conversion value is recorded.
- MFA TOTP enrollment/verification and account deletion UI are wired. Account deletion requires deploying `supabase/functions/delete-account` and setting the `SUPABASE_SERVICE_ROLE_KEY` secret. Scheduled email alerts, recurring transaction auto-generation and admin dashboard are not included yet. PDF output uses the browser print dialog (choose Save as PDF).
- Production security review, two-account RLS acceptance tests and deployment have not been performed.

## Test with fake financial data first
1. Create two separate test accounts.
2. Verify email and sign in.
3. Set monthly income and refresh.
4. Add/edit/delete income and expense transactions.
5. Create a wallet, add funds, withdraw, test insufficient-funds rejection and delete it.
6. Create/delete budgets, goals, contributions, categories and recurring payments.
7. Upload a receipt and confirm it is private.
8. Verify account A cannot read account B's data.

## Deploy account deletion function
From the project root, after installing the Supabase CLI and linking your project:
```bash
supabase functions deploy delete-account
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```
The service-role key is a server-side secret only. Never put it in `assets/js/config.js` or the browser. Verify deletion using a disposable test account first.
