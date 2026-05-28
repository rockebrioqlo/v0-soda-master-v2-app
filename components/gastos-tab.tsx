'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, RefreshCw, Wallet, Filter } from 'lucide-react'
import { showToast } from '@/components/toast'
import { formatCurrency } from '@/lib/helpers'

type Gasto = {
  id: string
  fecha: string
  categoria: string
  descripcion: string | null
  monto: number | string
  tipo: string
  recurrente: boolean
  periodicidad: string | null
  proveedor_id: string | null
  empleado_id: string | null
  activo_id: string | null
  proveedor_nombre: string | null
  empleado_nombre: string | null
  activo_nombre: string | null
}

type Resumen = {
  desde: string
  hasta: string
  total: number
  sueldos_proyectados_mes: number
  por_tipo: { tipo: string; total: string | number; cantidad: number }[]
}

type Lookup = { id: string; nombre: string }

const TIPOS = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'sueldo', label: 'Sueldo' },
  { value: 'servicio', label: 'Servicio (luz/agua/internet)' },
  { value: 'impuesto', label: 'Impuesto' },
  { value: 'financiero', label: 'Financiero' },
  { value: 'otros', label: 'Otros' },
]

const EMPTY = {
  fecha: new Date().toISOString().slice(0, 10),
  categoria: 'general',
  descripcion: '',
  monto: '0',
  tipo: 'operativo',
  recurrente: false,
  periodicidad: '',
  proveedor_id: '',
  empleado_id: '',
  activo_id: '',
  notas: '',
}

function defaultDesde() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export function GastosTab() {
  const [items, setItems] = useState<Gasto[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [proveedores, setProveedores] = useState<Lookup[]>([])
  const [empleados, setEmpleados] = useState<Lookup[]>([])
  const [activos, setActivos] = useState<Lookup[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [filtroTipo, setFiltroTipo] = useState<string>('all')
  const [desde, setDesde] = useState<string>(defaultDesde())
  const [hasta, setHasta] = useState<string>(new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (desde) qs.set('desde', desde)
      if (hasta) qs.set('hasta', hasta)
      if (filtroTipo && filtroTipo !== 'all') qs.set('tipo', filtroTipo)
      const [g, r, p, e, a] = await Promise.all([
        fetch(`/api/gastos?${qs.toString()}`),
        fetch(`/api/gastos?resumen=true&desde=${desde}&hasta=${hasta}`),
        fetch('/api/proveedores'),
        fetch('/api/empleados'),
        fetch('/api/activos'),
      ])
      if (g.ok) setItems(await g.json())
      if (r.ok) setResumen(await r.json())
      if (p.ok) setProveedores(await p.json())
      if (e.ok) setEmpleados(await e.json())
      if (a.ok) setActivos(await a.json())
    } catch {
      showToast('Error al cargar gastos', 'error')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, filtroTipo])

  useEffect(() => {
    load()
  }, [load])

  const abrirNuevo = () => {
    setForm({ ...EMPTY })
    setShowDialog(true)
  }

  const guardar = async () => {
    const monto = Number(form.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      showToast('Monto debe ser mayor a 0', 'error')
      return
    }
    const payload = {
      fecha: form.fecha,
      categoria: form.categoria || 'general',
      descripcion: form.descripcion || null,
      monto,
      tipo: form.tipo,
      recurrente: form.recurrente,
      periodicidad: form.periodicidad || null,
      proveedor_id: form.proveedor_id || null,
      empleado_id: form.empleado_id || null,
      activo_id: form.activo_id || null,
      notas: form.notas || null,
    }
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error al guardar')
      showToast('Gasto registrado', 'success')
      setShowDialog(false)
      await load()
    } catch {
      showToast('Error al registrar gasto', 'error')
    }
  }

  const eliminar = async (g: Gasto) => {
    if (!confirm(`¿Eliminar gasto de ${formatCurrency(Number(g.monto))}?`)) return
    try {
      await fetch(`/api/gastos/${g.id}`, { method: 'DELETE' })
      showToast('Gasto eliminado', 'success')
      await load()
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  const porTipoMap = useMemo(() => {
    const map: Record<string, number> = {}
    resumen?.por_tipo.forEach((t) => {
      map[t.tipo] = Number(t.total)
    })
    return map
  }, [resumen])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-amber-500">
              {formatCurrency(resumen?.total || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total del periodo</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(porTipoMap['sueldo'] || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Sueldos pagados</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(porTipoMap['servicio'] || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Servicios</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-red-500">
              {formatCurrency(resumen?.sueldos_proyectados_mes || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Sueldos proyectados / mes</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="min-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <Filter className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Aplicar
          </Button>
          <div className="ml-auto">
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" /> Registrar gasto
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Cargando gastos...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              <Wallet className="mx-auto mb-2 h-6 w-6" /> Sin gastos en este periodo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Relación</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{String(g.fecha).slice(0, 10)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {g.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{g.categoria}</TableCell>
                    <TableCell>{g.descripcion || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[g.proveedor_nombre, g.empleado_nombre, g.activo_nombre]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                      {g.recurrente && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          recurrente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(Number(g.monto))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => eliminar(g)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Categoría libre</label>
                <Input
                  placeholder="ej: arriendo, internet..."
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monto</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </div>
            </div>
            <Input
              placeholder="Descripción"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Proveedor</label>
                <Select
                  value={form.proveedor_id}
                  onValueChange={(v) => setForm({ ...form, proveedor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Empleado</label>
                <Select
                  value={form.empleado_id}
                  onValueChange={(v) =>
                    setForm({ ...form, empleado_id: v, tipo: v ? 'sueldo' : form.tipo })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {empleados.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Activo</label>
                <Select
                  value={form.activo_id}
                  onValueChange={(v) => setForm({ ...form, activo_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {activos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="g-recurrente">Gasto recurrente</Label>
                <Switch
                  id="g-recurrente"
                  checked={form.recurrente}
                  onCheckedChange={(c) => setForm({ ...form, recurrente: !!c })}
                />
              </div>
              {form.recurrente && (
                <Select
                  value={form.periodicidad}
                  onValueChange={(v) => setForm({ ...form, periodicidad: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Periodicidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Textarea
              placeholder="Notas"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
