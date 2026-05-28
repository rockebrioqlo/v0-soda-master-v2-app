'use client'

import { useCallback, useState } from 'react'
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
import { getRolLabel } from '@/lib/helpers'
import { Plus, Edit, Trash2, UserCheck, UserX, Shield, KeyRound, Ban } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Usuario, Rol, PermisosDescuento } from '@/lib/types'
import { hash } from 'bcryptjs'

export function UsuariosPage() {
  const {
    state,
    crearUsuarioApi,
    actualizarUsuarioApi,
    eliminarUsuarioApi,
    guardarPermisosDescuento,
    getPermisosEspecialesApi,
    otorgarPermisoEspecialApi,
    revocarPermisoEspecialApi,
  } = useApp()
  const { usuarios, permisosDescuento, usuarioActual } = state
  const esAdmin = usuarioActual?.rol === 'admin' || usuarioActual?.rol === 'administrador'

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

  const handleDelete = async (usuarioId: string) => {
    if (usuarioId === state.usuarioActual?.id) {
      showToast('No puedes eliminar tu propio usuario', 'error')
      return
    }
    try {
      await eliminarUsuarioApi(usuarioId)
      showToast('Usuario eliminado', 'success')
    } catch (error: any) {
      showToast(error?.message || 'Error al eliminar usuario', 'error')
    }
  }

  const handleToggleActivo = async (usuario: Usuario) => {
    if (usuario.id === state.usuarioActual?.id) {
      showToast('No puedes desactivar tu propio usuario', 'error')
      return
    }
    try {
      await actualizarUsuarioApi(usuario.id, { activo: !usuario.activo })
      showToast(usuario.activo ? 'Usuario desactivado' : 'Usuario activado', 'success')
    } catch (error: any) {
      showToast(error?.message || 'Error al actualizar usuario', 'error')
    }
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

    try {
      if (editingUsuario) {
        const updates: any = {
          nombre: formData.nombre,
          email: formData.email,
          rol: formData.rol,
          activo: formData.activo,
        }
        if (formData.pin) {
          updates.pinHash = await hash(formData.pin, 10)
        }
        await actualizarUsuarioApi(editingUsuario.id, updates)
        showToast('Usuario actualizado', 'success')
      } else {
        const pinHash = await hash(formData.pin, 10)
        await crearUsuarioApi({
          nombre: formData.nombre,
          email: formData.email,
          rol: formData.rol,
          activo: formData.activo,
          pinHash,
        })
        showToast('Usuario creado', 'success')
      }

      setShowDialog(false)
    } catch (error: any) {
      showToast(error?.message || 'Error al guardar usuario', 'error')
    }
  }

  const handleSavePermisos = async () => {
    const permisos = Object.entries(permisosEdit).map(([rol, permiso]) => ({
      rol,
      puede_aplicar: permiso.puede,
      limite_maximo: permiso.limiteMax,
      requiere_motivo: permiso.requiereMotivo,
    }))
    const ok = await guardarPermisosDescuento(permisos)
    if (ok) {
      showToast('Permisos actualizados', 'success')
      setShowPermisosDialog(false)
    }
  }

  // Permisos especiales (delegaciones temporales del admin a otros
  // usuarios, p. ej. permitir a un cajero abrir mesa cuando no hay
  // mesero). Se gestiona por usuario, con un dialog dedicado.
  const [showPermEspDialog, setShowPermEspDialog] = useState(false)
  const [usuarioPermEsp, setUsuarioPermEsp] = useState<Usuario | null>(null)
  const [permEspList, setPermEspList] = useState<any[]>([])
  const [permEspLoading, setPermEspLoading] = useState(false)
  const [permEspHoras, setPermEspHoras] = useState(4)
  const [permEspMotivo, setPermEspMotivo] = useState('')
  const [permEspGuardando, setPermEspGuardando] = useState(false)

  const cargarPermEsp = useCallback(
    async (usuarioId: string) => {
      setPermEspLoading(true)
      try {
        const data = await getPermisosEspecialesApi({ usuario_id: usuarioId })
        setPermEspList(data)
      } catch (error: any) {
        showToast(error?.message || 'Error al cargar permisos', 'error')
      } finally {
        setPermEspLoading(false)
      }
    },
    [getPermisosEspecialesApi],
  )

  const abrirPermEsp = async (usuario: Usuario) => {
    setUsuarioPermEsp(usuario)
    setShowPermEspDialog(true)
    setPermEspHoras(4)
    setPermEspMotivo('')
    await cargarPermEsp(usuario.id)
  }

  const handleOtorgarPermEsp = async () => {
    if (!usuarioPermEsp || !usuarioActual) return
    if (!esAdmin) {
      showToast('Sólo el administrador puede otorgar permisos especiales', 'error')
      return
    }
    if (!permEspHoras || permEspHoras <= 0) {
      showToast('Indica una cantidad de horas válida', 'error')
      return
    }
    setPermEspGuardando(true)
    try {
      const validoHasta = new Date(Date.now() + permEspHoras * 60 * 60 * 1000)
      await otorgarPermisoEspecialApi({
        usuario_id: usuarioPermEsp.id,
        tipo: 'apertura_mesa',
        valido_hasta: validoHasta.toISOString(),
        motivo: permEspMotivo || null,
        otorgado_por: usuarioActual.id,
        otorgado_por_nombre: usuarioActual.nombre,
      })
      showToast(
        `Permiso otorgado a ${usuarioPermEsp.nombre} por ${permEspHoras}h`,
        'success',
      )
      setPermEspMotivo('')
      await cargarPermEsp(usuarioPermEsp.id)
    } catch (error: any) {
      showToast(error?.message || 'Error al otorgar permiso', 'error')
    } finally {
      setPermEspGuardando(false)
    }
  }

  const handleRevocarPermEsp = async (id: string) => {
    if (!usuarioActual) return
    if (!esAdmin) {
      showToast('Sólo el administrador puede revocar permisos', 'error')
      return
    }
    try {
      await revocarPermisoEspecialApi({
        id,
        revocado_por: usuarioActual.id,
        revocado_por_nombre: usuarioActual.nombre,
      })
      showToast('Permiso revocado', 'success')
      if (usuarioPermEsp) await cargarPermEsp(usuarioPermEsp.id)
    } catch (error: any) {
      showToast(error?.message || 'Error al revocar permiso', 'error')
    }
  }

  const getRolBadgeColor = (rol: Rol) => {
    const colors: Record<Rol, string> = {
      administrador: 'bg-purple-500',
      admin: 'bg-purple-500',
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
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Rol</TableHead>
                    <TableHead className="text-center text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-right text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((usuario) => (
                    <TableRow key={usuario.id} className="border-border">
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
                          {/* Permisos especiales (vigencias temporales,
                              p. ej. cajero con apertura de mesa). Sólo
                              tiene sentido para roles distintos a
                              admin/administrador. */}
                          {esAdmin &&
                            usuario.rol !== 'admin' &&
                            usuario.rol !== 'administrador' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Permisos especiales"
                                onClick={() => abrirPermEsp(usuario)}
                              >
                                <KeyRound className="h-4 w-4 text-amber-500" />
                              </Button>
                            )}
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
        <Card className="mt-6 border-border bg-card">
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
                  <div key={rol} className="rounded-lg border border-border p-4">
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
          <DialogContent className="border-border bg-card">
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
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="border-border bg-muted"
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
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Rol</label>
                <Select
                  value={formData.rol}
                  onValueChange={(v) => setFormData({ ...formData, rol: v as Rol })}
                >
                  <SelectTrigger className="border-border bg-muted">
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
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
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
          <DialogContent className="max-h-[90vh] overflow-auto border-border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Permisos de Descuento por Rol
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {(Object.keys(permisosEdit) as Rol[]).map((rol) => {
                const permisos = permisosEdit[rol]
                return (
                  <div key={rol} className="rounded-lg border border-border p-4">
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

        {/* Permisos especiales (delegación temporal). El admin puede dar
            a cajeros (u otros roles) capacidades que normalmente no
            tienen, con vigencia limitada en horas. */}
        <Dialog open={showPermEspDialog} onOpenChange={setShowPermEspDialog}>
          <DialogContent className="max-h-[90vh] overflow-auto border-border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <KeyRound className="h-5 w-5 text-amber-500" />
                Permisos especiales
                {usuarioPermEsp && (
                  <span className="text-sm font-normal text-muted-foreground">
                    — {usuarioPermEsp.nombre}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Otorgar un nuevo permiso */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Otorgar apertura de mesa
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Permite a este usuario abrir mesas (responsabilidad
                  típica del mesero). Pasada la vigencia, el permiso se
                  desactiva solo.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Vigencia (horas)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={permEspHoras}
                      onChange={(e) =>
                        setPermEspHoras(parseInt(e.target.value, 10) || 0)
                      }
                      className="border-border bg-muted"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Motivo (opcional)
                    </label>
                    <Input
                      value={permEspMotivo}
                      onChange={(e) => setPermEspMotivo(e.target.value)}
                      placeholder="Ej: cubre turno"
                      className="border-border bg-muted"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    disabled={permEspGuardando || !esAdmin}
                    onClick={handleOtorgarPermEsp}
                    className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
                  >
                    {permEspGuardando ? 'Otorgando…' : 'Otorgar'}
                  </Button>
                </div>
              </div>

              {/* Historial / vigentes */}
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Permisos del usuario
                </p>
                {permEspLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : permEspList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Este usuario no tiene permisos registrados.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {permEspList.map((p) => {
                      const validoHasta = new Date(p.valido_hasta).getTime()
                      const vigente = !p.revocado && validoHasta > Date.now()
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            'rounded-lg border p-3 text-sm',
                            vigente
                              ? 'border-emerald-700/40 bg-emerald-700/5'
                              : 'border-border bg-muted/40 opacity-80',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground">
                                {p.tipo === 'apertura_mesa'
                                  ? 'Apertura de mesa'
                                  : p.tipo}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Vence{' '}
                                {new Date(p.valido_hasta).toLocaleString()}
                              </p>
                              {p.motivo && (
                                <p className="text-xs italic text-muted-foreground">
                                  "{p.motivo}"
                                </p>
                              )}
                              {p.otorgado_por_nombre && (
                                <p className="text-xs text-muted-foreground">
                                  Otorgado por {p.otorgado_por_nombre}
                                </p>
                              )}
                              {p.revocado && (
                                <p className="text-xs text-rose-500">
                                  Revocado
                                  {p.revocado_por_nombre
                                    ? ` por ${p.revocado_por_nombre}`
                                    : ''}
                                </p>
                              )}
                              {!p.revocado && validoHasta <= Date.now() && (
                                <p className="text-xs text-zinc-500">
                                  Expirado
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              {vigente ? (
                                <Badge className="bg-emerald-600 text-white">
                                  Vigente
                                </Badge>
                              ) : (
                                <Badge variant="outline">Inactivo</Badge>
                              )}
                              {vigente && esAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 text-rose-500 hover:text-rose-400"
                                  onClick={() => handleRevocarPermEsp(p.id)}
                                >
                                  <Ban className="mr-1 h-3 w-3" />
                                  Revocar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPermEspDialog(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
