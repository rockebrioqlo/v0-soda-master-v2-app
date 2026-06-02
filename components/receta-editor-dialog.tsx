'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Plus, Trash2, ChefHat, Star, Sparkles, Copy } from 'lucide-react'
import { showToast } from '@/components/toast'
import type { ModoStock } from '@/lib/types'
import { formatCurrency } from '@/lib/helpers'

type Categoria = 'base' | 'opcional' | 'extra'

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
  /**
   * Si se pasa, muestra el botón "Crear variante" que clona este
   * producto con su receta. Se llama después de clonar.
   */
  onClonado?: () => void
}

function lineaToCategoria(l: LineaForm): Categoria {
  if (l.extra) return 'extra'
  if (l.opcional) return 'opcional'
  return 'base'
}

function nuevoIngredienteEnCategoria(
  cat: Categoria,
  ingredientes: { id: string; nombre: string; unidad_medida: string }[],
): LineaForm {
  return {
    ingrediente_id: ingredientes[0]?.id || '',
    cantidad: '1',
    opcional: cat === 'opcional',
    extra: cat === 'extra',
    costo_adicional: '0',
    nombre_display: '',
  }
}

export function RecetaEditorDialog({
  open,
  onOpenChange,
  productoId,
  productoNombre,
  onSaved,
  onClonado,
}: RecetaEditorDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modoStock, setModoStock] = useState<ModoStock>('producto')
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [ingredientes, setIngredientes] = useState<
    { id: string; nombre: string; unidad_medida: string }[]
  >([])
  const [tab, setTab] = useState<Categoria>('base')

  // Estado del dialog "crear variante"
  const [varianteOpen, setVarianteOpen] = useState(false)
  const [varianteNombre, setVarianteNombre] = useState('')
  const [variantePrecio, setVariantePrecio] = useState('')
  const [clonando, setClonando] = useState(false)

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
          ingsReceta.map((ln: any) => ({
            ingrediente_id: ln.ingrediente_id,
            cantidad: String(ln.cantidad ?? 1),
            opcional: !!ln.opcional,
            extra: !!ln.extra,
            costo_adicional: String(ln.costo_adicional ?? 0),
            nombre_display: ln.nombre_display || ln.ingrediente_nombre || '',
          })),
        )
      })
      .catch(() => showToast('Error al cargar receta', 'error'))
      .finally(() => setLoading(false))
  }, [open, productoId])

  const ingredientesPorId = useMemo(() => {
    const m = new Map<string, { nombre: string; unidad: string }>()
    for (const i of ingredientes) m.set(i.id, { nombre: i.nombre, unidad: i.unidad_medida })
    return m
  }, [ingredientes])

  const conteos = useMemo(
    () => ({
      base: lineas.filter((l) => !l.opcional && !l.extra).length,
      opcional: lineas.filter((l) => l.opcional && !l.extra).length,
      extra: lineas.filter((l) => l.extra).length,
    }),
    [lineas],
  )

  const addLinea = (cat: Categoria) => {
    if (ingredientes.length === 0) {
      showToast('Primero crea ingredientes en el inventario', 'error')
      return
    }
    setLineas((prev) => [...prev, nuevoIngredienteEnCategoria(cat, ingredientes)])
  }

  const moverACategoria = (idx: number, cat: Categoria) => {
    setLineas((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              opcional: cat === 'opcional',
              extra: cat === 'extra',
              costo_adicional: cat === 'extra' ? l.costo_adicional : '0',
            }
          : l,
      ),
    )
    setTab(cat)
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

  const handleClonar = async () => {
    const nombre = varianteNombre.trim()
    if (!nombre) {
      showToast('Escribe el nombre de la variante', 'error')
      return
    }
    setClonando(true)
    try {
      const body: any = { nombre }
      const precioNum = Number((variantePrecio || '').replace(/[^\d.]/g, ''))
      if (Number.isFinite(precioNum) && precioNum > 0) body.precio = precioNum
      const res = await fetch(`/api/productos/${productoId}/clonar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear la variante')
      showToast(`Variante "${nombre}" creada con la misma receta`, 'success')
      setVarianteOpen(false)
      setVarianteNombre('')
      setVariantePrecio('')
      onClonado?.()
      onOpenChange(false)
    } catch (e: any) {
      showToast(e?.message || 'Error al crear variante', 'error')
    } finally {
      setClonando(false)
    }
  }

  const renderLinea = (linea: LineaForm, idx: number) => {
    const ing = ingredientesPorId.get(linea.ingrediente_id)
    const unidad = ing?.unidad || ''
    return (
      <div
        key={idx}
        className="rounded-lg border border-border bg-muted/30 p-3 transition hover:bg-muted/50"
      >
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
              {ingredientes.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nombre} ({i.unidad_medida})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
            title="Quitar de la receta"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">
              Cantidad por unidad{unidad ? ` (${unidad})` : ''}
            </Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  setLineas((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            cantidad: String(
                              Math.max(0, (Number(l.cantidad) || 0) - 1),
                            ),
                          }
                        : l,
                    ),
                  )
                }
              >
                −
              </Button>
              <Input
                type="number"
                inputMode="decimal"
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
                className="text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  setLineas((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            cantidad: String((Number(l.cantidad) || 0) + 1),
                          }
                        : l,
                    ),
                  )
                }
              >
                +
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Nombre visible en POS (opcional)</Label>
            <Input
              value={linea.nombre_display}
              placeholder={ing?.nombre || 'Como se llama en el ticket'}
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
        {linea.extra && (
          <div className="mt-2">
            <Label className="text-xs">Costo adicional para el cliente</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={linea.costo_adicional}
              onChange={(e) =>
                setLineas((prev) =>
                  prev.map((l, i) =>
                    i === idx ? { ...l, costo_adicional: e.target.value } : l,
                  ),
                )
              }
              placeholder="Ej: 800"
            />
            {Number(linea.costo_adicional) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Cliente paga {formatCurrency(Number(linea.costo_adicional))} extra al elegirlo.
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          {(['base', 'opcional', 'extra'] as Categoria[]).map((c) => {
            const actual = lineaToCategoria(linea)
            return (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={actual === c ? 'default' : 'outline'}
                className={
                  actual === c
                    ? c === 'base'
                      ? 'h-7 bg-emerald-600 text-white hover:bg-emerald-500'
                      : c === 'opcional'
                        ? 'h-7 bg-sky-600 text-white hover:bg-sky-500'
                        : 'h-7 bg-amber-500 text-zinc-900 hover:bg-amber-400'
                    : 'h-7'
                }
                onClick={() => moverACategoria(idx, c)}
              >
                {c === 'base' ? 'Base' : c === 'opcional' ? 'Opcional' : 'Extra pagado'}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  const lineasFiltradas = lineas
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => lineaToCategoria(l) === tab)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-amber-500" />
                Ingredientes — {productoNombre}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setVarianteNombre(`${productoNombre} Doble`)
                  setVariantePrecio('')
                  setVarianteOpen(true)
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Crear variante
              </Button>
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Define qué insumos lleva este producto, en qué cantidad, y si son
              <span className="mx-1 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1 text-emerald-600">
                base
              </span>
              <span className="mx-1 inline-flex items-center gap-1 rounded bg-sky-500/15 px-1 text-sky-600">
                opcionales
              </span>
              o
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1 text-amber-700">
                extras pagados
              </span>
              .
            </p>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Label>Modo de descuento de stock</Label>
                <Select value={modoStock} onValueChange={(v) => setModoStock(v as ModoStock)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producto">
                      Sólo stock del producto (no descuenta insumos)
                    </SelectItem>
                    <SelectItem value="receta">
                      Sólo insumos (cada venta descuenta los ingredientes)
                    </SelectItem>
                    <SelectItem value="producto_y_receta">
                      Producto + insumos (ambos descuentan)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Para hamburguesas casi siempre conviene <strong>Sólo insumos</strong> o{' '}
                  <strong>Producto + insumos</strong>.
                </p>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as Categoria)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="base" className="gap-2">
                    <Star className="h-3.5 w-3.5" />
                    Base
                    <Badge variant="secondary" className="ml-1 px-1.5">
                      {conteos.base}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="opcional" className="gap-2">
                    Opcionales
                    <Badge variant="secondary" className="ml-1 px-1.5">
                      {conteos.opcional}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="extra" className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Extras
                    <Badge variant="secondary" className="ml-1 px-1.5">
                      {conteos.extra}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                {(['base', 'opcional', 'extra'] as Categoria[]).map((c) => (
                  <TabsContent key={c} value={c} className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {c === 'base' &&
                          'Siempre se descuentan al vender el producto (ej: pan, carne, queso de la burger).'}
                        {c === 'opcional' &&
                          'El cliente puede pedirlo o no, sin costo extra (ej: tomate, cebolla, pepinillos).'}
                        {c === 'extra' &&
                          'El cliente puede agregarlo pagando más (ej: doble queso, bacon, palta).'}
                      </p>
                      <Button type="button" size="sm" variant="outline" onClick={() => addLinea(c)}>
                        <Plus className="mr-1 h-4 w-4" /> Agregar
                      </Button>
                    </div>
                    {lineasFiltradas.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        No hay ingredientes {c === 'base' ? 'base' : c === 'opcional' ? 'opcionales' : 'extras'} aún.
                        <br />
                        <Button
                          type="button"
                          size="sm"
                          variant="link"
                          onClick={() => addLinea(c)}
                          className="mt-1"
                        >
                          Agregar el primero
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {lineasFiltradas.map(({ l, idx }) => renderLinea(l, idx))}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Guardando...' : 'Guardar receta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: crear variante (clonar producto + receta) */}
      <Dialog open={varianteOpen} onOpenChange={setVarianteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-amber-500" />
              Crear variante
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Clona <strong>{productoNombre}</strong> con todos sus ingredientes.
              Después podés ajustar cantidades de cada uno (ej: doble carne, doble queso).
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Nombre de la variante</Label>
              <Input
                value={varianteNombre}
                onChange={(e) => setVarianteNombre(e.target.value)}
                placeholder={`${productoNombre} Doble`}
              />
            </div>
            <div>
              <Label className="text-sm">Precio (opcional)</Label>
              <Input
                inputMode="numeric"
                value={
                  variantePrecio
                    ? Number((variantePrecio || '').replace(/[^\d]/g, '')).toLocaleString('es-CL')
                    : ''
                }
                onChange={(e) => setVariantePrecio(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="Si lo dejas vacío, hereda el del original"
                className="text-right"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVarianteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleClonar} disabled={clonando}>
              {clonando ? 'Creando...' : 'Crear variante'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
