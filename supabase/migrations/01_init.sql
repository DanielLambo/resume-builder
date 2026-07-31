-- Resumate init: resumes table, RLS, and private PDF storage bucket
-- Apply with: supabase db push / supabase migration up

create extension if not exists "pgcrypto";

-- ── resumes ──────────────────────────────────────────────────────────────
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled Resume',
  data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_user_id_idx on public.resumes (user_id);
create index if not exists resumes_updated_at_idx on public.resumes (updated_at desc);

create or replace function public.set_resumes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at
before update on public.resumes
for each row
execute function public.set_resumes_updated_at();

alter table public.resumes enable row level security;

drop policy if exists "resumes_select_own" on public.resumes;
create policy "resumes_select_own"
  on public.resumes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "resumes_insert_own" on public.resumes;
create policy "resumes_insert_own"
  on public.resumes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "resumes_update_own" on public.resumes;
create policy "resumes_update_own"
  on public.resumes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "resumes_delete_own" on public.resumes;
create policy "resumes_delete_own"
  on public.resumes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ── storage: resume-pdfs (owner folder = auth.uid()) ─────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-pdfs',
  'resume-pdfs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Paths must be: {user_id}/...
drop policy if exists "resume_pdfs_select_own" on storage.objects;
create policy "resume_pdfs_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resume-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "resume_pdfs_insert_own" on storage.objects;
create policy "resume_pdfs_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resume-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "resume_pdfs_update_own" on storage.objects;
create policy "resume_pdfs_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'resume-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'resume-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "resume_pdfs_delete_own" on storage.objects;
create policy "resume_pdfs_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resume-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
