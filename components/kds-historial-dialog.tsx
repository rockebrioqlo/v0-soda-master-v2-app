'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/components/toast'
import { History, RefreshCw } from 'lucide-react'

interface ItemHist {
  id: string
  producto_nombre: string | null
  categoria: string | null
  cantidad: number
  estado_item: string
  pagado: boolean
  notas_especiales: string | null
  modificadores: any
  item_created_at: string
}

interface OrdenHist {
  id: string
  mesa_id: string | null
  estado: string
  created_at: string
  mesa_numero: number | null
  items: ItemHist[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  // 'cocina' | 'bar' | null (admin = null = todo)
  estacion: 'cocina' | 'bar' | null
}

// Heurística simple para clasificar item a cocina vs bar mientras no
// haya una columna explícita en `productos`. Bar = bebidas y similares.
const BAR_CATS = new Set([
  'bebidas',
  'bebida',
  'cervezas',
  'cerveza',
  'tragos',
  'cócteles',
  'cocteles',
  'vinos',
  'vino',
  'café',
  'cafe',
  'cafeterÍa',
  'cafeteria',
])

function esItemDeBar(it: ItemHist): boolean {
  const cat = (it.categoria || '').toLowerCase()
  if (!cat) return false
  return BAR_CATS.has(cat) || cat.includes('bebid') || cat.includes('trago')
}

interface NotasItem {
  modificadores: string[]
  especiales: string[]
  salsa: string
  notas: string
  notaEspecial: string
}

// `notas_especiales` se guarda como JSON ({salsa, notas, notaEspecial,
// ingredientesEspeciales}) y `modificadores` como array de ingredientes
// estándar. Esta función los convierte en un resumen legible en vez de
// mostrar el JSON crudo.
function parseNotasItem(it: ItemHist): NotasItem {
  const out: NotasItem = {
    modificadores: [],
    especiales: [],
    salsa: '',
    notas: '',
    notaEspecial: '',
  }

  if (Array.isArray(it.modificadores)) {
    out.modificadores = it.modificadores.map((m) => String(m)).filter(Boolean)
  }

  const raw = typeof it.notas_especiales === 'string' ? it.notas_especiales.trim() : ''
  if (!raw) return out

  if (raw.startsWith('{')) {
    try {
      const meta = JSON.parse(raw)
      if (typeof meta.salsa === 'string') out.salsa = meta.salsa
      if (typeof meta.notas === 'string') out.notas = meta.notas
      if (typeof meta.notaEspecial === 'string') out.notaEspecial = meta.notaEspecial
      if (Array.isArray(meta.ingredientesEspeciales)) {
        out.especiales = meta.ingredientesEspeciales
          .map((e: any) => (typeof e === 'string' ? e : e?.nombre))
          .filter(Boolean)
      }
      return out
    } catch {
      // No era JSON válido: lo tratamos como nota de texto plano.
    }
  }
  out.notas = raw
  return out
}

function fechaHoyChile(): string {
  // YYYY-MM-DD según la zona del negocio.
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    return f
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function formatHora(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const estadoStyle: Record<string, string> = {
  pendiente: 'bg-zinc-500/20 text-zinc-200',
  en_preparacion: 'bg-blue-500/20 text-blue-400',
  listo: 'bg-emerald-500/20 text-emerald-400',
  entregado: 'bg-emerald-700/20 text-emerald-300',
  cancelado: 'bg-rose-500/20 text-rose-400',
}

const estadoLabel: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export function KDSHistorialDialog({ open, onOpenChange, estacion }: Props) {
  const [fecha, setFecha] = useState<string>(fechaHoyChile())
  const [data, setData] = useState<OrdenHist[]>([])
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (f: string) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/kds/historial?fecha=${encodeURIComponent(f)}&limite=200`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('No se pudo cargar el historial')
      const json = await res.json()
      setData(Array.isArray(json) ? json : [])
    } catch (e: any) {
      showToast(e?.message || 'Error cargando historial', 'error')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (open) cargar(fecha)
  }, [open, fecha, cargar])

  // Filtra los items por estación y cuenta totales para resumen del día.
  const { ordenesFiltradas, totales } = useMemo(() => {
    const ordenes: OrdenHist[] = []
    let totalItems = 0
    let totalEntregados = 0
    let totalCancelados = 0
    for (const o of data) {
      const items = (o.items || []).filter((it) => {
        if (estacion === 'bar') return esItemDeBar(it)
        if (estacion === 'cocina') return !esItemDeBar(it)
        return true
      })
      if (items.length === 0) continue
      ordenes.push({ ...o, items })
      for (const it of items) {
        totalItems += Number(it.cantidad || 1)
        if (it.estado_item === 'entregado') totalEntregados += Number(it.cantidad || 1)
        if (it.estado_item === 'cancelado') totalCancelados += Number(it.cantidad || 1)
      }
    }
    return {
      ordenesFiltradas: ordenes,
      totales: { totalItems, totalEntregados, totalCancelados, totalOrdenes: ordenes.length },
    }
  }, [data, estacion])

  const titulo =
    estacion === 'bar' ? 'Historial — Bar' : estacion === 'cocina' ? 'Historial — Cocina' : 'Historial — Cocina y Bar'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-amber-500" />
            {titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3 border-b border-border/40 pb-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Fecha</label>
            <Input
              type="date"
              value={fecha}
              max={fechaHoyChile()}
              onChange={(e) => setFecha(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFecha(fechaHoyChile())}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date()
                d.setDate(d.getDate() - 1)
                const iso = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Santiago',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(d)
                setFecha(iso)
              }}
            >
              Ayer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cargar(fecha)}
              disabled={cargando}
            >
              <RefreshCw className={cargando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{totales.totalOrdenes} órdenes</Badge>
            <Badge variant="outline">{totales.totalItems} unidades</Badge>
            <Badge className="bg-emerald-500/20 text-emerald-400">
              {totales.totalEntregados} entregadas
            </Badge>
            {totales.totalCancelados > 0 && (
              <Badge className="bg-rose-500/20 text-rose-400">
                {totales.totalCancelados} canceladas
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto pt-3">
          {cargando && ordenesFiltradas.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>
          )}
          {!cargando && ordenesFiltradas.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Sin pedidos para esta fecha.
            </p>
          )}
          <div className="space-y-3">
            {ordenesFiltradas.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-border/50 bg-background p-3"
              >
                <div className="mb-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold">
                      Mesa {o.mesa_numero ?? '—'}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      · {formatHora(o.created_at)}
                    </span>
                  </div>
                  <Badge
                    className={
                      o.estado === 'pagado'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : o.estado === 'cancelado' || o.estado === 'perdida'
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-amber-500/20 text-amber-400'
                    }
                  >
                    {o.estado}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {o.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-2 border-t border-border/30 pt-1 first:border-t-0 first:pt-0"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">
                          {it.cantidad}× {it.producto_nombre || '—'}
                        </span>
                        {it.categoria && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({it.categoria})
                          </span>
                        )}
                        {(() => {
                          const n = parseNotasItem(it)
                          const vacio =
                            n.modificadores.length === 0 &&
                            n.especiales.length === 0 &&
                            !n.salsa &&
                            !n.notas &&
                            !n.notaEspecial
                          if (vacio) return null
                          return (
                            <div className="mt-0.5 space-y-0.5 text-xs leading-tight">
                              {n.modificadores.length > 0 && (
                                <p className="text-muted-foreground">
                                  + {n.modificadores.join(', ')}
                                </p>
                              )}
                              {n.especiales.length > 0 && (
                                <p className="text-amber-600">
                                  ⭐ {n.especiales.join(', ')}
                                </p>
                              )}
                              {n.salsa && (
                                <p className="text-muted-foreground">Salsa: {n.salsa}</p>
                              )}
                              {n.notaEspecial && (
                                <p className="italic text-amber-600">📝 {n.notaEspecial}</p>
                              )}
                              {n.notas && (
                                <p className="italic text-muted-foreground">
                                  Nota: {n.notas}
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                      <Badge
                        className={
                          estadoStyle[it.estado_item] ||
                          'bg-zinc-500/20 text-zinc-200'
                        }
                      >
                        {estadoLabel[it.estado_item] || it.estado_item}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
