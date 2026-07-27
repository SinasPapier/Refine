-- ============================================================================
-- Erweiterung v3: Zuständigkeiten entfernen, Statusmeldung einführen
-- ----------------------------------------------------------------------------
-- Führe dieses Skript EINMAL im Supabase SQL-Editor aus (Einfügen -> "Run").
-- Es kann gefahrlos mehrfach ausgeführt werden.
--
-- Voraussetzung: schema.sql, hardening.sql und v2.sql wurden bereits ausgeführt.
--
-- ACHTUNG: Die Tabelle "zustaendigkeiten" wird mitsamt Inhalt gelöscht.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Zuständigkeiten ersatzlos entfernen
--    In der Agentur sind ohnehin alle für alles zuständig – die Liste wurde
--    nicht gepflegt und hat die App nur aufgebläht.
-- ---------------------------------------------------------------------------
drop table if exists public.zustaendigkeiten;


-- ---------------------------------------------------------------------------
-- 2) Kurze Statusmeldung je Gesellschafter
--    Beispiel: "bis 14 Uhr beim Kunden". Der Zeitstempel macht sichtbar,
--    wenn eine Meldung veraltet ist.
-- ---------------------------------------------------------------------------
alter table public.profile add column if not exists status_text text;
alter table public.profile add column if not exists status_gesetzt_am timestamptz;

-- Hinweis: Eine neue Sicherheitsregel ist nicht nötig. Die Policy
-- "profile_update" aus hardening.sql erlaubt Änderungen ohnehin nur an der
-- eigenen Zeile – jeder kann also ausschließlich seinen eigenen Status setzen.
