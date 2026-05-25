'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import { getEstadoMesaColor, getEstadoMesaLabel } from '@/lib/helpers'
import { Plus, Users, Edit, Trash2, ShoppingCart } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Mesa, EstadoMesa } from '@/lib/types'

export function MesasPage() {
  const {
    state,
    navigateToPOS,
    updateMesa,
    crearMesaApi,
    eliminarMesaApi,
  } = useApp()
  const { mesas, comandas } = state

  const [showDialog, setShowDialog] = useState(false)
  const [editingMesa, setEditingMesa] = useState<Mesa | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    capacidad: '4',
    estado: 'libre' as EstadoMesa
  })

  const getComandaActiva = (mesaId: string) => {
    return comandas.find(
      c =>
        c.mesaId === mesaId &&
        !['pagado', 'cancelado'].includes(c.estado) &&
        c.items.length > 0
    )
  }

  const handleOpenNew = () => {
    setEditingMesa(null)
    setFormData({ nombre: '', capacidad: '4', estado: 'libre' })
    setShowDialog(true)
  }

  const handleEdit = (mesa: Mesa) => {
    setEditingMesa(mesa)
    setFormData({
      nombre: mesa.nombre,
      capacidad: mesa.capacidad.toString(),
      estado: mesa.estado
    })
    setShowDialog(true)
  }

  const handleDelete = async (mesaId: string) => {
    const comanda = getComandaActiva(mesaId)
    if (comanda) {
      showToast('No se puede eliminar una mesa con comanda activa', 'error')
      return
    }
    try {
      await eliminarMesaApi(mesaId)
      showToast('Mesa eliminada', 'success')
    } catch (error: any) {
      showToast(error?.message || 'Error al eliminar mesa', 'error')
    }
  }

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      showToast('El nombre es requerido', 'error')
      return
    }

    try {
      if (editingMesa) {
        await updateMesa(editingMesa.id, {
          capacidad: parseInt(formData.capacidad),
          estado: formData.estado,
        })
        showToast('Mesa actualizada', 'success')
      } else {
        await crearMesaApi({
          nombre: formData.nombre,
          capacidad: parseInt(formData.capacidad),
          estado: formData.estado,
        })
        showToast('Mesa creada', 'success')
      }

      setShowDialog(false)
    } catch (error: any) {
      showToast(error?.message || 'Error al guardar mesa', 'error')
    }
  }

  const handleMesaClick = (mesa: Mesa) => {
    if (mesa.estado === 'ocupada') {
      const comanda = getComandaActiva(mesa.id)
      if (comanda) {
        navigateToPOS(mesa.id, comanda.id)
      } else {
        navigateToPOS(mesa.id)
      }
    } else if (mesa.estado === 'libre') {
      // Start new order for this table
      navigateToPOS(mesa.id)
    }
  }

  const handleChangeEstado = async (mesa: Mesa, nuevoEstado: EstadoMesa) => {
    const comanda = getComandaActiva(mesa.id)
    
    if (mesa.estado === 'ocupada' && nuevoEstado === 'libre' && comanda) {
      showToast('No se puede liberar una mesa con comanda activa', 'error')
      return
    }

    await updateMesa(mesa.id, { estado: nuevoEstado })
    showToast(`Mesa ${mesa.nombre} ahora está ${getEstadoMesaLabel(nuevoEstado).toLowerCase()}`, 'success')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Gestion de Mesas</h1>
        <Button onClick={handleOpenNew} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Mesa
        </Button>
      </div>

        {/* Legend */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Libre</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-muted-foreground">Ocupada</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-500" />
            <span className="text-sm text-muted-foreground">Reservada</span>
          </div>
        </div>

        {/* Mesas Grid */}
        <div className="grid gap-3 grid-cols-2 md:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mesas.map((mesa) => {
            const comandaActiva = getComandaActiva(mesa.id)
            return (
              <Card
                key={mesa.id}
                className={cn(
                  'cursor-pointer border-2 transition-all hover:scale-[1.02] min-h-[100px]',
                  mesa.estado === 'libre' && 'border-green-500/50 bg-green-500/10',
                  mesa.estado === 'ocupada' && 'border-red-500/50 bg-red-500/10',
                  mesa.estado === 'reservada' && 'border-yellow-500/50 bg-yellow-500/10'
                )}
                onClick={() => handleMesaClick(mesa)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg font-bold text-foreground">{mesa.nombre}</CardTitle>
                    <span className={cn('rounded-full px-2 py-1 text-[10px] font-medium text-white md:text-xs', getEstadoMesaColor(mesa.estado))}>
                      {getEstadoMesaLabel(mesa.estado)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Capacidad: {mesa.capacidad}</span>
                  </div>

                  {comandaActiva && (
                    <div className="mt-2 flex items-center gap-2 text-amber-500">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="text-sm">Comanda activa ({comandaActiva.items.length} items)</span>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2" onClick={e => e.stopPropagation()}>
                    <Select
                      value={mesa.estado}
                      onValueChange={(value) => handleChangeEstado(mesa, value as EstadoMesa)}
                    >
                      <SelectTrigger className="h-8 flex-1 border-border bg-muted text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="libre">Libre</SelectItem>
                        <SelectItem value="ocupada">Ocupada</SelectItem>
                        <SelectItem value="reservada">Reservada</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(mesa)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-400"
                      onClick={() => handleDelete(mesa.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Dialog for New/Edit Mesa */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingMesa ? 'Editar Mesa' : 'Nueva Mesa'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Nombre</label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Mesa 6"
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Capacidad</label>
                <Select
                  value={formData.capacidad}
                  onValueChange={(value) => setFormData({ ...formData, capacidad: value })}
                >
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 6, 8, 10, 12].map((cap) => (
                      <SelectItem key={cap} value={cap.toString()}>
                        {cap} personas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Estado Inicial</label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => setFormData({ ...formData, estado: value as EstadoMesa })}
                >
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="libre">Libre</SelectItem>
                    <SelectItem value="ocupada">Ocupada</SelectItem>
                    <SelectItem value="reservada">Reservada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                {editingMesa ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
