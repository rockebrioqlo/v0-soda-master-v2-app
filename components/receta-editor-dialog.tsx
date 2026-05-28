'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2 } from 'lucide-react'
import { showToast } from '@/components/toast'
import type { ModoStock } from '@/lib/types'

type LineaForm = {
  ingrediente_id: string
  cantidad: string
  opcional: boolean
  extra: boolean
  costo_adicional: string
  nombre_display: string
}

interface RecetaEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productoId: string
  productoNombre: string
  onSaved?: () => void
}

export function RecetaEditorDialog({
  open,
  onOpenChange,
  productoId,
  productoNombre,
  onSaved,
}: RecetaEditorDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modoStock, setModoStock] = useState<ModoStock>('producto')
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [ingredientes, setIngredientes] = useState<
    { id: string; nombre: string; unidad_medida: string }[]
  >([])

  useEffect(() => {
    if (!open || !productoId) return
    setLoading(true)
    Promise.all([
      fetch('/api/ingredientes').then((r) => r.json()),
      fetch(`/api/recetas?producto_id=${encodeURIComponent(productoId)}`).then((r) => r.json()),
    ])
      .then(([ings, receta]) => {
        setIngredientes(Array.isArray(ings) ? ings : [])
        const modo = receta?.modo_stock || 'producto'
        setModoStock(
          ['producto', 'receta', 'producto_y_receta'].includes(modo) ? modo : 'producto',
        )
        const ingsReceta = Array.isArray(receta?.ingredientes) ? receta.ingredientes : []
        setLineas(
          ingsReceta.length > 0
            ? ingsReceta.map((ln: any) => ({
                ingrediente_id: ln.ingrediente_id,
                cantidad: String(ln.cantidad ?? 1),
                opcional: !!ln.opcional,
                extra: !!ln.extra,
                costo_adicional: String(ln.costo_adicional ?? 0),
                nombre_display: ln.nombre_display || ln.ingrediente_nombre || '',
              }))
            : [],
        )
      })
      .catch(() => showToast('Error al cargar receta', 'error'))
      .finally(() => setLoading(false))
  }, [open, productoId])

  const addLinea = () => {
    const first = ingredientes[0]?.id || ''
    setLineas((prev) => [
      ...prev,
      {
        ingrediente_id: first,
        cantidad: '1',
        opcional: false,
        extra: false,
        costo_adicional: '0',
        nombre_display: '',
      },
    ])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        producto_id: productoId,
        modo_stock: modoStock,
        ingredientes: lineas
          .filter((l) => l.ingrediente_id)
          .map((l) => ({
            ingrediente_id: l.ingrediente_id,
            cantidad: Number(l.cantidad) || 1,
            opcional: l.opcional,
            extra: l.extra,
            costo_adicional: Number(l.costo_adicional) || 0,
            nombre_display: l.nombre_display.trim() || null,
          })),
      }
      const res = await fetch('/api/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al guardar')
      }
      showToast('Receta guardada', 'success')
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle>Receta: {productoNombre}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modo de descuento de stock</Label>
              <Select value={modoStock} onValueChange={(v) => setModoStock(v as ModoStock)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producto">Sólo stock del producto</SelectItem>
                  <SelectItem value="receta">Sólo insumos de la receta</SelectItem>
                  <SelectItem value="producto_y_receta">Producto + insumos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Insumos de la receta</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLinea}>
                  <Plus className="mr-1 h-4 w-4" /> Agregar línea
                </Button>
              </div>
              {lineas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin líneas. Agrega insumos o usa modo &quot;Sólo stock del producto&quot;.
                </p>
              )}
              {lineas.map((linea, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex gap-2">
                    <Select
                      value={linea.ingrediente_id}
                      onValueChange={(v) =>
                        setLineas((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, ingrediente_id: v } : l)),
                        )
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Insumo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ingredientes.map((ing) => (
                          <SelectItem key={ing.id} value={ing.id}>
                            {ing.nombre} ({ing.unidad_medida})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        value={linea.cantidad}
                        onChange={(e) =>
                          setLineas((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, cantidad: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nombre en POS</Label>
                      <Input
                        value={linea.nombre_display}
                        placeholder="Ej: Tomate"
                        onChange={(e) =>
                          setLineas((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, nombre_display: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={linea.opcional}
                        onCheckedChange={(v) =>
                          setLineas((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, opcional: !!v, extra: v ? false : l.extra } : l)),
                          )
                        }
                      />
                      <span className="text-xs">Opcional</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={linea.extra}
                        onCheckedChange={(v) =>
                          setLineas((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, extra: !!v, opcional: v ? false : l.opcional } : l)),
                          )
                        }
                      />
                      <span className="text-xs">Extra pagado</span>
                    </div>
                  </div>
                  {linea.extra && (
                    <div>
                      <Label className="text-xs">Costo adicional ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={linea.costo_adicional}
                        onChange={(e) =>
                          setLineas((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, costo_adicional: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar receta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
