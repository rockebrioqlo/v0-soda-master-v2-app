'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Producto = {
  id: string
  nombre: string
  descripcion?: string | null
  precio: string | number
  categoria?: string | null
  stock?: number
  activo?: boolean
}

const ORDEN_CATEGORIAS = [
  'burgers',
  'entradas',
  'acompañamientos',
  'postres',
  'cervezas',
  'jugos_bebidas',
  'tragos',
] as const

type CategoriaSlug = (typeof ORDEN_CATEGORIAS)[number]

const LABEL_CATEGORIAS: Record<CategoriaSlug, string> = {
  burgers: 'Burgers',
  entradas: 'Entradas',
  acompañamientos: 'Acompañamientos',
  postres: 'Postres',
  cervezas: 'Cervezas',
  jugos_bebidas: 'Jugos y Bebidas',
  tragos: 'Tragos',
}

function formatoPrecioCLP(valor: string | number) {
  const n = Math.round(Number(valor) || 0)
  return '$' + n.toLocaleString('es-CL', { useGrouping: true })
}

function slugCategoria(c?: string | null): CategoriaSlug | null {
  if (!c) return null
  const norm = c.toLowerCase().trim()
  return (ORDEN_CATEGORIAS as readonly string[]).includes(norm)
    ? (norm as CategoriaSlug)
    : null
}

export default function MenuPage() {
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState('Soda Master')
  const [activa, setActiva] = useState<CategoriaSlug | null>(null)
  const seccionesRef = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const [resProd, resConf] = await Promise.all([
          fetch('/api/productos', { cache: 'no-store' }),
          fetch('/api/configuracion', { cache: 'no-store' }).catch(() => null),
        ])
        if (!resProd.ok) throw new Error('No se pudo cargar el menú')
        const data: Producto[] = await resProd.json()
        if (!cancelado) setProductos(data)
        if (resConf && resConf.ok) {
          const conf = await resConf.json()
          if (!cancelado && conf?.nombre_negocio) {
            setNombreNegocio(String(conf.nombre_negocio))
          }
        }
      } catch (e: any) {
        if (!cancelado) setError(e?.message || 'Error al cargar el menú')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  const seccionesAgrupadas = useMemo(() => {
    if (!productos) return []
    const grupos = new Map<CategoriaSlug, Producto[]>()
    for (const p of productos) {
      if (p.activo === false) continue
      if (typeof p.stock === 'number' && p.stock <= 0) continue
      const slug = slugCategoria(p.categoria)
      if (!slug) continue
      const arr = grupos.get(slug) ?? []
      arr.push(p)
      grupos.set(slug, arr)
    }
    return ORDEN_CATEGORIAS.filter((c) => grupos.has(c)).map((c) => ({
      slug: c,
      label: LABEL_CATEGORIAS[c],
      items: (grupos.get(c) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))
  }, [productos])

  useEffect(() => {
    if (activa === null && seccionesAgrupadas.length > 0) {
      setActiva(seccionesAgrupadas[0].slug)
    }
  }, [seccionesAgrupadas, activa])

  useEffect(() => {
    if (seccionesAgrupadas.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible?.target instanceof HTMLElement) {
          const slug = visible.target.dataset.cat as CategoriaSlug | undefined
          if (slug) setActiva(slug)
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    )
    for (const sec of seccionesAgrupadas) {
      const el = seccionesRef.current[sec.slug]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [seccionesAgrupadas])

  const handleNavClick = (slug: CategoriaSlug) => {
    const el = seccionesRef.current[slug]
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 110
      window.scrollTo({ top: y, behavior: 'smooth' })
      setActiva(slug)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
        <div className="px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 font-bold">
              SM
            </div>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{nombreNegocio}</h1>
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Categorías del menú"
        >
          {seccionesAgrupadas.map((s) => (
            <button
              key={s.slug}
              onClick={() => handleNavClick(s.slug)}
              className={[
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                activa === s.slug
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {!error && productos === null && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-900" />
            ))}
          </div>
        )}

        {!error && productos !== null && seccionesAgrupadas.length === 0 && (
          <p className="py-10 text-center text-zinc-400">
            No hay productos disponibles en este momento.
          </p>
        )}

        <div className="space-y-10">
          {seccionesAgrupadas.map((s) => (
            <section
              key={s.slug}
              data-cat={s.slug}
              ref={(el) => {
                seccionesRef.current[s.slug] = el
              }}
              className="scroll-mt-32"
            >
              <h2 className="mb-3 text-xl font-bold text-amber-400">{s.label}</h2>
              <ul className="space-y-3">
                {s.items.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold leading-tight text-zinc-50">
                          {p.nombre}
                        </h3>
                        {p.descripcion && (
                          <p className="mt-1 text-sm leading-snug text-zinc-400">
                            {p.descripcion}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-base font-bold text-amber-400 sm:text-lg">
                        {formatoPrecioCLP(p.precio)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <footer className="mt-8 border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500 sm:px-6">
        <p className="font-medium text-zinc-400">{nombreNegocio}</p>
        <p className="mt-1">Precios incluyen IVA</p>
      </footer>
    </div>
  )
}
