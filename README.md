# Agentur-App

Eine kleine Web-App für dich und deine Mitgesellschafter, um **Arbeitszeiten**,
**Zuständigkeiten** und **Kunden** zu verwalten und fortlaufende **Kunden-,
Rechnungs- und Angebotsnummern** per Knopfdruck zu erzeugen (mit automatischem
Kopieren in die Zwischenablage und Dokumentation).

Die App ist **kostenlos** betreibbar: Die Oberfläche läuft auf **GitHub Pages**,
die gemeinsamen Daten und der Login liegen in einer **kostenlosen
Supabase-Datenbank**.

## Funktionen

- **Übersicht** – Stunden pro Person und pro Kunde, wählbar für Monat / Jahr / gesamt.
- **Arbeitszeiten** – Zeiten erfassen (Datum, Dauer, Projekt, Beschreibung),
  filtern nach Person/Projekt/Zeitraum, Summen sehen.
- **Kunden & Projekte** – Kunden pflegen (optional mit automatischer
  Kundennummer) und Projekte je Kunde anlegen.
- **Zuständigkeiten** – festlegen, wer wofür verantwortlich ist, inkl. Status.
- **Nummern** – drei Buttons für Kunden-, Rechnungs- und Angebotsnummer. Jede
  erzeugte Nummer wird eindeutig hochgezählt, in die Zwischenablage kopiert und
  in einer Liste dokumentiert. Format (Präfix, Jahr, Stellen) einstellbar.

---

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> mit einem kostenlosen Konto anmelden.
2. **New project** anlegen (Name frei wählbar, Region z. B. „Frankfurt", ein
   Datenbank-Passwort vergeben und notieren).
3. Warten, bis das Projekt bereit ist.

### 2. Datenbank einrichten

1. In Supabase links auf **SQL Editor** klicken.
2. Den kompletten Inhalt der Datei [`supabase/schema.sql`](supabase/schema.sql)
   hineinkopieren und **Run** drücken. Damit werden alle Tabellen, Regeln und
   die Nummern-Funktion angelegt.

### 2b. Selbstregistrierung abschalten (wichtig!)

Supabase erlaubt standardmäßig, dass **jede fremde Person sich selbst ein Konto
anlegt**. Da alle Angemeldeten die Firmendaten sehen, muss das aus sein:

1. **Authentication → Sign In / Providers → Email**
2. **„Allow new users to sign up" ausschalten** und speichern.

Eure eigenen Konten legt ihr in Schritt 6 manuell an.

> Bei einer bereits laufenden Datenbank, die mit einer älteren Fassung
> eingerichtet wurde, zusätzlich einmal
> [`supabase/hardening.sql`](supabase/hardening.sql) im SQL-Editor ausführen.
> Bei einer Neueinrichtung ist das nicht nötig – `schema.sql` enthält alles.

### 3. Zugangsdaten kopieren

In Supabase unter **Project Settings → API** findest du:

- **Project URL** (z. B. `https://abcd.supabase.co`)
- **anon public** Key

Beide Werte werden gleich gebraucht. (Der anon-Key darf öffentlich sein – die
Daten sind durch die eingerichteten Sicherheitsregeln geschützt.)

### 4. GitHub Pages aktivieren

1. Im GitHub-Repository auf **Settings → Pages** gehen.
2. Bei **Source** „**GitHub Actions**" auswählen.

### 5. Zugangsdaten bei GitHub hinterlegen

1. Im Repository auf **Settings → Secrets and variables → Actions →
   Variables** gehen.
2. Zwei **New repository variable** anlegen:
   - `VITE_SUPABASE_URL` = die Project URL aus Schritt 3
   - `VITE_SUPABASE_ANON_KEY` = der anon public Key aus Schritt 3
3. Den Deploy-Workflow neu starten (Tab **Actions → Deploy auf GitHub Pages →
   Run workflow**) oder einfach einen kleinen Commit pushen.

Nach dem Durchlauf ist die App unter
`https://<dein-github-name>.github.io/Refine/` erreichbar.

### 6. Gesellschafter-Konten anlegen

In Supabase unter **Authentication → Users → Add user** für jeden
Gesellschafter ein Konto mit E-Mail und Passwort anlegen. Mit diesen Daten
meldet sich jeder in der App an.

> Tipp: Falls Supabase eine E-Mail-Bestätigung verlangt, kann diese unter
> **Authentication → Providers → Email** deaktiviert werden („Confirm email"
> aus), solange nur intern gearbeitet wird.

---

## Lokal entwickeln / testen

```bash
npm install
cp .env.example .env    # .env öffnen und die zwei Supabase-Werte eintragen
npm run dev
```

Die App läuft dann unter der angezeigten lokalen Adresse (z. B.
`http://localhost:5173`).

Produktions-Build lokal prüfen:

```bash
npm run build
npm run preview
```

## Sicherheit

Die Daten liegen in Supabase und sind über Row Level Security geschützt:

- **Ohne Anmeldung** ist nichts sichtbar und die Nummern-Funktion nicht aufrufbar.
- **Angemeldete Gesellschafter** sehen alle Daten und verwalten Kunden, Projekte
  und Zuständigkeiten gemeinsam.
- **Arbeitszeiten** darf jeder nur für sich selbst buchen, ändern und löschen.
- **Profile** kann jeder nur für sich selbst ändern.
- Das **Nummern-Protokoll** ist unveränderlich; die **Zähler** lassen sich nicht
  von Hand verstellen (nur das Format: Präfix, Jahr, Stellen).

Der `anon public` Key im ausgelieferten JavaScript ist unkritisch und dafür
vorgesehen – er gewährt ohne gültige Anmeldung keinen Datenzugriff.
Voraussetzung ist, dass die Selbstregistrierung aus ist (Schritt 2b).

## Technik

- **Frontend:** React + TypeScript + Vite
- **Backend/Datenbank/Login:** Supabase (PostgreSQL + Auth)
- **Hosting:** GitHub Pages (statischer Build via GitHub Actions)

Das Datenmodell ist bewusst erweiterbar angelegt – spätere Ausbaustufen wie
Abrechnung/Stundensätze, Urlaub/Abwesenheiten, CSV-Export oder Soll-/Ist-Aufwand
lassen sich ergänzen.
