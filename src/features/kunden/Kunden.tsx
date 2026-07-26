import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Projekt } from '../../lib/types'
import { useToast } from '../../components/Toast'

export default function Kunden() {
  const toast = useToast()
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null)

  // Formular „neuer Kunde"
  const [name, setName] = useState('')
  const [ansprech, setAnsprech] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [mitNummer, setMitNummer] = useState(true)

  async function lade() {
    const [{ data: k }, { data: p }] = await Promise.all([
      supabase.from('kunden').select('*').order('name'),
      supabase.from('projekte').select('*').order('name'),
    ])
    setKunden((k as Kunde[]) ?? [])
    setProjekte((p as Projekt[]) ?? [])
  }

  useEffect(() => {
    lade()
  }, [])

  async function neuerKunde(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    let kundennummer: string | null = null
    if (mitNummer) {
      const { data, error } = await supabase.rpc('next_nummer', {
        p_typ: 'kunde',
        p_notiz: name.trim(),
      })
      if (!error && data) kundennummer = data as string
    }

    const { error } = await supabase.from('kunden').insert({
      name: name.trim(),
      ansprechpartner: ansprech.trim() || null,
      email: email.trim() || null,
      telefon: telefon.trim() || null,
      kundennummer,
    })
    if (error) {
      toast('Kunde konnte nicht angelegt werden.', 'fehler')
      return
    }
    toast(kundennummer ? `Kunde angelegt (${kundennummer})` : 'Kunde angelegt')
    setName('')
    setAnsprech('')
    setEmail('')
    setTelefon('')
    lade()
  }

  async function loesche(id: string) {
    if (!confirm('Diesen Kunden inkl. Projekten wirklich löschen?')) return
    await supabase.from('kunden').delete().eq('id', id)
    if (ausgewaehlt === id) setAusgewaehlt(null)
    lade()
  }

  return (
    <div>
      <h1>Kunden &amp; Projekte</h1>

      <div className="card">
        <h2>Neuer Kunde</h2>
        <form className="form-grid" onSubmit={neuerKunde}>
          <label>
            Name*
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Ansprechpartner
            <input value={ansprech} onChange={(e) => setAnsprech(e.target.value)} />
          </label>
          <label>
            E-Mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Telefon
            <input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={mitNummer}
              onChange={(e) => setMitNummer(e.target.checked)}
            />
            Kundennummer automatisch vergeben
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit">
              Kunde anlegen
            </button>
          </div>
        </form>
      </div>

      {kunden.length === 0 ? (
        <p className="muted">Noch keine Kunden angelegt.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kundennr.</th>
                <th>Name</th>
                <th>Ansprechpartner</th>
                <th>Kontakt</th>
                <th>Projekte</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {kunden.map((k) => (
                <tr key={k.id}>
                  <td>
                    <code>{k.kundennummer ?? '—'}</code>
                  </td>
                  <td>{k.name}</td>
                  <td>{k.ansprechpartner ?? '—'}</td>
                  <td>
                    {k.email ?? ''}
                    {k.email && k.telefon ? ' · ' : ''}
                    {k.telefon ?? ''}
                    {!k.email && !k.telefon ? '—' : ''}
                  </td>
                  <td>
                    <button
                      className="btn-ghost small"
                      onClick={() => setAusgewaehlt(ausgewaehlt === k.id ? null : k.id)}
                    >
                      {projekte.filter((p) => p.kunde_id === k.id).length} Projekt(e)
                    </button>
                  </td>
                  <td>
                    <button className="btn-ghost small danger" onClick={() => loesche(k.id)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ausgewaehlt && (
        <Projekte
          kunde={kunden.find((k) => k.id === ausgewaehlt)!}
          projekte={projekte.filter((p) => p.kunde_id === ausgewaehlt)}
          onChange={lade}
        />
      )}
    </div>
  )
}

function Projekte({
  kunde,
  projekte,
  onChange,
}: {
  kunde: Kunde
  projekte: Projekt[]
  onChange: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')

  async function neu(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase
      .from('projekte')
      .insert({ kunde_id: kunde.id, name: name.trim() })
    if (error) {
      toast('Projekt konnte nicht angelegt werden.', 'fehler')
      return
    }
    setName('')
    onChange()
  }

  async function loesche(id: string) {
    await supabase.from('projekte').delete().eq('id', id)
    onChange()
  }

  return (
    <div className="card">
      <h2>Projekte von „{kunde.name}"</h2>
      <form className="inline-form" onSubmit={neu}>
        <input
          placeholder="Neues Projekt…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary" type="submit">
          Hinzufügen
        </button>
      </form>
      {projekte.length === 0 ? (
        <p className="muted">Noch keine Projekte.</p>
      ) : (
        <ul className="liste">
          {projekte.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <button className="btn-ghost small danger" onClick={() => loesche(p.id)}>
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
