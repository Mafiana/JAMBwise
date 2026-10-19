import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const Ctx = createContext(null)

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
const read = () => {
  try {
    const t = localStorage.getItem('jw_theme')
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(read) // null means "follow the device"

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])

  const setTheme = useCallback((t) => {
    setThemeState(t)
    try { localStorage.setItem('jw_theme', t) } catch { /* private mode: keep it in memory only */ }
  }, [])

  const value = useMemo(() => {
    const dark = theme ? theme === 'dark' : systemDark()
    return { dark, setTheme, toggle: () => setTheme(dark ? 'light' : 'dark') }
  }, [theme, setTheme])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
