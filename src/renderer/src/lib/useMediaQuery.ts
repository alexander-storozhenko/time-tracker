import { useEffect, useState } from 'react'

/**
 * Reads the query synchronously on first render — there is no SSR here, and
 * hydrating from `false` would flash the wide layout before collapsing it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const sync = (): void => setMatches(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [query])

  return matches
}
