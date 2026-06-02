-- =========================================================
-- CAHIER THE KING PIECES AUTOS - BASE SUPABASE V10
-- À coller dans Supabase > SQL Editor > New query > Run
-- Cette version ajoute aussi la partie FACTURES CLIENTS.
-- =========================================================

create extension if not exists pgcrypto;

-- Nettoyage optionnel si tu repars de zéro :
-- drop table if exists public.factures cascade;
-- drop table if exists public.devis cascade;
-- drop table if exists public.demandes cascade;
-- drop table if exists public.counters cascade;
-- drop table if exists public.profiles cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.counters (
  key text primary key,
  value integer not null default 0
);

create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  origine text not null default 'Téléphone',
  statut text not null default 'En attente',
  client_nom text default '',
  client_tel text default '',
  plaque text default '',
  marque text default '',
  modele text default '',
  vin text default '',
  salarie_nom text default '',
  notes text default '',
  propositions jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  demande_id uuid references public.demandes(id) on delete set null,
  statut text not null default 'Brouillon',
  client_nom text default '',
  client_tel text default '',
  plaque text default '',
  marque text default '',
  modele text default '',
  vin text default '',
  salarie_nom text default '',
  lignes jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  date_facture date not null default current_date,
  date_echeance date default current_date,
  statut text not null default 'Payée',
  client_nom text default '',
  client_adresse text default '',
  client_cp_ville text default '',
  mode_reglement text default 'Virement',
  paye_le date,
  notes text default '',
  lignes jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_demandes_updated_at on public.demandes;
create trigger set_demandes_updated_at
before update on public.demandes
for each row execute function public.set_updated_at();

drop trigger if exists set_devis_updated_at on public.devis;
create trigger set_devis_updated_at
before update on public.devis
for each row execute function public.set_updated_at();

drop trigger if exists set_factures_updated_at on public.factures;
create trigger set_factures_updated_at
before update on public.factures
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text;
  meta_display text;
begin
  meta_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g'));
  if meta_username = '' then
    meta_username := 'admin';
  end if;

  meta_display := coalesce(new.raw_user_meta_data->>'display_name', meta_username);

  insert into public.profiles (id, username, display_name, role)
  values (new.id, meta_username, meta_display, 'admin')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.next_counter(prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y text := to_char(now(), 'YYYY');
  k text := upper(prefix) || '_' || to_char(now(), 'YYYY');
  n integer;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecté';
  end if;

  insert into public.counters(key, value)
  values (k, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;

  return upper(prefix) || '-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

alter table public.profiles enable row level security;
alter table public.demandes enable row level security;
alter table public.devis enable row level security;
alter table public.factures enable row level security;
alter table public.counters enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select to authenticated
using (public.is_admin() or id = auth.uid());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
for update to authenticated
using (public.is_admin() or id = auth.uid())
with check (public.is_admin() or id = auth.uid());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
for insert to authenticated
with check (public.is_admin() or id = auth.uid());

drop policy if exists "demandes_admin_all" on public.demandes;
create policy "demandes_admin_all" on public.demandes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "devis_admin_all" on public.devis;
create policy "devis_admin_all" on public.devis
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "factures_admin_all" on public.factures;
create policy "factures_admin_all" on public.factures
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Pas d'accès direct aux compteurs, uniquement via la fonction next_counter.
drop policy if exists "counters_no_direct_access" on public.counters;
create policy "counters_no_direct_access" on public.counters
for select to authenticated
using (false);

create index if not exists idx_demandes_updated_at on public.demandes(updated_at desc);
create index if not exists idx_demandes_plaque on public.demandes(plaque);
create index if not exists idx_demandes_client on public.demandes(client_nom);
create index if not exists idx_devis_updated_at on public.devis(updated_at desc);
create index if not exists idx_devis_numero on public.devis(numero);
create index if not exists idx_factures_updated_at on public.factures(updated_at desc);
create index if not exists idx_factures_numero on public.factures(numero);
create index if not exists idx_factures_date on public.factures(date_facture desc);



-- =========================================================
-- V10 - Gestion des comptes admin depuis le site
-- Permet de modifier nom / identifiant / mot de passe et de supprimer un admin.
-- Le dernier compte admin et le compte connecté ne doivent pas être supprimés.
-- =========================================================

create or replace function public.clean_admin_username(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(value, ''), '[^a-z0-9._-]', '', 'g'));
$$;

create or replace function public.update_admin_account(
  target_id uuid,
  new_username text,
  new_display_name text,
  new_password text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cleaned_username text;
  cleaned_display text;
  new_email text;
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé';
  end if;

  cleaned_username := public.clean_admin_username(new_username);
  if cleaned_username = '' then
    raise exception 'Identifiant obligatoire';
  end if;

  cleaned_display := nullif(trim(coalesce(new_display_name, '')), '');
  if cleaned_display is null then
    cleaned_display := cleaned_username;
  end if;

  new_email := cleaned_username || '@thekingpiecesautos.fr';

  update public.profiles
  set username = cleaned_username,
      display_name = cleaned_display,
      role = 'admin'
  where id = target_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Compte introuvable';
  end if;

  update auth.users
  set email = new_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('username', cleaned_username, 'display_name', cleaned_display, 'role', 'admin'),
      updated_at = now()
  where id = target_id;

  if new_password is not null and trim(new_password) <> '' then
    if length(new_password) < 6 then
      raise exception 'Le mot de passe doit contenir au moins 6 caractères';
    end if;

    update auth.users
    set encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    where id = target_id;
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.update_admin_account(uuid, text, text, text) to authenticated;

create or replace function public.delete_admin_account(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_count integer;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé';
  end if;

  if target_id = auth.uid() then
    raise exception 'Impossible de supprimer le compte actuellement connecté';
  end if;

  select count(*) into admin_count from public.profiles where role = 'admin';
  if admin_count <= 1 then
    raise exception 'Impossible de supprimer le dernier compte admin';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

grant execute on function public.delete_admin_account(uuid) to authenticated;

-- =========================================================
-- IMPORTANT SUPABASE AUTH
-- Authentication > Providers > Email :
-- 1) Activer Email provider
-- 2) Désactiver Confirm email
-- =========================================================
