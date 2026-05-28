'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
import { Plus, Edit, RefreshCw, UserPlus } from 'lucide-react'
import { showToast } from '@/components/toast'
import { formatCurrency } from '@/lib/helpers'

type Empleado = {
  id: string
  nombre: string
  cargo: string | null
  documento: string | null
  telefono: string | null
  email: string | null
  sueldo_base: number | string
  periodicidad: 'mensual' | 'quincenal' | 'semanal' | 'diario' | 'por_hora'
  fecha_ingreso: string | null
  fecha_egreso: string | null
  activo: boolean
  notas: string | null
}

const EMPTY = {
  nombre: '',
  cargo: '',
  documento: '',
  telefono: '',
  email: '',
  sueldo_base: '0',
  periodicidad: 'mensual' as Empleado['periodicidad'],
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_egreso: '',
  activo: true,
  notas: '',
}

const SUELDO_MENSUAL_FACTOR: Record<Empleado['periodicidad'], number> = {
  mensual: 1,
  quincenal: 2,
  semanal: 4,
  diario: 30,
  por_hora: 160,
}

export function EmpleadosTab() {
  const [items, setItems] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Empleado | null>(null)
  const [form, setForm] = useState({ ...EMPTY })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/empleados?incluir_inactivos=true')
      if (res.ok) setItems(await res.json())
    } catch {
      showToast('Error al cargar empleados', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const proyeccion = useMemo(() => {
    return items
      .filter((e) => e.activo)
      .reduce(
        (acc, e) => acc + Number(e.sueldo_base) * SUELDO_MENSUAL_FACTOR[e.periodicidad],
        0,
      )
  }, [items])

  const abrirNuevo = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setShowDialog(true)
  }

  const abrirEditar = (e: Empleado) => {
    setEditing(e)
    setForm({
      nombre: e.nombre || '',
      cargo: e.cargo || '',
      documento: e.documento || '',
      telefono: e.telefono || '',
      email: e.email || '',
      sueldo_base: String(e.sueldo_base),
      periodicidad: e.periodicidad,
      fecha_ingreso: e.fecha_ingreso ? String(e.fecha_ingreso).slice(0, 10) : '',
      fecha_egreso: e.fecha_egreso ? String(e.fecha_egreso).slice(0, 10) : '',
      activo: e.activo !== false,
      notas: e.notas || '',
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
      cargo: form.cargo || null,
      documento: form.documento || null,
      telefono: form.telefono || null,
      email: form.email || null,
      sueldo_base: Number(form.sueldo_base) || 0,
      periodicidad: form.periodicidad,
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_egreso: form.fecha_egreso || null,
      activo: form.activo,
      notas: form.notas || null,
    }
    try {
      const url = editing ? `/api/empleados/${editing.id}` : '/api/empleados'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error al guardar')
      showToast(editing ? 'Empleado actualizado' : 'Empleado creado', 'success')
      setShowDialog(false)
      await load()
    } catch {
      showToast('Error al guardar empleado', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {items.filter((e) => e.activo).length}
            </p>
            <p className="text-xs text-muted-foreground">Empleados activos</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{formatCurrency(proyeccion)}</p>
            <p className="text-xs text-muted-foreground">Sueldos / mes proyectados</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground">Total registros</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={load} disabled={loading} className="border-border">
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
        <Button onClick={abrirNuevo}>
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo empleado
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Cargando empleados...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              No hay empleados registrados. Crea el primero con &quot;Nuevo empleado&quot;.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="text-right">Sueldo base</TableHead>
                  <TableHead>Periodicidad</TableHead>
                  <TableHead>Ingreso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell>{e.cargo || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[e.telefono, e.email].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(e.sueldo_base))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {e.periodicidad}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.fecha_ingreso ? String(e.fecha_ingreso).slice(0, 10) : '—'}
                    </TableCell>
                    <TableCell>
                      {e.activo ? (
                        <span className="text-green-500">Activo</span>
                      ) : (
                        <span className="text-muted-foreground">Inactivo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => abrirEditar(e)}>
                        <Edit className="h-4 w-4" />
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
            <DialogTitle>{editing ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              placeholder="Nombre *"
              value={form.nombre}
              onChange={(ev) => setForm({ ...form, nombre: ev.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Cargo"
                value={form.cargo}
                onChange={(ev) => setForm({ ...form, cargo: ev.target.value })}
              />
              <Input
                placeholder="Documento"
                value={form.documento}
                onChange={(ev) => setForm({ ...form, documento: ev.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Teléfono"
                value={form.telefono}
                onChange={(ev) => setForm({ ...form, telefono: ev.target.value })}
              />
              <Input
                placeholder="Email"
                value={form.email}
                onChange={(ev) => setForm({ ...form, email: ev.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Sueldo base</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sueldo_base}
                  onChange={(ev) => setForm({ ...form, sueldo_base: ev.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Periodicidad</label>
                <Select
                  value={form.periodicidad}
                  onValueChange={(v) =>
                    setForm({ ...form, periodicidad: v as Empleado['periodicidad'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="diario">Diario</SelectItem>
                    <SelectItem value="por_hora">Por hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Fecha ingreso</label>
                <Input
                  type="date"
                  value={form.fecha_ingreso}
                  onChange={(ev) => setForm({ ...form, fecha_ingreso: ev.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha egreso</label>
                <Input
                  type="date"
                  value={form.fecha_egreso}
                  onChange={(ev) => setForm({ ...form, fecha_egreso: ev.target.value })}
                />
              </div>
            </div>
            <Textarea
              placeholder="Notas"
              value={form.notas}
              onChange={(ev) => setForm({ ...form, notas: ev.target.value })}
            />
            {editing && (
              <div className="flex items-center justify-between rounded border border-border bg-muted/30 p-3">
                <Label htmlFor="emp-activo">Activo</Label>
                <Switch
                  id="emp-activo"
                  checked={form.activo}
                  onCheckedChange={(c) => setForm({ ...form, activo: !!c })}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La proyección mensual usa factores estándar: quincenal × 2, semanal × 4, diario × 30,
              por hora × 160.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>
              <Plus className="mr-2 h-4 w-4" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
