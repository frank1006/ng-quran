-- QuranFlow AI answer reports: Google Play requires that people can report offensive AI
-- answers from inside the app. Run once in Supabase → SQL Editor.
--
-- Row level security: a signed-in user can add a report about an answer they received, and
-- nothing else; nobody can read reports with the app's key. Read them in the Supabase
-- dashboard (Table Editor → ai_reports). Size: a few hundred bytes a report, capped below.
-- Deleting the account deletes that user's reports (cascade).

create table if not exists public.ai_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('wrong', 'offensive', 'other')),
  note        text check (char_length(note) <= 500),
  question    text not null check (char_length(question) <= 1000),
  answer      text not null check (char_length(answer) <= 4000)
);

alter table public.ai_reports enable row level security;

drop policy if exists "Own report: insert" on public.ai_reports;
create policy "Own report: insert" on public.ai_reports
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Guests get nothing; signed-in users can only add
revoke all on public.ai_reports from anon, authenticated;
grant insert on public.ai_reports to authenticated;
