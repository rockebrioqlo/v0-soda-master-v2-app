"use client"

import { useState } from "react"
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

export function ConfiguracionPage() {
  const { state, dispatch } = useApp()
  const { mesas } = state
  const [businessName, setBusinessName] = useState("Soda Master")
  const [businessAddress, setBusinessAddress] = useState("San Jose, Costa Rica")
  const [businessPhone, setBusinessPhone] = useState("+506 8888-8888")
  const [currency, setCurrency] = useState("CRC")
  const [taxRate, setTaxRate] = useState("13")
  const [enableTax, setEnableTax] = useState(true)
  const [enableTips, setEnableTips] = useState(true)
  const [defaultTip, setDefaultTip] = useState("10")
  const [printerEnabled, setPrinterEnabled] = useState(false)
  const [printerIP, setPrinterIP] = useState("")
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [kdsAutoComplete, setKdsAutoComplete] = useState(false)
  const [kdsAutoCompleteTime, setKdsAutoCompleteTime] = useState("30")

  // Table management
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [editingTable, setEditingTable] = useState<Mesa | null>(null)
  const [tableForm, setTableForm] = useState({
    nombre: "",
    capacidad: 4,
    area: "Interior",
  })

  const handleSaveSettings = () => {
    showToast("Configuracion guardada exitosamente", "success")
  }

  const handleAddTable = () => {
    if (!tableForm.nombre.trim()) {
      showToast("El nombre de la mesa es requerido", "error")
      return
    }

    if (editingTable) {
      const updated: Mesa = {
        ...editingTable,
        nombre: tableForm.nombre,
        capacidad: tableForm.capacidad,
        area: tableForm.area
      }
      dispatch({ type: 'UPDATE_MESA', payload: updated })
      showToast("Mesa actualizada", "success")
    } else {
      const newMesa: Mesa = {
        id: `mesa-${Date.now()}`,
        nombre: tableForm.nombre,
        capacidad: tableForm.capacidad,
        estado: "libre",
        area: tableForm.area,
      }
      dispatch({ type: 'ADD_MESA', payload: newMesa })
      showToast("Mesa agregada", "success")
    }

    setTableForm({ nombre: "", capacidad: 4, area: "Interior" })
    setEditingTable(null)
    setShowTableDialog(false)
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

  const handleDeleteTable = (mesaId: string) => {
    const mesa = mesas.find((m) => m.id === mesaId)
    if (mesa?.estado === "ocupada") {
      showToast("No se puede eliminar una mesa ocupada", "error")
      return
    }
    dispatch({ type: 'DELETE_MESA', payload: mesaId })
    showToast("Mesa eliminada", "success")
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="negocio">Negocio</TabsTrigger>
          <TabsTrigger value="mesas">Mesas</TabsTrigger>
          <TabsTrigger value="impresion">Impresion</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
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
                      <SelectItem value="CRC">Colones (CRC)</SelectItem>
                      <SelectItem value="USD">Dolares (USD)</SelectItem>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Configuracion de Impresion
              </CardTitle>
              <CardDescription>
                Configura las impresoras para tickets y comandas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Impresora de Tickets</Label>
                  <p className="text-sm text-muted-foreground">
                    Habilitar impresion automatica de tickets
                  </p>
                </div>
                <Switch checked={printerEnabled} onCheckedChange={setPrinterEnabled} />
              </div>
              {printerEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="printerIP">Direccion IP de la Impresora</Label>
                  <Input
                    id="printerIP"
                    placeholder="192.168.1.100"
                    value={printerIP}
                    onChange={(e) => setPrinterIP(e.target.value)}
                  />
                </div>
              )}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  La impresion de tickets requiere una impresora termica compatible con ESC/POS
                  conectada a la red local.
                </p>
              </div>
            </CardContent>
          </Card>
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
                    <span>Tarjeta</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Sinpe Movil</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Transferencia</span>
                    <Switch defaultChecked />
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
      </Tabs>
    </div>
  )
}
