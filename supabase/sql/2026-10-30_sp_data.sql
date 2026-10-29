-- Penyimpanan data per kunci (riwayat demo, memori autopilot, log, buku transaksi, riwayat nilai).
-- Jalankan sekali di Supabase → SQL Editor. Aman dijalankan ulang.
create table if not exists public.sp_data (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null check (key ~ '^[a-zA-Z0-9_]{1,40}$'),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.sp_data enable row level security;

drop policy if exists "sp_data select own" on public.sp_data;
drop policy if exists "sp_data insert own" on public.sp_data;
drop policy if exists "sp_data update own" on public.sp_data;
drop policy if exists "sp_data delete own" on public.sp_data;

create policy "sp_data select own" on public.sp_data for select
  using ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_data insert own" on public.sp_data for insert
  with check ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_data update own" on public.sp_data for update
  using ((select auth.uid()) = user_id and (select public.sp_is_approved()))
  with check ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_data delete own" on public.sp_data for delete
  using ((select auth.uid()) = user_id and (select public.sp_is_approved()));
