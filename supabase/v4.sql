-- ============================================================================
-- Erweiterung v4: Feste Stundensätze, Deadlines, Administrator-Recht
-- ----------------------------------------------------------------------------
-- Führe dieses Skript EINMAL im Supabase SQL-Editor aus (Einfügen -> "Run").
-- Es kann gefahrlos mehrfach ausgeführt werden.
--
-- Voraussetzung: schema.sql, hardening.sql, v2.sql und v3.sql wurden bereits
-- ausgeführt.
--
-- ACHTUNG: Die Spalte kunden.stundensatz wird entfernt. Die Sätze gelten ab
-- jetzt einheitlich je Tätigkeit, nicht mehr je Kunde.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Administrator-Kennzeichen
-- ---------------------------------------------------------------------------
alter table public.profile add column if not exists ist_admin boolean not null default false;

-- Falls es noch keinen Administrator gibt: das zuerst angelegte Konto bekommt
-- das Recht. Das ist im Normalfall der Betreiber.
update public.profile
   set ist_admin = true
 where id = (select id from public.profile order by created_at limit 1)
   and not exists (select 1 from public.profile where ist_admin);

-- Falls das falsche Konto getroffen wurde, hier die richtige E-Mail eintragen
-- und die beiden Zeilen ohne "--" ausführen:
-- update public.profile set ist_admin = false;
-- update public.profile set ist_admin = true where email = 'DEINE@EMAIL.DE';

-- Hilfsfunktion für die Sicherheitsregeln. "security definer", weil die
-- Regeln sonst wieder auf profile zugreifen müssten.
create or replace function public.ist_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select ist_admin from public.profile where id = auth.uid()), false);
$$;

revoke all on function public.ist_admin() from public;
revoke all on function public.ist_admin() from anon;
grant execute on function public.ist_admin() to authenticated;

-- WICHTIG: Das Kennzeichen selbst darf niemand über die App setzen – sonst
-- könnte sich jedes Konto zum Administrator machen und alle Sperren umgehen.
-- Die Policy "profile_update" erlaubt das Ändern der eigenen Zeile; welche
-- SPALTEN dabei erlaubt sind, wird hier festgelegt.
revoke update on public.profile from authenticated;
revoke update on public.profile from anon;
grant update (name, farbe, status_text, status_gesetzt_am)
  on public.profile to authenticated;


-- ---------------------------------------------------------------------------
-- 2) Stundensätze – gelten einheitlich für alle
-- ---------------------------------------------------------------------------
create table if not exists public.stundensaetze (
  schluessel  text primary key,
  bezeichnung text not null,
  satz        numeric not null default 0,
  sortierung  integer not null default 0
);

insert into public.stundensaetze (schluessel, bezeichnung, satz, sortierung)
values
  ('beratung',   'Beratung',   80, 1),
  ('gestaltung', 'Gestaltung', 60, 2),
  ('intern',     'Internes',    0, 3)
on conflict (schluessel) do nothing;

alter table public.stundensaetze enable row level security;

drop policy if exists "saetze_select" on public.stundensaetze;
drop policy if exists "saetze_update" on public.stundensaetze;

-- Lesen dürfen alle Angemeldeten, ändern nur Administratoren.
create policy "saetze_select" on public.stundensaetze
  for select to authenticated using (true);

create policy "saetze_update" on public.stundensaetze
  for update to authenticated using (public.ist_admin()) with check (public.ist_admin());

grant select on public.stundensaetze to authenticated;
grant update (bezeichnung, satz) on public.stundensaetze to authenticated;


-- ---------------------------------------------------------------------------
-- 3) Tätigkeit und Satz an den Zeiteinträgen
--    Der Satz wird beim Buchen hineinkopiert. Eine spätere Satzänderung
--    verändert dadurch keine bereits abgerechneten Zeiten rückwirkend.
-- ---------------------------------------------------------------------------
alter table public.arbeitszeiten  add column if not exists taetigkeit  text;
alter table public.arbeitszeiten  add column if not exists stundensatz numeric;
alter table public.laufende_zeiten add column if not exists taetigkeit text;


-- ---------------------------------------------------------------------------
-- 4) Interne Kunden; Stundensatz je Kunde entfällt
-- ---------------------------------------------------------------------------
alter table public.kunden add column if not exists intern boolean not null default false;
alter table public.kunden drop column if exists stundensatz;

-- Ein interner Kunde als Startpunkt, nur falls noch nicht vorhanden.
insert into public.kunden (name, intern)
select 'Intern', true
where not exists (select 1 from public.kunden where intern);

insert into public.projekte (kunde_id, name)
select k.id, 'Refine'
  from public.kunden k
 where k.intern
   and not exists (select 1 from public.projekte p where p.kunde_id = k.id)
 limit 1;


-- ---------------------------------------------------------------------------
-- 5) Termine / Deadlines
-- ---------------------------------------------------------------------------
create table if not exists public.termine (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  datum        date not null,
  projekt_id   uuid references public.projekte (id) on delete set null,
  beschreibung text,
  erledigt     boolean not null default false,
  erstellt_von uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.termine enable row level security;

drop policy if exists "termine_all" on public.termine;

-- Deadlines sind gemeinsame Team-Information: alle dürfen sie pflegen.
create policy "termine_all" on public.termine
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.termine to authenticated;


-- ---------------------------------------------------------------------------
-- 6) Nummernkreise: Zähler und Format nur noch für Administratoren
--    Bisher durfte jeder das Format ändern und niemand den Zähler. Zum
--    Einpflegen bestehender Nummern muss der Zähler setzbar sein – das aber
--    nur durch Administratoren, damit die Nummernfolge nicht versehentlich
--    zerschossen wird.
-- ---------------------------------------------------------------------------
drop policy if exists "kreise_update" on public.nummernkreise;

create policy "kreise_update" on public.nummernkreise
  for update to authenticated using (public.ist_admin()) with check (public.ist_admin());

revoke update on public.nummernkreise from authenticated;
revoke update on public.nummernkreise from anon;
grant update (praefix, mit_jahr, reset_pro_jahr, stellen, zaehler, jahr)
  on public.nummernkreise to authenticated;
