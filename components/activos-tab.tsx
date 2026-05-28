'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { Plus, Edit, RefreshCw, Box, Trash2 } from 'lucide-react'
import { showToast } from '@/components/toast'
import { formatCurrency } from '@/lib/helpers'

type Activo = {
  id: string
  nombre: string
  categoria: string
  descripcion: string | null
  fecha_compra: string
  costo_compra: number | string
  vida_util_meses: number
  valor_residual: number | string
  metodo_depreciacion: string
  proveedor_id: string | null
  proveedor_nombre?: string | null
  ubicacion: string | null
  numero_serie: string | null
  estado: 'activo' | 'baja' | 'vendido' | 'reparacion'
  notas: string | null
  depreciacion_mensual: number
  depreciacion_acumulada: number
  meses_transcurridos: number
  valor_actual: number
  completamente_depreciado: boolean
}

type Proveedor = { id: string; nombre: string }

const EMPTY = {
  nombre: '',
  categoria: 'maquinaria',
  descripcion: '',
  fecha_compra: new Date().toISOString().slice(0, 10),
  costo_compra: '0',
  vida_util_meses: '60',
  valor_residual: '0',
  metodo_depreciacion: 'lineal',
  proveedor_id: '',
  ubicacion: '',
  numero_serie: '',
  estado: 'activo',
  notas: '',
}

const CATEGORIAS = [
  { value: 'maquinaria', label: 'Maquinaria' },
  { value: 'mobiliario', label: 'Mobiliario' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'vehiculo', label: 'Vehículo' },
  { value: 'inmueble', label: 'Inmueble' },
  { value: 'otros', label: 'Otros' },
]

export function ActivosTab() {
  const [items, setItems] = useState<Activo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Activo | null>(null)
  const [form, setForm] = useState({ ...EMPTY })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, p] = await Promise.all([
        fetch('/api/activos?incluir_baja=true'),
        fetch('/api/proveedores'),
      ])
      if (a.ok) setItems(await a.json())
      if (p.ok) setProveedores(await p.json())
    } catch {
      showToast('Error al cargar activos', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totales = useMemo(() => {
    const activos = items.filter((i) => i.estado === 'activo')
    return activos.reduce(
      (acc, a) => {
        acc.costo += Number(a.costo_compra) || 0
        acc.valor += Number(a.valor_actual) || 0
        acc.depAcum += Number(a.depreciacion_acumulada) || 0
        acc.depMes += Number(a.depreciacion_mensual) || 0
        return acc
      },
      { costo: 0, valor: 0, depAcum: 0, depMes: 0 },
    )
  }, [items])

  const abrirNuevo = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setShowDialog(true)
  }

  const abrirEditar = (a: Activo) => {
    setEditing(a)
    setForm({
      nombre: a.nombre || '',
      categoria: a.categoria || 'maquinaria',
      descripcion: a.descripcion || '',
      fecha_compra: String(a.fecha_compra).slice(0, 10),
      costo_compra: String(a.costo_compra),
      vida_util_meses: String(a.vida_util_meses),
      valor_residual: String(a.valor_residual),
      metodo_depreciacion: a.metodo_depreciacion || 'lineal',
      proveedor_id: a.proveedor_id || '',
      ubicacion: a.ubicacion || '',
      numero_serie: a.numero_serie || '',
      estado: a.estado || 'activo',
      notas: a.notas || '',
    })
    setShowDialog(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) {
      showToast('Nombre requerido', 'error')
      return
    }
    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      descripcion: form.descripcion || null,
      fecha_compra: form.fecha_compra,
      costo_compra: Number(form.costo_compra) || 0,
      vida_util_meses: Math.max(1, Number(form.vida_util_meses) || 1),
      valor_residual: Number(form.valor_residual) || 0,
      metodo_depreciacion: form.metodo_depreciacion,
      proveedor_id: form.proveedor_id || null,
      ubicacion: form.ubicacion || null,
      numero_serie: form.numero_serie || null,
      estado: form.estado,
      notas: form.notas || null,
    }
    try {
      const url = editing ? `/api/activos/${editing.id}` : '/api/activos'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error al guardar')
      showToast(editing ? 'Activo actualizado' : 'Activo creado', 'success')
      setShowDialog(false)
      await load()
    } catch {
      showToast('Error al guardar activo', 'error')
    }
  }

  const eliminar = async (a: Activo) => {
    if (!confirm(`¿Eliminar ${a.nombre}? Los gastos asociados se conservarán.`)) return
    try {
      await fetch(`/api/activos/${a.id}`, { method: 'DELETE' })
      showToast('Activo eliminado', 'success')
      await load()
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-foreground">{formatCurrency(totales.costo)}</p>
            <p className="text-xs text-muted-foreground">Costo inicial</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-amber-500">{formatCurrency(totales.valor)}</p>
            <p className="text-xs text-muted-foreground">Valor actual neto</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-red-500">{formatCurrency(totales.depAcum)}</p>
            <p className="text-xs text-muted-foreground">Depreciación acumulada</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-xl font-bold text-foreground">{formatCurrency(totales.depMes)}</p>
            <p className="text-xs text-muted-foreground">Depreciación / mes</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={load} disabled={loading} className="border-border">
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
        <Button onClick={abrirNuevo}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo activo
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Cargando activos...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              <Box className="mx-auto mb-2 h-6 w-6" /> No hay máquinas/activos registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Dep./mes</TableHead>
                  <TableHead className="text-right">Acumulada</TableHead>
                  <TableHead className="text-right">Valor actual</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.nombre}</div>
                      {a.proveedor_nombre && (
                        <div className="text-xs text-muted-foreground">
                          Proveedor: {a.proveedor_nombre}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {a.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {String(a.fecha_compra).slice(0, 10)}
                      <div className="text-xs">
                        {a.meses_transcurridos} / {a.vida_util_meses} meses
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(a.costo_compra))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(a.depreciacion_mensual)}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {formatCurrency(a.depreciacion_acumulada)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-amber-500">
                      {formatCurrency(a.valor_actual)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          a.estado === 'activo'
                            ? 'bg-green-600 text-white'
                            : a.estado === 'reparacion'
                              ? 'bg-amber-500 text-zinc-900'
                              : 'bg-muted text-muted-foreground'
                        }
                      >
                        {a.estado}
                      </Badge>
                      {a.completamente_depreciado && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Totalmente depreciado
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => abrirEditar(a)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => eliminar(a)}>
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
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar activo' : 'Nuevo activo / máquina'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              placeholder="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm({ ...form, categoria: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={form.fecha_compra}
                onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Costo</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo_compra}
                  onChange={(e) => setForm({ ...form, costo_compra: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Vida útil (meses)</label>
                <Input
                  type="number"
                  min="1"
                  value={form.vida_util_meses}
                  onChange={(e) => setForm({ ...form, vida_util_meses: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Valor residual</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor_residual}
                  onChange={(e) => setForm({ ...form, valor_residual: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Proveedor (opcional)</label>
                <Select
                  value={form.proveedor_id}
                  onValueChange={(v) => setForm({ ...form, proveedor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin proveedor" />
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
                <label className="text-xs text-muted-foreground">Estado</label>
                <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="reparacion">En reparación</SelectItem>
                    <SelectItem value="baja">Dado de baja</SelectItem>
                    <SelectItem value="vendido">Vendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Ubicación"
                value={form.ubicacion}
                onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              />
              <Input
                placeholder="N° de serie"
                value={form.numero_serie}
                onChange={(e) => setForm({ ...form, numero_serie: e.target.value })}
              />
            </div>
            <Input
              placeholder="Descripción"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
            <Textarea
              placeholder="Notas"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Depreciación lineal: <code>(costo − residual) / vida_útil</code>. La vista calcula
              el valor actual con la fecha de hoy.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
