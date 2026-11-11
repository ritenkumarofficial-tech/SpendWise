# SpendWise — Project Overview

## Project title
TEAM 3 – SpendWise – Personal Expense Tracker

## Objective
To develop a responsive web application that helps individuals record income and expenses, organise transactions, set budgets, monitor savings goals, and understand spending patterns through charts and reports.

## Proposed stack
- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend services: Supabase Auth, PostgreSQL and Storage
- Visualisations: Chart.js
- Icons: Lucide
- Hosting: Vercel

## Core modules
1. Authentication and profile
2. Dashboard and financial summaries
3. Income and expense transactions
4. Categories and payment methods
5. Budgets and spending alerts
6. Savings goals and contributions
7. Wallets and accounts
8. Recurring payments
9. Analytics and reports
10. Notifications and preferences
11. Data export, privacy and security

## Security design
All personal records are associated with the authenticated Supabase user. PostgreSQL Row Level Security policies restrict access to records owned by the current user. Receipt objects are stored in a private bucket under a user-specific folder. Client-side validation improves usability but server/database constraints remain authoritative.

## Limitations to disclose
The current starter ZIP includes a functional browser demo and initial Supabase integration foundation. Some planned modules require further CRUD wiring and provider configuration. Currency conversion is not yet active in this starter build. The project must be tested with separate accounts and deployed configuration before production use.
