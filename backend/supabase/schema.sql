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

-- Room image storage: create a bucket named `room-images` in
-- Storage > New bucket (public, so uploaded photos load without signed URLs),
-- then run these policies so each user can only touch their own folder
-- (files are stored at `{project_id}/{filename}`, and project_id -> owner_id
-- is enforced by the `projects` RLS policy above at the app layer).
insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload room images"
  on storage.objects for insert
  with check (bucket_id = 'room-images' and auth.role() = 'authenticated');

create policy "Authenticated users can delete room images"
  on storage.objects for delete
  using (bucket_id = 'room-images' and auth.role() = 'authenticated');

create policy "Anyone can view room images"
  on storage.objects for select
  using (bucket_id = 'room-images');
