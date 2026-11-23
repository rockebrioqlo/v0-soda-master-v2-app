'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Plus, Edit, RefreshCw } from 'lucide-react'
import { showToast } from '@/components/toast'
import { validarRut } from '@/lib/rut'

type Proveedor = {
  id: string
  nombre: string
  rut: string | null
  contacto: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
  activo: boolean
}

const EMPTY = {
  nombre: '',
  rut: '',
  contacto: '',
  telefono: '',
  email: '',
  direccion: '',
  notas: '',
  activo: true,
  // Sesión 18: casilla "otro documento" (pasaporte o extranjero: no se valida el Módulo 11). Solo se usa al guardar.
  documento_otro: false,
}

export function ProveedoresTab() {
  const [items, setItems] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [form, setForm] = useState({ ...EMPTY })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/proveedores?incluir_inactivos=true')
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      }
    } catch {
      showToast('Error al cargar proveedores', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNuevo = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setShowDialog(true)
  }

  const openEditar = async (fila: Proveedor) => {
    // Sesión 17 (K1): el detalle se pide por id (queda una entrada `ver_datos_personales` en la auditoría).
    let p = fila
    try {
      const res = await fetch(`/api/proveedores/${fila.id}`)
      if (!res.ok) {
        showToast('No se pudo abrir el proveedor', 'error')
        return
      }
      p = (await res.json()) as Proveedor
    } catch {
      showToast('No se pudo abrir el proveedor', 'error')
      return
    }
    setEditing(p)
    setForm({
      nombre: p.nombre || '',
      rut: p.rut || '',
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      email: p.email || '',
      direccion: p.direccion || '',
      notas: p.notas || '',
      activo: p.activo !== false,
      // un dato antiguo que no es un RUT válido queda marcado como "otro documento" para no bloquear la edición
      documento_otro: !!p.rut && !validarRut(p.rut),
    })
    setShowDialog(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) {
      showToast('Nombre requerido', 'error')
      return
    }
    const rut = form.rut.trim()
    if (rut && !form.documento_otro && !validarRut(rut) && rut !== (editing?.rut ?? '').trim()) {
      showToast('RUT inválido: revisa el dígito verificador (si es otro documento, marca "Otro documento")', 'error')
      return
    }
    try {
      const url = editing ? `/api/proveedores/${editing.id}` : '/api/proveedores'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        showToast(data?.codigo === 'RUT_INVALIDO' && data?.error ? data.error : 'Error al guardar proveedor', 'error')
        return
      }
      showToast(editing ? 'Proveedor actualizado' : 'Proveedor creado', 'success')
      setShowDialog(false)
      await load()
    } catch {
      showToast('Error al guardar proveedor', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Button variant="outline" onClick={load} disabled={loading} className="border-border">
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
        <Button onClick={openNuevo}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Cargando proveedores...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              No hay proveedores. Crea el primero con &quot;Nuevo proveedor&quot;.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{p.rut || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.contacto || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.telefono || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email || '—'}</TableCell>
                    <TableCell>
                      {p.activo ? (
                        <span className="text-green-500">Activo</span>
                      ) : (
                        <span className="text-muted-foreground">Inactivo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button aria-label={`Editar a ${p.nombre}`} variant="ghost" size="icon" onClick={() => openEditar(p)}>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input aria-label="Nombre"
              placeholder="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="RUT / NIT"
                placeholder="RUT / NIT"
                value={form.rut}
                onChange={(e) => setForm({ ...form, rut: e.target.value })}
              />
              <Input aria-label="Teléfono"
                placeholder="Teléfono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={form.documento_otro} onCheckedChange={(v) => setForm({ ...form, documento_otro: v === true })} />
              Otro documento (extranjero, pasaporte): no se valida como RUT
            </label>
            <Input aria-label="Persona de contacto"
              placeholder="Persona de contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
            />
            <Input aria-label="Email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input aria-label="Dirección"
              placeholder="Dirección"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
            <Textarea aria-label="Notas"
              placeholder="Notas"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
            {editing && (
              <div className="flex items-center justify-between rounded border border-border bg-muted/30 p-3">
                <Label htmlFor="prov-activo">Activo</Label>
                <Switch
                  id="prov-activo"
                  checked={form.activo}
                  onCheckedChange={(c) => setForm({ ...form, activo: !!c })}
                />
              </div>
            )}
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
