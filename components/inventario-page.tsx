'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { formatNumber, formatCurrency, generateId } from '@/lib/helpers'
import { Plus, Edit, Trash2, AlertTriangle, Package, Search } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Producto } from '@/lib/types'

export function InventarioPage() {
  const { state, dispatch } = useApp()
  const { productos } = state

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showDialog, setShowDialog] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: 'acompañamientos' as Producto['categoria'],
    precio: '',
    stock: '',
    stockMinimo: '',
    formato: 'unidad',
    esIngredienteEspecial: false,
    costoAdicional: ''
  })

  // Filter products that are inventory items (not final products for sale or have stock management)
  const inventarioItems = productos.filter(p => 
    p.precio === 0 || p.esIngredienteEspecial || p.categoria === 'salsas' ||
    ['inv', 'ie'].some(prefix => p.id.startsWith(prefix))
  )

  const productosVenta = productos.filter(p => 
    p.precio > 0 && !p.esIngredienteEspecial && p.categoria !== 'salsas'
  )

  const filteredInventario = inventarioItems.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || p.categoria === categoryFilter
    return matchesSearch && matchesCategory
  })

  const filteredProductos = productosVenta.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || p.categoria === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleOpenNew = () => {
    setEditingProducto(null)
    setFormData({
      nombre: '',
      categoria: 'acompañamientos',
      precio: '',
      stock: '',
      stockMinimo: '',
      formato: 'unidad',
      esIngredienteEspecial: false,
      costoAdicional: ''
    })
    setShowDialog(true)
  }

  const handleEdit = (producto: Producto) => {
    setEditingProducto(producto)
    setFormData({
      nombre: producto.nombre,
      categoria: producto.categoria,
      precio: producto.precio.toString(),
      stock: producto.stock.toString(),
      stockMinimo: producto.stockMinimo.toString(),
      formato: producto.formato,
      esIngredienteEspecial: producto.esIngredienteEspecial,
      costoAdicional: producto.costoAdicional.toString()
    })
    setShowDialog(true)
  }

  const handleDelete = (productoId: string) => {
    dispatch({ type: 'DELETE_PRODUCTO', payload: productoId })
    showToast('Producto eliminado', 'success')
  }

  const handleSave = () => {
    if (!formData.nombre.trim()) {
      showToast('El nombre es requerido', 'error')
      return
    }

    const productoData: Producto = {
      id: editingProducto?.id || generateId(),
      nombre: formData.nombre,
      categoria: formData.categoria,
      precio: parseFloat(formData.precio) || 0,
      stock: parseInt(formData.stock) || 0,
      stockMinimo: parseInt(formData.stockMinimo) || 10,
      formato: formData.formato,
      esIngredienteEspecial: formData.esIngredienteEspecial,
      costoAdicional: parseFloat(formData.costoAdicional) || 0
    }

    if (editingProducto) {
      dispatch({ type: 'UPDATE_PRODUCTO', payload: productoData })
      showToast('Producto actualizado', 'success')
    } else {
      dispatch({ type: 'ADD_PRODUCTO', payload: productoData })
      showToast('Producto creado', 'success')
    }

    setShowDialog(false)
  }

  const toggleEspecial = (producto: Producto) => {
    dispatch({
      type: 'UPDATE_PRODUCTO',
      payload: {
        ...producto,
        esIngredienteEspecial: !producto.esIngredienteEspecial
      }
    })
    showToast(
      producto.esIngredienteEspecial 
        ? `${producto.nombre} ya no es ingrediente especial`
        : `${producto.nombre} ahora es ingrediente especial`,
      'success'
    )
  }

  const stockBajoCount = productos.filter(p => p.stock <= p.stockMinimo && p.stock > 0).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
            {stockBajoCount > 0 && (
              <p className="mt-1 flex items-center gap-2 text-sm text-orange-500">
                <AlertTriangle className="h-4 w-4" />
                {stockBajoCount} productos con stock bajo
              </p>
            )}
          </div>
          <Button onClick={handleOpenNew} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Producto
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar productos..."
              className="border-border bg-muted pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full border-border bg-muted sm:w-48">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              <SelectItem value="burgers">Burgers</SelectItem>
              <SelectItem value="entradas">Entradas</SelectItem>
              <SelectItem value="acompañamientos">Acompañamientos</SelectItem>
              <SelectItem value="postres">Postres</SelectItem>
              <SelectItem value="bebidas">Bebidas</SelectItem>
              <SelectItem value="salsas">Salsas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Inventory Section */}
        <Card className="mb-6 border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Package className="h-5 w-5 text-amber-500" />
              Materias Primas e Ingredientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Formato</TableHead>
                    <TableHead className="text-right text-muted-foreground">Cantidad</TableHead>
                    <TableHead className="text-right text-muted-foreground">Stock Mín.</TableHead>
                    <TableHead className="text-center text-muted-foreground">Ing. Especial</TableHead>
                    <TableHead className="text-right text-muted-foreground">Costo Adic.</TableHead>
                    <TableHead className="text-right text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventario.map((producto) => (
                    <TableRow 
                      key={producto.id} 
                      className={cn(
                        'border-border',
                        producto.stock <= producto.stockMinimo && producto.stock > 0 && 'bg-red-500/10'
                      )}
                    >
                      <TableCell className="font-medium text-foreground">
                        {producto.nombre}
                        {producto.stock <= producto.stockMinimo && producto.stock > 0 && (
                          <Badge className="ml-2 bg-red-500 text-white">Stock bajo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{producto.formato}</TableCell>
                      <TableCell className={cn(
                        'text-right font-medium',
                        producto.stock <= producto.stockMinimo ? 'text-red-500' : 'text-foreground'
                      )}>
                        {formatNumber(producto.stock)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(producto.stockMinimo)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={producto.esIngredienteEspecial}
                          onCheckedChange={() => toggleEspecial(producto)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-amber-500">
                        {producto.esIngredienteEspecial ? formatCurrency(producto.costoAdicional) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(producto)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-400"
                            onClick={() => handleDelete(producto.id)}
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

        {/* Products for Sale Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Productos para Venta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Categoría</TableHead>
                    <TableHead className="text-right text-muted-foreground">Precio</TableHead>
                    <TableHead className="text-right text-muted-foreground">Stock</TableHead>
                    <TableHead className="text-right text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductos.map((producto) => (
                    <TableRow key={producto.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{producto.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border">
                          {producto.categoria}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-amber-500 font-medium">
                        {formatCurrency(producto.precio)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(producto.stock)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(producto)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-400"
                            onClick={() => handleDelete(producto.id)}
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

        {/* Dialog for New/Edit Product */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingProducto ? 'Editar Producto' : 'Nuevo Producto'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Nombre</label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="border-border bg-muted"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Categoría</label>
                  <Select
                    value={formData.categoria}
                    onValueChange={(v) => setFormData({ ...formData, categoria: v as Producto['categoria'] })}
                  >
                    <SelectTrigger className="border-border bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="burgers">Burgers</SelectItem>
                      <SelectItem value="entradas">Entradas</SelectItem>
                      <SelectItem value="acompañamientos">Acompañamientos</SelectItem>
                      <SelectItem value="postres">Postres</SelectItem>
                      <SelectItem value="bebidas">Bebidas</SelectItem>
                      <SelectItem value="salsas">Salsas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Formato</label>
                  <Input
                    value={formData.formato}
                    onChange={(e) => setFormData({ ...formData, formato: e.target.value })}
                    placeholder="Ej: unidad, kg, litros"
                    className="border-border bg-muted"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Precio</label>
                  <Input
                    type="number"
                    value={formData.precio}
                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                    placeholder="0"
                    className="border-border bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Stock</label>
                  <Input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="border-border bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Stock Mín.</label>
                  <Input
                    type="number"
                    value={formData.stockMinimo}
                    onChange={(e) => setFormData({ ...formData, stockMinimo: e.target.value })}
                    placeholder="10"
                    className="border-border bg-muted"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div>
                  <p className="font-medium text-foreground">Ingrediente Especial</p>
                  <p className="text-sm text-muted-foreground">
                    Disponible como extra en burgers
                  </p>
                </div>
                <Switch
                  checked={formData.esIngredienteEspecial}
                  onCheckedChange={(v) => setFormData({ ...formData, esIngredienteEspecial: v })}
                />
              </div>
              {formData.esIngredienteEspecial && (
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Costo Adicional</label>
                  <Input
                    type="number"
                    value={formData.costoAdicional}
                    onChange={(e) => setFormData({ ...formData, costoAdicional: e.target.value })}
                    placeholder="0"
                    className="border-border bg-muted"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                {editingProducto ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
