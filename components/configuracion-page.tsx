"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  Store, 
  Printer, 
  Bell, 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit,
  Save,
  MapPin
} from "lucide-react"
import { Mesa } from "@/lib/types"
import { showToast } from "@/components/toast"
import { PrintPreviewDialog } from "@/components/print-preview-dialog"
import {
  DEFAULT_PRINT_CONFIG,
  FUENTES_DISPONIBLES,
  PRESET_ANCHOS_MM,
  buildTicketHtml,
  normalizePrintConfig,
  type TicketData,
  type TicketPrintConfig,
} from "@/lib/print-ticket"

export function ConfiguracionPage() {
  const {
    state,
    updateMesa,
    crearMesaApi,
    eliminarMesaApi,
    cargarConfiguracion,
    guardarConfiguracion,
    guardarPermisosDescuento,
  } = useApp()
  const { mesas, usuarioActual } = state
  const esAdmin = usuarioActual?.rol === 'admin' || usuarioActual?.rol === 'administrador'
  const [businessName, setBusinessName] = useState("Soda Master")
  const [businessAddress, setBusinessAddress] = useState("San Jose, Costa Rica")
  const [businessPhone, setBusinessPhone] = useState("+506 8888-8888")
  const [currency, setCurrency] = useState("CLP")
  const [taxRate, setTaxRate] = useState("13")
  const [enableTax, setEnableTax] = useState(true)
  const [enableTips, setEnableTips] = useState(true)
  const [defaultTip, setDefaultTip] = useState("10")
  const [printerEnabled, setPrinterEnabled] = useState(false)
  const [printerIP, setPrinterIP] = useState("")
  const [printAnchoMm, setPrintAnchoMm] = useState(String(DEFAULT_PRINT_CONFIG.ancho_mm))
  const [printFuente, setPrintFuente] = useState(DEFAULT_PRINT_CONFIG.fuente)
  const [printTamanoPt, setPrintTamanoPt] = useState(String(DEFAULT_PRINT_CONFIG.tamano_fuente_pt))
  const [printMargenMm, setPrintMargenMm] = useState(String(DEFAULT_PRINT_CONFIG.margen_mm))
  const [printEncabezado, setPrintEncabezado] = useState(DEFAULT_PRINT_CONFIG.encabezado)
  const [printPie, setPrintPie] = useState(DEFAULT_PRINT_CONFIG.pie)
  const [printMostrarLogo, setPrintMostrarLogo] = useState(DEFAULT_PRINT_CONFIG.mostrar_logo)
  const [printCopiasAuto, setPrintCopiasAuto] = useState(true)
  const [showPrintTestDialog, setShowPrintTestDialog] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [kdsAutoComplete, setKdsAutoComplete] = useState(false)
  const [kdsAutoCompleteTime, setKdsAutoCompleteTime] = useState("30")

  type PermisoRow = { rol: string; puede_aplicar: boolean; limite_maximo: number; requiere_motivo: boolean }
  const [permisosForm, setPermisosForm] = useState<PermisoRow[]>([])
  const [permisosLoading, setPermisosLoading] = useState(false)
  const [permisosSaving, setPermisosSaving] = useState(false)

  useEffect(() => {
    if (!esAdmin) return
    setPermisosLoading(true)
    fetch('/api/permisos-descuento')
      .then(r => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const filtrados = data
            .map((p: any) => ({
              rol: String(p.rol),
              puede_aplicar: !!p.puede_aplicar,
              limite_maximo: Number(p.limite_maximo) || 0,
              requiere_motivo: !!p.requiere_motivo,
            }))
            .sort((a, b) => a.rol.localeCompare(b.rol))
          setPermisosForm(filtrados)
        }
      })
      .catch(() => {})
      .finally(() => setPermisosLoading(false))
  }, [esAdmin])

  const handleSavePermisos = async () => {
    setPermisosSaving(true)
    const ok = await guardarPermisosDescuento(permisosForm)
    setPermisosSaving(false)
    if (ok) showToast('Permisos de descuento actualizados', 'success')
  }

  const updatePermisoField = (rol: string, field: keyof PermisoRow, value: any) => {
    setPermisosForm(prev => prev.map(p => p.rol === rol ? { ...p, [field]: value } : p))
  }

  const formatRol = (rol: string) =>
    ({ admin: 'Administrador', administrador: 'Administrador', cajero: 'Cajero', mesero: 'Mesero', cocina: 'Cocina', bar: 'Bar' } as Record<string, string>)[rol] || rol

  useEffect(() => {
    (async () => {
      const config = await cargarConfiguracion()
      if (!config || typeof config !== 'object') return
      if (config.nombre_negocio !== undefined) setBusinessName(String(config.nombre_negocio))
      if (config.direccion !== undefined) setBusinessAddress(String(config.direccion))
      if (config.telefono !== undefined) setBusinessPhone(String(config.telefono))
      setCurrency('CLP')
      if (config.tasa_impuesto !== undefined) setTaxRate(String(config.tasa_impuesto))
      if (config.impuesto_habilitado !== undefined) setEnableTax(!!config.impuesto_habilitado)
      if (config.propinas_habilitadas !== undefined) setEnableTips(!!config.propinas_habilitadas)
      if (config.propina_default !== undefined) setDefaultTip(String(config.propina_default))
      if (config.impresora_habilitada !== undefined) setPrinterEnabled(!!config.impresora_habilitada)
      if (config.impresora_ip !== undefined) setPrinterIP(String(config.impresora_ip))
      if (config.impresora_ancho_mm !== undefined) setPrintAnchoMm(String(config.impresora_ancho_mm))
      if (config.impresora_fuente !== undefined) setPrintFuente(String(config.impresora_fuente))
      if (config.impresora_tamano_fuente_pt !== undefined)
        setPrintTamanoPt(String(config.impresora_tamano_fuente_pt))
      if (config.impresora_margen_mm !== undefined) setPrintMargenMm(String(config.impresora_margen_mm))
      if (config.impresora_encabezado !== undefined) setPrintEncabezado(String(config.impresora_encabezado))
      if (config.impresora_pie !== undefined) setPrintPie(String(config.impresora_pie))
      if (config.impresora_mostrar_logo !== undefined) setPrintMostrarLogo(!!config.impresora_mostrar_logo)
      if (config.impresora_copias_auto !== undefined) setPrintCopiasAuto(!!config.impresora_copias_auto)
      if (config.notificaciones_habilitadas !== undefined)
        setNotificationsEnabled(!!config.notificaciones_habilitadas)
      if (config.sonido_habilitado !== undefined) setSoundEnabled(!!config.sonido_habilitado)
      if (config.kds_auto_completar !== undefined) setKdsAutoComplete(!!config.kds_auto_completar)
      if (config.kds_tiempo_auto_completar !== undefined)
        setKdsAutoCompleteTime(String(config.kds_tiempo_auto_completar))
    })()
  }, [cargarConfiguracion])

  // Table management
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [editingTable, setEditingTable] = useState<Mesa | null>(null)
  const [tableForm, setTableForm] = useState({
    nombre: "",
    capacidad: 4,
    area: "Interior",
  })

  const handleSaveSettings = async () => {
    const ok = await guardarConfiguracion({
      nombre_negocio: businessName,
      direccion: businessAddress,
      telefono: businessPhone,
      moneda: currency,
      tasa_impuesto: Number(taxRate) || 0,
      impuesto_habilitado: enableTax,
      propinas_habilitadas: enableTips,
      propina_default: Number(defaultTip) || 0,
      impresora_habilitada: printerEnabled,
      impresora_ip: printerIP,
      impresora_ancho_mm: Number(printAnchoMm) || DEFAULT_PRINT_CONFIG.ancho_mm,
      impresora_fuente: printFuente,
      impresora_tamano_fuente_pt: Number(printTamanoPt) || DEFAULT_PRINT_CONFIG.tamano_fuente_pt,
      impresora_margen_mm: Number(printMargenMm) || DEFAULT_PRINT_CONFIG.margen_mm,
      impresora_encabezado: printEncabezado,
      impresora_pie: printPie,
      impresora_mostrar_logo: printMostrarLogo,
      impresora_copias_auto: printCopiasAuto,
      notificaciones_habilitadas: notificationsEnabled,
      sonido_habilitado: soundEnabled,
      kds_auto_completar: kdsAutoComplete,
      kds_tiempo_auto_completar: Number(kdsAutoCompleteTime) || 0,
    })
    if (ok) {
      showToast("Configuracion guardada exitosamente", "success")
    } else {
      showToast("Error al guardar la configuracion", "error")
    }
  }

  const handleAddTable = async () => {
    if (!tableForm.nombre.trim()) {
      showToast("El nombre de la mesa es requerido", "error")
      return
    }

    try {
      if (editingTable) {
        await updateMesa(editingTable.id, {
          capacidad: tableForm.capacidad,
          area: tableForm.area,
        })
        showToast("Mesa actualizada", "success")
      } else {
        await crearMesaApi({
          nombre: tableForm.nombre,
          capacidad: tableForm.capacidad,
          area: tableForm.area,
          estado: "libre",
        })
        showToast("Mesa agregada", "success")
      }

      setTableForm({ nombre: "", capacidad: 4, area: "Interior" })
      setEditingTable(null)
      setShowTableDialog(false)
    } catch (error: any) {
      showToast(error?.message || "Error al guardar mesa", "error")
    }
  }

  const handleEditTable = (mesa: Mesa) => {
    setEditingTable(mesa)
    setTableForm({
      nombre: mesa.nombre,
      capacidad: mesa.capacidad,
      area: mesa.area || "Interior",
    })
    setShowTableDialog(true)
  }

  const handleDeleteTable = async (mesaId: string) => {
    const mesa = mesas.find((m) => m.id === mesaId)
    if (mesa?.estado === "ocupada") {
      showToast("No se puede eliminar una mesa ocupada", "error")
      return
    }
    try {
      await eliminarMesaApi(mesaId)
      showToast("Mesa eliminada", "success")
    } catch (error: any) {
      showToast(error?.message || "Error al eliminar mesa", "error")
    }
  }

  const areas = [...new Set(mesas.map((m) => m.area || "Interior"))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Configuracion</h1>
        <Button onClick={handleSaveSettings}>
          <Save className="mr-2 h-4 w-4" />
          Guardar Cambios
        </Button>
      </div>

      <Tabs defaultValue="negocio" className="space-y-4">
        <TabsList className={`grid w-full ${esAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
          <TabsTrigger value="negocio">Negocio</TabsTrigger>
          <TabsTrigger value="mesas">Mesas</TabsTrigger>
          <TabsTrigger value="impresion">Impresion</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
          {esAdmin && <TabsTrigger value="descuentos">Descuentos</TabsTrigger>}
        </TabsList>

        <TabsContent value="negocio">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Informacion del Negocio
              </CardTitle>
              <CardDescription>
                Configura la informacion basica de tu restaurante
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Nombre del Negocio</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessPhone">Telefono</Label>
                  <Input
                    id="businessPhone"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessAddress">Direccion</Label>
                <div className="flex gap-2">
                  <MapPin className="mt-2.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="businessAddress"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency">Moneda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLP">Pesos chilenos (CLP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">Tasa de Impuesto (%)</Label>
                  <Input
                    id="taxRate"
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    disabled={!enableTax}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Habilitar Impuestos</Label>
                  <p className="text-sm text-muted-foreground">
                    Aplicar impuestos a las ventas
                  </p>
                </div>
                <Switch checked={enableTax} onCheckedChange={setEnableTax} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mesas">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gestion de Mesas</CardTitle>
                  <CardDescription>
                    Administra las mesas de tu restaurante
                  </CardDescription>
                </div>
                <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
                  <DialogTrigger asChild>
                    <Button
                      onClick={() => {
                        setEditingTable(null)
                        setTableForm({ nombre: "", capacidad: 4, area: "Interior" })
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar Mesa
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingTable ? "Editar Mesa" : "Nueva Mesa"}
                      </DialogTitle>
                      <DialogDescription>
                        {editingTable
                          ? "Modifica los datos de la mesa"
                          : "Agrega una nueva mesa al sistema"}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="tableName">Nombre de la Mesa</Label>
                        <Input
                          id="tableName"
                          placeholder="Ej: Mesa 1"
                          value={tableForm.nombre}
                          onChange={(e) =>
                            setTableForm({ ...tableForm, nombre: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tableCapacity">Capacidad</Label>
                        <Input
                          id="tableCapacity"
                          type="number"
                          min={1}
                          max={20}
                          value={tableForm.capacidad}
                          onChange={(e) =>
                            setTableForm({
                              ...tableForm,
                              capacidad: parseInt(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tableArea">Area</Label>
                        <Select
                          value={tableForm.area}
                          onValueChange={(v) => setTableForm({ ...tableForm, area: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Interior">Interior</SelectItem>
                            <SelectItem value="Terraza">Terraza</SelectItem>
                            <SelectItem value="Barra">Barra</SelectItem>
                            <SelectItem value="VIP">VIP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowTableDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddTable}>
                        {editingTable ? "Guardar" : "Agregar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {areas.map((area) => (
                  <div key={area}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {area}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {mesas
                        .filter((m) => (m.area || "Interior") === area)
                        .map((mesa) => (
                          <div
                            key={mesa.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div>
                              <p className="font-medium">{mesa.nombre}</p>
                              <p className="text-sm text-muted-foreground">
                                {mesa.capacidad} personas
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditTable(mesa)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteTable(mesa.id)}
                                disabled={mesa.estado === "ocupada"}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impresion">
          <PrintTab
            businessName={businessName}
            printerEnabled={printerEnabled}
            setPrinterEnabled={setPrinterEnabled}
            printerIP={printerIP}
            setPrinterIP={setPrinterIP}
            anchoMm={printAnchoMm}
            setAnchoMm={setPrintAnchoMm}
            fuente={printFuente}
            setFuente={setPrintFuente}
            tamanoPt={printTamanoPt}
            setTamanoPt={setPrintTamanoPt}
            margenMm={printMargenMm}
            setMargenMm={setPrintMargenMm}
            encabezado={printEncabezado}
            setEncabezado={setPrintEncabezado}
            pie={printPie}
            setPie={setPrintPie}
            mostrarLogo={printMostrarLogo}
            setMostrarLogo={setPrintMostrarLogo}
            copiasAuto={printCopiasAuto}
            setCopiasAuto={setPrintCopiasAuto}
            onTestPrint={() => setShowPrintTestDialog(true)}
          />
        </TabsContent>

        <TabsContent value="pagos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Configuracion de Pagos
              </CardTitle>
              <CardDescription>
                Configura las opciones de pago y propinas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Habilitar Propinas</Label>
                  <p className="text-sm text-muted-foreground">
                    Permitir agregar propinas en el cobro
                  </p>
                </div>
                <Switch checked={enableTips} onCheckedChange={setEnableTips} />
              </div>
              {enableTips && (
                <div className="space-y-2">
                  <Label htmlFor="defaultTip">Propina Sugerida (%)</Label>
                  <Input
                    id="defaultTip"
                    type="number"
                    value={defaultTip}
                    onChange={(e) => setDefaultTip(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Metodos de Pago Aceptados</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Efectivo</span>
                    <Switch defaultChecked disabled />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Tarjeta (Transbank)</span>
                    <Switch defaultChecked disabled />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificaciones">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones
              </CardTitle>
              <CardDescription>
                Configura las alertas y notificaciones del sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Notificaciones del Sistema</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibir alertas de ordenes y eventos
                  </p>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Sonidos</Label>
                  <p className="text-sm text-muted-foreground">
                    Reproducir sonidos en nuevas ordenes
                  </p>
                </div>
                <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Auto-completar en KDS</Label>
                  <p className="text-sm text-muted-foreground">
                    Marcar ordenes como listas automaticamente
                  </p>
                </div>
                <Switch checked={kdsAutoComplete} onCheckedChange={setKdsAutoComplete} />
              </div>
              {kdsAutoComplete && (
                <div className="space-y-2">
                  <Label htmlFor="kdsAutoCompleteTime">
                    Tiempo para auto-completar (minutos)
                  </Label>
                  <Input
                    id="kdsAutoCompleteTime"
                    type="number"
                    value={kdsAutoCompleteTime}
                    onChange={(e) => setKdsAutoCompleteTime(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {esAdmin && (
          <TabsContent value="descuentos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Permisos de Descuento
                </CardTitle>
                <CardDescription>
                  Configura qué roles pueden aplicar descuentos y su límite máximo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {permisosLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                ) : permisosForm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin permisos configurados</p>
                ) : (
                  <div className="space-y-4">
                    {permisosForm.map((p) => {
                      const esRolAdmin = p.rol === 'admin' || p.rol === 'administrador'
                      return (
                        <div
                          key={p.rol}
                          className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-foreground">{formatRol(p.rol)}</h4>
                            {esRolAdmin && (
                              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                                Acceso total (no editable)
                              </span>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                              <Label htmlFor={`puede-${p.rol}`} className="text-sm">
                                Puede aplicar descuentos
                              </Label>
                              <Switch
                                id={`puede-${p.rol}`}
                                checked={p.puede_aplicar}
                                disabled={esRolAdmin}
                                onCheckedChange={(v) =>
                                  updatePermisoField(p.rol, 'puede_aplicar', !!v)
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`limite-${p.rol}`} className="text-sm">
                                Límite máximo (%)
                              </Label>
                              <Input
                                id={`limite-${p.rol}`}
                                type="number"
                                min={0}
                                max={100}
                                disabled={esRolAdmin || !p.puede_aplicar}
                                value={p.limite_maximo}
                                onChange={(e) =>
                                  updatePermisoField(
                                    p.rol,
                                    'limite_maximo',
                                    Math.max(0, Math.min(100, Number(e.target.value) || 0))
                                  )
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                              <Label htmlFor={`motivo-${p.rol}`} className="text-sm">
                                Requiere motivo
                              </Label>
                              <Switch
                                id={`motivo-${p.rol}`}
                                checked={p.requiere_motivo}
                                disabled={esRolAdmin}
                                onCheckedChange={(v) =>
                                  updatePermisoField(p.rol, 'requiere_motivo', !!v)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex justify-end">
                      <Button onClick={handleSavePermisos} disabled={permisosSaving}>
                        <Save className="mr-2 h-4 w-4" />
                        {permisosSaving ? 'Guardando...' : 'Guardar permisos'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <PrintPreviewDialog
        open={showPrintTestDialog}
        onOpenChange={setShowPrintTestDialog}
        data={buildSampleTicket(businessName)}
        config={{
          ancho_mm: Number(printAnchoMm) || DEFAULT_PRINT_CONFIG.ancho_mm,
          fuente: printFuente,
          tamano_fuente_pt: Number(printTamanoPt) || DEFAULT_PRINT_CONFIG.tamano_fuente_pt,
          margen_mm: Number(printMargenMm) || DEFAULT_PRINT_CONFIG.margen_mm,
          encabezado: printEncabezado,
          pie: printPie,
          mostrar_logo: printMostrarLogo,
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Ticket de ejemplo para preview / impresión de prueba
// ─────────────────────────────────────────────────────────
function buildSampleTicket(businessName: string): TicketData {
  return {
    tipo: 'boleta',
    nombre_negocio: businessName || 'Soda Master',
    mesa: 'Mesa 5',
    atendido_por: 'María',
    fecha: Date.now(),
    metodo_pago: 'efectivo',
    items: [
      { cantidad: 2, nombre: 'Burger Clásica', precio_unitario: 5500 },
      { cantidad: 1, nombre: 'Papas Fritas', variante: 'grande', precio_unitario: 3200 },
      { cantidad: 2, nombre: 'Cerveza Rubia', precio_unitario: 3000 },
    ],
    totales: {
      subtotal: 20200,
      descuento: 1000,
      descuento_label: 'Descuento (5%)',
      impuesto: 1900,
      impuesto_label: 'Impuesto (10%)',
      propina: 2020,
      total: 23120,
      pagado: 25000,
      vuelto: 1880,
    },
  }
}

// ─────────────────────────────────────────────────────────
// PrintTab: tab de Impresión con personalización + preview
// ─────────────────────────────────────────────────────────
interface PrintTabProps {
  businessName: string
  printerEnabled: boolean
  setPrinterEnabled: (v: boolean) => void
  printerIP: string
  setPrinterIP: (v: string) => void
  anchoMm: string
  setAnchoMm: (v: string) => void
  fuente: string
  setFuente: (v: string) => void
  tamanoPt: string
  setTamanoPt: (v: string) => void
  margenMm: string
  setMargenMm: (v: string) => void
  encabezado: string
  setEncabezado: (v: string) => void
  pie: string
  setPie: (v: string) => void
  mostrarLogo: boolean
  setMostrarLogo: (v: boolean) => void
  copiasAuto: boolean
  setCopiasAuto: (v: boolean) => void
  onTestPrint: () => void
}

function PrintTab(props: PrintTabProps) {
  const {
    businessName,
    printerEnabled,
    setPrinterEnabled,
    printerIP,
    setPrinterIP,
    anchoMm,
    setAnchoMm,
    fuente,
    setFuente,
    tamanoPt,
    setTamanoPt,
    margenMm,
    setMargenMm,
    encabezado,
    setEncabezado,
    pie,
    setPie,
    mostrarLogo,
    setMostrarLogo,
    copiasAuto,
    setCopiasAuto,
    onTestPrint,
  } = props

  const previewConfig = useMemo<TicketPrintConfig>(
    () =>
      normalizePrintConfig({
        ancho_mm: Number(anchoMm) || DEFAULT_PRINT_CONFIG.ancho_mm,
        fuente,
        tamano_fuente_pt: Number(tamanoPt) || DEFAULT_PRINT_CONFIG.tamano_fuente_pt,
        margen_mm: Number(margenMm) || DEFAULT_PRINT_CONFIG.margen_mm,
        encabezado,
        pie,
        mostrar_logo: mostrarLogo,
      }),
    [anchoMm, fuente, tamanoPt, margenMm, encabezado, pie, mostrarLogo],
  )

  const previewHtml = useMemo(
    () => buildTicketHtml(buildSampleTicket(businessName), previewConfig),
    [businessName, previewConfig],
  )

  const previewWidthPx = Math.round(previewConfig.ancho_mm * 3.78)

  const matchPreset = PRESET_ANCHOS_MM.find((p) => p.value === Number(anchoMm))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Configuración de Impresión
        </CardTitle>
        <CardDescription>
          Personaliza tamaño del papel, fuente, márgenes y textos del ticket. Funciona con cualquier
          impresora del sistema (térmica 58/72/80 mm, A4 o PDF) gracias al diálogo de impresión del navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Columna izquierda: controles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Impresora de Tickets</Label>
                <p className="text-sm text-muted-foreground">
                  Mostrar el botón "Imprimir" en POS y Pagos
                </p>
              </div>
              <Switch checked={printerEnabled} onCheckedChange={setPrinterEnabled} />
            </div>

            {printerEnabled && (
              <div className="space-y-2">
                <Label htmlFor="printerIP">IP de la impresora (opcional, para impresoras de red)</Label>
                <Input
                  id="printerIP"
                  placeholder="192.168.1.100"
                  value={printerIP}
                  onChange={(e) => setPrinterIP(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Solo informativo. El ticket se imprime con el diálogo de impresión del navegador.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="printAncho">Ancho del papel</Label>
              <div className="flex gap-2">
                <Select
                  value={matchPreset ? String(matchPreset.value) : 'custom'}
                  onValueChange={(v) => {
                    if (v !== 'custom') setAnchoMm(v)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Selecciona un ancho" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_ANCHOS_MM.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    id="printAncho"
                    type="number"
                    min={40}
                    max={297}
                    value={anchoMm}
                    onChange={(e) => setAnchoMm(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">mm</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="printTamano">Tamaño de fuente</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="printTamano"
                    type="number"
                    min={6}
                    max={24}
                    value={tamanoPt}
                    onChange={(e) => setTamanoPt(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">pt</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="printMargen">Margen interno</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="printMargen"
                    type="number"
                    min={0}
                    max={30}
                    value={margenMm}
                    onChange={(e) => setMargenMm(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">mm</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="printFuente">Familia tipográfica</Label>
              <Select value={fuente} onValueChange={setFuente}>
                <SelectTrigger id="printFuente">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUENTES_DISPONIBLES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="printEncabezado">Texto de encabezado</Label>
              <Input
                id="printEncabezado"
                value={encabezado}
                onChange={(e) => setEncabezado(e.target.value)}
                placeholder="¡Gracias por su visita!"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printPie">Texto de pie de ticket</Label>
              <Input
                id="printPie"
                value={pie}
                onChange={(e) => setPie(e.target.value)}
                placeholder="Vuelva pronto"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Mostrar nombre del negocio destacado</Label>
                <p className="text-sm text-muted-foreground">
                  Imprime el nombre del negocio en tamaño mayor al inicio
                </p>
              </div>
              <Switch checked={mostrarLogo} onCheckedChange={setMostrarLogo} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Preguntar por copias para cocina y bar (KDS doble)</Label>
                <p className="text-sm text-muted-foreground">
                  Al enviar la comanda desde el POS se muestra un diálogo con checkboxes
                  para elegir si imprimir el ticket de cocina y/o bar según corresponda.
                  La selección se recuerda por dispositivo. Desactívalo si nunca imprimes
                  copias físicas.
                </p>
              </div>
              <Switch checked={copiasAuto} onCheckedChange={setCopiasAuto} />
            </div>

            <Button variant="outline" onClick={onTestPrint} className="w-full">
              <Printer className="mr-2 h-4 w-4" /> Probar impresión con ticket de ejemplo
            </Button>
          </div>

          {/* Columna derecha: preview en vivo */}
          <div className="space-y-2">
            <Label>Vista previa en vivo</Label>
            <p className="text-xs text-muted-foreground">
              Se actualiza mientras editas. Lo que ves es lo que se imprime.
            </p>
            <div className="flex max-h-[520px] justify-center overflow-auto rounded-lg border bg-zinc-200 p-4 dark:bg-zinc-900">
              <div
                className="bg-white shadow"
                style={{ width: `${previewWidthPx}px`, minWidth: `${previewWidthPx}px` }}
              >
                <iframe
                  title="Vista previa configuración impresión"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  style={{
                    width: `${previewWidthPx}px`,
                    minHeight: '300px',
                    border: 'none',
                    display: 'block',
                    background: 'white',
                  }}
                  onLoad={(e) => {
                    const target = e.currentTarget
                    try {
                      const doc = target.contentDocument
                      if (doc) {
                        const height = doc.documentElement.scrollHeight
                        target.style.height = `${Math.max(height, 300)}px`
                      }
                    } catch {
                      /* same-origin */
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
