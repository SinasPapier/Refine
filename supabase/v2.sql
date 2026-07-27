-- ============================================================================
-- Erweiterung v2: Stoppuhr, Kalenderfarben, eigener Anzeigename,
--                 Abrechnung und Archivieren
-- ----------------------------------------------------------------------------
-- Führe dieses Skript EINMAL im Supabase SQL-Editor aus (Einfügen -> "Run").
-- Es kann gefahrlos mehrfach ausgeführt werden.
--
-- Voraussetzung: schema.sql und hardening.sql wurden bereits ausgeführt.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Kunden: Stundensatz (optional) und Archivieren statt Löschen
-- ---------------------------------------------------------------------------
alter table public.kunden add column if not exists stundensatz numeric;
alter table public.kunden add column if not exists archiviert boolean not null default false;

alter table public.projekte add column if not exists archiviert boolean not null default false;


-- ---------------------------------------------------------------------------
-- 2) Arbeitszeiten: tatsächliche Start-/Endzeit (füllt die Stoppuhr)
--    Manuelle Einträge lassen die Felder leer – beides ist erlaubt.
-- ---------------------------------------------------------------------------
alter table public.arbeitszeiten add column if not exists start_zeit timestamptz;
alter table public.arbeitszeiten add column if not exists end_zeit   timestamptz;


-- ---------------------------------------------------------------------------
-- 3) Laufende Stoppuhr
--    Der Zustand liegt in der Datenbank, damit die Uhr weiterläuft, wenn der
--    Browser geschlossen oder das Gerät gewechselt wird.
--    Primärschlüssel = Nutzer: pro Person kann nur eine Uhr laufen.
-- ---------------------------------------------------------------------------
create table if not exists public.laufende_zeiten (
  gesellschafter_id uuid primary key references auth.users (id) on delete cascade,
  projekt_id        uuid references public.projekte (id) on delete set null,
  beschreibung      text,
  gestartet_am      timestamptz not null default now()
);

alter table public.laufende_zeiten enable row level security;

drop policy if exists "timer_select" on public.laufende_zeiten;
drop policy if exists "timer_insert" on public.laufende_zeiten;
drop policy if exists "timer_update" on public.laufende_zeiten;
drop policy if exists "timer_delete" on public.laufende_zeiten;

-- Alle Angemeldeten sehen, wer gerade an etwas arbeitet ...
create policy "timer_select" on public.laufende_zeiten
  for select to authenticated using (true);

-- ... starten und stoppen darf aber jeder nur die eigene Uhr.
create policy "timer_insert" on public.laufende_zeiten
  for insert to authenticated with check (gesellschafter_id = auth.uid());

create policy "timer_update" on public.laufende_zeiten
  for update to authenticated
  using (gesellschafter_id = auth.uid())
  with check (gesellschafter_id = auth.uid());

create policy "timer_delete" on public.laufende_zeiten
  for delete to authenticated using (gesellschafter_id = auth.uid());

-- Zugriffsrechte ausdrücklich vergeben, damit die Tabelle unabhängig von der
-- Supabase-Einstellung "Automatically expose new tables" funktioniert.
grant select, insert, update, delete on public.laufende_zeiten to authenticated;


-- ---------------------------------------------------------------------------
-- 4) Anzeigename: nicht mehr automatisch aus der E-Mail ableiten.
--    Neue Konten starten ohne Namen; die App fragt beim ersten Login danach.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, name, email)
  values (new.id, '', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
