-- SpendWise Backend v1 — Supabase PostgreSQL
-- Run this entire file once in Supabase SQL Editor.
-- Safe to re-run for the core objects/policies below.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  preferred_currency char(3) not null default 'INR'
    check (preferred_currency ~ '^[A-Z]{3}$'),
  monthly_income numeric(14,2) not null default 0 check (monthly_income >= 0),
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  account_role text not null default 'user' check (account_role in ('user','admin','finance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists monthly_income numeric(14,2) not null default 0;
alter table public.profiles add column if not exists account_role text not null default 'user';
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists preferred_currency char(3) not null default 'INR';
alter table public.profiles add column if not exists theme text not null default 'dark';

-- ---------------------------------------------------------------------
-- WALLETS + ADJUSTMENT LEDGER
-- ---------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);
alter table public.wallets add column if not exists updated_at timestamptz not null default now();

create table if not exists public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  direction text not null check (direction in ('add','withdraw')),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_adjustments_wallet_date_idx
  on public.wallet_adjustments(user_id,wallet_id,created_at desc);

-- ---------------------------------------------------------------------
-- TRANSACTIONS
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  converted_amount numeric(14,2) check (converted_amount is null or converted_amount > 0),
  conversion_currency char(3),
  exchange_rate numeric(18,8) check (exchange_rate is null or exchange_rate > 0),
  exchange_rate_at timestamptz,
  category text not null check (length(trim(category)) between 1 and 80),
  payment_method text,
  description text,
  tags text[] not null default '{}',
  receipt_path text,
  location text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions(user_id,occurred_at desc);
create index if not exists transactions_user_category_idx on public.transactions(user_id,category);
create index if not exists transactions_wallet_idx on public.transactions(user_id,wallet_id);

-- A transaction may only refer to a wallet owned by the same user.
create or replace function public.validate_transaction_wallet_owner()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id=new.wallet_id and w.user_id=new.user_id
  ) then
    raise exception 'Wallet does not belong to this account';
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_wallet_owner_check on public.transactions;
create trigger transactions_wallet_owner_check
before insert or update of wallet_id,user_id on public.transactions
for each row execute function public.validate_transaction_wallet_owner();

-- ---------------------------------------------------------------------
-- OTHER USER DATA
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null default 'expense' check (kind in ('income','expense')),
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists categories_user_name_kind_idx
  on public.categories(coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name),kind);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Overall',
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  period text not null default 'monthly' check (period in ('weekly','monthly','yearly')),
  created_at timestamptz not null default now()
);
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  currency char(3) not null default 'INR',
  deadline date,
  created_at timestamptz not null default now()
);
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  contributed_at timestamptz not null default now(),
  note text
);
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  next_payment date,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  budget_alerts boolean not null default true,
  goal_reminders boolean not null default true,
  recurring_reminders boolean not null default true,
  daily_summary boolean not null default false,
  weekly_summary boolean not null default true,
  monthly_summary boolean not null default true,
  large_transaction_alerts boolean not null default true,
  email_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUTOMATIC PROFILE + MAIN WALLET ON SIGNUP
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'full_name','');
  insert into public.profiles(id,full_name)
  values(new.id,v_name)
  on conflict(id) do nothing;

  insert into public.wallets(user_id,name,currency,opening_balance)
  values(new.id,'Main Wallet','INR',0)
  on conflict do nothing;

  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep updated_at reliable.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at before update on public.wallets
for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();

-- Prevent users from promoting themselves to admin/finance.
create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid()=old.id and new.account_role is distinct from old.account_role then
    raise exception 'Account role can only be changed by an administrator';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------
-- ATOMIC WALLET ADD / WITHDRAW RPC
-- ---------------------------------------------------------------------
create or replace function public.adjust_wallet_balance(
  p_wallet_id uuid,
  p_amount numeric,
  p_direction text,
  p_note text default null
)
returns public.wallet_adjustments
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_balance numeric(14,2);
  v_result public.wallet_adjustments%rowtype;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_direction not in ('add','withdraw') then raise exception 'Invalid wallet operation'; end if;

  select * into v_wallet from public.wallets
  where id=p_wallet_id and user_id=v_user
  for update;
  if not found then raise exception 'Wallet not found'; end if;

  select v_wallet.opening_balance
    + coalesce((select sum(case when t.type='income' then t.amount else -t.amount end)
      from public.transactions t
      where t.wallet_id=p_wallet_id and t.user_id=v_user and t.currency=v_wallet.currency),0)
    + coalesce((select sum(case when a.direction='add' then a.amount else -a.amount end)
      from public.wallet_adjustments a
      where a.wallet_id=p_wallet_id and a.user_id=v_user),0)
  into v_balance;

  if p_direction='withdraw' and p_amount>v_balance then
    raise exception 'Insufficient wallet balance';
  end if;

  insert into public.wallet_adjustments(user_id,wallet_id,direction,amount,note)
  values(v_user,p_wallet_id,p_direction,p_amount,left(coalesce(p_note,''),160))
  returning * into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_adjustments enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- Drop our named policies before re-creating them so this script is re-runnable.
drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "wallets own all" on public.wallets;
drop policy if exists "wallet adjustments own all" on public.wallet_adjustments;
drop policy if exists "wallet adjustments select own" on public.wallet_adjustments;
drop policy if exists "categories read defaults or own" on public.categories;
drop policy if exists "categories own write" on public.categories;
drop policy if exists "transactions own all" on public.transactions;
drop policy if exists "budgets own all" on public.budgets;
drop policy if exists "goals own all" on public.savings_goals;
drop policy if exists "contributions own all" on public.goal_contributions;
drop policy if exists "recurring own all" on public.recurring_payments;
drop policy if exists "notification preferences own all" on public.notification_preferences;
drop policy if exists "notifications own all" on public.notifications;

create policy "profiles select own" on public.profiles for select using (auth.uid()=id);
create policy "profiles update own" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "wallets own all" on public.wallets for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "wallet adjustments select own" on public.wallet_adjustments for select using (auth.uid()=user_id);
create policy "categories read defaults or own" on public.categories for select using (user_id is null or auth.uid()=user_id);
create policy "categories own write" on public.categories for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "transactions own all" on public.transactions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "budgets own all" on public.budgets for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "goals own all" on public.savings_goals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "contributions own all" on public.goal_contributions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "recurring own all" on public.recurring_payments for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "notification preferences own all" on public.notification_preferences for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "notifications own all" on public.notifications for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Wallet adjustments are read-only from the browser. Only the trusted RPC can write the ledger.
revoke insert,update,delete on public.wallet_adjustments from anon,authenticated;
grant select on public.wallet_adjustments to authenticated;
-- RPC validates auth.uid() and wallet ownership, then writes atomically as its owner.
revoke all on function public.adjust_wallet_balance(uuid,numeric,text,text) from public;
grant execute on function public.adjust_wallet_balance(uuid,numeric,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- PRIVATE RECEIPT STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "receipt select own folder" on storage.objects;
drop policy if exists "receipt insert own folder" on storage.objects;
drop policy if exists "receipt delete own folder" on storage.objects;
create policy "receipt select own folder" on storage.objects for select
using(bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "receipt insert own folder" on storage.objects for insert
with check(bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "receipt delete own folder" on storage.objects for delete
using(bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);

-- NOTE: Admin roles are assigned manually by a trusted project owner in SQL.
-- Never add a public signup field that lets a user choose admin/finance.


-- Shared default expense categories (read-only to normal users through RLS).
insert into public.categories(user_id,name,kind,is_default)
select null, x.name, 'expense', true
from unnest(array[
 'Food & Dining','Shopping','Travel & Transport','Bills & Utilities','Education',
 'Health & Medical','Entertainment','Rent & Housing','Groceries','Personal Care',
 'Subscriptions','Other'
]) as x(name)
where not exists (
 select 1 from public.categories c
 where c.user_id is null and lower(c.name)=lower(x.name) and c.kind='expense'
);


-- Explicit authenticated table privileges; RLS remains the actual row-level boundary.
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
-- Wallet adjustment ledger is read-only to browser clients; writes only through the RPC.
revoke insert,update,delete on public.wallet_adjustments from anon,authenticated;
grant select on public.wallet_adjustments to authenticated;
