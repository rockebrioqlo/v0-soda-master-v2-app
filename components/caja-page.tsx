'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { formatCurrency } from '@/lib/helpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { showToast } from '@/components/toast'
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Lock,
  History,
} from 'lucide-react'

interface CajaResumen {
  fondo_inicial: number
  ventas_efectivo: number
  vuelto_entregado: number
  retiros: number
  depositos: number
  efectivo_esperado: number
}

interface CajaAbierta {
  id: string
  usuario_apertura_nombre: string
  fondo_inicial: number
  abierta_en: string
  estado: 'abierta' | 'cerrada'
}

interface MovimientoCaja {
  id: string
  tipo: 'apertura' | 'venta_efectivo' | 'vuelto' | 'retiro' | 'deposito' | 'ajuste' | 'cierre'
  monto: number
  descripcion: string | null
  usuario_nombre: string | null
  created_at: string
}

interface CajaHistorial {
  id: string
  usuario_apertura_nombre: string
  usuario_cierre_nombre: string | null
  fondo_inicial: number
  efectivo_contado: number | null
  diferencia: number | null
  estado: 'abierta' | 'cerrada'
  abierta_en: string
  cerrada_en: string | null
  pagos_efectivo: number
}

const tipoLabel: Record<MovimientoCaja['tipo'], string> = {
  apertura: 'Apertura',
  venta_efectivo: 'Venta en efectivo',
  vuelto: 'Vuelto entregado',
  retiro: 'Retiro',
  deposito: 'Depósito',
  ajuste: 'Ajuste',
  cierre: 'Cierre',
}

const esEntrada = (t: MovimientoCaja['tipo']) =>
  t === 'apertura' || t === 'venta_efectivo' || t === 'deposito'

// Parser tolerante: acepta "20.000", "20000", "$20.000" — sólo nos
// quedamos con dígitos. Igual que en pagos-page.tsx.
function parseMonto(s: string): number {
  const limpio = (s || '').replace(/[^\d]/g, '')
  if (!limpio) return 0
  return Number(limpio)
}

function formatHora(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function CajaPage() {
  const { state } = useApp()
  const usuarioActual = state.usuarioActual

  const [cargando, setCargando] = useState(true)
  const [caja, setCaja] = useState<CajaAbierta | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [resumen, setResumen] = useState<CajaResumen | null>(null)
  const [historial, setHistorial] = useState<CajaHistorial[]>([])
  const [historialOpen, setHistorialOpen] = useState(false)
  const [detalleCaja, setDetalleCaja] = useState<{
    caja: any
    movimientos: MovimientoCaja[]
    resumen: CajaResumen
  } | null>(null)

  const [abrirOpen, setAbrirOpen] = useState(false)
  const [fondoInput, setFondoInput] = useState('')
  const [notasApertura, setNotasApertura] = useState('')

  const [retiroOpen, setRetiroOpen] = useState(false)
  const [depositoOpen, setDepositoOpen] = useState(false)
  const [movTipo, setMovTipo] = useState<'retiro' | 'deposito'>('retiro')
  const [movMonto, setMovMonto] = useState('')
  const [movDescripcion, setMovDescripcion] = useState('')

  const [cerrarOpen, setCerrarOpen] = useState(false)
  const [contadoInput, setContadoInput] = useState('')
  const [notasCierre, setNotasCierre] = useState('')

  const recargar = useCallback(async () => {
    try {
      const res = await fetch('/api/caja', { cache: 'no-store' })
      if (!res.ok) throw new Error('No se pudo cargar la caja')
      const data = await res.json()
      if (data?.abierta && data.caja) {
        setCaja(data.caja)
        setMovimientos(data.movimientos || [])
        setResumen(data.resumen || null)
      } else {
        setCaja(null)
        setMovimientos([])
        setResumen(null)
      }
    } catch (e: any) {
      showToast(e?.message || 'Error cargando caja', 'error')
    } finally {
      setCargando(false)
    }
  }, [])

  const cargarHistorial = useCallback(async () => {
    try {
      const res = await fetch('/api/caja/historial?limite=50', { cache: 'no-store' })
      if (!res.ok) throw new Error('No se pudo cargar el historial')
      const data = await res.json()
      setHistorial(Array.isArray(data) ? data : [])
    } catch (e: any) {
      showToast(e?.message || 'Error cargando historial', 'error')
    }
  }, [])

  useEffect(() => {
    recargar()
    // Refresca cada 20 s para que las ventas en efectivo entren al
    // panel sin tener que recargar la página manualmente.
    const id = window.setInterval(recargar, 20000)
    return () => window.clearInterval(id)
  }, [recargar])

  const handleAbrir = async () => {
    if (!usuarioActual) return
    const fondo = parseMonto(fondoInput)
    if (fondo < 0) {
      showToast('Fondo inicial inválido', 'error')
      return
    }
    try {
      const res = await fetch('/api/caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuarioActual.id,
          usuario_nombre: usuarioActual.nombre,
          fondo_inicial: fondo,
          notas: notasApertura.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo abrir la caja')
      showToast('Caja abierta', 'success')
      setAbrirOpen(false)
      setFondoInput('')
      setNotasApertura('')
      await recargar()
    } catch (e: any) {
      showToast(e?.message || 'Error abriendo caja', 'error')
    }
  }

  const handleMovimiento = async () => {
    if (!usuarioActual) return
    const monto = parseMonto(movMonto)
    if (monto <= 0) {
      showToast('Monto inválido', 'error')
      return
    }
    try {
      const res = await fetch('/api/caja/movimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: movTipo,
          monto,
          descripcion: movDescripcion.trim() || null,
          usuario_id: usuarioActual.id,
          usuario_nombre: usuarioActual.nombre,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo registrar')
      showToast(`${movTipo === 'retiro' ? 'Retiro' : 'Depósito'} registrado`, 'success')
      setRetiroOpen(false)
      setDepositoOpen(false)
      setMovMonto('')
      setMovDescripcion('')
      await recargar()
    } catch (e: any) {
      showToast(e?.message || 'Error registrando movimiento', 'error')
    }
  }

  const handleCerrar = async () => {
    if (!usuarioActual || !caja) return
    const contado = parseMonto(contadoInput)
    if (contado < 0) {
      showToast('Monto contado inválido', 'error')
      return
    }
    try {
      const res = await fetch('/api/caja/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caja_id: caja.id,
          usuario_id: usuarioActual.id,
          usuario_nombre: usuarioActual.nombre,
          efectivo_contado: contado,
          notas: notasCierre.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo cerrar la caja')
      const diff = Number(data?.diferencia ?? 0)
      const msg =
        diff === 0
          ? 'Caja cerrada. Cuadre exacto.'
          : diff > 0
            ? `Caja cerrada. Sobrante de ${formatCurrency(diff)}.`
            : `Caja cerrada. Faltante de ${formatCurrency(Math.abs(diff))}.`
      showToast(msg, diff === 0 ? 'success' : 'error')
      setCerrarOpen(false)
      setContadoInput('')
      setNotasCierre('')
      await recargar()
    } catch (e: any) {
      showToast(e?.message || 'Error cerrando caja', 'error')
    }
  }

  const abrirDetalleCaja = async (id: string) => {
    try {
      const res = await fetch(`/api/caja/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('No se pudo cargar el detalle')
      const data = await res.json()
      setDetalleCaja(data)
    } catch (e: any) {
      showToast(e?.message || 'Error cargando detalle', 'error')
    }
  }

  const totalEsperado = resumen?.efectivo_esperado ?? 0
  const movimientosOrdenados = useMemo(
    () => [...movimientos].sort((a, b) => (a.created_at > b.created_at ? -1 : 1)),
    [movimientos],
  )

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        Cargando caja...
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Wallet className="h-6 w-6 text-amber-500" />
            Caja chica
          </h1>
          <p className="text-sm text-muted-foreground">
            Apertura, movimientos y arqueo de caja. Cada pago en efectivo se registra
            automáticamente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarHistorial()
            setHistorialOpen(true)
          }}
        >
          <History className="mr-2 h-4 w-4" />
          Historial
        </Button>
      </div>

      {!caja && (
        <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <PiggyBank className="h-12 w-12 text-amber-500" />
            <div>
              <p className="text-lg font-semibold">No hay caja abierta</p>
              <p className="text-sm text-muted-foreground">
                Abre la caja con el fondo inicial para empezar a operar.
                Los pagos en efectivo quedan registrados aquí.
              </p>
            </div>
            <Button onClick={() => setAbrirOpen(true)} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Abrir caja
            </Button>
          </CardContent>
        </Card>
      )}

      {caja && resumen && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  Fondo inicial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(resumen.fondo_inicial)}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  Ventas en efectivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(resumen.ventas_efectivo)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  Vuelto entregado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-rose-500">
                  -{formatCurrency(resumen.vuelto_entregado)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/50 bg-amber-500/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  Efectivo esperado en caja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-500">
                  {formatCurrency(totalEsperado)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMovTipo('retiro')
                setMovMonto('')
                setMovDescripcion('')
                setRetiroOpen(true)
              }}
            >
              <ArrowUpCircle className="mr-2 h-4 w-4 text-rose-500" />
              Retiro
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMovTipo('deposito')
                setMovMonto('')
                setMovDescripcion('')
                setDepositoOpen(true)
              }}
            >
              <ArrowDownCircle className="mr-2 h-4 w-4 text-emerald-500" />
              Depósito
            </Button>
            <div className="ml-auto">
              <Button
                onClick={() => {
                  setContadoInput('')
                  setNotasCierre('')
                  setCerrarOpen(true)
                }}
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                <Lock className="mr-2 h-4 w-4" />
                Cerrar caja
              </Button>
            </div>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>
                Movimientos del turno{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  abierta {formatHora(caja.abierta_en)} por {caja.usuario_apertura_nombre}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {movimientosOrdenados.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin movimientos aún.</p>
              )}
              {movimientosOrdenados.map((m) => {
                const entrada = esEntrada(m.tipo)
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded border border-border/40 bg-background px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tipoLabel[m.tipo]}</span>
                        {m.descripcion && (
                          <span className="truncate text-xs text-muted-foreground">
                            — {m.descripcion}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatHora(m.created_at)}
                        {m.usuario_nombre ? ` · ${m.usuario_nombre}` : ''}
                      </p>
                    </div>
                    <p
                      className={
                        entrada
                          ? 'shrink-0 font-bold text-emerald-500'
                          : 'shrink-0 font-bold text-rose-500'
                      }
                    >
                      {entrada ? '+' : '-'}
                      {formatCurrency(Number(m.monto))}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog abrir caja */}
      <Dialog open={abrirOpen} onOpenChange={setAbrirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm">Fondo inicial</label>
              <Input
                inputMode="numeric"
                value={fondoInput ? parseMonto(fondoInput).toLocaleString('es-CL') : ''}
                onChange={(e) => setFondoInput(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="50.000"
                className="text-right text-lg font-semibold"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Dinero físico que dejas en caja para dar vueltos al iniciar.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm">Notas (opcional)</label>
              <Textarea
                value={notasApertura}
                onChange={(e) => setNotasApertura(e.target.value)}
                placeholder="Turno mañana / cualquier observación"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAbrir} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog retiro / depósito */}
      <Dialog
        open={retiroOpen || depositoOpen}
        onOpenChange={(v) => {
          if (!v) {
            setRetiroOpen(false)
            setDepositoOpen(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movTipo === 'retiro' ? 'Registrar retiro' : 'Registrar depósito'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm">Monto</label>
              <Input
                inputMode="numeric"
                value={movMonto ? parseMonto(movMonto).toLocaleString('es-CL') : ''}
                onChange={(e) => setMovMonto(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="10.000"
                className="text-right text-lg font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Motivo / descripción</label>
              <Textarea
                value={movDescripcion}
                onChange={(e) => setMovDescripcion(e.target.value)}
                placeholder={
                  movTipo === 'retiro'
                    ? 'Ej: pago proveedor, propinas al cocinero, etc.'
                    : 'Ej: depósito refuerzo de caja'
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRetiroOpen(false)
                setDepositoOpen(false)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMovimiento}
              className={
                movTipo === 'retiro'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cierre / arqueo */}
      <Dialog open={cerrarOpen} onOpenChange={setCerrarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arqueo y cierre de caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span>Efectivo esperado</span>
                <span className="font-bold text-amber-500">
                  {formatCurrency(totalEsperado)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Fondo + ventas en efectivo - vuelto - retiros + depósitos.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm">Efectivo contado en caja</label>
              <Input
                inputMode="numeric"
                value={contadoInput ? parseMonto(contadoInput).toLocaleString('es-CL') : ''}
                onChange={(e) => setContadoInput(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={formatCurrency(totalEsperado).replace('$', '')}
                className="text-right text-lg font-semibold"
              />
              {contadoInput && (
                <p className="mt-1 text-xs">
                  Diferencia:{' '}
                  <span
                    className={
                      parseMonto(contadoInput) - totalEsperado === 0
                        ? 'font-semibold text-emerald-500'
                        : parseMonto(contadoInput) - totalEsperado > 0
                          ? 'font-semibold text-amber-500'
                          : 'font-semibold text-rose-500'
                    }
                  >
                    {formatCurrency(parseMonto(contadoInput) - totalEsperado)}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm">Notas (opcional)</label>
              <Textarea
                value={notasCierre}
                onChange={(e) => setNotasCierre(e.target.value)}
                placeholder="Observaciones del cierre"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCerrarOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCerrar} className="bg-rose-600 text-white hover:bg-rose-500">
              Cerrar caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog historial */}
      <Dialog open={historialOpen} onOpenChange={setHistorialOpen}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Historial de cajas</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {historial.length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay cajas registradas.</p>
            )}
            {historial.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrirDetalleCaja(c.id)}
                className="flex w-full items-center justify-between gap-3 rounded border border-border/40 bg-background px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div>
                  <div className="font-semibold">
                    {c.estado === 'cerrada' ? 'Cerrada' : 'Abierta'} —{' '}
                    {formatHora(c.abierta_en)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Abrió {c.usuario_apertura_nombre}
                    {c.usuario_cierre_nombre ? ` · Cerró ${c.usuario_cierre_nombre}` : ''}
                    {' · '}
                    {c.pagos_efectivo} pago{c.pagos_efectivo === 1 ? '' : 's'} en efectivo
                  </p>
                </div>
                {c.estado === 'cerrada' && c.diferencia !== null && (
                  <span
                    className={
                      Number(c.diferencia) === 0
                        ? 'shrink-0 text-xs font-semibold text-emerald-500'
                        : Number(c.diferencia) > 0
                          ? 'shrink-0 text-xs font-semibold text-amber-500'
                          : 'shrink-0 text-xs font-semibold text-rose-500'
                    }
                  >
                    Δ {formatCurrency(Number(c.diferencia))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle caja del historial */}
      <Dialog open={!!detalleCaja} onOpenChange={(v) => !v && setDetalleCaja(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Caja {detalleCaja?.caja?.estado === 'cerrada' ? 'cerrada' : 'abierta'} —{' '}
              {detalleCaja && formatHora(detalleCaja.caja.abierta_en)}
            </DialogTitle>
          </DialogHeader>
          {detalleCaja && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded border border-border/40 p-2">
                  <p className="text-xs text-muted-foreground">Fondo inicial</p>
                  <p className="font-bold">{formatCurrency(detalleCaja.resumen.fondo_inicial)}</p>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <p className="text-xs text-muted-foreground">Ventas efectivo</p>
                  <p className="font-bold text-emerald-500">
                    {formatCurrency(detalleCaja.resumen.ventas_efectivo)}
                  </p>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <p className="text-xs text-muted-foreground">Vuelto</p>
                  <p className="font-bold text-rose-500">
                    -{formatCurrency(detalleCaja.resumen.vuelto_entregado)}
                  </p>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <p className="text-xs text-muted-foreground">Retiros</p>
                  <p className="font-bold text-rose-500">
                    -{formatCurrency(detalleCaja.resumen.retiros)}
                  </p>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <p className="text-xs text-muted-foreground">Depósitos</p>
                  <p className="font-bold text-emerald-500">
                    +{formatCurrency(detalleCaja.resumen.depositos)}
                  </p>
                </div>
                <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2">
                  <p className="text-xs text-muted-foreground">Esperado</p>
                  <p className="font-bold text-amber-500">
                    {formatCurrency(detalleCaja.resumen.efectivo_esperado)}
                  </p>
                </div>
              </div>
              {detalleCaja.caja.estado === 'cerrada' && (
                <div className="rounded border border-border/40 bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground">
                    Contado al cerrar: {formatCurrency(Number(detalleCaja.caja.efectivo_contado || 0))}
                    {' · '}
                    Diferencia:{' '}
                    <span
                      className={
                        Number(detalleCaja.caja.diferencia || 0) === 0
                          ? 'font-semibold text-emerald-500'
                          : Number(detalleCaja.caja.diferencia || 0) > 0
                            ? 'font-semibold text-amber-500'
                            : 'font-semibold text-rose-500'
                      }
                    >
                      {formatCurrency(Number(detalleCaja.caja.diferencia || 0))}
                    </span>
                  </p>
                </div>
              )}
              <div className="space-y-1">
                {detalleCaja.movimientos.map((m: MovimientoCaja) => {
                  const entrada = esEntrada(m.tipo)
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded border border-border/30 bg-background px-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{tipoLabel[m.tipo]}</span>
                        {m.descripcion && (
                          <span className="ml-1 truncate text-muted-foreground">
                            — {m.descripcion}
                          </span>
                        )}
                        <span className="ml-2 text-muted-foreground">
                          {formatHora(m.created_at)}
                        </span>
                      </div>
                      <span
                        className={
                          entrada ? 'font-bold text-emerald-500' : 'font-bold text-rose-500'
                        }
                      >
                        {entrada ? '+' : '-'}
                        {formatCurrency(Number(m.monto))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
