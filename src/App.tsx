import { useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useAuth } from './features/auth/useAuth'
import { useProfiles } from './features/profile/ProfileProvider'
import Login from './features/auth/Login'
import Profil from './features/profile/Profil'
import Timer from './features/timer/Timer'
import Dashboard from './features/auswertung/Dashboard'
import Kalender from './features/kalender/Kalender'
import Zeiten from './features/zeiten/Zeiten'
import Kunden from './features/kunden/Kunden'
import Zustaendigkeiten from './features/zustaendigkeiten/Zustaendigkeiten'
import Nummern from './features/nummern/Nummern'
import Abrechnung from './features/abrechnung/Abrechnung'

type View =
  | 'dashboard'
  | 'kalender'
  | 'zeiten'
  | 'kunden'
  | 'zustaendigkeiten'
  | 'nummern'
  | 'abrechnung'
  | 'profil'

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Übersicht', icon: '📊' },
  { key: 'kalender', label: 'Kalender', icon: '🗓️' },
  { key: 'zeiten', label: 'Arbeitszeiten', icon: '⏱️' },
  { key: 'kunden', label: 'Kunden & Projekte', icon: '🏢' },
  { key: 'zustaendigkeiten', label: 'Zuständigkeiten', icon: '✅' },
  { key: 'nummern', label: 'Nummern', icon: '🔢' },
  { key: 'abrechnung', label: 'Abrechnung', icon: '🧾' },
]

function NichtKonfiguriert() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Fast fertig 🙂</h1>
        <p>
          Die App ist noch nicht mit Supabase verbunden. Bitte hinterlege die
          Werte <code>VITE_SUPABASE_URL</code> und{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, laden } = useAuth()
  const { meinProfil, laden: profileLaden, nameVon, farbeVon } = useProfiles()
  const [view, setView] = useState<View>('dashboard')
  // Erzwingt ein Neuladen der Listen, wenn die Stoppuhr einen Eintrag anlegt.
  const [datenStand, setDatenStand] = useState(0)

  if (!isSupabaseConfigured) return <NichtKonfiguriert />
  if (laden) return <div className="center-hint">Lädt…</div>
  if (!session) return <Login />
  if (profileLaden) return <div className="center-hint">Lädt…</div>

  // Solange kein Anzeigename gesetzt ist, zuerst danach fragen.
  const nameFehlt = !meinProfil || !(meinProfil.name ?? '').trim()
  if (nameFehlt) return <Profil begruessung />

  const meineFarbe = farbeVon(session.user.id)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Agentur-App</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={view === n.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(n.key)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            className={view === 'profil' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('profil')}
          >
            <span className="punkt" style={{ background: meineFarbe }} />
            {nameVon(session.user.id)}
          </button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Abmelden
          </button>
        </div>
      </aside>

      <main className="content">
        <Timer onGebucht={() => setDatenStand((n) => n + 1)} />

        <div key={`${view}-${datenStand}`}>
          {view === 'dashboard' && <Dashboard />}
          {view === 'kalender' && <Kalender />}
          {view === 'zeiten' && <Zeiten />}
          {view === 'kunden' && <Kunden />}
          {view === 'zustaendigkeiten' && <Zustaendigkeiten />}
          {view === 'nummern' && <Nummern />}
          {view === 'abrechnung' && <Abrechnung />}
          {view === 'profil' && <Profil />}
        </div>
      </main>
    </div>
  )
}
