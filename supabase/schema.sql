-- ============================================================================
-- Agentur-App – vollständiges Datenbankschema für Supabase
-- ----------------------------------------------------------------------------
-- Das ist die EINZIGE Datei, die du ausführen musst.
--
-- Anleitung: In Supabase den "SQL Editor" öffnen, den kompletten Inhalt dieser
-- Datei einfügen und "Run" drücken.
--
-- Sie funktioniert von jedem Stand aus – bei einer leeren Datenbank ebenso wie
-- bei einer bereits eingerichteten – und kann beliebig oft wiederholt werden.
-- Nach jeder Änderung an der App einfach erneut ausführen.
--
-- WICHTIG – zusätzlich einmal im Dashboard erledigen:
--   Authentication -> Sign In / Providers -> Email
--   -> "Allow new users to sign up" AUSSCHALTEN
-- Sonst kann sich jede fremde Person selbst ein Konto anlegen und damit alle
-- Daten sehen. Eigene Konten manuell unter Authentication -> Users anlegen.
-- ============================================================================


-- ############################################################################
-- 1) TABELLEN
-- ############################################################################

-- Ein Eintrag je Gesellschafter/angemeldetem Nutzer.
create table if not exists public.profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text,
  farbe       text default '#4f46e5',
  -- Kurze Statusmeldung, z. B. "bis 14 Uhr beim Kunden".
  status_text       text,
  status_gesetzt_am timestamptz,
  -- Darf Nummernkreise und Stundensätze ändern.
  ist_admin   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.kunden (
  id              uuid primary key default gen_random_uuid(),
  kundennummer    text,
  name            text not null,
  ansprechpartner text,
  email           text,
  telefon         text,
  adresse         text,
  notiz           text,
  -- Interne Kunden belegen die Tätigkeit automatisch mit "Internes" vor.
  intern          boolean not null default false,
  archiviert      boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.projekte (
  id           uuid primary key default gen_random_uuid(),
  kunde_id     uuid references public.kunden (id) on delete cascade,
  name         text not null,
  beschreibung text,
  status       text not null default 'aktiv',
  archiviert   boolean not null default false,
  -- Leistungszeitraum des Auftrags.
  angelegt_am  date not null default current_date,
  erledigt_am  date,
  -- Laufende Nummer je Kunde. Bewusst nur die Zahl: die Anzeige "K-00002-01"
  -- entsteht aus der AKTUELLEN Kundennummer, damit eine spätere Korrektur der
  -- Kundennummer nicht zu veralteten Projektnummern führt.
  lfd_nummer   integer,
  -- Entfernte Projekte werden nur ausgeblendet, nicht gelöscht: an ihnen
  -- hängen gebuchte Zeiten, deren Zuordnung ein echtes "delete" unwiderruflich
  -- kappen würde (on delete set null). So bleibt das Zurückholen ein update.
  geloescht_am  timestamptz,
  geloescht_von uuid references public.profile (id),
  created_at   timestamptz not null default now()
);

-- Bestandteile eines Projekts, z. B. Visitenkarten, Beachflag, Flyer.
-- Das Projekt bleibt die Abrechnungseinheit; die Positionen zeigen, was noch
-- offen ist.
create table if not exists public.positionen (
  id           uuid primary key default gen_random_uuid(),
  projekt_id   uuid not null references public.projekte (id) on delete cascade,
  bezeichnung  text not null,
  status       text not null default 'offen',  -- offen | in_arbeit | erledigt
  sortierung   integer not null default 0,
  erledigt_am  date,
  created_at   timestamptz not null default now()
);

create table if not exists public.arbeitszeiten (
  id                uuid primary key default gen_random_uuid(),
  gesellschafter_id uuid not null references auth.users (id) on delete cascade,
  projekt_id        uuid references public.projekte (id) on delete set null,
  datum             date not null default current_date,
  dauer_minuten     integer not null check (dauer_minuten >= 0),
  beschreibung      text,
  -- Tatsächliche Start-/Endzeit, wenn der Eintrag von der Stoppuhr stammt.
  start_zeit        timestamptz,
  end_zeit          timestamptz,
  -- Tätigkeit und der dabei gültige Satz. Der Satz wird beim Buchen
  -- hineinkopiert, damit spätere Satzänderungen alte Zeiten nicht verändern.
  taetigkeit        text,
  stundensatz       numeric,
  created_at        timestamptz not null default now()
);

-- Zustand der Stoppuhr. Liegt in der Datenbank, damit die Uhr weiterläuft,
-- wenn der Browser geschlossen oder das Gerät gewechselt wird.
-- Primärschlüssel = Nutzer: pro Person kann nur eine Uhr laufen.
create table if not exists public.laufende_zeiten (
  gesellschafter_id uuid primary key references auth.users (id) on delete cascade,
  projekt_id        uuid references public.projekte (id) on delete set null,
  beschreibung      text,
  taetigkeit        text,
  gestartet_am      timestamptz not null default now()
);

-- Stundensätze gelten einheitlich für alle Gesellschafter.
create table if not exists public.stundensaetze (
  schluessel  text primary key,
  bezeichnung text not null,
  satz        numeric not null default 0,
  sortierung  integer not null default 0
);

-- Deadlines im Kalender.
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

-- Je Typ genau eine Zeile: kunde / rechnung / angebot.
create table if not exists public.nummernkreise (
  typ            text primary key,
  praefix        text not null default '',
  mit_jahr       boolean not null default true,
  reset_pro_jahr boolean not null default true,
  jahr           integer not null default extract(year from now()),
  zaehler        integer not null default 0,
  stellen        integer not null default 4
);

-- Dokumentation aller erzeugten Nummern.
create table if not exists public.nummern_log (
  id          uuid primary key default gen_random_uuid(),
  typ         text not null,
  nummer      text not null,
  erzeugt_von uuid references auth.users (id) on delete set null,
  erzeugt_am  timestamptz not null default now(),
  notiz       text
);


-- ############################################################################
-- 2) NACHRÜSTUNG
-- Bringt Datenbanken auf den aktuellen Stand, die mit einer älteren Fassung
-- eingerichtet wurden. Bei einer neuen Datenbank passiert hier nichts.
-- ############################################################################

alter table public.profile        add column if not exists status_text       text;
alter table public.profile        add column if not exists status_gesetzt_am timestamptz;
alter table public.profile        add column if not exists ist_admin         boolean not null default false;
alter table public.kunden         add column if not exists intern            boolean not null default false;
alter table public.kunden         add column if not exists archiviert        boolean not null default false;
alter table public.projekte       add column if not exists archiviert        boolean not null default false;
alter table public.arbeitszeiten  add column if not exists start_zeit        timestamptz;
alter table public.arbeitszeiten  add column if not exists end_zeit          timestamptz;
alter table public.arbeitszeiten  add column if not exists taetigkeit        text;
alter table public.arbeitszeiten  add column if not exists stundensatz       numeric;
alter table public.laufende_zeiten add column if not exists taetigkeit       text;

-- Leistungszeitraum am Projekt nachrüsten: Bestandsdaten bekommen ihr
-- Anlagedatum aus dem technischen Anlagezeitpunkt, damit nichts leer bleibt.
alter table public.projekte add column if not exists angelegt_am date;
alter table public.projekte add column if not exists erledigt_am date;
alter table public.projekte add column if not exists lfd_nummer  integer;
update public.projekte set angelegt_am = created_at::date where angelegt_am is null;
alter table public.projekte alter column angelegt_am set default current_date;
alter table public.projekte alter column angelegt_am set not null;

-- Papierkorb für Projekte. Bewusst ein Zeitstempel und keine Kennzeichnung:
-- so lässt sich der Papierkorb nach Aktualität sortieren und es ist
-- nachvollziehbar, wer wann etwas entfernt hat.
alter table public.projekte add column if not exists geloescht_am  timestamptz;
alter table public.projekte add column if not exists geloescht_von uuid references public.profile (id);

-- Am Kunden wieder entfernt: für die Dokumentation zählt der Zeitraum des
-- Auftrags, nicht der der Kundenbeziehung.
alter table public.kunden drop column if exists angelegt_am;
alter table public.kunden drop column if exists erledigt_am;

-- Bestandsprojekte bekommen ihre laufende Nummer nach Anlagereihenfolge.
with nummeriert as (
  select id, row_number() over (partition by kunde_id order by created_at, id) as nr
    from public.projekte
   where lfd_nummer is null
)
update public.projekte p
   set lfd_nummer = n.nr
  from nummeriert n
 where p.id = n.id;

-- Nicht mehr benötigt: Sätze hängen an der Tätigkeit, nicht am Kunden bzw.
-- an der Person.
alter table public.kunden  drop column if exists stundensatz;
alter table public.profile drop column if exists stundensatz;

-- Zuständigkeiten wurden ersatzlos gestrichen: In der Agentur sind ohnehin
-- alle für alles zuständig.
drop table if exists public.zustaendigkeiten;


-- ############################################################################
-- 3) STARTDATEN
-- ############################################################################

insert into public.nummernkreise (typ, praefix, mit_jahr, reset_pro_jahr, stellen)
values
  ('kunde',    'K-',  false, false, 4),
  ('rechnung', 'RE-', true,  true,  4),
  ('angebot',  'AN-', true,  true,  4)
on conflict (typ) do nothing;

insert into public.stundensaetze (schluessel, bezeichnung, satz, sortierung)
values
  ('beratung',   'Beratung',   80, 1),
  ('gestaltung', 'Gestaltung', 60, 2),
  ('intern',     'Internes',    0, 3)
on conflict (schluessel) do nothing;

-- Ein interner Kunde als Ausgangspunkt (jederzeit umbenennbar).
insert into public.kunden (name, intern)
select 'Intern', true
where not exists (select 1 from public.kunden where intern);

insert into public.projekte (kunde_id, name)
select k.id, 'Refine'
  from public.kunden k
 where k.intern
   and not exists (select 1 from public.projekte p where p.kunde_id = k.id)
 limit 1;

-- Das zuerst angelegte Konto wird Administrator, falls es noch keinen gibt.
update public.profile
   set ist_admin = true
 where id = (select id from public.profile order by created_at limit 1)
   and not exists (select 1 from public.profile where ist_admin);

-- Falls das falsche Konto getroffen wurde, hier die richtige E-Mail eintragen
-- und die beiden Zeilen ohne "--" ausführen:
-- update public.profile set ist_admin = false;
-- update public.profile set ist_admin = true where email = 'DEINE@EMAIL.DE';


-- ############################################################################
-- 4) FUNKTIONEN UND TRIGGER
-- ############################################################################

-- Erzeugt atomar die nächste Nummer eines Typs, protokolliert sie und gibt sie
-- zurück. Die Zeile wird gesperrt, dadurch kann bei mehreren gleichzeitigen
-- Nutzern keine Nummer doppelt vergeben werden.
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

  select * into v_kreis from public.nummernkreise where typ = p_typ for update;
  if not found then
    raise exception 'Unbekannter Nummernkreis: %', p_typ;
  end if;

  -- Jahreswechsel: Zähler ggf. zurücksetzen
  if v_kreis.reset_pro_jahr and v_kreis.jahr <> v_jahr then
    v_zaehler := 1;
    update public.nummernkreise set jahr = v_jahr, zaehler = 1 where typ = p_typ;
  else
    v_zaehler := v_kreis.zaehler + 1;
    update public.nummernkreise set zaehler = v_zaehler, jahr = v_jahr where typ = p_typ;
  end if;

  -- Nummer zusammensetzen: Präfix [+ Jahr-] + aufgefüllter Zähler
  v_nummer := v_kreis.praefix;
  if v_kreis.mit_jahr then
    v_nummer := v_nummer || v_jahr::text || '-';
  end if;
  v_nummer := v_nummer || lpad(v_zaehler::text, v_kreis.stellen, '0');

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

-- Nächste laufende Projektnummer eines Kunden. Die Kundenzeile wird gesperrt,
-- sonst könnten zwei gleichzeitig angelegte Projekte dieselbe Nummer bekommen.
create or replace function public.next_projektnummer(p_kunde_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_naechste integer;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  perform 1 from public.kunden where id = p_kunde_id for update;

  -- Bewusst ohne Filter auf geloescht_am: eine einmal vergebene Projektnummer
  -- darf kein zweites Mal herauskommen, sonst läge "K-00002-02" doppelt in der
  -- Ablage.
  select coalesce(max(lfd_nummer), 0) + 1
    into v_naechste
    from public.projekte
   where kunde_id = p_kunde_id;

  return v_naechste;
end;
$$;

revoke all on function public.next_projektnummer(uuid) from public;
revoke all on function public.next_projektnummer(uuid) from anon;
grant execute on function public.next_projektnummer(uuid) to authenticated;

-- Administrator? Wird in den Sicherheitsregeln verwendet. "security definer",
-- weil die Regeln sonst wieder auf profile zugreifen müssten.
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

-- Legt beim Anlegen eines Kontos automatisch ein Profil an. Bewusst ohne
-- Namen: den Anzeigenamen legt jede Person selbst fest, die App fragt beim
-- ersten Login danach.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Das Anlagedatum ist Teil des dokumentierten Leistungszeitraums und soll
-- nicht beiläufig verändert werden. Spaltenrechte scheiden aus, weil die Rolle
-- "authenticated" auch Administratoren umfasst – ein Trigger kann dagegen
-- ist_admin() auswerten.
create or replace function public.schuetze_angelegt_am()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.angelegt_am is distinct from old.angelegt_am
     -- auth.uid() ist null bei direktem Zugriff über den SQL-Editor; dort soll
     -- eine Korrektur im Notfall weiterhin möglich sein.
     and auth.uid() is not null
     and not public.ist_admin() then
    raise exception 'Das Anlagedatum darf nur ein Administrator ändern';
  end if;
  return new;
end;
$$;

drop trigger if exists schuetze_angelegt_am_kunden on public.kunden;

drop trigger if exists schuetze_angelegt_am_projekte on public.projekte;
create trigger schuetze_angelegt_am_projekte
  before update on public.projekte
  for each row execute function public.schuetze_angelegt_am();


-- ############################################################################
-- 5) SICHERHEIT (Row Level Security)
-- Ohne Anmeldung ist nichts sichtbar. Angemeldete Gesellschafter arbeiten
-- gemeinsam an Kunden, Projekten und Deadlines; eigene Zeiten und das eigene
-- Profil pflegt jeder selbst. Protokoll und Nummernfolge sind geschützt.
-- ############################################################################

alter table public.profile         enable row level security;
alter table public.kunden          enable row level security;
alter table public.projekte        enable row level security;
alter table public.arbeitszeiten   enable row level security;
alter table public.laufende_zeiten enable row level security;
alter table public.stundensaetze   enable row level security;
alter table public.termine         enable row level security;
alter table public.nummernkreise   enable row level security;
alter table public.nummern_log     enable row level security;
alter table public.positionen      enable row level security;

-- Alte Regeln entfernen, damit dieses Skript wiederholt ausführbar bleibt.
do $$
declare
  eintrag record;
begin
  for eintrag in
    select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I;',
                   eintrag.policyname, eintrag.tablename);
  end loop;
end $$;

-- Gemeinsam genutzte Stammdaten: alle Angemeldeten dürfen alles bearbeiten.
create policy "auth_all" on public.kunden
  for all to authenticated using (true) with check (true);
create policy "auth_all" on public.projekte
  for all to authenticated using (true) with check (true);

-- Deadlines sind gemeinsame Team-Information.
create policy "termine_all" on public.termine
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.termine to authenticated;

-- Positionen gehören zum Projekt und werden gemeinsam gepflegt.
create policy "positionen_all" on public.positionen
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.positionen to authenticated;

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

-- Stoppuhr: alle sehen, wer gerade arbeitet – starten/stoppen nur die eigene.
create policy "timer_select" on public.laufende_zeiten
  for select to authenticated using (true);
create policy "timer_insert" on public.laufende_zeiten
  for insert to authenticated with check (gesellschafter_id = auth.uid());
create policy "timer_update" on public.laufende_zeiten
  for update to authenticated
  using (gesellschafter_id = auth.uid())
  with check (gesellschafter_id = auth.uid());
create policy "timer_delete" on public.laufende_zeiten
  for delete to authenticated using (gesellschafter_id = auth.uid());
grant select, insert, update, delete on public.laufende_zeiten to authenticated;

-- Profile: für alle sichtbar, änderbar nur das eigene.
-- Neue Profile legt der Trigger handle_new_user an, daher keine insert-Regel.
create policy "profile_select" on public.profile
  for select to authenticated using (true);
create policy "profile_update" on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- WICHTIG: "ist_admin" ist bewusst nicht dabei. Sonst könnte sich jedes Konto
-- selbst zum Administrator machen und alle Sperren umgehen. Gesetzt wird das
-- Kennzeichen nur direkt hier in der Datenbank.
revoke update on public.profile from authenticated;
revoke update on public.profile from anon;
grant update (name, farbe, status_text, status_gesetzt_am)
  on public.profile to authenticated;

-- Stundensätze: lesen alle, ändern nur Administratoren.
create policy "saetze_select" on public.stundensaetze
  for select to authenticated using (true);
create policy "saetze_update" on public.stundensaetze
  for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
grant select on public.stundensaetze to authenticated;
revoke update on public.stundensaetze from authenticated;
revoke update on public.stundensaetze from anon;
grant update (bezeichnung, satz) on public.stundensaetze to authenticated;

-- Nummern-Protokoll: Einträge entstehen ausschließlich über next_nummer.
-- Nachträglich ist nur die Notiz änderbar – Nummer, Typ und Zeitpunkt bleiben
-- stehen, sonst wäre die Dokumentation wertlos. Der Spaltenzuschnitt ist der
-- entscheidende Teil: ohne ihn ließe sich über die API auch "nummer"
-- überschreiben.
create policy "log_select" on public.nummern_log
  for select to authenticated using (true);
create policy "log_update" on public.nummern_log
  for update to authenticated using (true) with check (true);
revoke update on public.nummern_log from authenticated;
revoke update on public.nummern_log from anon;
grant update (notiz) on public.nummern_log to authenticated;

-- Löschen nur für Administratoren – wie schon bei Zähler und Format. Ein
-- gelöschter Eintrag ist nicht wiederherstellbar, und die Nummer selbst steht
-- zu dem Zeitpunkt meist schon auf einer Rechnung.
create policy "log_delete" on public.nummern_log
  for delete to authenticated using (public.ist_admin());

-- Nummernkreise: lesen alle; Format und Zähler nur Administratoren. So lassen
-- sich bestehende Nummern einpflegen, ohne dass jemand die Nummernfolge
-- versehentlich zerschießt.
create policy "kreise_select" on public.nummernkreise
  for select to authenticated using (true);
create policy "kreise_update" on public.nummernkreise
  for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
revoke update on public.nummernkreise from authenticated;
revoke update on public.nummernkreise from anon;
grant update (praefix, mit_jahr, reset_pro_jahr, stellen, zaehler, jahr)
  on public.nummernkreise to authenticated;
