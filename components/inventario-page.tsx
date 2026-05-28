'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { formatCurrency } from '@/lib/helpers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Edit,
  AlertTriangle,
  Package,
  Search,
  RefreshCw,
  Star,
  Plus,
  BookOpen,
  FlaskConical,
  Truck,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { RecetaEditorDialog } from '@/components/receta-editor-dialog'
import { ProveedoresTab } from '@/components/proveedores-tab'
import { ComprasTab } from '@/components/compras-tab'
import { MargenesTab } from '@/components/margenes-tab'
import { showToast } from '@/components/toast'
import { Switch } from '@/components/ui/switch'

interface InventarioRow {
  id: string
  producto_id: string
  producto_nombre: string
  categoria: string
  stock_actual: number
  stock_minimo: number
  unidad_medida: string
  updated_at: string
  precio?: number
  es_ingrediente_especial?: boolean
  costo_adicional?: number
  modo_stock?: string
}

interface InsumoRow {
  id: string
  nombre: string
  categoria: string
  unidad_medida: string
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  tipo?: 'comida' | 'negocio' | 'otro'
}

const CATEGORIAS = [
  { value: 'burgers',         label: 'Burgers' },
  { value: 'entradas',        label: 'Entradas' },
  { value: 'acompañamientos', label: 'Acompañamientos' },
  { value: 'postres',         label: 'Postres' },
  { value: 'cervezas',        label: 'Cervezas' },
  { value: 'jugos_bebidas',   label: 'Jugos y Bebidas' },
  { value: 'tragos',          label: 'Tragos' },
]

const MODO_STOCK_LABEL: Record<string, string> = {
  producto: 'Producto',
  receta: 'Receta',
  producto_y_receta: 'Producto + receta',
}

export function InventarioPage() {
  const [mainTab, setMainTab] = useState<
    'productos' | 'insumos' | 'proveedores' | 'compras' | 'margenes'
  >('productos')
  const [items, setItems]               = useState<InventarioRow[]>([])
  const [insumos, setInsumos]           = useState<InsumoRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadingInsumos, setLoadingInsumos] = useState(false)
  const [seedingRecetas, setSeedingRecetas] = useState(false)
  const [recetaProducto, setRecetaProducto] = useState<{ id: string; nombre: string } | null>(null)
  const [showInsumoDialog, setShowInsumoDialog] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState<InsumoRow | null>(null)
  const [insumoForm, setInsumoForm] = useState({
    nombre: '',
    categoria: 'insumos',
    unidad_medida: 'unidad',
    stock_actual: '0',
    stock_minimo: '0',
    costo_unitario: '0',
    tipo: 'comida' as 'comida' | 'negocio' | 'otro',
  })
  const [filtroTipoInsumo, setFiltroTipoInsumo] = useState<'all' | 'comida' | 'negocio' | 'otro'>(
    'all',
  )
  const [searchTerm, setSearchTerm]     = useState('')
  const [catFilter, setCatFilter]       = useState('all')
  const [showDialog, setShowDialog]     = useState(false)
  const [editing, setEditing]           = useState<InventarioRow | null>(null)
  const [saving, setSaving]             = useState(false)
  const [formData, setFormData]         = useState({
    stock_actual: '',
    stock_minimo: '',
    unidad_medida: 'unidad',
    es_ingrediente_especial: false,
    costo_adicional: '0',
  })

  const loadInventario = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventario')
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : [])
      } else {
        showToast('Error al cargar inventario', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInsumos = useCallback(async () => {
    setLoadingInsumos(true)
    try {
      const res = await fetch('/api/ingredientes')
      if (res.ok) {
        const data = await res.json()
        setInsumos(Array.isArray(data) ? data : [])
      }
    } catch {
      showToast('Error al cargar insumos', 'error')
    } finally {
      setLoadingInsumos(false)
    }
  }, [])

  useEffect(() => { loadInventario() }, [loadInventario])
  useEffect(() => {
    if (mainTab === 'insumos') loadInsumos()
  }, [mainTab, loadInsumos])

  const handleSeedRecetas = async () => {
    setSeedingRecetas(true)
    try {
      const res = await fetch('/api/seed-recetas', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error en seed')
      showToast(`Recetas: ${data.recetas}, insumos: ${data.insumos}`, 'success')
      await loadInventario()
      await loadInsumos()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error')
    } finally {
      setSeedingRecetas(false)
    }
  }

  const handleSaveInsumo = async () => {
    const payload = {
      nombre: insumoForm.nombre.trim(),
      categoria: insumoForm.categoria,
      unidad_medida: insumoForm.unidad_medida,
      stock_actual: Number(insumoForm.stock_actual) || 0,
      stock_minimo: Number(insumoForm.stock_minimo) || 0,
      costo_unitario: Number(insumoForm.costo_unitario) || 0,
      tipo: insumoForm.tipo,
    }
    if (!payload.nombre) {
      showToast('Nombre requerido', 'error')
      return
    }
    try {
      const res = editingInsumo
        ? await fetch(`/api/ingredientes/${editingInsumo.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ingredientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error('Error al guardar')
      showToast(editingInsumo ? 'Insumo actualizado' : 'Insumo creado', 'success')
      setShowInsumoDialog(false)
      setEditingInsumo(null)
      await loadInsumos()
    } catch {
      showToast('Error al guardar insumo', 'error')
    }
  }

  const filtered = items.filter(item => {
    const matchSearch = item.producto_nombre.toLowerCase().includes(searchTerm.toLowerCase())
    const matchCat    = catFilter === 'all' || item.categoria === catFilter
    return matchSearch && matchCat
  })

  const stockBajoCount = items.filter(i => i.stock_actual <= i.stock_minimo && i.stock_actual >= 0).length

  const handleEdit = (item: InventarioRow) => {
    setEditing(item)
    setFormData({
      stock_actual:  item.stock_actual.toString(),
      stock_minimo:  item.stock_minimo.toString(),
      unidad_medida: item.unidad_medida || 'unidad',
      es_ingrediente_especial: !!item.es_ingrediente_especial,
      costo_adicional: ((item.costo_adicional ?? 0) || 0).toString(),
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!editing) return
    const stock_actual = parseInt(formData.stock_actual)
    const stock_minimo = parseInt(formData.stock_minimo)
    if (isNaN(stock_actual) || stock_actual < 0) {
      showToast('Stock actual debe ser un número mayor o igual a 0', 'error')
      return
    }
    if (isNaN(stock_minimo) || stock_minimo < 0) {
      showToast('Stock mínimo debe ser un número mayor o igual a 0', 'error')
      return
    }
    const costoAdicional = formData.es_ingrediente_especial
      ? Number(formData.costo_adicional)
      : 0
    if (formData.es_ingrediente_especial && (!Number.isFinite(costoAdicional) || costoAdicional < 0)) {
      showToast('Costo adicional debe ser un número mayor o igual a 0', 'error')
      return
    }
    const unidadMedida = formData.unidad_medida.trim()
    if (!unidadMedida) {
      showToast('Unidad de medida requerida', 'error')
      return
    }
    setSaving(true)
    try {
      const [inventarioRes, productoRes] = await Promise.all([
        fetch('/api/inventario', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            producto_id:  editing.producto_id,
            stock_actual,
            stock_minimo,
            unidad_medida: unidadMedida,
          }),
        }),
        fetch(`/api/productos/${editing.producto_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            es_ingrediente_especial: formData.es_ingrediente_especial,
            costo_adicional: costoAdicional,
          }),
        }),
      ])
      if (inventarioRes.ok && productoRes.ok) {
        showToast(`${editing.producto_nombre} actualizado`, 'success')
        setShowDialog(false)
        await loadInventario()
      } else {
        showToast('Error al guardar', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(false)
    }
  }

  const stockColor = (item: InventarioRow) => {
    if (item.stock_actual === 0)                      return 'text-red-500 font-bold'
    if (item.stock_actual <= item.stock_minimo)       return 'text-orange-500 font-semibold'
    return 'text-foreground'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
          {stockBajoCount > 0 && (
            <p className="mt-1 flex items-center gap-2 text-sm text-orange-500">
              <AlertTriangle className="h-4 w-4" />
              {stockBajoCount} {stockBajoCount === 1 ? 'producto' : 'productos'} con stock bajo
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleSeedRecetas}
            disabled={seedingRecetas}
            className="border-border"
          >
            <BookOpen className={cn('mr-2 h-4 w-4', seedingRecetas && 'animate-spin')} />
            {seedingRecetas ? 'Generando...' : 'Generar recetas base'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              loadInventario()
              if (mainTab === 'insumos') loadInsumos()
            }}
            disabled={loading || loadingInsumos}
            className="border-border"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', (loading || loadingInsumos) && 'animate-spin')} />
            Refrescar
          </Button>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) =>
          setMainTab(v as 'productos' | 'insumos' | 'proveedores' | 'compras' | 'margenes')
        }
      >
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="productos" className="gap-2">
            <Package className="h-4 w-4" /> Productos
          </TabsTrigger>
          <TabsTrigger value="insumos" className="gap-2">
            <FlaskConical className="h-4 w-4" /> Insumos
          </TabsTrigger>
          <TabsTrigger value="proveedores" className="gap-2">
            <Truck className="h-4 w-4" /> Proveedores
          </TabsTrigger>
          <TabsTrigger value="compras" className="gap-2">
            <ShoppingBag className="h-4 w-4" /> Compras
          </TabsTrigger>
          <TabsTrigger value="margenes" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Márgenes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="mt-4 space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar productos..."
            className="border-border bg-muted pl-10"
          />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full border-border bg-muted sm:w-52">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {CATEGORIAS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground">Total productos</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {items.filter(i => i.stock_actual > i.stock_minimo).length}
            </p>
            <p className="text-xs text-muted-foreground">Stock OK</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stockBajoCount}</p>
            <p className="text-xs text-muted-foreground">Stock bajo</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">
              {items.filter(i => i.stock_actual === 0).length}
            </p>
            <p className="text-xs text-muted-foreground">Sin stock</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Package className="h-5 w-5 text-amber-500" />
            Productos y Stock ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              Cargando inventario desde base de datos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {items.length === 0
                ? 'No hay productos en la base de datos. Ejecuta el seed primero.'
                : 'No hay resultados para este filtro.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Producto</TableHead>
                    <TableHead className="text-muted-foreground">Categoría</TableHead>
                    <TableHead className="text-muted-foreground">Modo stock</TableHead>
                    <TableHead className="text-muted-foreground">Unidad</TableHead>
                    <TableHead className="text-right text-muted-foreground">Stock actual</TableHead>
                    <TableHead className="text-right text-muted-foreground">Stock mín.</TableHead>
                    <TableHead className="text-center text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-right text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        'border-border',
                        item.stock_actual === 0 && 'bg-red-500/10',
                        item.stock_actual > 0 && item.stock_actual <= item.stock_minimo && 'bg-orange-500/10',
                      )}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{item.producto_nombre}</span>
                          {item.es_ingrediente_especial && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-500"
                              title={`Ingrediente especial${item.costo_adicional ? ` +${formatCurrency(item.costo_adicional)}` : ''}`}
                            >
                              <Star className="mr-1 h-3 w-3" />
                              Especial
                              {item.costo_adicional ? ` +${formatCurrency(item.costo_adicional)}` : ''}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border text-xs capitalize">
                          {item.categoria?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {MODO_STOCK_LABEL[item.modo_stock || 'producto'] || item.modo_stock}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.unidad_medida}</TableCell>
                      <TableCell className={cn('text-right', stockColor(item))}>
                        {item.stock_actual}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.stock_minimo}</TableCell>
                      <TableCell className="text-center">
                        {item.stock_actual === 0 ? (
                          <Badge className="bg-red-500 text-white">Sin stock</Badge>
                        ) : item.stock_actual <= item.stock_minimo ? (
                          <Badge className="bg-orange-500 text-white">Stock bajo</Badge>
                        ) : (
                          <Badge className="bg-green-600 text-white">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar receta"
                            onClick={() =>
                              setRecetaProducto({
                                id: item.producto_id,
                                nombre: item.producto_nombre,
                              })
                            }
                          >
                            <BookOpen className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="insumos" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              value={filtroTipoInsumo}
              onValueChange={(v) =>
                setFiltroTipoInsumo(v as 'all' | 'comida' | 'negocio' | 'otro')
              }
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los insumos</SelectItem>
                <SelectItem value="comida">Para comida</SelectItem>
                <SelectItem value="negocio">Para el negocio</SelectItem>
                <SelectItem value="otro">Otros</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setEditingInsumo(null)
                setInsumoForm({
                  nombre: '',
                  categoria: 'insumos',
                  unidad_medida: 'unidad',
                  stock_actual: '0',
                  stock_minimo: '0',
                  costo_unitario: '0',
                  tipo: 'comida',
                })
                setShowInsumoDialog(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nuevo insumo
            </Button>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="p-0">
              {loadingInsumos ? (
                <p className="p-8 text-center text-muted-foreground">Cargando insumos...</p>
              ) : insumos.length === 0 ? (
                <p className="p-8 text-center text-muted-foreground">
                  No hay insumos. Usa &quot;Generar recetas base&quot; o crea uno manualmente.
                </p>
              ) : (
                (() => {
                  const filtrados = insumos.filter((ing) =>
                    filtroTipoInsumo === 'all' ? true : (ing.tipo || 'comida') === filtroTipoInsumo,
                  )
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Insumo</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Mín.</TableHead>
                          <TableHead className="text-right">Costo</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtrados.map((ing) => (
                          <TableRow key={ing.id}>
                            <TableCell className="font-medium">{ing.nombre}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">
                                {ing.tipo || 'comida'}
                              </Badge>
                            </TableCell>
                            <TableCell>{ing.categoria}</TableCell>
                            <TableCell>{ing.unidad_medida}</TableCell>
                            <TableCell className="text-right">{ing.stock_actual}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {ing.stock_minimo}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCurrency(ing.costo_unitario)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingInsumo(ing)
                                  setInsumoForm({
                                    nombre: ing.nombre,
                                    categoria: ing.categoria,
                                    unidad_medida: ing.unidad_medida,
                                    stock_actual: String(ing.stock_actual),
                                    stock_minimo: String(ing.stock_minimo),
                                    costo_unitario: String(ing.costo_unitario),
                                    tipo: ing.tipo || 'comida',
                                  })
                                  setShowInsumoDialog(true)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
                })()
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proveedores" className="mt-4">
          <ProveedoresTab />
        </TabsContent>

        <TabsContent value="compras" className="mt-4">
          <ComprasTab />
        </TabsContent>

        <TabsContent value="margenes" className="mt-4">
          <MargenesTab />
        </TabsContent>
      </Tabs>

      {recetaProducto && (
        <RecetaEditorDialog
          open={!!recetaProducto}
          onOpenChange={(o) => !o && setRecetaProducto(null)}
          productoId={recetaProducto.id}
          productoNombre={recetaProducto.nombre}
          onSaved={loadInventario}
        />
      )}

      <Dialog open={showInsumoDialog} onOpenChange={setShowInsumoDialog}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingInsumo ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              placeholder="Nombre"
              value={insumoForm.nombre}
              onChange={(e) => setInsumoForm({ ...insumoForm, nombre: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={insumoForm.tipo}
                onValueChange={(v) =>
                  setInsumoForm({ ...insumoForm, tipo: v as 'comida' | 'negocio' | 'otro' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comida">Comida (entra en receta)</SelectItem>
                  <SelectItem value="negocio">
                    Negocio (limpieza, empaque, papelería)
                  </SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Categoría"
                value={insumoForm.categoria}
                onChange={(e) => setInsumoForm({ ...insumoForm, categoria: e.target.value })}
              />
            </div>
            <Input
              placeholder="Unidad (unidad, kg, litro...)"
              value={insumoForm.unidad_medida}
              onChange={(e) => setInsumoForm({ ...insumoForm, unidad_medida: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                placeholder="Stock"
                value={insumoForm.stock_actual}
                onChange={(e) => setInsumoForm({ ...insumoForm, stock_actual: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Mínimo"
                value={insumoForm.stock_minimo}
                onChange={(e) => setInsumoForm({ ...insumoForm, stock_minimo: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Costo unit."
                value={insumoForm.costo_unitario}
                onChange={(e) => setInsumoForm({ ...insumoForm, costo_unitario: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInsumoDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveInsumo}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit stock dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Actualizar stock — {editing?.producto_nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Stock actual</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.stock_actual}
                  onChange={e => setFormData({ ...formData, stock_actual: e.target.value })}
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Stock mínimo</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.stock_minimo}
                  onChange={e => setFormData({ ...formData, stock_minimo: e.target.value })}
                  className="border-border bg-muted"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Unidad de medida</label>
              <Input
                value={formData.unidad_medida}
                onChange={e => setFormData({ ...formData, unidad_medida: e.target.value })}
                placeholder="unidad, kg, litros..."
                className="border-border bg-muted"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <label htmlFor="es-ingrediente-especial" className="text-sm font-medium text-foreground">
                    Disponible como ingrediente especial
                  </label>
                </div>
                <Switch
                  id="es-ingrediente-especial"
                  checked={formData.es_ingrediente_especial}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, es_ingrediente_especial: !!checked })
                  }
                />
              </div>
              {formData.es_ingrediente_especial && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    Costo adicional ($) — aplicado al usarlo como extra en el POS
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={formData.costo_adicional}
                    onChange={(e) => setFormData({ ...formData, costo_adicional: e.target.value })}
                    placeholder="0"
                    className="border-border bg-card"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vista previa:{' '}
                    <span className="font-medium text-amber-500">
                      +{formatCurrency(Number(formData.costo_adicional) || 0)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
