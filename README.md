# SpendWise — Personal Expense Tracker

**TEAM 3 · Final Semester Web Development Project**

SpendWise is a responsive personal finance tracker built with HTML, CSS, vanilla JavaScript, Supabase (PostgreSQL + Auth), and Chart.js. The UI opens in a local demo mode so you can explore the interface before connecting a backend.

## Features in this starter build
- Premium colourful Liquid Glass interface with cyan, blue, violet and pink technical accents; pointer-following glass highlights, hover tilt, animated counters and coloured charts.
- Dashboard with a user-entered monthly income plan, live total-spent and money-left calculations, and wallet-based account balance. The money-left figure is monthly income minus expenses recorded for the current month; it is a budget-planning figure, not a live bank balance.
- Transactions: add, edit, delete, search, filter and CSV export.
- Interactive day-wise bar, category pie/doughnut, six-month line and monthly trend graphs; users can select the dataset and graph type (bar, line, pie, doughnut, radar or polar area).
- Budget, savings-goal, wallet, recurring-payment and category starter screens.
- Light/dark theme preference and preferred display currency.
- Supabase Auth integration scaffold and PostgreSQL schema with user-scoped RLS.
- Currency code stored with each transaction. The current starter does **not** yet fetch live exchange rates; it keeps original currencies and requires the next integration step for reliable converted totals.

## 1. Run locally
Because the app uses browser JavaScript modules/CDN libraries, serve the folder through a local web server (not by opening `index.html` directly).

Python:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

## 2. Connect Supabase
1. Create a free project at https://supabase.com.
2. Open **Project Settings → API**.
3. Copy the Project URL and public anon/publishable key.
4. Paste them into `assets/js/config.js`.
5. Change `DEMO_MODE` to `false`.
6. In Supabase **SQL Editor**, run `sql/schema.sql`.
7. In Authentication settings, configure your site URL and allowed redirect URLs (local URL and your eventual Vercel URL).
8. Enable Google provider only if you want Google sign-in; configure its OAuth credentials in Supabase.

Never put the Supabase `service_role` key in frontend code or commit it to Git. The public anon/publishable key is designed to be exposed in a browser when RLS is correctly configured.

## 3. Deploy to Vercel
1. Create a GitHub repository and upload the project files.
2. Import that repository in https://vercel.com.
3. Framework preset: **Other**; build command: none; output directory: `.`.
4. Deploy.
5. Add your Vercel domain to Supabase Auth redirect URLs and set the Site URL.
6. Re-deploy if you change frontend config.

Vercel provides HTTPS on its hosted domains. A custom domain may cost money; the free `vercel.app` subdomain is sufficient for a student demo, subject to provider terms and availability.

## 4. Demo mode
- Demo mode is enabled by default.
- Transactions, monthly income plan and basic settings are stored in this browser's localStorage only.
- Demo data is not shared between devices and is not a substitute for a real database.
- Use the app's Add transaction button to try the interaction flow.

## 5. Important implementation notes
- This package is a functional starter foundation, not a claim that every item in the original feature checklist is fully integrated yet.
- Supabase SQL includes the core schema and RLS policies. Test policies using separate test accounts before real deployment.
- Receipt storage bucket is private and limited to images/PDFs up to 5 MB. The upload UI still needs to be wired to the storage API.
- Email notifications, scheduled reminders, Google OAuth and two-factor authentication need provider-side configuration and/or server-side scheduled functions. Do not put service secrets in browser JavaScript.
- The initial transaction form supports core fields. More advanced receipt upload, map/location picker, report PDF generation, budget thresholds, full CRUD for every module, and exchange-rate refresh are planned follow-up implementation tasks.
- For multi-currency totals, keep the original amount/currency. Before enabling automatic conversion, add a trusted exchange-rate provider, record the applied rate and timestamp, and show a clear fallback if the rate source is unavailable. Never silently treat different currencies as if they were the same currency.

## 6. Suggested next development milestones
1. Complete authenticated CRUD for every database table.
2. Add currency conversion service with cached rate snapshots and manual fallback.
3. Wire private receipt uploads and secure signed downloads.
4. Add budget alert calculations and in-app notification generation.
5. Complete PDF exports, report filters and calendar month navigation.
6. Add account deletion flow and profile settings.
7. Conduct RLS/security tests and mobile browser testing.

## Project structure
```text
SpendWise/
├── index.html
├── assets/
│   ├── css/styles.css
│   └── js/{config.js,app.js}
├── sql/schema.sql
├── sample-data/demo-transactions.json
├── docs/
└── README.md
```

## Credits
Designed & Developed by Riten Kumar.


## Backend v1 setup
See [`BACKEND_SETUP.md`](BACKEND_SETUP.md) for Supabase setup, SQL installation, authentication configuration and backend testing. Run `sql/schema.sql` before switching `DEMO_MODE` to `false`.


## Production-oriented build
Demo mode is disabled. Configure Supabase and run `sql/schema.sql` before signing in. See `BACKEND_SETUP.md` for setup steps and remaining external integrations.
