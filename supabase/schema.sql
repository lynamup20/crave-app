-- Run this in the Supabase SQL editor for project eyfbrabcuuyertgckpit

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  taste_tags text[] not null default '{}',
  swipes_used int not null default 0,
  swipes_reset_date date not null default current_date,
  onboarding_completed boolean not null default false,
  is_premium boolean not null default false,
  bonus_swipes int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.swipe_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  restaurant_id text not null,
  restaurant_name text not null,
  cuisine_type text not null,
  action text not null check (action in ('like', 'pass')),
  created_at timestamptz not null default now()
);

create index if not exists swipe_history_user_id_idx on public.swipe_history(user_id);
create index if not exists swipe_history_user_action_idx on public.swipe_history(user_id, action);

create table if not exists public.recipe_cache (
  dish_key text primary key,
  recipe jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_cache (
  cache_key text primary key,
  results jsonb not null,
  cached_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.swipe_history enable row level security;
alter table public.recipe_cache enable row level security;
alter table public.restaurant_cache enable row level security;

create policy "users select own" on public.users for select using (auth.uid() = id);
create policy "users insert own" on public.users for insert with check (auth.uid() = id);
create policy "users update own" on public.users for update using (auth.uid() = id);

create policy "swipe_history select own" on public.swipe_history for select using (auth.uid() = user_id);
create policy "swipe_history insert own" on public.swipe_history for insert with check (auth.uid() = user_id);

create policy "recipe_cache read all" on public.recipe_cache for select using (true);
create policy "recipe_cache insert all" on public.recipe_cache for insert with check (true);
create policy "recipe_cache update all" on public.recipe_cache for update using (true);

create policy "restaurant_cache read all" on public.restaurant_cache for select using (true);
create policy "restaurant_cache insert all" on public.restaurant_cache for insert with check (true);
create policy "restaurant_cache update all" on public.restaurant_cache for update using (true);
