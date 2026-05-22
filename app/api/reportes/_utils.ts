function toIsoDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  if (value === 'hoy') return new Date().toISOString().slice(0, 10)
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : fallback
}

export function parseRango(searchParams: URLSearchParams) {
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = toIsoDate(searchParams.get('desde'), hoy)
  const hasta = toIsoDate(searchParams.get('hasta'), hoy)
  if (desde > hasta) {
    return { desde: hasta, hasta: desde }
  }
  return { desde, hasta }
}
