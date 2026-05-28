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
import { Label } from '@/components/ui/label'
import { Plus, Edit, RefreshCw } from 'lucide-react'
import { showToast } from '@/components/toast'

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

  const openEditar = (p: Proveedor) => {
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
    })
    setShowDialog(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) {
      showToast('Nombre requerido', 'error')
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
      if (!res.ok) throw new Error('Error al guardar')
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
                      <Button variant="ghost" size="icon" onClick={() => openEditar(p)}>
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
            <Input
              placeholder="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="RUT / NIT"
                value={form.rut}
                onChange={(e) => setForm({ ...form, rut: e.target.value })}
              />
              <Input
                placeholder="Teléfono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <Input
              placeholder="Persona de contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
            />
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Dirección"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
            <Textarea
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
