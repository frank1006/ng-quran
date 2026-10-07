-- QuranFlow account sync: one private row per signed-in user (bookmarks, reading place,
-- preferences). Run once in Supabase → SQL Editor.
--
-- Row level security: each user can only read and write their own row; nobody else's is
-- visible, even with the app's public key. Deleting the account deletes the row (cascade).

create table if not exists public.user_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  bookmarks   jsonb not null default '[]'::jsonb,
  last_read   jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Own row: read" on public.user_data;
drop policy if exists "Own row: insert" on public.user_data;
drop policy if exists "Own row: update" on public.user_data;
drop policy if exists "Own row: delete" on public.user_data;

create policy "Own row: read" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own row: insert" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own row: update" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own row: delete" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Guests (the public key without a session) get nothing
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

-- updated_at is set by the database on every write, so devices can tell which copy is newer
create or replace function public.user_data_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.user_data_touch();
