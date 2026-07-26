import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'

/** Lädt alle Gesellschafter (profile-Tabelle). Wird von mehreren Views genutzt. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    let aktiv = true
    supabase
      .from('profile')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (!aktiv) return
        setProfiles((data as Profile[]) ?? [])
        setLaden(false)
      })
    return () => {
      aktiv = false
    }
  }, [])

  return { profiles, laden }
}

/** Bequemer Name-Lookup nach Id. */
export function nameVon(profiles: Profile[], id: string | null): string {
  if (!id) return '—'
  const p = profiles.find((x) => x.id === id)
  return p ? p.name || p.email || 'Unbekannt' : 'Unbekannt'
}
