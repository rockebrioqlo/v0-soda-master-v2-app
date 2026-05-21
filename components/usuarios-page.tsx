'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import { generateId, getRolLabel } from '@/lib/helpers'
import { Plus, Edit, Trash2, UserCheck, UserX, Shield } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Usuario, Rol, PermisosDescuento } from '@/lib/types'
import { hash } from 'bcryptjs'

export function UsuariosPage() {
  const { state, dispatch } = useApp()
  const { usuarios, permisosDescuento } = state

  const [showDialog, setShowDialog] = useState(false)
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    rol: 'mesero' as Rol,
    pin: '',
    activo: true
  })

  const [showPermisosDialog, setShowPermisosDialog] = useState(false)
  const [permisosEdit, setPermisosEdit] = useState(permisosDescuento)

  const handleOpenNew = () => {
    setEditingUsuario(null)
    setFormData({
      nombre: '',
      email: '',
      rol: 'mesero',
      pin: '',
      activo: true
    })
    setShowDialog(true)
  }

  const handleEdit = (usuario: Usuario) => {
    setEditingUsuario(usuario)
    setFormData({
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      pin: '',
      activo: usuario.activo
    })
    setShowDialog(true)
  }

  const handleDelete = (usuarioId: string) => {
    if (usuarioId === state.usuarioActual?.id) {
      showToast('No puedes eliminar tu propio usuario', 'error')
      return
    }
    dispatch({ type: 'DELETE_USUARIO', payload: usuarioId })
    showToast('Usuario eliminado', 'success')
  }

  const handleToggleActivo = (usuario: Usuario) => {
    if (usuario.id === state.usuarioActual?.id) {
      showToast('No puedes desactivar tu propio usuario', 'error')
      return
    }
    dispatch({
      type: 'UPDATE_USUARIO',
      payload: { ...usuario, activo: !usuario.activo }
    })
    showToast(
      usuario.activo ? 'Usuario desactivado' : 'Usuario activado',
      'success'
    )
  }

  const handleSave = async () => {
    if (!formData.nombre.trim() || !formData.email.trim()) {
      showToast('Nombre y email son requeridos', 'error')
      return
    }

    if (!editingUsuario && !formData.pin) {
      showToast('El PIN es requerido para nuevos usuarios', 'error')
      return
    }

    if (formData.pin && formData.pin.length < 4) {
      showToast('El PIN debe tener al menos 4 dígitos', 'error')
      return
    }

    let pinHash = editingUsuario?.pinHash || ''
    if (formData.pin) {
      pinHash = await hash(formData.pin, 10)
    }

    const usuarioData: Usuario = {
      id: editingUsuario?.id || generateId(),
      nombre: formData.nombre,
      email: formData.email,
      rol: formData.rol,
      pinHash,
      activo: formData.activo,
      intentosFallidos: editingUsuario?.intentosFallidos || 0,
      bloqueadoHasta: editingUsuario?.bloqueadoHasta || null
    }

    if (editingUsuario) {
      dispatch({ type: 'UPDATE_USUARIO', payload: usuarioData })
      showToast('Usuario actualizado', 'success')
    } else {
      dispatch({ type: 'ADD_USUARIO', payload: usuarioData })
      showToast('Usuario creado', 'success')
    }

    setShowDialog(false)
  }

  const handleSavePermisos = () => {
    dispatch({ type: 'SET_PERMISOS_DESCUENTO', payload: permisosEdit })
    showToast('Permisos actualizados', 'success')
    setShowPermisosDialog(false)
  }

  const getRolBadgeColor = (rol: Rol) => {
    const colors: Record<Rol, string> = {
      administrador: 'bg-purple-500',
      mesero: 'bg-blue-500',
      cocina: 'bg-orange-500',
      bar: 'bg-pink-500',
      cajero: 'bg-green-500'
    }
    return colors[rol]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Gestion de Usuarios</h1>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setPermisosEdit(permisosDescuento)
                setShowPermisosDialog(true)
              }}
            >
              <Shield className="mr-2 h-4 w-4" />
              Permisos
            </Button>
            <Button onClick={handleOpenNew} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Usuario
            </Button>
          </div>
        </div>

        {/* Users Table */}
        <Card className="border-zinc-700 bg-zinc-800/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Rol</TableHead>
                    <TableHead className="text-center text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-right text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((usuario) => (
                    <TableRow key={usuario.id} className="border-zinc-700">
                      <TableCell className="font-medium text-foreground">
                        {usuario.nombre}
                        {usuario.bloqueadoHasta && usuario.bloqueadoHasta > Date.now() && (
                          <Badge className="ml-2 bg-red-500">Bloqueado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-white', getRolBadgeColor(usuario.rol))}>
                          {getRolLabel(usuario.rol)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActivo(usuario)}
                          disabled={usuario.id === state.usuarioActual?.id}
                        >
                          {usuario.activo ? (
                            <UserCheck className="h-5 w-5 text-green-500" />
                          ) : (
                            <UserX className="h-5 w-5 text-red-500" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(usuario)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-400"
                            onClick={() => handleDelete(usuario.id)}
                            disabled={usuario.id === state.usuarioActual?.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Permisos Summary */}
        <Card className="mt-6 border-zinc-700 bg-zinc-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-amber-500" />
              Permisos de Descuento por Rol
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(permisosDescuento) as Rol[]).map((rol) => {
                const permisos = permisosDescuento[rol]
                return (
                  <div key={rol} className="rounded-lg border border-zinc-700 p-4">
                    <div className="flex items-center justify-between">
                      <Badge className={cn('text-white', getRolBadgeColor(rol))}>
                        {getRolLabel(rol)}
                      </Badge>
                      {permisos.puede ? (
                        <Badge variant="outline" className="border-green-500 text-green-500">
                          Puede aplicar
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500 text-red-500">
                          No puede
                        </Badge>
                      )}
                    </div>
                    {permisos.puede && (
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p>Límite máximo: {permisos.limiteMax}%</p>
                        <p>Requiere motivo: {permisos.requiereMotivo ? 'Sí' : 'No'}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Dialog for New/Edit User */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="border-zinc-700 bg-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingUsuario ? 'Editar Usuario' : 'Nuevo Usuario'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Nombre</label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="border-zinc-600 bg-zinc-700/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="border-zinc-600 bg-zinc-700/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  PIN {editingUsuario && '(dejar vacío para mantener el actual)'}
                </label>
                <Input
                  type="password"
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="••••"
                  maxLength={6}
                  className="border-zinc-600 bg-zinc-700/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Rol</label>
                <Select
                  value={formData.rol}
                  onValueChange={(v) => setFormData({ ...formData, rol: v as Rol })}
                >
                  <SelectTrigger className="border-zinc-600 bg-zinc-700/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="mesero">Mesero</SelectItem>
                    <SelectItem value="cocina">Cocina</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="cajero">Cajero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-700/50 p-4">
                <span className="text-sm text-foreground">Usuario Activo</span>
                <Switch
                  checked={formData.activo}
                  onCheckedChange={(v) => setFormData({ ...formData, activo: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                {editingUsuario ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for Discount Permissions */}
        <Dialog open={showPermisosDialog} onOpenChange={setShowPermisosDialog}>
          <DialogContent className="max-h-[90vh] overflow-auto border-zinc-700 bg-zinc-800 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Permisos de Descuento por Rol
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {(Object.keys(permisosEdit) as Rol[]).map((rol) => {
                const permisos = permisosEdit[rol]
                return (
                  <div key={rol} className="rounded-lg border border-zinc-700 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <Badge className={cn('text-white', getRolBadgeColor(rol))}>
                        {getRolLabel(rol)}
                      </Badge>
                      <Switch
                        checked={permisos.puede}
                        onCheckedChange={(v) => setPermisosEdit({
                          ...permisosEdit,
                          [rol]: { ...permisos, puede: v }
                        })}
                      />
                    </div>
                    {permisos.puede && (
                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">
                            Límite máximo: {permisos.limiteMax}%
                          </label>
                          <Slider
                            value={[permisos.limiteMax]}
                            onValueChange={([v]) => setPermisosEdit({
                              ...permisosEdit,
                              [rol]: { ...permisos, limiteMax: v }
                            })}
                            max={100}
                            step={5}
                            className="w-full"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Requiere motivo</span>
                          <Switch
                            checked={permisos.requiereMotivo}
                            onCheckedChange={(v) => setPermisosEdit({
                              ...permisosEdit,
                              [rol]: { ...permisos, requiereMotivo: v }
                            })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPermisosDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePermisos} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                Guardar Permisos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
