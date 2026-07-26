import { useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useAuth } from './features/auth/useAuth'
import Login from './features/auth/Login'
import Dashboard from './features/auswertung/Dashboard'
import Zeiten from './features/zeiten/Zeiten'
import Kunden from './features/kunden/Kunden'
import Zustaendigkeiten from './features/zustaendigkeiten/Zustaendigkeiten'
import Nummern from './features/nummern/Nummern'

type View = 'dashboard' | 'zeiten' | 'kunden' | 'zustaendigkeiten' | 'nummern'

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Übersicht', icon: '📊' },
  { key: 'zeiten', label: 'Arbeitszeiten', icon: '⏱️' },
  { key: 'kunden', label: 'Kunden & Projekte', icon: '🏢' },
  { key: 'zustaendigkeiten', label: 'Zuständigkeiten', icon: '✅' },
  { key: 'nummern', label: 'Nummern', icon: '🔢' },
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
        <p className="muted small">
          Lokal: in einer Datei <code>.env</code> (siehe <code>.env.example</code>).
          Auf GitHub Pages: als Repository-Variables (siehe README).
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, laden } = useAuth()
  const [view, setView] = useState<View>('dashboard')

  if (!isSupabaseConfigured) return <NichtKonfiguriert />
  if (laden) return <div className="center-hint">Lädt…</div>
  if (!session) return <Login />

  const email = session.user.email ?? ''

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
          <div className="muted small" title={email}>
            {email}
          </div>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Abmelden
          </button>
        </div>
      </aside>

      <main className="content">
        {view === 'dashboard' && <Dashboard />}
        {view === 'zeiten' && <Zeiten session={session} />}
        {view === 'kunden' && <Kunden />}
        {view === 'zustaendigkeiten' && <Zustaendigkeiten />}
        {view === 'nummern' && <Nummern />}
      </main>
    </div>
  )
}
