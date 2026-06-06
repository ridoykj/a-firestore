import * as React from "react"

export function useMediaQuery(query: string): boolean {
  const getMatches = React.useCallback(() => {
    if (typeof window === "undefined") {
      return false
    }
    return window.matchMedia(query).matches
  }, [query])

  const [matches, setMatches] = React.useState<boolean>(getMatches)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const onChange = () => {
      setMatches(mediaQuery.matches)
    }

    onChange()
    mediaQuery.addEventListener("change", onChange)
    return () => mediaQuery.removeEventListener("change", onChange)
  }, [query])

  return matches
}
