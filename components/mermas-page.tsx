'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { showToast } from '@/components/toast'
import { formatCurrency } from '@/lib/helpers'
import { AlertTriangle, RefreshCw, Shield, UserCheck } from 'lucide-react'

type TipoMerma =
  | 'accidente'
  | 'vencido'
  | 'perdida_sin_explicacion'
  | 'consumo_interno'
  | 'comanda_no_pagada'
  | 'error_preparacion'
  | 'robo'

const TIPOS: { value: TipoMerma; label: string }[] = [
  { value: 'accidente', label: 'Accidente / Daño físico' },
  { value: 'vencido', label: 'Producto vencido o en mal estado' },
  { value: 'perdida_sin_explicacion', label: 'Pérdida sin explicación' },
  { value: 'consumo_interno', label: 'Consumo interno del personal' },
  { value: 'comanda_no_pagada', label: 'Comanda no pagada' },
  { value: 'error_preparacion', label: 'Error de preparación' },
  { value: 'robo', label: 'Robo' },
]

const MOTIVOS_CNP: { value: 'cliente_se_fue' | 'error_mesero' | 'cortesia'; label: string }[] = [
  { value: 'cliente_se_fue', label: 'Cliente se retiró sin pagar' },
  { value: 'error_mesero', label: 'Error del mesero' },
  { value: 'cortesia', label: 'Cortesía autorizada' },
]

const CONSECUENCIAS: { value: 'descuento_liquidacion' | 'solo_registro' | 'amonestacion'; label: string }[] = [
  { value: 'descuento_liquidacion', label: 'Descuento en liquidación' },
  { value: 'solo_registro', label: 'Solo registro' },
  { value: 'amonestacion', label: 'Amonestación' },
]

const TIPOS_ADMIN_ONLY = new Set<TipoMerma>(['robo', 'perdida_sin_explicacion'])

interface MermaRow {
  id: string
  tipo: TipoMerma
  producto_id: string | null
  producto_nombre: string | null
  cantidad: number
  descripcion: string | null
  registrado_por: string | null
  registrado_por_nombre: string | null
  responsable_id: string | null
  responsable_nombre: string | null
  consecuencia: string | null
  monto_descuento: number
  created_at: string
}

interface OrdenLista {
  id: string
  mesa_id: string | null
  estado: string
  total: number | string
  created_at?: string
}

function tipoLabel(tipo: string) {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}

function consecuenciaLabel(c: string | null) {
  if (!c) return null
  return CONSECUENCIAS.find((x) => x.value === c)?.label ?? c
}

export function MermasPage() {
  const { state } = useApp()
  const { usuarioActual, productos, usuarios, mesas } = state
  const isAdmin = usuarioActual?.rol === 'admin' || usuarioActual?.rol === 'administrador'

  const [mermas, setMermas] = useState<MermaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<string>('all')
  const hoy = new Date().toISOString().slice(0, 10)
  const [filtroDesde, setFiltroDesde] = useState<string>('')
  const [filtroHasta, setFiltroHasta] = useState<string>('')

  const [tipo, setTipo] = useState<TipoMerma>('accidente')
  const [productoId, setProductoId] = useState<string>('')
  const [cantidad, setCantidad] = useState<string>('1')
  const [descripcion, setDescripcion] = useState<string>('')
  const [ordenes, setOrdenes] = useState<OrdenLista[]>([])
  const [ordenId, setOrdenId] = useState<string>('')
  const [motivoCnp, setMotivoCnp] = useState<'cliente_se_fue' | 'error_mesero' | 'cortesia'>('cliente_se_fue')

  const [authOpen, setAuthOpen] = useState(false)
  const [authPin, setAuthPin] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [autorizadoPor, setAutorizadoPor] = useState<string | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMerma, setAssignMerma] = useState<MermaRow | null>(null)
  const [assignResponsable, setAssignResponsable] = useState<string>('')
  const [assignConsecuencia, setAssignConsecuencia] = useState<string>('solo_registro')
  const [assignMonto, setAssignMonto] = useState<string>('0')
  const [assignLoading, setAssignLoading] = useState(false)

  const adminEmail = useMemo(() => {
    const admin = usuarios.find((u) => u.rol === 'admin' || u.rol === 'administrador')
    return admin?.email ?? ''
  }, [usuarios])

  const loadMermas = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroTipo !== 'all') params.set('tipo', filtroTipo)
      if (filtroDesde) params.set('desde', filtroDesde)
      if (filtroHasta) params.set('hasta', filtroHasta)
      const res = await fetch(`/api/mermas?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setMermas(Array.isArray(data) ? data : [])
      } else {
        showToast('Error al cargar mermas', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setLoading(false)
    }
  }, [filtroTipo, filtroDesde, filtroHasta])

  useEffect(() => {
    loadMermas()
  }, [loadMermas])

  useEffect(() => {
    if (tipo !== 'comanda_no_pagada') return
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch('/api/ordenes?limite=50&orden=desc', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelado) {
          setOrdenes(
            (Array.isArray(data) ? data : []).filter(
              (o: OrdenLista) => o.estado !== 'pagado' && o.estado !== 'cancelado'
            )
          )
        }
      } catch {}
    })()
    return () => {
      cancelado = true
    }
  }, [tipo])

  const bloqueadoPorTipo = !isAdmin && TIPOS_ADMIN_ONLY.has(tipo)
  const requiereCortesia = tipo === 'comanda_no_pagada' && motivoCnp === 'cortesia'
  const cortesiaPendiente = requiereCortesia && !autorizadoPor

  const resetForm = () => {
    setTipo('accidente')
    setProductoId('')
    setCantidad('1')
    setDescripcion('')
    setOrdenId('')
    setMotivoCnp('cliente_se_fue')
    setAutorizadoPor(null)
  }

  const handleRegistrar = async () => {
    if (!usuarioActual) return
    if (bloqueadoPorTipo) {
      showToast('Solo el administrador puede registrar este tipo de merma', 'error')
      return
    }
    const cantidadNum = Number(cantidad)
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      showToast('Cantidad inválida', 'error')
      return
    }
    if (tipo !== 'comanda_no_pagada' && !productoId) {
      showToast('Selecciona un producto', 'error')
      return
    }
    if (tipo === 'comanda_no_pagada' && !ordenId) {
      showToast('Selecciona una orden', 'error')
      return
    }
    if (cortesiaPendiente) {
      setAuthOpen(true)
      return
    }
    try {
      const body: Record<string, unknown> = {
        tipo,
        cantidad: cantidadNum,
        descripcion: descripcion || null,
        registrado_por: usuarioActual.id,
      }
      if (tipo !== 'comanda_no_pagada') body.producto_id = productoId
      if (tipo === 'comanda_no_pagada') {
        body.comanda_no_pagada = {
          orden_id: ordenId,
          motivo: motivoCnp,
          autorizado_por: autorizadoPor,
        }
      }
      const res = await fetch('/api/mermas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        showToast('Merma registrada', 'success')
        resetForm()
        loadMermas()
      } else {
        showToast(data?.error || 'Error al registrar', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    }
  }

  const handleVerificarAdmin = async () => {
    if (!adminEmail) {
      showToast('No hay administrador configurado', 'error')
      return
    }
    setAuthLoading(true)
    try {
      const res = await fetch('/api/auth/verificar-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, pin: authPin }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.valido) {
        setAutorizadoPor(data.usuario.id)
        setAuthOpen(false)
        setAuthPin('')
        showToast('Autorización aprobada — registra la cortesía', 'success')
      } else {
        showToast('PIN incorrecto', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleOpenAssign = (merma: MermaRow) => {
    setAssignMerma(merma)
    setAssignResponsable(merma.responsable_id || '')
    setAssignConsecuencia(merma.consecuencia || 'solo_registro')
    setAssignMonto(String(merma.monto_descuento || 0))
    setAssignOpen(true)
  }

  const handleConfirmAssign = async () => {
    if (!assignMerma || !usuarioActual) return
    if (!assignResponsable) {
      showToast('Selecciona un responsable', 'error')
      return
    }
    const monto = assignConsecuencia === 'descuento_liquidacion' ? Number(assignMonto) : 0
    if (assignConsecuencia === 'descuento_liquidacion' && (!Number.isFinite(monto) || monto < 0)) {
      showToast('Monto inválido', 'error')
      return
    }
    setAssignLoading(true)
    try {
      const res = await fetch(`/api/mermas/${assignMerma.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuarioActual.id,
          responsable_id: assignResponsable,
          consecuencia: assignConsecuencia,
          monto_descuento: monto,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        showToast('Responsable asignado', 'success')
        setAssignOpen(false)
        setAssignMerma(null)
        loadMermas()
      } else {
        showToast(data?.error || 'Error al asignar', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setAssignLoading(false)
    }
  }

  const productosOrdenados = useMemo(
    () => [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos]
  )
  const usuariosActivos = useMemo(() => usuarios.filter((u) => u.activo), [usuarios])
  const mesaNombre = (mesaId: string | null | undefined) =>
    mesas.find((m) => m.id === mesaId)?.nombre || (mesaId ? '—' : '')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mermas y Pérdidas</h1>
          <p className="text-sm text-muted-foreground">
            Registra pérdidas físicas, robos, errores de preparación y comandas no pagadas.
          </p>
        </div>
        <Button variant="outline" onClick={loadMermas} disabled={loading}>
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Registrar Merma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoMerma); setAutorizadoPor(null) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem
                      key={t.value}
                      value={t.value}
                      disabled={!isAdmin && TIPOS_ADMIN_ONLY.has(t.value)}
                    >
                      {t.label}
                      {!isAdmin && TIPOS_ADMIN_ONLY.has(t.value) ? ' (solo admin)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>

            {tipo !== 'comanda_no_pagada' && (
              <div className="space-y-2 md:col-span-2">
                <Label>Producto afectado</Label>
                <Select value={productoId} onValueChange={setProductoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {productosOrdenados.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} · stock {p.stock}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {tipo === 'comanda_no_pagada' && (
              <>
                <div className="space-y-2">
                  <Label>Orden</Label>
                  <Select value={ordenId} onValueChange={setOrdenId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una orden" />
                    </SelectTrigger>
                    <SelectContent>
                      {ordenes.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No hay órdenes abiertas
                        </div>
                      ) : (
                        ordenes.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {mesaNombre(o.mesa_id)} · {formatCurrency(Number(o.total) || 0)} · {o.estado}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Select
                    value={motivoCnp}
                    onValueChange={(v) => {
                      setMotivoCnp(v as typeof motivoCnp)
                      setAutorizadoPor(null)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_CNP.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {requiereCortesia && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-500">
                      <Shield className="h-3.5 w-3.5" />
                      {autorizadoPor
                        ? 'Cortesía autorizada por administrador.'
                        : 'Requiere PIN del administrador al registrar.'}
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                placeholder="Detalle del incidente..."
              />
            </div>
          </div>

          {bloqueadoPorTipo && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Solo el administrador puede registrar este tipo de merma.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleRegistrar}
              disabled={bloqueadoPorTipo}
              className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
            >
              {cortesiaPendiente ? 'Autorizar y registrar' : 'Registrar merma'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>Historial de mermas</CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input
                type="date"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
                className="w-[180px]"
                max={hoy}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input
                type="date"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
                className="w-[180px]"
                max={hoy}
              />
            </div>
            {(filtroDesde || filtroHasta || filtroTipo !== 'all') && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFiltroTipo('all')
                  setFiltroDesde('')
                  setFiltroHasta('')
                }}
                className="self-end"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : mermas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No hay mermas registradas en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Registrado por</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Consecuencia</TableHead>
                    {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mermas.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString('es-CL', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {tipoLabel(m.tipo)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.producto_nombre || '—'}
                      </TableCell>
                      <TableCell className="text-right">{m.cantidad}</TableCell>
                      <TableCell>{m.registrado_por_nombre || '—'}</TableCell>
                      <TableCell>
                        {m.responsable_nombre ? (
                          <span className="text-foreground">{m.responsable_nombre}</span>
                        ) : (
                          <Badge className="bg-orange-500 text-white">Sin asignar</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {consecuenciaLabel(m.consecuencia) || (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {m.consecuencia === 'descuento_liquidacion' && m.monto_descuento > 0 && (
                          <span className="ml-1 text-xs text-amber-500">
                            ({formatCurrency(m.monto_descuento)})
                          </span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAssign(m)}
                          >
                            <UserCheck className="mr-1 h-3.5 w-3.5" />
                            {m.responsable_id ? 'Editar' : 'Asignar'}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Requiere autorización del Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Ingresa el PIN del administrador para autorizar la cortesía.
            </p>
            <Input
              type="password"
              inputMode="numeric"
              value={authPin}
              onChange={(e) => setAuthPin(e.target.value)}
              placeholder="PIN admin"
              onKeyDown={(e) => e.key === 'Enter' && handleVerificarAdmin()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthOpen(false)} disabled={authLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleVerificarAdmin}
              disabled={authLoading || !authPin}
              className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
            >
              {authLoading ? 'Verificando...' : 'Verificar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar responsable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {assignMerma && (
              <p className="text-xs text-muted-foreground">
                {tipoLabel(assignMerma.tipo)} — {assignMerma.producto_nombre || 'sin producto'} · {assignMerma.cantidad} u.
              </p>
            )}
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select value={assignResponsable} onValueChange={setAssignResponsable}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {usuariosActivos.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Consecuencia</Label>
              <Select value={assignConsecuencia} onValueChange={setAssignConsecuencia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSECUENCIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assignConsecuencia === 'descuento_liquidacion' && (
              <div className="space-y-2">
                <Label>Monto del descuento ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={assignMonto}
                  onChange={(e) => setAssignMonto(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAssign}
              disabled={assignLoading}
              className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
            >
              {assignLoading ? 'Guardando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
