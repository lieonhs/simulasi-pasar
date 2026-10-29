-- RAM Capital: persetujuan admin + riwayat berita untuk machine learning.
-- Jalankan sekali di Supabase → SQL Editor (project my_pricess). Aman dijalankan ulang.
create table if not exists public.sp_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  role text not null default 'user' check (role in ('user','admin')),
  reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
alter table public.sp_members enable row level security;

create or replace function public.sp_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.sp_members where user_id = auth.uid() and role = 'admin' and status = 'approved');
$$;
create or replace function public.sp_is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.sp_members where user_id = auth.uid() and status = 'approved');
$$;

drop policy if exists "sp_members select own or admin" on public.sp_members;
create policy "sp_members select own or admin" on public.sp_members for select to authenticated
  using ((select auth.uid()) = user_id or (select public.sp_is_admin()));

create or replace function public.sp_request_access(p_name text default null, p_reason text default null)
returns public.sp_members language plpgsql security definer set search_path = public as $$
declare r public.sp_members; e text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into e from auth.users where id = auth.uid();
  insert into public.sp_members(user_id, email, name, reason) values (auth.uid(), e, nullif(trim(p_name),''), nullif(trim(p_reason),''))
  on conflict (user_id) do update set
    name = coalesce(nullif(trim(excluded.name),''), public.sp_members.name),
    reason = coalesce(nullif(trim(excluded.reason),''), public.sp_members.reason),
    email = excluded.email,
    status = case when public.sp_members.status = 'rejected' and excluded.reason is not null then 'pending' else public.sp_members.status end,
    requested_at = case when public.sp_members.status = 'rejected' and excluded.reason is not null then now() else public.sp_members.requested_at end
  returning * into r;
  return r;
end $$;

create or replace function public.sp_update_profile(p_name text)
returns public.sp_members language plpgsql security definer set search_path = public as $$
declare r public.sp_members;
begin
  update public.sp_members set name = nullif(trim(p_name),'') where user_id = auth.uid() returning * into r;
  return r;
end $$;

create or replace function public.sp_admin_decide(p_user uuid, p_status text, p_role text default null)
returns public.sp_members language plpgsql security definer set search_path = public as $$
declare r public.sp_members;
begin
  if not public.sp_is_admin() then raise exception 'hanya admin'; end if;
  if p_user = auth.uid() then raise exception 'admin tidak bisa mengubah status akunnya sendiri'; end if;
  if p_status not in ('pending','approved','rejected','revoked') then raise exception 'status tidak valid'; end if;
  if p_role is not null and p_role not in ('user','admin') then raise exception 'role tidak valid'; end if;
  update public.sp_members set status = p_status, role = coalesce(p_role, role), decided_at = now(), decided_by = auth.uid()
  where user_id = p_user returning * into r;
  return r;
end $$;

revoke all on function public.sp_request_access(text, text) from public, anon;
revoke all on function public.sp_update_profile(text) from public, anon;
revoke all on function public.sp_admin_decide(uuid, text, text) from public, anon;
revoke all on function public.sp_is_admin() from public, anon;
revoke all on function public.sp_is_approved() from public, anon;
grant execute on function public.sp_request_access(text, text) to authenticated;
grant execute on function public.sp_update_profile(text) to authenticated;
grant execute on function public.sp_admin_decide(uuid, text, text) to authenticated;
grant execute on function public.sp_is_admin() to authenticated;
grant execute on function public.sp_is_approved() to authenticated;

-- pengaturan aplikasi hanya untuk akun yang disetujui
drop policy if exists "sp_settings select own" on public.sp_settings;
drop policy if exists "sp_settings insert own" on public.sp_settings;
drop policy if exists "sp_settings update own" on public.sp_settings;
drop policy if exists "sp_settings delete own" on public.sp_settings;
create policy "sp_settings select own" on public.sp_settings for select to authenticated using ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_settings insert own" on public.sp_settings for insert to authenticated with check ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_settings update own" on public.sp_settings for update to authenticated using ((select auth.uid()) = user_id and (select public.sp_is_approved())) with check ((select auth.uid()) = user_id and (select public.sp_is_approved()));
create policy "sp_settings delete own" on public.sp_settings for delete to authenticated using ((select auth.uid()) = user_id and (select public.sp_is_approved()));

-- admin: akun El
insert into public.sp_members(user_id, email, name, status, role, decided_at)
select id, email, 'El', 'approved', 'admin', now() from auth.users where lower(email) = 'raafialmuchsin6805@gmail.com'
on conflict (user_id) do update set status = 'approved', role = 'admin';

-- riwayat sentimen berita harian per aset (diisi otomatis oleh server tiap kali berita dibuka; dipakai machine learning)
create table if not exists public.sp_news_daily (
  symbol text not null,
  day date not null,
  n int not null default 0,
  pos int not null default 0,
  neg int not null default 0,
  sent real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (symbol, day)
);
alter table public.sp_news_daily enable row level security;
drop policy if exists "sp_news_daily read" on public.sp_news_daily;
create policy "sp_news_daily read" on public.sp_news_daily for select to authenticated using ((select public.sp_is_approved()));
create or replace function public.sp_news_merge(p_rows jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.sp_news_daily(symbol, day, n, pos, neg, sent)
  select r->>'symbol', (r->>'day')::date, (r->>'n')::int, (r->>'pos')::int, (r->>'neg')::int, (r->>'sent')::real
  from jsonb_array_elements(p_rows) r
  on conflict (symbol, day) do update set
    n = greatest(public.sp_news_daily.n, excluded.n),
    pos = case when excluded.n >= public.sp_news_daily.n then excluded.pos else public.sp_news_daily.pos end,
    neg = case when excluded.n >= public.sp_news_daily.n then excluded.neg else public.sp_news_daily.neg end,
    sent = case when excluded.n >= public.sp_news_daily.n then excluded.sent else public.sp_news_daily.sent end,
    updated_at = now();
$$;
revoke all on function public.sp_news_merge(jsonb) from public, anon, authenticated;
grant execute on function public.sp_news_merge(jsonb) to service_role;
