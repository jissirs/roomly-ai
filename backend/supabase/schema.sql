-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Auth (users) is handled entirely by Supabase — no `users` table needed here.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  room_type text not null,
  style text not null,
  budget integer not null,
  requirements text[] not null default '{}',
  dimensions jsonb,
  notes text,
  stage text not null default 'room-input',
  status text not null default 'draft',
  progress integer not null default 16,
  has_room_image boolean not null default false,
  ai_instructions text,
  generated_image_url text,
  decisions jsonb not null default '{}'::jsonb,
  product_selections jsonb not null default '{}'::jsonb,
  estimated_total integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.projects enable row level security;

create policy "Users manage their own projects"
  on public.projects for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Curated product catalog (see backend/supabase/seed_products.sql) — public read.
create table if not exists public.products (
  id text primary key,
  category text not null,
  name text not null,
  store text not null,
  price integer not null,
  match integer not null,
  size text not null,
  url text not null,
  image_url text,
  sku text,
  tags text[] not null default '{}',
  verified_at date,
  -- Style ids this product fits (matches STYLES ids in
  -- frontend/src/pages/CreateProject/CreateProjectPage.jsx, e.g. "japandi",
  -- "minimal") — lets Product Match actually honor the style the user
  -- picked, instead of ranking every category purely by `match`.
  styles text[] not null default '{}'
);

-- Safe to re-run on a database that already has `products` without this column.
alter table public.products add column if not exists styles text[] not null default '{}';
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists tags text[] not null default '{}';
alter table public.products add column if not exists verified_at date;

alter table public.products enable row level security;

create policy "Anyone can read products"
  on public.products for select
  using (true);

-- Room image storage: bucket `room-images` (public read, so photos load without
-- signed URLs). Files live at `{project_id}/{file}` (uploaded room photos) and
-- `generated/{project_id}/{file}` (AI results). Writes are limited to the
-- owner of that project; reading stays public because the URLs are unguessable
-- and are handed to OpenAI/the browser directly.
insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload room images" on storage.objects;
drop policy if exists "Authenticated users can delete room images" on storage.objects;
drop policy if exists "Owners upload room images" on storage.objects;
drop policy if exists "Owners delete room images" on storage.objects;
drop policy if exists "Anyone can view room images" on storage.objects;

create policy "Owners upload room images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-images'
    and exists (
      select 1 from public.projects p
      where p.owner_id = auth.uid()
        and p.id::text = case when (storage.foldername(objects.name))[1] = 'generated'
                              then (storage.foldername(objects.name))[2]
                              else (storage.foldername(objects.name))[1] end
    )
  );

create policy "Owners delete room images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-images'
    and exists (
      select 1 from public.projects p
      where p.owner_id = auth.uid()
        and p.id::text = case when (storage.foldername(objects.name))[1] = 'generated'
                              then (storage.foldername(objects.name))[2]
                              else (storage.foldername(objects.name))[1] end
    )
  );

create policy "Anyone can view room images"
  on storage.objects for select
  using (bucket_id = 'room-images');

-- Keep obviously invalid values out of the table (the app enforces the same limits).
alter table public.projects drop constraint if exists projects_budget_range;
alter table public.projects add constraint projects_budget_range check (budget between 100 and 1000000) not valid;

-- Project checkpoints: named snapshots of a project's editable state, so a
-- user can roll back after changing style/budget/decisions/AI results.
-- Generated images stay in Storage, so restoring never re-runs (or re-bills) AI.
create table if not exists public.project_checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists project_checkpoints_project_idx
  on public.project_checkpoints (project_id, created_at desc);

alter table public.project_checkpoints enable row level security;

drop policy if exists "Users manage their own checkpoints" on public.project_checkpoints;
create policy "Users manage their own checkpoints"
  on public.project_checkpoints for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- Affiliate tracking link per product (from your affiliate network). When set,
-- the "ดูสินค้าจริง" button uses it instead of the plain store URL.
alter table public.products add column if not exists affiliate_url text;
alter table public.products add column if not exists price_checked_at timestamptz;

-- AI usage limits (used by the `api` Edge Function): counts paid AI calls per user.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, used_at desc);
alter table public.ai_usage enable row level security;  -- no policies: only the function below touches it

create or replace function public.consume_ai_quota(p_per_minute int, p_per_day int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  day_count int;
  minute_count int;
begin
  if uid is null then return 'unauthenticated'; end if;
  delete from public.ai_usage where user_id = uid and used_at < now() - interval '1 day';
  select count(*) into day_count from public.ai_usage where user_id = uid;
  if day_count >= p_per_day then return 'day'; end if;
  select count(*) into minute_count from public.ai_usage where user_id = uid and used_at > now() - interval '1 minute';
  if minute_count >= p_per_minute then return 'minute'; end if;
  insert into public.ai_usage (user_id) values (uid);
  return 'ok';
end;
$$;

revoke all on function public.consume_ai_quota(int, int) from public, anon;
grant execute on function public.consume_ai_quota(int, int) to authenticated;
