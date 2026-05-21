'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatCurrency, generateId, getEstadoComandaColor, getEstadoComandaLabel } from '@/lib/helpers'
import { Plus, Minus, Trash2, Send, Printer, Percent, ChefHat, Wine, Star, ArrowLeft } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Comanda, ItemComanda, Producto, TipoDescuento } from '@/lib/types'
import { ingredientesEstandar, salsasDisponibles } from '@/lib/initial-data'

export function POSPage() {
  const { state, dispatch, hasPermission, posNavigation, clearPOSNavigation, navigateTo } = useApp()
  const { mesas, productos, comandas, usuarioActual, permisosDescuento } = state

  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(posNavigation.mesaId)
  const [currentComanda, setCurrentComanda] = useState<Comanda | null>(null)
  const [activeTab, setActiveTab] = useState('comidas')
  
  // Burger customization state
  const [showBurgerDialog, setShowBurgerDialog] = useState(false)
  const [selectedBurger, setSelectedBurger] = useState<Producto | null>(null)
  const [burgerIngredientes, setBurgerIngredientes] = useState<string[]>([])
  const [burgerEspeciales, setBurgerEspeciales] = useState<string[]>([])
  const [burgerSalsa, setBurgerSalsa] = useState('')
  const [burgerNotas, setBurgerNotas] = useState('')

  // Generic item dialog
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Producto | null>(null)
  const [itemVariante, setItemVariante] = useState('')
  const [itemSalsa, setItemSalsa] = useState('')
  const [itemNotas, setItemNotas] = useState('')
  const [itemCantidad, setItemCantidad] = useState(1)

  // Discount dialog
  const [showDescuentoDialog, setShowDescuentoDialog] = useState(false)
  const [descuentoTipo, setDescuentoTipo] = useState<TipoDescuento>('porcentaje')
  const [descuentoValor, setDescuentoValor] = useState('')
  const [descuentoMotivo, setDescuentoMotivo] = useState('')
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [authPin, setAuthPin] = useState('')

  // Find special ingredients from products
  const ingredientesEspeciales = useMemo(() => {
    return productos.filter(p => p.esIngredienteEspecial && p.stock > 0)
  }, [productos])

  // Load or create comanda on mount
  useEffect(() => {
    if (posNavigation.comandaId) {
      const existingComanda = comandas.find(c => c.id === posNavigation.comandaId)
      if (existingComanda) {
        setCurrentComanda(existingComanda)
        setSelectedMesaId(existingComanda.mesaId)
        return
      }
    }

    if (posNavigation.mesaId) {
      setSelectedMesaId(posNavigation.mesaId)
      const existingComanda = comandas.find(
        c => c.mesaId === posNavigation.mesaId && c.estado !== 'pagada'
      )
      if (existingComanda) {
        setCurrentComanda(existingComanda)
      } else {
        // Create new comanda
        const mesa = mesas.find(m => m.id === posNavigation.mesaId)
        if (mesa && usuarioActual) {
          const newComanda: Comanda = {
            id: generateId(),
            mesaId: posNavigation.mesaId,
            mesaNombre: mesa.nombre,
            usuarioId: usuarioActual.id,
            usuarioNombre: usuarioActual.nombre,
            estado: 'pendiente',
            creadoAt: Date.now(),
            items: [],
            descuento: 0,
            tipoDescuento: null,
            propina: 0,
            tipoPropina: 'porcentaje'
          }
          dispatch({ type: 'ADD_COMANDA', payload: newComanda })
          setCurrentComanda(newComanda)
          
          // Mark table as occupied
          dispatch({
            type: 'UPDATE_MESA',
            payload: { ...mesa, estado: 'ocupada' }
          })
        }
      }
    }
  }, [posNavigation.mesaId, posNavigation.comandaId, comandas, mesas, usuarioActual, dispatch])

  // Sync currentComanda with global state
  useEffect(() => {
    if (currentComanda) {
      const updated = comandas.find(c => c.id === currentComanda.id)
      if (updated && JSON.stringify(updated) !== JSON.stringify(currentComanda)) {
        setCurrentComanda(updated)
      }
    }
  }, [comandas, currentComanda])

  const selectedMesa = mesas.find(m => m.id === selectedMesaId)

  // Product categories
  const burgers = productos.filter(p => p.categoria === 'burgers')
  const entradas = productos.filter(p => p.categoria === 'entradas')
  const acompañamientos = productos.filter(p => p.categoria === 'acompañamientos' && !p.esIngredienteEspecial)
  const postres = productos.filter(p => p.categoria === 'postres')
  const bebidas = productos.filter(p => p.categoria === 'bebidas')

  const handleSelectMesa = (mesaId: string) => {
    setSelectedMesaId(mesaId)
    // Find or create comanda for this table
    const existingComanda = comandas.find(
      c => c.mesaId === mesaId && c.estado !== 'pagada'
    )
    if (existingComanda) {
      setCurrentComanda(existingComanda)
    } else {
      const mesa = mesas.find(m => m.id === mesaId)
      if (mesa && usuarioActual) {
        const newComanda: Comanda = {
          id: generateId(),
          mesaId: mesaId,
          mesaNombre: mesa.nombre,
          usuarioId: usuarioActual.id,
          usuarioNombre: usuarioActual.nombre,
          estado: 'pendiente',
          creadoAt: Date.now(),
          items: [],
          descuento: 0,
          tipoDescuento: null,
          propina: 0,
          tipoPropina: 'porcentaje'
        }
        dispatch({ type: 'ADD_COMANDA', payload: newComanda })
        setCurrentComanda(newComanda)
        
        dispatch({
          type: 'UPDATE_MESA',
          payload: { ...mesa, estado: 'ocupada' }
        })
      }
    }
  }

  // Burger handling
  const handleSelectBurger = (burger: Producto) => {
    setSelectedBurger(burger)
    setBurgerIngredientes([])
    setBurgerEspeciales([])
    setBurgerSalsa('')
    setBurgerNotas('')
    setShowBurgerDialog(true)
  }

  const handleToggleIngrediente = (ingrediente: string) => {
    if (burgerIngredientes.includes(ingrediente)) {
      setBurgerIngredientes(prev => prev.filter(i => i !== ingrediente))
    } else if (burgerIngredientes.length < 4) {
      setBurgerIngredientes(prev => [...prev, ingrediente])
    }
  }

  const handleToggleEspecial = (especialId: string) => {
    if (burgerEspeciales.includes(especialId)) {
      setBurgerEspeciales(prev => prev.filter(e => e !== especialId))
    } else {
      setBurgerEspeciales(prev => [...prev, especialId])
    }
  }

  const handleConfirmBurger = () => {
    if (!selectedBurger || !currentComanda) return

    // Calculate additional cost from special ingredients
    const costoEspeciales = burgerEspeciales.reduce((sum, espId) => {
      const esp = ingredientesEspeciales.find(i => i.id === espId)
      return sum + (esp?.costoAdicional || 0)
    }, 0)

    const newItem: ItemComanda = {
      id: generateId(),
      productoId: selectedBurger.id,
      productoNombre: selectedBurger.nombre,
      cantidad: 1,
      ingredientesEstandar: burgerIngredientes,
      ingredientesEspeciales: burgerEspeciales.map(id => {
        const esp = ingredientesEspeciales.find(i => i.id === id)
        return esp?.nombre || ''
      }),
      salsaSeleccionada: burgerSalsa,
      notas: burgerNotas,
      precio: selectedBurger.precio + costoEspeciales
    }

    const updatedComanda: Comanda = {
      ...currentComanda,
      items: [...currentComanda.items, newItem]
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setShowBurgerDialog(false)
    showToast(`${selectedBurger.nombre} agregada`, 'success')
  }

  // Generic item handling
  const handleSelectItem = (item: Producto) => {
    if (item.categoria === 'burgers') {
      handleSelectBurger(item)
      return
    }
    
    setSelectedItem(item)
    setItemVariante(item.variantes?.[0]?.nombre || '')
    setItemSalsa('')
    setItemNotas('')
    setItemCantidad(1)
    setShowItemDialog(true)
  }

  const handleConfirmItem = () => {
    if (!selectedItem || !currentComanda) return

    const variante = selectedItem.variantes?.find(v => v.nombre === itemVariante)
    const precio = variante?.precio || selectedItem.precio

    const newItem: ItemComanda = {
      id: generateId(),
      productoId: selectedItem.id,
      productoNombre: selectedItem.nombre,
      cantidad: itemCantidad,
      ingredientesEstandar: [],
      ingredientesEspeciales: [],
      salsaSeleccionada: itemSalsa,
      notas: itemNotas,
      precio: precio,
      variante: itemVariante || undefined
    }

    const updatedComanda: Comanda = {
      ...currentComanda,
      items: [...currentComanda.items, newItem]
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setShowItemDialog(false)
    showToast(`${selectedItem.nombre} agregado`, 'success')
  }

  const handleRemoveItem = (itemId: string) => {
    if (!currentComanda) return
    const updatedComanda: Comanda = {
      ...currentComanda,
      items: currentComanda.items.filter(i => i.id !== itemId)
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
  }

  const handleUpdateItemQuantity = (itemId: string, delta: number) => {
    if (!currentComanda) return
    const updatedComanda: Comanda = {
      ...currentComanda,
      items: currentComanda.items.map(item => {
        if (item.id === itemId) {
          const newQty = Math.max(1, item.cantidad + delta)
          return { ...item, cantidad: newQty }
        }
        return item
      })
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
  }

  // Calculate totals
  const subtotal = currentComanda?.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) || 0
  const descuentoMonto = currentComanda?.tipoDescuento === 'porcentaje'
    ? subtotal * (currentComanda.descuento / 100)
    : (currentComanda?.descuento || 0)
  const propinaMonto = currentComanda?.tipoPropina === 'porcentaje'
    ? subtotal * (currentComanda.propina / 100)
    : (currentComanda?.propina || 0)
  const total = subtotal - descuentoMonto + propinaMonto

  // Send to kitchen
  const handleEnviarCocina = () => {
    if (!currentComanda || currentComanda.items.length === 0) {
      showToast('Agrega items a la comanda primero', 'error')
      return
    }

    const updatedComanda: Comanda = {
      ...currentComanda,
      estado: 'en_cocina'
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    showToast('Comanda enviada a cocina/bar', 'success')
  }

  // Discount handling
  const handleOpenDescuento = () => {
    if (!usuarioActual) return
    
    const permisos = permisosDescuento[usuarioActual.rol]
    if (!permisos.puede) {
      setShowAuthDialog(true)
      return
    }
    
    setShowDescuentoDialog(true)
  }

  const handleApplyDescuento = () => {
    if (!currentComanda || !usuarioActual) return
    
    const valor = parseFloat(descuentoValor)
    if (isNaN(valor) || valor <= 0) {
      showToast('Ingresa un valor válido', 'error')
      return
    }

    const permisos = permisosDescuento[usuarioActual.rol]
    if (permisos.requiereMotivo && !descuentoMotivo.trim()) {
      showToast('El motivo es requerido', 'error')
      return
    }

    if (descuentoTipo === 'porcentaje' && valor > permisos.limiteMax) {
      showToast(`El descuento máximo permitido es ${permisos.limiteMax}%`, 'error')
      setShowAuthDialog(true)
      setShowDescuentoDialog(false)
      return
    }

    const updatedComanda: Comanda = {
      ...currentComanda,
      descuento: valor,
      tipoDescuento: descuentoTipo,
      motivoDescuento: descuentoMotivo,
      descuentoAplicadoPor: usuarioActual.nombre
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setShowDescuentoDialog(false)
    showToast('Descuento aplicado', 'success')
  }

  const handleAuthDescuento = async () => {
    // Verify admin PIN
    const { compare } = await import('bcryptjs')
    const admin = state.usuarios.find(u => u.rol === 'administrador')
    
    if (!admin) {
      showToast('No hay administrador registrado', 'error')
      return
    }

    const isValid = await compare(authPin, admin.pinHash)
    if (!isValid) {
      showToast('PIN incorrecto', 'error')
      return
    }

    setShowAuthDialog(false)
    setAuthPin('')
    setShowDescuentoDialog(true)
  }

  // Print ticket (visual only)
  const handlePrintTicket = () => {
    showToast('Imprimiendo comanda...', 'info')
    window.print()
  }

  // Go to payment
  const handleGoToPago = () => {
    if (!currentComanda) return
    navigateTo('pagos')
  }

  // Go back to mesa selector
  const handleChangeMesa = () => {
    setSelectedMesaId(null)
    setCurrentComanda(null)
    clearPOSNavigation()
  }

  // If no mesa selected, show mesa selector
  if (!selectedMesaId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Selecciona una Mesa</h1>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {mesas.map((mesa) => (
            <Card
              key={mesa.id}
              className={cn(
                'cursor-pointer border-2 transition-all hover:scale-[1.02]',
                mesa.estado === 'libre' && 'border-green-500/50 bg-green-500/10',
                mesa.estado === 'ocupada' && 'border-red-500/50 bg-red-500/10',
                mesa.estado === 'reservada' && 'border-yellow-500/50 bg-yellow-500/10'
              )}
              onClick={() => handleSelectMesa(mesa.id)}
            >
              <CardContent className="flex flex-col items-center justify-center p-6">
                <span className="text-2xl font-bold text-foreground">{mesa.nombre}</span>
                <span className="text-sm text-muted-foreground">Capacidad: {mesa.capacidad}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-[calc(100vh-3.5rem-5rem)] flex-col lg:h-[calc(100vh-3.5rem-1.5rem)] lg:flex-row gap-4">
        {/* Products Section */}
        <div className="flex-1 overflow-auto border-b border-zinc-700 p-4 lg:border-b-0 lg:border-r">
          {/* Mesa Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-foreground">{selectedMesa?.nombre}</h2>
              {currentComanda && (
                <Badge className={cn('text-white', getEstadoComandaColor(currentComanda.estado))}>
                  {getEstadoComandaLabel(currentComanda.estado)}
                </Badge>
              )}
            </div>
                        <Button variant="outline" size="sm" onClick={handleChangeMesa}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cambiar Mesa
            </Button>
          </div>

          {/* Tabs for mobile, columns for desktop */}
          <div className="lg:hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 bg-zinc-800">
                <TabsTrigger value="comidas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">
                  <ChefHat className="mr-2 h-4 w-4" />
                  Comidas
                </TabsTrigger>
                <TabsTrigger value="bebidas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">
                  <Wine className="mr-2 h-4 w-4" />
                  Bebidas
                </TabsTrigger>
              </TabsList>
              <TabsContent value="comidas" className="mt-4 space-y-4">
                <ProductSection title="Burgers" items={burgers} onSelect={handleSelectItem} />
                <ProductSection title="Entradas" items={entradas} onSelect={handleSelectItem} />
                <ProductSection title="Acompañamientos" items={acompañamientos} onSelect={handleSelectItem} />
                <ProductSection title="Postres" items={postres} onSelect={handleSelectItem} />
              </TabsContent>
              <TabsContent value="bebidas" className="mt-4">
                <ProductSection title="Bebidas" items={bebidas} onSelect={handleSelectItem} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop two-column layout */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-500">
                <ChefHat className="h-5 w-5" />
                Comidas
              </h3>
              <ProductSection title="Burgers" items={burgers} onSelect={handleSelectItem} />
              <ProductSection title="Entradas" items={entradas} onSelect={handleSelectItem} />
              <ProductSection title="Acompañamientos" items={acompañamientos} onSelect={handleSelectItem} />
              <ProductSection title="Postres" items={postres} onSelect={handleSelectItem} />
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-amber-500">
                <Wine className="h-5 w-5" />
                Bebidas
              </h3>
              <ProductSection title="" items={bebidas} onSelect={handleSelectItem} />
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="flex w-full flex-col bg-zinc-800/50 lg:w-96">
          <div className="border-b border-zinc-700 p-4">
            <h3 className="font-semibold text-foreground">Resumen de Comanda</h3>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {currentComanda?.items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No hay items en la comanda</p>
            ) : (
              <ul className="space-y-3">
                {currentComanda?.items.map((item) => (
                  <li key={item.id} className="rounded-lg bg-zinc-700/50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {item.productoNombre}
                          {item.variante && <span className="text-sm text-muted-foreground"> ({item.variante})</span>}
                        </p>
                        {item.ingredientesEstandar.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            + {item.ingredientesEstandar.join(', ')}
                          </p>
                        )}
                        {item.ingredientesEspeciales.length > 0 && (
                          <p className="text-xs text-amber-500">
                            ⭐ {item.ingredientesEspeciales.join(', ')}
                          </p>
                        )}
                        {item.salsaSeleccionada && (
                          <p className="text-xs text-muted-foreground">Salsa: {item.salsaSeleccionada}</p>
                        )}
                        {item.notas && (
                          <p className="text-xs italic text-muted-foreground">Nota: {item.notas}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleUpdateItemQuantity(item.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-foreground">{item.cantidad}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleUpdateItemQuantity(item.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-medium text-foreground">
                        {formatCurrency(item.precio * item.cantidad)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-zinc-700 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {currentComanda?.descuento > 0 && (
                <div className="flex justify-between text-green-500">
                  <span>Descuento ({currentComanda.tipoDescuento === 'porcentaje' ? `${currentComanda.descuento}%` : 'fijo'})</span>
                  <span>-{formatCurrency(descuentoMonto)}</span>
                </div>
              )}
              {currentComanda?.propina > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Propina</span>
                  <span>+{formatCurrency(propinaMonto)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-700 pt-2 text-lg font-bold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-zinc-600"
                onClick={handleOpenDescuento}
                disabled={!currentComanda || currentComanda.items.length === 0}
              >
                <Percent className="mr-2 h-4 w-4" />
                Descuento
              </Button>
              <Button
                variant="outline"
                className="border-zinc-600"
                onClick={handlePrintTicket}
                disabled={!currentComanda || currentComanda.items.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
                onClick={handleEnviarCocina}
                disabled={!currentComanda || currentComanda.items.length === 0 || currentComanda.estado !== 'pendiente'}
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar Cocina
              </Button>
              <Button
                className="bg-green-600 text-white hover:bg-green-500"
                onClick={handleGoToPago}
                disabled={!currentComanda || currentComanda.items.length === 0}
              >
                Ir a Pago
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Burger Customization Dialog */}
      <Dialog open={showBurgerDialog} onOpenChange={setShowBurgerDialog}>
        <DialogContent className="max-h-[90vh] overflow-auto border-zinc-700 bg-zinc-800 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Personalizar {selectedBurger?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Standard Ingredients */}
            <div>
              <label className="mb-3 block text-sm font-medium text-muted-foreground">
                Ingredientes estándar (máximo 4)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ingredientesEstandar.map((ing) => (
                  <div
                    key={ing}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors',
                      burgerIngredientes.includes(ing)
                        ? 'border-amber-500 bg-amber-500/20'
                        : 'border-zinc-600 hover:border-zinc-500',
                      burgerIngredientes.length >= 4 && !burgerIngredientes.includes(ing) && 'cursor-not-allowed opacity-50'
                    )}
                    onClick={() => handleToggleIngrediente(ing)}
                  >
                    <Checkbox
                      checked={burgerIngredientes.includes(ing)}
                      disabled={burgerIngredientes.length >= 4 && !burgerIngredientes.includes(ing)}
                    />
                    <span className="text-sm text-foreground">{ing}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Seleccionados: {burgerIngredientes.length}/4
              </p>
            </div>

            {/* Special Ingredients */}
            {ingredientesEspeciales.length > 0 && (
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-500">
                  <Star className="h-4 w-4" />
                  Ingredientes Especiales (costo adicional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ingredientesEspeciales.map((esp) => (
                    <Badge
                      key={esp.id}
                      variant={burgerEspeciales.includes(esp.id) ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer py-2 px-3',
                        burgerEspeciales.includes(esp.id)
                          ? 'bg-amber-500 text-zinc-900'
                          : 'border-zinc-600 hover:border-amber-500'
                      )}
                      onClick={() => handleToggleEspecial(esp.id)}
                    >
                      {esp.nombre} (+{formatCurrency(esp.costoAdicional)})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sauce */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Salsa</label>
              <Select value={burgerSalsa} onValueChange={setBurgerSalsa}>
                <SelectTrigger className="border-zinc-600 bg-zinc-700/50">
                  <SelectValue placeholder="Sin salsa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin salsa</SelectItem>
                  {salsasDisponibles.map((salsa) => (
                    <SelectItem key={salsa} value={salsa}>{salsa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Nota especial (instrucciones)
              </label>
              <Textarea
                value={burgerNotas}
                onChange={(e) => setBurgerNotas(e.target.value)}
                placeholder="Ej: sin sal, bien cocida..."
                className="border-zinc-600 bg-zinc-700/50"
              />
            </div>

            {/* Price */}
            <div className="rounded-lg bg-zinc-700/50 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Precio base:</span>
                <span className="text-foreground">{formatCurrency(selectedBurger?.precio || 0)}</span>
              </div>
              {burgerEspeciales.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Especiales:</span>
                  <span className="text-amber-500">
                    +{formatCurrency(burgerEspeciales.reduce((sum, id) => {
                      const esp = ingredientesEspeciales.find(i => i.id === id)
                      return sum + (esp?.costoAdicional || 0)
                    }, 0))}
                  </span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-zinc-600 pt-2 font-bold">
                <span className="text-foreground">Total:</span>
                <span className="text-foreground">
                  {formatCurrency(
                    (selectedBurger?.precio || 0) +
                    burgerEspeciales.reduce((sum, id) => {
                      const esp = ingredientesEspeciales.find(i => i.id === id)
                      return sum + (esp?.costoAdicional || 0)
                    }, 0)
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBurgerDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmBurger} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Confirmar Burger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="border-zinc-700 bg-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Agregar {selectedItem?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Variant selector */}
            {selectedItem?.variantes && selectedItem.variantes.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Tamaño/Variante</label>
                <Select value={itemVariante} onValueChange={setItemVariante}>
                  <SelectTrigger className="border-zinc-600 bg-zinc-700/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedItem.variantes.map((v) => (
                      <SelectItem key={v.nombre} value={v.nombre}>
                        {v.nombre} - {formatCurrency(v.precio)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sauce for applicable items */}
            {(selectedItem?.categoria === 'entradas' || selectedItem?.categoria === 'acompañamientos') && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Salsa</label>
                <Select value={itemSalsa} onValueChange={setItemSalsa}>
                  <SelectTrigger className="border-zinc-600 bg-zinc-700/50">
                    <SelectValue placeholder="Sin salsa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin salsa</SelectItem>
                    {salsasDisponibles.map((salsa) => (
                      <SelectItem key={salsa} value={salsa}>{salsa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Cantidad</label>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setItemCantidad(Math.max(1, itemCantidad - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xl font-bold text-foreground">{itemCantidad}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setItemCantidad(itemCantidad + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Notas</label>
              <Textarea
                value={itemNotas}
                onChange={(e) => setItemNotas(e.target.value)}
                placeholder="Ej: sin hielo, con limón..."
                className="border-zinc-600 bg-zinc-700/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmItem} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDescuentoDialog} onOpenChange={setShowDescuentoDialog}>
        <DialogContent className="border-zinc-700 bg-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-foreground">Aplicar Descuento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Tipo</label>
              <Select value={descuentoTipo} onValueChange={(v) => setDescuentoTipo(v as TipoDescuento)}>
                <SelectTrigger className="border-zinc-600 bg-zinc-700/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                  <SelectItem value="monto_fijo">Monto fijo ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Valor</label>
              <Input
                type="number"
                value={descuentoValor}
                onChange={(e) => setDescuentoValor(e.target.value)}
                placeholder={descuentoTipo === 'porcentaje' ? 'Ej: 10' : 'Ej: 1000'}
                className="border-zinc-600 bg-zinc-700/50"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Motivo {permisosDescuento[usuarioActual?.rol || 'mesero']?.requiereMotivo && '*'}
              </label>
              <Textarea
                value={descuentoMotivo}
                onChange={(e) => setDescuentoMotivo(e.target.value)}
                placeholder="Motivo del descuento..."
                className="border-zinc-600 bg-zinc-700/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDescuentoDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApplyDescuento} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog for Discount */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="border-zinc-700 bg-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-foreground">Autorización Requerida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ingresa el PIN del administrador para autorizar el descuento.
            </p>
            <Input
              type="password"
              value={authPin}
              onChange={(e) => setAuthPin(e.target.value)}
              placeholder="PIN del administrador"
              className="border-zinc-600 bg-zinc-700/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAuthDialog(false); setAuthPin('') }}>
              Cancelar
            </Button>
            <Button onClick={handleAuthDescuento} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Verificar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Product Section Component
function ProductSection({ 
  title, 
  items, 
  onSelect 
}: { 
  title: string
  items: Producto[]
  onSelect: (item: Producto) => void 
}) {
  if (items.length === 0) return null

  return (
    <div>
      {title && <h4 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h4>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            className="h-auto flex-col items-start border-zinc-600 p-3 text-left hover:border-amber-500 hover:bg-amber-500/10"
            onClick={() => onSelect(item)}
          >
            <span className="text-sm font-medium text-foreground">{item.nombre}</span>
            <span className="text-xs text-amber-500">{formatCurrency(item.precio)}</span>
            {item.variantes && item.variantes.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({item.variantes.map(v => v.nombre).join(' / ')})
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}
