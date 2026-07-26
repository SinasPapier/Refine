-- ============================================================================
-- Agentur-App – Datenbankschema für Supabase
-- ----------------------------------------------------------------------------
-- Anleitung: Öffne in Supabase den "SQL Editor", füge dieses komplette Skript
-- ein und klicke "Run". Es legt alle Tabellen, Regeln und die Nummern-Funktion
-- an. Das Skript kann gefahrlos erneut ausgeführt werden (IF NOT EXISTS).
--
-- WICHTIG – zusätzlich einmal im Dashboard erledigen:
--   Authentication -> Sign In / Providers -> Email
--   -> "Allow new users to sign up" AUSSCHALTEN
-- Sonst kann sich jede fremde Person selbst ein Konto anlegen und damit alle
-- Daten sehen. Eigene Konten manuell unter Authentication -> Users anlegen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelle: profile (ein Eintrag je Gesellschafter/angemeldetem Nutzer)
-- ---------------------------------------------------------------------------
create table if not exists public.profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text,
  stundensatz numeric,
  farbe       text default '#4f46e5',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelle: kunden
-- ---------------------------------------------------------------------------
create table if not exists public.kunden (
  id             uuid primary key default gen_random_uuid(),
  kundennummer   text,
  name           text not null,
  ansprechpartner text,
  email          text,
  telefon        text,
  adresse        text,
  notiz          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelle: projekte
-- ---------------------------------------------------------------------------
create table if not exists public.projekte (
  id          uuid primary key default gen_random_uuid(),
  kunde_id    uuid references public.kunden (id) on delete cascade,
  name        text not null,
  beschreibung text,
  status      text not null default 'aktiv',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelle: arbeitszeiten
-- ---------------------------------------------------------------------------
create table if not exists public.arbeitszeiten (
  id               uuid primary key default gen_random_uuid(),
  gesellschafter_id uuid not null references auth.users (id) on delete cascade,
  projekt_id       uuid references public.projekte (id) on delete set null,
  datum            date not null default current_date,
  dauer_minuten    integer not null check (dauer_minuten >= 0),
  beschreibung     text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelle: zustaendigkeiten
-- ---------------------------------------------------------------------------
create table if not exists public.zustaendigkeiten (
  id               uuid primary key default gen_random_uuid(),
  titel            text not null,
  beschreibung     text,
  gesellschafter_id uuid references auth.users (id) on delete set null,
  status           text not null default 'offen',
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelle: nummernkreise (je Typ genau eine Zeile: kunde / rechnung / angebot)
-- ---------------------------------------------------------------------------
create table if not exists public.nummernkreise (
  typ            text primary key,      -- 'kunde' | 'rechnung' | 'angebot'
  praefix        text not null default '',
  mit_jahr       boolean not null default true,
  reset_pro_jahr boolean not null default true,
  jahr           integer not null default extract(year from now()),
  zaehler        integer not null default 0,
  stellen        integer not null default 4
);

-- Standard-Nummernkreise anlegen (nur falls noch nicht vorhanden)
insert into public.nummernkreise (typ, praefix, mit_jahr, reset_pro_jahr, stellen)
values
  ('kunde',    'K-',  false, false, 4),
  ('rechnung', 'RE-', true,  true,  4),
  ('angebot',  'AN-', true,  true,  4)
on conflict (typ) do nothing;

-- ---------------------------------------------------------------------------
-- Tabelle: nummern_log (Dokumentation aller erzeugten Nummern)
-- ---------------------------------------------------------------------------
create table if not exists public.nummern_log (
  id         uuid primary key default gen_random_uuid(),
  typ        text not null,
  nummer     text not null,
  erzeugt_von uuid references auth.users (id) on delete set null,
  erzeugt_am timestamptz not null default now(),
  notiz      text
);

-- ============================================================================
-- Funktion: next_nummer – erzeugt atomar die nächste Nummer eines Typs,
-- protokolliert sie und gibt sie zurück. Durch "update ... returning" ist die
-- Erhöhung des Zählers gegen gleichzeitige Zugriffe abgesichert (keine Doppel).
-- ============================================================================
create or replace function public.next_nummer(p_typ text, p_notiz text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kreis   public.nummernkreise%rowtype;
  v_jahr    integer := extract(year from now());
  v_zaehler integer;
  v_nummer  text;
begin
  -- Ohne angemeldeten Nutzer wird keine Nummer vergeben.
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  -- Zeile des Nummernkreises sperren
  select * into v_kreis from public.nummernkreise where typ = p_typ for update;
  if not found then
    raise exception 'Unbekannter Nummernkreis: %', p_typ;
  end if;

  -- Jahreswechsel: Zähler ggf. zurücksetzen
  if v_kreis.reset_pro_jahr and v_kreis.jahr <> v_jahr then
    v_zaehler := 1;
    update public.nummernkreise
      set jahr = v_jahr, zaehler = 1
      where typ = p_typ;
  else
    v_zaehler := v_kreis.zaehler + 1;
    update public.nummernkreise
      set zaehler = v_zaehler, jahr = v_jahr
      where typ = p_typ;
  end if;

  -- Nummer zusammensetzen: Präfix [+ Jahr-] + aufgefüllter Zähler
  v_nummer := v_kreis.praefix;
  if v_kreis.mit_jahr then
    v_nummer := v_nummer || v_jahr::text || '-';
  end if;
  v_nummer := v_nummer || lpad(v_zaehler::text, v_kreis.stellen, '0');

  -- Protokollieren
  insert into public.nummern_log (typ, nummer, erzeugt_von, notiz)
  values (p_typ, v_nummer, auth.uid(), p_notiz);

  return v_nummer;
end;
$$;

-- Aufrufrecht entziehen und gezielt nur Angemeldeten geben.
-- (In PostgreSQL darf sonst standardmäßig JEDER Funktionen ausführen.)
revoke all on function public.next_nummer(text, text) from public;
revoke all on function public.next_nummer(text, text) from anon;
grant execute on function public.next_nummer(text, text) to authenticated;

-- ============================================================================
-- Trigger: legt beim ersten Login automatisch einen profile-Eintrag an
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security: alle Daten nur für eingeloggte Nutzer sichtbar/änderbar
-- ============================================================================
alter table public.profile          enable row level security;
alter table public.kunden           enable row level security;
alter table public.projekte         enable row level security;
alter table public.arbeitszeiten    enable row level security;
alter table public.zustaendigkeiten enable row level security;
alter table public.nummernkreise    enable row level security;
alter table public.nummern_log      enable row level security;

-- Gemeinsam genutzte Stammdaten: alle Angemeldeten dürfen alles bearbeiten.
do $$
declare
  t text;
begin
  foreach t in array array['kunden','projekte','zustaendigkeiten'] loop
    execute format('drop policy if exists "auth_all" on public.%I;', t);
    execute format(
      'create policy "auth_all" on public.%I
         for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Alte Policies entfernen, damit dieses Skript erneut ausführbar bleibt.
drop policy if exists "auth_all"      on public.arbeitszeiten;
drop policy if exists "zeiten_select" on public.arbeitszeiten;
drop policy if exists "zeiten_insert" on public.arbeitszeiten;
drop policy if exists "zeiten_update" on public.arbeitszeiten;
drop policy if exists "zeiten_delete" on public.arbeitszeiten;
drop policy if exists "auth_all"       on public.profile;
drop policy if exists "profile_select" on public.profile;
drop policy if exists "profile_update" on public.profile;
drop policy if exists "auth_all"   on public.nummern_log;
drop policy if exists "log_select" on public.nummern_log;
drop policy if exists "auth_all"      on public.nummernkreise;
drop policy if exists "kreise_select" on public.nummernkreise;
drop policy if exists "kreise_update" on public.nummernkreise;

-- Arbeitszeiten: alle sehen alles, bearbeiten nur die eigenen Einträge.
create policy "zeiten_select" on public.arbeitszeiten
  for select to authenticated using (true);

create policy "zeiten_insert" on public.arbeitszeiten
  for insert to authenticated with check (gesellschafter_id = auth.uid());

create policy "zeiten_update" on public.arbeitszeiten
  for update to authenticated
  using (gesellschafter_id = auth.uid())
  with check (gesellschafter_id = auth.uid());

create policy "zeiten_delete" on public.arbeitszeiten
  for delete to authenticated using (gesellschafter_id = auth.uid());

-- Profile: für alle sichtbar, änderbar nur das eigene.
-- Neue Profile legt der Trigger handle_new_user an, daher keine insert-Policy.
create policy "profile_select" on public.profile
  for select to authenticated using (true);

create policy "profile_update" on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Nummern-Protokoll: nur lesen – Einträge entstehen ausschließlich über
-- next_nummer und bleiben damit unveränderlich (revisionssicher).
create policy "log_select" on public.nummern_log
  for select to authenticated using (true);

-- Nummernkreise: Format anpassbar, Zähler unantastbar.
create policy "kreise_select" on public.nummernkreise
  for select to authenticated using (true);

create policy "kreise_update" on public.nummernkreise
  for update to authenticated using (true) with check (true);

-- Spaltengenau: "zaehler" und "jahr" lassen sich nicht von Hand ändern.
revoke update on public.nummernkreise from authenticated;
revoke update on public.nummernkreise from anon;
grant update (praefix, mit_jahr, reset_pro_jahr, stellen)
  on public.nummernkreise to authenticated;
