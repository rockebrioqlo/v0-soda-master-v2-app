'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent } from '@/components/ui/card'
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
import { Plus, Minus, Trash2, Send, Printer, Percent, ChefHat, Wine, Star, ArrowLeft, Beer, GlassWater, ShoppingCart, X } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Comanda, ItemComanda, Producto, TipoDescuento } from '@/lib/types'
import { ingredientesEstandar, quesosDisponibles, salsasDisponibles } from '@/lib/initial-data'

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────
const MAX_QUESOS = 1
const MAX_INGREDIENTES = 3
const MAX_SALSAS = 2

export function POSPage() {
  const {
    state,
    dispatch,
    posNavigation,
    clearPOSNavigation,
    navigateTo,
    updateMesa,
    crearOrden,
    crearItemOrden,
    crearDescuentoApi,
  } = useApp()
  const { mesas, productos, comandas, usuarioActual, permisosDescuento } = state

  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(posNavigation.mesaId)
  const [currentComanda, setCurrentComanda] = useState<Comanda | null>(null)
  const [activeTab, setActiveTab] = useState('comidas')

  const [showBurgerDialog, setShowBurgerDialog] = useState(false)
  const [selectedBurger, setSelectedBurger] = useState<Producto | null>(null)
  const [burgerQuesos, setBurgerQuesos] = useState<string[]>([])
  const [burgerIngredientes, setBurgerIngredientes] = useState<string[]>([])
  const [burgerSalsas, setBurgerSalsas] = useState<string[]>([])
  const [burgerEspeciales, setBurgerEspeciales] = useState<string[]>([])
  const [burgerNotaEspecial, setBurgerNotaEspecial] = useState('')

  const [showItemDialog, setShowItemDialog] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Producto | null>(null)
  const [itemVariante, setItemVariante] = useState('')
  const [itemNotas, setItemNotas] = useState('')
  const [itemNotaEspecial, setItemNotaEspecial] = useState('')
  const [itemEspeciales, setItemEspeciales] = useState<string[]>([])
  const [itemCantidad, setItemCantidad] = useState(1)

  // Discount dialog
  const [showComandaDrawer, setShowComandaDrawer] = useState(false)
  const [showDescuentoDialog, setShowDescuentoDialog] = useState(false)
  const [descuentoTipo, setDescuentoTipo] = useState<TipoDescuento>('porcentaje')
  const [descuentoValor, setDescuentoValor] = useState('')
  const [descuentoMotivo, setDescuentoMotivo] = useState('')
  const [authPin, setAuthPin] = useState('')

  // Special ingredients from products
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
            tipoPropina: 'porcentaje',
          }
          dispatch({ type: 'ADD_COMANDA', payload: newComanda })
          setCurrentComanda(newComanda)
          // Mark table occupied locally + Neon
          dispatch({ type: 'UPDATE_MESA', payload: { ...mesa, estado: 'ocupada' } })
          updateMesa(mesa.id, { estado: 'ocupada' })
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posNavigation.mesaId, posNavigation.comandaId])

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

  // ─── Product categories ───────────────────────────────
  const burgers         = productos.filter(p => p.categoria === 'burgers')
  const entradas        = productos.filter(p => p.categoria === 'entradas')
  const acompañamientos = productos.filter(p => p.categoria === 'acompañamientos' && !p.esIngredienteEspecial)
  const postres         = productos.filter(p => p.categoria === 'postres')
  const cervezas        = productos.filter(p => p.categoria === 'cervezas')
  const jugosBebidas    = productos.filter(p => p.categoria === 'jugos_bebidas')
  const tragos          = productos.filter(p => p.categoria === 'tragos')

  // ─── Mesa selection ───────────────────────────────────
  const handleSelectMesa = (mesaId: string) => {
    setSelectedMesaId(mesaId)
    const existingComanda = comandas.find(c => c.mesaId === mesaId && c.estado !== 'pagada')
    if (existingComanda) {
      setCurrentComanda(existingComanda)
    } else {
      const mesa = mesas.find(m => m.id === mesaId)
      if (mesa && usuarioActual) {
        const newComanda: Comanda = {
          id: generateId(),
          mesaId,
          mesaNombre: mesa.nombre,
          usuarioId: usuarioActual.id,
          usuarioNombre: usuarioActual.nombre,
          estado: 'pendiente',
          creadoAt: Date.now(),
          items: [],
          descuento: 0,
          tipoDescuento: null,
          propina: 0,
          tipoPropina: 'porcentaje',
        }
        dispatch({ type: 'ADD_COMANDA', payload: newComanda })
        setCurrentComanda(newComanda)
        dispatch({ type: 'UPDATE_MESA', payload: { ...mesa, estado: 'ocupada' } })
        updateMesa(mesa.id, { estado: 'ocupada' })
      }
    }
  }

  // ─── Burger dialog ────────────────────────────────────
  const handleSelectBurger = (burger: Producto) => {
    setSelectedBurger(burger)
    setBurgerQuesos([])
    setBurgerIngredientes([])
    setBurgerSalsas([])
    setBurgerEspeciales([])
    setBurgerNotaEspecial('')
    setShowBurgerDialog(true)
  }

  const toggleQueso = (q: string) => {
    setBurgerQuesos(prev =>
      prev.includes(q) ? prev.filter(x => x !== q) : prev.length < MAX_QUESOS ? [...prev, q] : prev
    )
  }

  const toggleIngrediente = (ing: string) => {
    setBurgerIngredientes(prev =>
      prev.includes(ing) ? prev.filter(x => x !== ing) : prev.length < MAX_INGREDIENTES ? [...prev, ing] : prev
    )
  }

  const toggleSalsa = (s: string) => {
    setBurgerSalsas(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : prev.length < MAX_SALSAS ? [...prev, s] : prev
    )
  }

  const toggleEspecial = (id: string) => {
    setBurgerEspeciales(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleItemEspecial = (id: string) => {
    setItemEspeciales(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const especialesSeleccionados = (ids: string[]) =>
    ids
      .map(id => ingredientesEspeciales.find(i => i.id === id))
      .filter((esp): esp is Producto => Boolean(esp))
      .map(esp => ({
        id: esp.id,
        nombre: esp.nombre,
        costoAdicional: Number(esp.costoAdicional) || 0,
      }))

  const handleConfirmBurger = () => {
    if (!selectedBurger || !currentComanda) return

    const especiales = especialesSeleccionados(burgerEspeciales)
    const costoEspeciales = especiales.reduce((sum, esp) => sum + esp.costoAdicional, 0)

    const allIngredientes = [...burgerQuesos, ...burgerIngredientes]

    const newItem: ItemComanda = {
      id: generateId(),
      productoId: selectedBurger.id,
      productoNombre: selectedBurger.nombre,
      cantidad: 1,
      ingredientesEstandar: allIngredientes,
      ingredientesEspeciales: especiales,
      salsaSeleccionada: burgerSalsas.join(', '),
      notas: '',
      notaEspecial: burgerNotaEspecial,
      precio: selectedBurger.precio + costoEspeciales,
      estado: 'pendiente',
    }

    const updatedComanda: Comanda = { ...currentComanda, items: [...currentComanda.items, newItem] }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setCurrentComanda(updatedComanda)
    setShowBurgerDialog(false)
    showToast(`${selectedBurger.nombre} agregada`, 'success')
  }

  // ─── Generic item dialog ──────────────────────────────
  const handleSelectItem = (item: Producto) => {
    if (item.categoria === 'burgers') {
      handleSelectBurger(item)
      return
    }
    setSelectedItem(item)
    setItemVariante(item.variantes?.[0]?.nombre || '')
    setItemNotas('')
    setItemNotaEspecial('')
    setItemEspeciales([])
    setItemCantidad(1)
    setShowItemDialog(true)
  }

  const handleConfirmItem = () => {
    if (!selectedItem || !currentComanda) return

    const variante = selectedItem.variantes?.find(v => v.nombre === itemVariante)
    const precioBase = variante?.precio || selectedItem.precio
    const especiales = especialesSeleccionados(itemEspeciales)
    const costoEspeciales = especiales.reduce((sum, esp) => sum + esp.costoAdicional, 0)

    const newItem: ItemComanda = {
      id: generateId(),
      productoId: selectedItem.id,
      productoNombre: selectedItem.nombre,
      cantidad: itemCantidad,
      ingredientesEstandar: [],
      ingredientesEspeciales: especiales,
      salsaSeleccionada: '',
      notas: itemNotas,
      notaEspecial: itemNotaEspecial,
      precio: precioBase + costoEspeciales,
      variante: itemVariante || undefined,
      estado: 'pendiente',
    }

    const updatedComanda: Comanda = { ...currentComanda, items: [...currentComanda.items, newItem] }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setCurrentComanda(updatedComanda)
    setShowItemDialog(false)
    showToast(`${selectedItem.nombre} agregado`, 'success')
  }

  const handleRemoveItem = (itemId: string) => {
    if (!currentComanda) return
    const updatedComanda: Comanda = {
      ...currentComanda,
      items: currentComanda.items.filter(i => i.id !== itemId),
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setCurrentComanda(updatedComanda)
  }

  const handleUpdateItemQty = (itemId: string, delta: number) => {
    if (!currentComanda) return
    const updatedComanda: Comanda = {
      ...currentComanda,
      items: currentComanda.items.map(item =>
        item.id === itemId ? { ...item, cantidad: Math.max(1, item.cantidad + delta) } : item
      ),
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setCurrentComanda(updatedComanda)
  }

  // ─── Totals ───────────────────────────────────────────
  const subtotal = currentComanda?.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0) || 0
  const descuentoMonto = (() => {
    if (!currentComanda || !currentComanda.tipoDescuento) return 0
    switch (currentComanda.tipoDescuento) {
      case 'porcentaje':
        return subtotal * (currentComanda.descuento / 100)
      case 'monto_fijo':
      case 'cortesia_parcial':
        return Math.min(currentComanda.descuento || 0, subtotal)
      case 'cortesia_total':
        return subtotal
      default:
        return 0
    }
  })()
  const propinaMonto = currentComanda?.tipoPropina === 'porcentaje'
    ? subtotal * (currentComanda.propina / 100)
    : (currentComanda?.propina || 0)
  const total = subtotal - descuentoMonto + propinaMonto

  // ─── Send to kitchen ──────────────────────────────────
  const handleEnviarCocina = async () => {
    if (!currentComanda || currentComanda.items.length === 0) {
      showToast('Agrega items a la comanda primero', 'error')
      return
    }

    try {
      const ordenData = {
        mesa_id: currentComanda.mesaId,
        usuario_id: usuarioActual?.id,
        estado: 'en_cocina',
        subtotal,
        impuesto: 0,
        total,
        notas: '',
        enviado_a_cocina: true,
      }

      const nuevaOrden = await crearOrden(ordenData)

      if (nuevaOrden) {
        for (const item of currentComanda.items) {
          const metadata = {
            salsa: item.salsaSeleccionada || '',
            notas: item.notas || '',
            notaEspecial: item.notaEspecial || '',
            ingredientesEspeciales: item.ingredientesEspeciales || [],
          }
          await crearItemOrden({
            orden_id: nuevaOrden.id,
            producto_id: item.productoId,
            cantidad: item.cantidad,
            precio_unitario: item.precio,
            modificadores: item.ingredientesEstandar || [],
            notas_especiales: JSON.stringify(metadata),
            estado_item: 'pendiente',
          })
        }

        // Ensure mesa stays occupied
        const mesa = mesas.find(m => m.id === currentComanda.mesaId)
        if (mesa && mesa.estado !== 'ocupada') {
          await updateMesa(mesa.id, { estado: 'ocupada' })
          dispatch({ type: 'UPDATE_MESA', payload: { ...mesa, estado: 'ocupada' } })
        }

        const updatedComanda: Comanda = { ...currentComanda, id: nuevaOrden.id, estado: 'en_cocina' }
        dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
        setCurrentComanda(updatedComanda)
        showToast('Comanda enviada a cocina/bar', 'success')
      }
    } catch (error) {
      console.error('[v0] Error sending to kitchen:', error)
      showToast('Error al enviar a cocina', 'error')
    }
  }

  // ─── Discount ─────────────────────────────────────────
  const permisoActual = usuarioActual ? permisosDescuento[usuarioActual.rol] : null
  const tieneDescuento =
    !!currentComanda && currentComanda.descuento > 0 && !!currentComanda.tipoDescuento
  const valorNumDescuento = Number(descuentoValor)
  const valorEsValido = Number.isFinite(valorNumDescuento) && valorNumDescuento > 0
  const esCortesia = descuentoTipo === 'cortesia_total' || descuentoTipo === 'cortesia_parcial'
  const requiereAdmin = !permisoActual?.puede ||
    (descuentoTipo === 'porcentaje' && valorEsValido && valorNumDescuento > (permisoActual?.limiteMax ?? 0)) ||
    descuentoTipo === 'cortesia_total'

  const handleOpenDescuento = () => {
    if (!usuarioActual) return
    if (tieneDescuento && currentComanda) {
      setDescuentoTipo((currentComanda.tipoDescuento as TipoDescuento) || 'porcentaje')
      setDescuentoValor(String(currentComanda.descuento))
      setDescuentoMotivo(currentComanda.motivoDescuento || '')
    } else {
      setDescuentoTipo('porcentaje')
      setDescuentoValor('')
      setDescuentoMotivo('')
    }
    setAuthPin('')
    setShowDescuentoDialog(true)
  }

  const persistirDescuento = async (
    valor: number,
    tipo: TipoDescuento,
    motivo: string,
    autorizadoPorId?: string | null
  ) => {
    if (!currentComanda || !usuarioActual) return
    const result = await crearDescuentoApi({
      orden_id: currentComanda.id,
      tipo,
      valor,
      motivo,
      autorizado_por: autorizadoPorId || null,
    })
    if (!result) return
    const updatedComanda: Comanda = {
      ...currentComanda,
      descuento: valor,
      tipoDescuento: tipo,
      motivoDescuento: motivo,
      descuentoAplicadoPor: usuarioActual.nombre,
      descuentoAutorizadoPor: autorizadoPorId
        ? state.usuarios.find((u) => u.id === autorizadoPorId)?.nombre
        : undefined,
    }
    dispatch({ type: 'UPDATE_COMANDA', payload: updatedComanda })
    setCurrentComanda(updatedComanda)
    setShowDescuentoDialog(false)
    setAuthPin('')
    showToast('Descuento aplicado', 'success')
  }

  const handleApplyDescuento = async () => {
    if (!currentComanda || !usuarioActual || !permisoActual) return
    if (!valorEsValido) {
      showToast('Ingresa un valor válido', 'error')
      return
    }
    if (descuentoTipo === 'porcentaje' && valorNumDescuento > 100) {
      showToast('El porcentaje no puede superar 100%', 'error')
      return
    }
    if (permisoActual.requiereMotivo && !descuentoMotivo.trim()) {
      showToast('El motivo es requerido', 'error')
      return
    }

    if (!requiereAdmin) {
      await persistirDescuento(valorNumDescuento, descuentoTipo, descuentoMotivo.trim() || '—')
      return
    }

    if (!authPin) {
      showToast('Ingresa el PIN del administrador', 'error')
      return
    }
    const admin = state.usuarios.find((u) => u.rol === 'admin' || u.rol === 'administrador')
    if (!admin?.email) {
      showToast('No hay administrador configurado', 'error')
      return
    }
    try {
      const res = await fetch('/api/auth/verificar-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: admin.email, pin: authPin }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.valido || (data.usuario.rol !== 'admin' && data.usuario.rol !== 'administrador')) {
        showToast('PIN incorrecto', 'error')
        return
      }
      await persistirDescuento(
        valorNumDescuento,
        descuentoTipo,
        descuentoMotivo.trim() || 'Autorizado por administrador',
        data.usuario.id
      )
    } catch {
      showToast('Error de conexión', 'error')
    }
  }

  const handlePrintTicket = () => { showToast('Imprimiendo comanda...', 'info'); window.print() }
  const handleGoToPago = () => { if (!currentComanda) return; navigateTo('pagos') }
  const handleChangeMesa = () => { setSelectedMesaId(null); setCurrentComanda(null); clearPOSNavigation() }

  // ─── Mesa selector ────────────────────────────────────
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
                mesa.estado === 'libre'     && 'border-green-500/50 bg-green-500/5 hover:border-green-500',
                mesa.estado === 'ocupada'   && 'border-red-500/50   bg-red-500/5   hover:border-red-500',
                mesa.estado === 'reservada' && 'border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-500'
              )}
              onClick={() => handleSelectMesa(mesa.id)}
            >
              <CardContent className="flex flex-col items-center justify-center gap-1 p-6">
                <span className="text-xl font-bold text-foreground">{mesa.nombre || `Mesa ${mesa.numero}`}</span>
                <span className="text-xs text-muted-foreground">Cap. {mesa.capacidad}</span>
                <Badge
                  className={cn(
                    'mt-1 capitalize',
                    mesa.estado === 'libre'     && 'bg-green-500 text-white',
                    mesa.estado === 'ocupada'   && 'bg-red-500 text-white',
                    mesa.estado === 'reservada' && 'bg-yellow-500 text-zinc-900'
                  )}
                >
                  {mesa.estado}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ─── Main POS ─────────────────────────────────────────
  const cantidadItems =
    currentComanda?.items.reduce((sum, it) => sum + it.cantidad, 0) || 0

  return (
    <>
      <div className="flex h-[calc(100vh-3.5rem-5rem)] flex-col md:h-[calc(100vh-3.5rem-1.5rem)] md:flex-row gap-4">

        {/* ── Products ── */}
        <div className="flex-1 overflow-auto md:border-r md:border-border p-4">
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

          {/* Mobile tabs */}
          <div className="lg:hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 bg-muted">
                <TabsTrigger value="comidas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">
                  <ChefHat className="mr-2 h-4 w-4" /> Comidas
                </TabsTrigger>
                <TabsTrigger value="bebidas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">
                  <Wine className="mr-2 h-4 w-4" /> Bebidas
                </TabsTrigger>
              </TabsList>
              <TabsContent value="comidas" className="mt-4 space-y-4">
                <ProductSection title="Burgers" items={burgers} onSelect={handleSelectItem} />
                <ProductSection title="Entradas" items={entradas} onSelect={handleSelectItem} />
                <ProductSection title="Acompañamientos" items={acompañamientos} onSelect={handleSelectItem} />
                <ProductSection title="Postres" items={postres} onSelect={handleSelectItem} />
              </TabsContent>
              <TabsContent value="bebidas" className="mt-4 space-y-4">
                <ProductSection title="Cervezas" icon="beer" items={cervezas} onSelect={handleSelectItem} />
                <ProductSection title="Jugos y Bebidas" icon="water" items={jugosBebidas} onSelect={handleSelectItem} />
                <ProductSection title="Tragos" icon="martini" items={tragos} onSelect={handleSelectItem} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop 2-column layout */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-500">
                <ChefHat className="h-5 w-5" /> Comidas
              </h3>
              <ProductSection title="Burgers" items={burgers} onSelect={handleSelectItem} />
              <ProductSection title="Entradas" items={entradas} onSelect={handleSelectItem} />
              <ProductSection title="Acompañamientos" items={acompañamientos} onSelect={handleSelectItem} />
              <ProductSection title="Postres" items={postres} onSelect={handleSelectItem} />
            </div>
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-500">
                <Wine className="h-5 w-5" /> Bebidas
              </h3>
              <ProductSection title="Cervezas" icon="beer" items={cervezas} onSelect={handleSelectItem} />
              <ProductSection title="Jugos y Bebidas" icon="water" items={jugosBebidas} onSelect={handleSelectItem} />
              <ProductSection title="Tragos" icon="martini" items={tragos} onSelect={handleSelectItem} />
            </div>
          </div>
        </div>

        {/* ── Order summary (side panel for md+) ── */}
        <aside className="hidden flex-col bg-muted/30 md:flex md:w-80 lg:w-96">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Resumen de Comanda</h3>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {!currentComanda || currentComanda.items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No hay items en la comanda</p>
            ) : (
              <ul className="space-y-3">
                {currentComanda.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {item.productoNombre}
                          {item.variante && <span className="text-xs text-muted-foreground"> ({item.variante})</span>}
                        </p>
                        {item.ingredientesEstandar.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            + {item.ingredientesEstandar.join(', ')}
                          </p>
                        )}
                        {item.ingredientesEspeciales.length > 0 && (
                          <p className="text-xs text-amber-500 mt-0.5">
                            ⭐ {item.ingredientesEspeciales
                              .map(esp =>
                                esp.costoAdicional > 0
                                  ? `${esp.nombre} (+${formatCurrency(esp.costoAdicional)})`
                                  : esp.nombre
                              )
                              .join(', ')}
                          </p>
                        )}
                        {item.salsaSeleccionada && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Salsas: {item.salsaSeleccionada}
                          </p>
                        )}
                        {item.notas && (
                          <p className="text-xs italic text-muted-foreground mt-0.5">
                            Nota: {item.notas}
                          </p>
                        )}
                        {item.notaEspecial && (
                          <p className="text-xs italic text-amber-500 mt-0.5">
                            📝 {item.notaEspecial}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => handleUpdateItemQty(item.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium text-foreground">{item.cantidad}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => handleUpdateItemQty(item.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(item.precio * item.cantidad)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Totals & actions */}
          <div className="border-t border-border p-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              {(currentComanda?.descuento ?? 0) > 0 && (
                <div className="flex justify-between text-green-500">
                  <span>
                    Descuento{' '}
                    {currentComanda!.tipoDescuento === 'porcentaje'
                      ? `(${currentComanda!.descuento}%)`
                      : currentComanda!.tipoDescuento === 'cortesia_total'
                        ? '(cortesía total)'
                        : currentComanda!.tipoDescuento === 'cortesia_parcial'
                          ? '(cortesía parcial)'
                          : '(fijo)'}
                  </span>
                  <span>-{formatCurrency(descuentoMonto)}</span>
                </div>
              )}
              {(currentComanda?.propina ?? 0) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Propina</span><span>+{formatCurrency(propinaMonto)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" className="border-border"
                onClick={handleOpenDescuento}
                disabled={!currentComanda || currentComanda.items.length === 0}>
                <Percent className="mr-2 h-4 w-4" />
                {tieneDescuento ? 'Editar descuento' : 'Aplicar descuento'}
              </Button>
              <Button variant="outline" className="border-border"
                onClick={handlePrintTicket}
                disabled={!currentComanda || currentComanda.items.length === 0}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                className="bg-amber-500 text-zinc-900 hover:bg-amber-400 font-semibold"
                onClick={handleEnviarCocina}
                disabled={!currentComanda || currentComanda.items.length === 0 || currentComanda.estado !== 'pendiente'}
              >
                <Send className="mr-2 h-4 w-4" /> Enviar
              </Button>
              <Button
                className="bg-green-600 text-white hover:bg-green-500 font-semibold"
                onClick={handleGoToPago}
                disabled={!currentComanda || currentComanda.items.length === 0}
              >
                Ir a Pago
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Mobile "Ver comanda" FAB ── */}
      {cantidadItems > 0 && !showComandaDrawer && (
        <button
          type="button"
          onClick={() => setShowComandaDrawer(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-sm font-bold text-zinc-900 shadow-xl shadow-amber-500/30 hover:bg-amber-400 md:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
        >
          <ShoppingCart className="h-4 w-4" />
          Ver comanda ({cantidadItems})
          {total > 0 && (
            <span className="ml-1 rounded-full bg-zinc-900/15 px-2 py-0.5 text-xs">
              {formatCurrency(total)}
            </span>
          )}
        </button>
      )}

      {/* ── Mobile order drawer ── */}
      {showComandaDrawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowComandaDrawer(false)}
          />
          <aside
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl"
            style={{ height: '85vh' }}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Resumen de Comanda</h3>
              <button
                type="button"
                onClick={() => setShowComandaDrawer(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 p-4">
              {!currentComanda || currentComanda.items.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No hay items en la comanda
                </p>
              ) : (
                <ul className="space-y-3">
                  {currentComanda.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {item.productoNombre}
                            {item.variante && (
                              <span className="text-xs text-muted-foreground">
                                {' '}({item.variante})
                              </span>
                            )}
                          </p>
                          {item.ingredientesEstandar.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              + {item.ingredientesEstandar.join(', ')}
                            </p>
                          )}
                          {item.ingredientesEspeciales.length > 0 && (
                            <p className="mt-0.5 text-xs text-amber-500">
                              ⭐{' '}
                              {item.ingredientesEspeciales
                                .map((esp) =>
                                  esp.costoAdicional > 0
                                    ? `${esp.nombre} (+${formatCurrency(esp.costoAdicional)})`
                                    : esp.nombre
                                )
                                .join(', ')}
                            </p>
                          )}
                          {item.salsaSeleccionada && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Salsas: {item.salsaSeleccionada}
                            </p>
                          )}
                          {item.notas && (
                            <p className="mt-0.5 text-xs italic text-muted-foreground">
                              Nota: {item.notas}
                            </p>
                          )}
                          {item.notaEspecial && (
                            <p className="mt-0.5 text-xs italic text-amber-500">
                              📝 {item.notaEspecial}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
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
                            className="h-9 w-9"
                            onClick={() => handleUpdateItemQty(item.id, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-6 text-center text-base font-medium text-foreground">
                            {item.cantidad}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleUpdateItemQty(item.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.precio * item.cantidad)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className="border-t border-border bg-card p-4"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {(currentComanda?.descuento ?? 0) > 0 && (
                  <div className="flex justify-between text-green-500">
                    <span>
                      Descuento{' '}
                      {currentComanda!.tipoDescuento === 'porcentaje'
                        ? `(${currentComanda!.descuento}%)`
                        : currentComanda!.tipoDescuento === 'cortesia_total'
                          ? '(cortesía total)'
                          : currentComanda!.tipoDescuento === 'cortesia_parcial'
                            ? '(cortesía parcial)'
                            : '(fijo)'}
                    </span>
                    <span>-{formatCurrency(descuentoMonto)}</span>
                  </div>
                )}
                {(currentComanda?.propina ?? 0) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Propina</span>
                    <span>+{formatCurrency(propinaMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-lg font-bold text-foreground">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="min-h-[48px] border-border"
                  onClick={handleOpenDescuento}
                  disabled={!currentComanda || currentComanda.items.length === 0}
                >
                  <Percent className="mr-2 h-4 w-4" />
                  {tieneDescuento ? 'Editar' : 'Descuento'}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[48px] border-border"
                  onClick={handlePrintTicket}
                  disabled={!currentComanda || currentComanda.items.length === 0}
                >
                  <Printer className="mr-2 h-4 w-4" /> Imprimir
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  className="min-h-[56px] bg-amber-500 font-semibold text-zinc-900 hover:bg-amber-400"
                  onClick={() => {
                    handleEnviarCocina()
                    setShowComandaDrawer(false)
                  }}
                  disabled={
                    !currentComanda ||
                    currentComanda.items.length === 0 ||
                    currentComanda.estado !== 'pendiente'
                  }
                >
                  <Send className="mr-2 h-4 w-4" /> Enviar
                </Button>
                <Button
                  className="min-h-[56px] bg-green-600 font-semibold text-white hover:bg-green-500"
                  onClick={() => {
                    handleGoToPago()
                    setShowComandaDrawer(false)
                  }}
                  disabled={!currentComanda || currentComanda.items.length === 0}
                >
                  Ir a Pago
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Burger dialog ── */}
      <Dialog open={showBurgerDialog} onOpenChange={setShowBurgerDialog}>
        <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Personalizar {selectedBurger?.nombre}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Price tag */}
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio base:</span>
                <span className="font-semibold text-foreground">{formatCurrency(selectedBurger?.precio || 0)}</span>
              </div>
            </div>

            {/* QUESOS */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Quesos
                </h4>
                <span className="text-xs text-muted-foreground">{burgerQuesos.length}/{MAX_QUESOS} elegido</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quesosDisponibles.map(q => (
                  <ToggleChip
                    key={q}
                    label={q}
                    selected={burgerQuesos.includes(q)}
                    disabled={burgerQuesos.length >= MAX_QUESOS && !burgerQuesos.includes(q)}
                    onToggle={() => toggleQueso(q)}
                  />
                ))}
              </div>
            </div>

            {/* INGREDIENTES */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Ingredientes
                </h4>
                <span className="text-xs text-muted-foreground">{burgerIngredientes.length}/{MAX_INGREDIENTES} elegidos</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ingredientesEstandar.map(ing => (
                  <ToggleChip
                    key={ing}
                    label={ing}
                    selected={burgerIngredientes.includes(ing)}
                    disabled={burgerIngredientes.length >= MAX_INGREDIENTES && !burgerIngredientes.includes(ing)}
                    onToggle={() => toggleIngrediente(ing)}
                  />
                ))}
              </div>
            </div>

            {/* SALSAS */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Salsas
                </h4>
                <span className="text-xs text-muted-foreground">{burgerSalsas.length}/{MAX_SALSAS} elegidas</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {salsasDisponibles.map(s => (
                  <ToggleChip
                    key={s}
                    label={s}
                    selected={burgerSalsas.includes(s)}
                    disabled={burgerSalsas.length >= MAX_SALSAS && !burgerSalsas.includes(s)}
                    onToggle={() => toggleSalsa(s)}
                  />
                ))}
              </div>
            </div>

            {ingredientesEspeciales.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-amber-500">
                  <Star className="h-4 w-4" /> Ingredientes Especiales
                </h4>
                <p className="mb-2 text-xs text-muted-foreground">
                  Sin límite. No cuentan para los 3 ingredientes estándar.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ingredientesEspeciales.map(esp => (
                    <Badge
                      key={esp.id}
                      variant={burgerEspeciales.includes(esp.id) ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer py-1.5 px-3',
                        burgerEspeciales.includes(esp.id)
                          ? 'bg-amber-500 text-zinc-900 hover:bg-amber-400'
                          : 'border-border hover:border-amber-500 text-foreground'
                      )}
                      onClick={() => toggleEspecial(esp.id)}
                    >
                      {esp.nombre}
                      {esp.costoAdicional > 0 && (
                        <span className="ml-1 font-semibold">
                          + {formatCurrency(esp.costoAdicional)}
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-amber-500">
                📝 Nota especial
              </label>
              <Textarea
                value={burgerNotaEspecial}
                onChange={(e) => setBurgerNotaEspecial(e.target.value)}
                placeholder="Sin sal, bien cocida, sin gluten..."
                className="border-border bg-muted"
                rows={2}
              />
            </div>

            {burgerEspeciales.length > 0 && (
              <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Precio base</span>
                  <span>{formatCurrency(selectedBurger?.precio || 0)}</span>
                </div>
                <div className="flex justify-between text-amber-500">
                  <span>Especiales</span>
                  <span>
                    +{formatCurrency(
                      burgerEspeciales.reduce((sum, id) => {
                        const esp = ingredientesEspeciales.find(i => i.id === id)
                        return sum + (Number(esp?.costoAdicional) || 0)
                      }, 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-bold text-foreground">
                  <span>Total ítem</span>
                  <span>
                    {formatCurrency(
                      (selectedBurger?.precio || 0) +
                        burgerEspeciales.reduce((sum, id) => {
                          const esp = ingredientesEspeciales.find(i => i.id === id)
                          return sum + (Number(esp?.costoAdicional) || 0)
                        }, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBurgerDialog(false)}>Cancelar</Button>
            <Button onClick={handleConfirmBurger} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generic item dialog ── */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent aria-describedby={undefined} className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Agregar {selectedItem?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedItem?.variantes && selectedItem.variantes.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Tamaño / Variante</label>
                <Select value={itemVariante} onValueChange={setItemVariante}>
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedItem.variantes.map(v => (
                      <SelectItem key={v.nombre} value={v.nombre}>
                        {v.nombre} — {formatCurrency(v.precio)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Cantidad</label>
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setItemCantidad(Math.max(1, itemCantidad - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xl font-bold text-foreground">{itemCantidad}</span>
                <Button variant="outline" size="icon" onClick={() => setItemCantidad(itemCantidad + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Notas</label>
              <Textarea
                value={itemNotas}
                onChange={(e) => setItemNotas(e.target.value)}
                placeholder="Ej: sin hielo, con limón..."
                className="border-border bg-muted"
                rows={2}
              />
            </div>

            {ingredientesEspeciales.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-amber-500">
                  <Star className="h-4 w-4" /> Ingredientes Especiales
                </h4>
                <div className="flex flex-wrap gap-2">
                  {ingredientesEspeciales.map(esp => (
                    <Badge
                      key={esp.id}
                      variant={itemEspeciales.includes(esp.id) ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer py-1.5 px-3',
                        itemEspeciales.includes(esp.id)
                          ? 'bg-amber-500 text-zinc-900 hover:bg-amber-400'
                          : 'border-border hover:border-amber-500 text-foreground'
                      )}
                      onClick={() => toggleItemEspecial(esp.id)}
                    >
                      {esp.nombre}
                      {esp.costoAdicional > 0 && (
                        <span className="ml-1 font-semibold">
                          + {formatCurrency(esp.costoAdicional)}
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-amber-500">
                📝 Nota especial
              </label>
              <Textarea
                value={itemNotaEspecial}
                onChange={(e) => setItemNotaEspecial(e.target.value)}
                placeholder="Sin sal, bien cocida, sin gluten..."
                className="border-border bg-muted"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancelar</Button>
            <Button onClick={handleConfirmItem} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Discount dialog ── */}
      <Dialog open={showDescuentoDialog} onOpenChange={setShowDescuentoDialog}>
        <DialogContent aria-describedby={undefined} className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {tieneDescuento ? 'Editar descuento' : 'Aplicar descuento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {permisoActual && !permisoActual.puede && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
                Tu rol no puede aplicar descuentos. Necesitas autorización del administrador.
              </div>
            )}
            {permisoActual?.puede && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                Tu límite como <span className="font-semibold text-foreground">{usuarioActual?.rol}</span>:{' '}
                <span className="font-semibold text-foreground">{permisoActual.limiteMax}%</span>. Si superas el límite o aplicas cortesía total se requerirá PIN del admin.
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Tipo</label>
              <Select value={descuentoTipo} onValueChange={(v) => setDescuentoTipo(v as TipoDescuento)}>
                <SelectTrigger className="border-border bg-muted"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                  <SelectItem value="monto_fijo">Monto fijo ($)</SelectItem>
                  <SelectItem value="cortesia_parcial">Cortesía parcial</SelectItem>
                  <SelectItem value="cortesia_total">Cortesía total</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {descuentoTipo !== 'cortesia_total' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Valor {descuentoTipo === 'porcentaje' ? '(%)' : '($)'}
                </label>
                <Input
                  type="number"
                  value={descuentoValor}
                  onChange={(e) => setDescuentoValor(e.target.value)}
                  placeholder={descuentoTipo === 'porcentaje' ? 'Ej: 10' : 'Ej: 1000'}
                  className="border-border bg-muted"
                  min={0}
                  max={descuentoTipo === 'porcentaje' ? 100 : undefined}
                />
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Motivo {(esCortesia || permisoActual?.requiereMotivo || requiereAdmin) && <span className="text-red-400">*</span>}
              </label>
              <Textarea
                value={descuentoMotivo}
                onChange={(e) => setDescuentoMotivo(e.target.value)}
                placeholder="Motivo del descuento..."
                className="border-border bg-muted"
              />
            </div>
            {requiereAdmin && valorEsValido && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3">
                <p className="mb-2 text-sm font-medium text-red-200">
                  Requiere autorización del administrador
                </p>
                <Input
                  type="password"
                  value={authPin}
                  onChange={(e) => setAuthPin(e.target.value)}
                  placeholder="PIN del administrador"
                  className="border-border bg-muted"
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyDescuento()}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDescuentoDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleApplyDescuento}
              className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
            >
              {requiereAdmin ? 'Verificar y aplicar' : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─────────────────────────────────────────────────────────
// ToggleChip: selectable ingredient / salsa chip
// ─────────────────────────────────────────────────────────
function ToggleChip({
  label, selected, disabled, onToggle
}: { label: string; selected: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        selected
          ? 'border-amber-500 bg-amber-500/15 text-foreground font-medium'
          : 'border-border text-muted-foreground hover:border-muted-foreground',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <Checkbox checked={selected} disabled={disabled} className="pointer-events-none h-4 w-4 shrink-0" />
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// ProductSection
// ─────────────────────────────────────────────────────────
function ProductSection({
  title,
  items,
  onSelect,
  icon,
}: {
  title: string
  items: Producto[]
  onSelect: (item: Producto) => void
  icon?: 'beer' | 'water' | 'martini'
}) {
  if (items.length === 0) return null

  const iconMap = {
    beer: <Beer className="h-4 w-4" />,
    water: <GlassWater className="h-4 w-4" />,
    martini: <Wine className="h-4 w-4" />,
  }

  return (
    <div>
      {title && (
        <div className="mb-2 flex items-center gap-2">
          {icon && <span className="text-amber-500">{iconMap[icon]}</span>}
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            className="h-auto min-h-[64px] md:min-h-[72px] flex-col items-start justify-start border-border p-3 text-left hover:border-amber-500 hover:bg-amber-500/10"
            onClick={() => onSelect(item)}
          >
            <span className="w-full text-sm font-medium leading-tight text-foreground md:text-base">
              {item.nombre}
            </span>
            <span className="mt-1 text-sm font-semibold text-amber-500">{formatCurrency(item.precio)}</span>
            {item.variantes && item.variantes.length > 0 && (
              <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                {item.variantes.map(v => v.nombre).join(' / ')}
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}
