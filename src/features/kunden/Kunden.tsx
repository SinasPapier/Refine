import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde } from '../../lib/types'
import { nameSchluessel } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import ProjekteDialog from './ProjekteDialog'

export default function Kunden() {
  const toast = useToast()
  const { kunden, projekte, neuLaden } = useStammdaten()

  const [zeigeArchiv, setZeigeArchiv] = useState(false)
  const [suche, setSuche] = useState('')
  const [bearbeiten, setBearbeiten] = useState<Kunde | null>(null)
  const [projekteVon, setProjekteVon] = useState<Kunde | null>(null)

  // Formular „neuer Kunde"
  const [name, setName] = useState('')
  const [ansprech, setAnsprech] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [intern, setIntern] = useState(false)
  const [mitNummer, setMitNummer] = useState(true)
  const [nummerManuell, setNummerManuell] = useState('')
  const [dubletten, setDubletten] = useState<Kunde[] | null>(null)

  const suchbegriff = suche.trim().toLowerCase()

  /**
   * Bei einer Suche werden aktive UND archivierte Kunden durchsucht – sonst
   * legt man einen Kunden doppelt an, weil der alte im Archiv liegt.
   */
  const sichtbar = useMemo(() => {
    if (!suchbegriff) return kunden.filter((k) => k.archiviert === zeigeArchiv)
    return kunden.filter((k) =>
      [k.name, k.ansprechpartner ?? '', k.kundennummer ?? '']
        .join(' ')
        .toLowerCase()
        .includes(suchbegriff),
    )
  }, [kunden, zeigeArchiv, suchbegriff])

  function findeDubletten(neuerName: string): Kunde[] {
    const schluessel = nameSchluessel(neuerName)
    if (!schluessel) return []
    return kunden.filter((k) => {
      const vorhanden = nameSchluessel(k.name)
      return vorhanden === schluessel || vorhanden.includes(schluessel) || schluessel.includes(vorhanden)
    })
  }

  async function anlegen() {
    let kundennummer: string | null = nummerManuell.trim() || null
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
      intern,
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
    setNummerManuell('')
    setIntern(false)
    setDubletten(null)
    neuLaden()
  }

  function neuerKunde(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    // Erst prüfen, ob es den Kunden schon gibt – auch im Archiv.
    const treffer = findeDubletten(name)
    if (treffer.length > 0 && dubletten === null) {
      setDubletten(treffer)
      return
    }
    anlegen()
  }

  async function archivWechseln(k: Kunde, archiv: boolean) {
    const { error } = await supabase
      .from('kunden')
      .update({ archiviert: archiv })
      .eq('id', k.id)
    if (error) {
      toast('Änderung fehlgeschlagen.', 'fehler')
      return
    }
    toast(archiv ? 'Kunde archiviert.' : 'Kunde wieder aktiv – Projekte sind wieder möglich.')
    neuLaden()
  }

  return (
    <div>
      <h1>Kunden &amp; Projekte</h1>

      {!zeigeArchiv && !suchbegriff && (
        <div className="card">
          <h2>Neuer Kunde</h2>
          <form className="form-grid" onSubmit={neuerKunde}>
            <label>
              Name*
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setDubletten(null)
                }}
                required
              />
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
                checked={intern}
                onChange={(e) => setIntern(e.target.checked)}
              />
              Interner Kunde (Tätigkeit wird auf „Internes" vorbelegt)
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={mitNummer}
                onChange={(e) => setMitNummer(e.target.checked)}
              />
              Kundennummer automatisch vergeben
            </label>
            {!mitNummer && (
              <label>
                Kundennummer (bestehende eintragen)
                <input
                  value={nummerManuell}
                  onChange={(e) => setNummerManuell(e.target.value)}
                  placeholder="z. B. K-00007"
                />
              </label>
            )}

            {dubletten && dubletten.length > 0 && (
              <div className="hinweis-warnung wide">
                <strong>Gibt es diesen Kunden schon?</strong>
                <ul className="dubletten-liste">
                  {dubletten.map((k) => (
                    <li key={k.id}>
                      {k.kundennummer ?? 'ohne Nummer'} · {k.name}
                      {k.archiviert && <span className="tag-intern">archiviert</span>}
                    </li>
                  ))}
                </ul>
                Ist es derselbe Kunde, brich hier ab – archivierte lassen sich über
                „Reaktivieren" wieder öffnen.
              </div>
            )}

            <div className="form-actions">
              <button className="btn-primary" type="submit">
                {dubletten && dubletten.length > 0 ? 'Trotzdem anlegen' : 'Kunde anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="such-zeile">
        <input
          className="suchfeld"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Kunde suchen (durchsucht auch das Archiv)…"
        />
        {suchbegriff && (
          <button className="btn-ghost small" onClick={() => setSuche('')}>
            Suche zurücksetzen
          </button>
        )}
      </div>

      {!suchbegriff && (
        <div className="segmented">
          <button
            className={!zeigeArchiv ? 'seg active' : 'seg'}
            onClick={() => setZeigeArchiv(false)}
          >
            Aktive ({kunden.filter((k) => !k.archiviert).length})
          </button>
          <button
            className={zeigeArchiv ? 'seg active' : 'seg'}
            onClick={() => setZeigeArchiv(true)}
          >
            Archiv ({kunden.filter((k) => k.archiviert).length})
          </button>
        </div>
      )}

      {suchbegriff && (
        <p className="muted small">
          {sichtbar.length} Treffer für „{suche.trim()}" – aktive und archivierte Kunden.
        </p>
      )}

      {sichtbar.length === 0 ? (
        <p className="muted">
          {suchbegriff
            ? 'Kein Kunde gefunden – dann ist der Name noch frei.'
            : zeigeArchiv
              ? 'Das Archiv ist leer.'
              : 'Noch keine Kunden angelegt.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kundennr.</th>
                <th>Name</th>
                <th>Kontakt</th>
                <th>Projekte</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((k) => {
                const anzahl = projekte.filter((p) => p.kunde_id === k.id).length
                return (
                  <tr key={k.id}>
                    <td className="nowrap">
                      <code>{k.kundennummer ?? '—'}</code>
                    </td>
                    <td>
                      <div>
                        {k.name}
                        {k.intern && <span className="tag-intern">intern</span>}
                        {k.archiviert && <span className="tag-intern">archiviert</span>}
                      </div>
                      {k.ansprechpartner && (
                        <div className="muted small">{k.ansprechpartner}</div>
                      )}
                    </td>
                    <td className="spalte-kontakt">
                      {k.email && <div className="kontakt-zeile">{k.email}</div>}
                      {k.telefon && <div className="kontakt-zeile nowrap">{k.telefon}</div>}
                      {!k.email && !k.telefon && '—'}
                    </td>
                    <td className="nowrap">
                      <button
                        className="btn-ghost small"
                        onClick={() => setProjekteVon(k)}
                        title="Projekte dieses Kunden verwalten"
                      >
                        {anzahl === 0
                          ? '+ Projekt anlegen'
                          : `${anzahl} ${anzahl === 1 ? 'Projekt' : 'Projekte'}`}
                      </button>
                    </td>
                    <td className="spalte-aktionen">
                      <div className="aktionen">
                        <button className="btn-ghost small" onClick={() => setBearbeiten(k)}>
                          Bearbeiten
                        </button>
                        <button
                          className="btn-ghost small"
                          onClick={() => archivWechseln(k, !k.archiviert)}
                        >
                          {k.archiviert ? 'Reaktivieren' : 'Archivieren'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {projekteVon && (
        <ProjekteDialog
          kunde={projekteVon}
          onSchliessen={() => setProjekteVon(null)}
          onGeaendert={neuLaden}
        />
      )}

      {bearbeiten && (
        <KundeDialog
          kunde={bearbeiten}
          onSchliessen={() => setBearbeiten(null)}
          onGespeichert={neuLaden}
        />
      )}
    </div>
  )
}

function KundeDialog({
  kunde,
  onSchliessen,
  onGespeichert,
}: {
  kunde: Kunde
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(kunde.name)
  const [ansprech, setAnsprech] = useState(kunde.ansprechpartner ?? '')
  const [email, setEmail] = useState(kunde.email ?? '')
  const [telefon, setTelefon] = useState(kunde.telefon ?? '')
  const [nummer, setNummer] = useState(kunde.kundennummer ?? '')
  const [intern, setIntern] = useState(kunde.intern)

  const veraendert =
    name.trim() !== kunde.name ||
    ansprech.trim() !== (kunde.ansprechpartner ?? '') ||
    email.trim() !== (kunde.email ?? '') ||
    telefon.trim() !== (kunde.telefon ?? '') ||
    nummer.trim() !== (kunde.kundennummer ?? '') ||
    intern !== kunde.intern

  async function speichern(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase
      .from('kunden')
      .update({
        name: name.trim(),
        ansprechpartner: ansprech.trim() || null,
        email: email.trim() || null,
        telefon: telefon.trim() || null,
        kundennummer: nummer.trim() || null,
        intern,
      })
      .eq('id', kunde.id)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast('Kunde geändert.')
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={speichern}>
        <h2>Kunde bearbeiten</h2>
        <label>
          Name
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
        <label>
          Kundennummer
          <input
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            placeholder="z. B. K-00007"
          />
        </label>
        <label className="checkbox-inline">
          <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
          Interner Kunde
        </label>
        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button type="button" className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={!veraendert}
              title={!veraendert ? 'Es wurde nichts geändert' : undefined}
            >
              Speichern
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
