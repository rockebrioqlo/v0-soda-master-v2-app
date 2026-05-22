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
import { Edit, AlertTriangle, Package, Search, RefreshCw, Star } from 'lucide-react'
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

export function InventarioPage() {
  const [items, setItems]               = useState<InventarioRow[]>([])
  const [loading, setLoading]           = useState(true)
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

  useEffect(() => { loadInventario() }, [loadInventario])

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
        <Button
          variant="outline"
          onClick={loadInventario}
          disabled={loading}
          className="border-border"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {loading ? 'Cargando...' : 'Refrescar'}
        </Button>
      </div>

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
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
