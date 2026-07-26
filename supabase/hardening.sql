-- ============================================================================
-- Sicherheits-Nachtrag für die Agentur-App
-- ----------------------------------------------------------------------------
-- Führe dieses Skript EINMAL im Supabase SQL-Editor aus (Einfügen -> "Run").
-- Es kann gefahrlos mehrfach ausgeführt werden.
--
-- WICHTIG – zusätzlich einmal im Dashboard erledigen:
--   Authentication -> Sign In / Providers -> Email
--   -> "Allow new users to sign up" AUSSCHALTEN
-- Andernfalls kann sich jede fremde Person selbst ein Konto anlegen und
-- damit alle Daten sehen und ändern. Eure Konten legt ihr manuell unter
-- Authentication -> Users -> "Add user" an.
--
-- Was dieses Skript bewirkt:
--   1. Die Nummern-Funktion ist nur noch für angemeldete Nutzer aufrufbar.
--   2. Das Nummern-Protokoll wird unveränderlich (reine Dokumentation).
--   3. Die Nummern-Zähler können nicht mehr von Hand verstellt werden,
--      das Format (Präfix/Jahr/Stellen) aber weiterhin.
--   4. Arbeitszeiten: alle sehen alles, ändern/löschen darf jeder nur die
--      eigenen Einträge (wie es die Oberfläche ohnehin anzeigt).
--   5. Profile: sichtbar für alle, ändern nur das eigene.
--
-- Unverändert gemeinsam nutzbar bleiben: Kunden, Projekte, Zuständigkeiten.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Nummern-Funktion: Zugriff nur für Angemeldete
-- ---------------------------------------------------------------------------

-- Zusätzliche Sicherung innerhalb der Funktion: ohne Anmeldung keine Nummer.
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


-- ---------------------------------------------------------------------------
-- 2) Nummern-Protokoll: nur lesen – Einträge entstehen ausschließlich
--    über next_nummer und bleiben unveränderlich.
-- ---------------------------------------------------------------------------
drop policy if exists "auth_all"   on public.nummern_log;
drop policy if exists "log_select" on public.nummern_log;

create policy "log_select" on public.nummern_log
  for select to authenticated using (true);
-- Bewusst keine insert/update/delete-Policy: das Protokoll ist revisionssicher.


-- ---------------------------------------------------------------------------
-- 3) Nummernkreise: Format anpassbar, Zähler unantastbar
-- ---------------------------------------------------------------------------
drop policy if exists "auth_all"     on public.nummernkreise;
drop policy if exists "kreise_select" on public.nummernkreise;
drop policy if exists "kreise_update" on public.nummernkreise;

create policy "kreise_select" on public.nummernkreise
  for select to authenticated using (true);

create policy "kreise_update" on public.nummernkreise
  for update to authenticated using (true) with check (true);

-- Spaltengenau: "zaehler" und "jahr" lassen sich nicht von Hand ändern.
revoke update on public.nummernkreise from authenticated;
revoke update on public.nummernkreise from anon;
grant update (praefix, mit_jahr, reset_pro_jahr, stellen)
  on public.nummernkreise to authenticated;


-- ---------------------------------------------------------------------------
-- 4) Arbeitszeiten: alle sehen alles, bearbeiten nur die eigenen Einträge
-- ---------------------------------------------------------------------------
drop policy if exists "auth_all"     on public.arbeitszeiten;
drop policy if exists "zeiten_select" on public.arbeitszeiten;
drop policy if exists "zeiten_insert" on public.arbeitszeiten;
drop policy if exists "zeiten_update" on public.arbeitszeiten;
drop policy if exists "zeiten_delete" on public.arbeitszeiten;

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


-- ---------------------------------------------------------------------------
-- 5) Profile: für alle sichtbar, änderbar nur das eigene
-- ---------------------------------------------------------------------------
drop policy if exists "auth_all"       on public.profile;
drop policy if exists "profile_select" on public.profile;
drop policy if exists "profile_update" on public.profile;

create policy "profile_select" on public.profile
  for select to authenticated using (true);

create policy "profile_update" on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- Neue Profile legt der Trigger handle_new_user an, daher keine insert-Policy.
