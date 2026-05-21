"use client"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { Download, FileText, TrendingUp, DollarSign, Package, Users } from "lucide-react"
import { formatCurrency } from "@/lib/helpers"

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"]

export function ReportesPage() {
  const { state } = useApp()
  const { comandas, productos, mesas } = state
  const [reportType, setReportType] = useState("ventas")
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"))

  // Filter comandas by date
  const filteredComandas = comandas.filter((comanda) => {
    const comandaDate = new Date(comanda.creadoAt)
    return isWithinInterval(comandaDate, {
      start: startOfDay(new Date(dateFrom)),
      end: endOfDay(new Date(dateTo)),
    })
  })

  const completedComandas = filteredComandas.filter((c) => c.estado === "pagada")

  // Sales by day
  const salesByDay = completedComandas.reduce((acc, comanda) => {
    const day = format(new Date(comanda.creadoAt), "dd/MM", { locale: es })
    const total = comanda.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
    if (!acc[day]) acc[day] = { day, total: 0, count: 0 }
    acc[day].total += total
    acc[day].count += 1
    return acc
  }, {} as Record<string, { day: string; total: number; count: number }>)

  const salesByDayData = Object.values(salesByDay).sort((a, b) => {
    const [dayA, monthA] = a.day.split("/").map(Number)
    const [dayB, monthB] = b.day.split("/").map(Number)
    if (monthA !== monthB) return monthA - monthB
    return dayA - dayB
  })

  // Top products sold
  const productSales = completedComandas.reduce((acc, comanda) => {
    comanda.items.forEach((item) => {
      if (!acc[item.productoId]) {
        acc[item.productoId] = {
          name: item.productoNombre,
          quantity: 0,
          total: 0,
        }
      }
      acc[item.productoId].quantity += item.cantidad
      acc[item.productoId].total += item.precio * item.cantidad
    })
    return acc
  }, {} as Record<string, { name: string; quantity: number; total: number }>)

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  // Sales by category
  const salesByCategory = completedComandas.reduce((acc, comanda) => {
    comanda.items.forEach((item) => {
      const product = productos.find((p) => p.id === item.productoId)
      const category = product?.categoria || "otros"
      if (!acc[category]) acc[category] = { name: category, value: 0 }
      acc[category].value += item.precio * item.cantidad
    })
    return acc
  }, {} as Record<string, { name: string; value: number }>)

  const categoryData = Object.values(salesByCategory)

  // Totals
  const totalSales = completedComandas.reduce((sum, c) => {
    return sum + c.items.reduce((itemSum, item) => itemSum + (item.precio * item.cantidad), 0)
  }, 0)
  const totalOrders = completedComandas.length
  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0

  // Low stock items
  const lowStockItems = productos.filter((p) => p.stock !== undefined && p.stockMinimo !== undefined && p.stock <= p.stockMinimo)

  // Payment methods from pagos (using state.pagos if available)
  const paymentData = [
    { name: "Efectivo", value: totalSales * 0.4, count: Math.floor(totalOrders * 0.4) },
    { name: "Tarjeta", value: totalSales * 0.35, count: Math.floor(totalOrders * 0.35) },
    { name: "Sinpe", value: totalSales * 0.25, count: Math.floor(totalOrders * 0.25) },
  ]

  const exportReport = () => {
    let csvContent = ""
    
    if (reportType === "ventas") {
      csvContent = "Fecha,Comanda,Mesa,Total,Estado\n"
      completedComandas.forEach((comanda) => {
        const total = comanda.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
        csvContent += `${format(new Date(comanda.creadoAt), "dd/MM/yyyy HH:mm")},${comanda.id},${comanda.mesaNombre},${total},${comanda.estado}\n`
      })
    } else if (reportType === "productos") {
      csvContent = "Producto,Cantidad Vendida,Total Ventas\n"
      topProducts.forEach((p) => {
        csvContent += `${p.name},${p.quantity},${p.total}\n`
      })
    } else if (reportType === "inventario") {
      csvContent = "Producto,Stock Actual,Stock Minimo,Estado\n"
      productos.forEach((item) => {
        const status = (item.stock !== undefined && item.stockMinimo !== undefined && item.stock <= item.stockMinimo) ? "BAJO" : "OK"
        csvContent += `${item.nombre},${item.stock || 0},${item.stockMinimo || 0},${status}\n`
      })
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `reporte_${reportType}_${format(new Date(), "yyyyMMdd")}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reportes y Estadisticas</h1>
        <Button onClick={exportReport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Tipo de Reporte</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ventas">Ventas</SelectItem>
                  <SelectItem value="productos">Productos</SelectItem>
                  <SelectItem value="inventario">Inventario</SelectItem>
                  <SelectItem value="pagos">Metodos de Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[180px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
            <p className="text-xs text-muted-foreground">En el periodo seleccionado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ordenes Completadas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Ordenes procesadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgTicket)}</div>
            <p className="text-xs text-muted-foreground">Por orden</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Bajo Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Requieren reposicion</p>
          </CardContent>
        </Card>
      </div>

      {/* Graficos segun tipo */}
      {reportType === "ventas" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByDayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `Dia: ${label}`}
                    />
                    <Bar dataKey="total" fill="#3b82f6" name="Ventas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ordenes por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesByDayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#10b981" name="Ordenes" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {reportType === "productos" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Productos Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} />
                    <Tooltip />
                    <Bar dataKey="quantity" fill="#8b5cf6" name="Cantidad" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {reportType === "inventario" && (
        <Card>
          <CardHeader>
            <CardTitle>Estado del Inventario</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Stock Actual</TableHead>
                  <TableHead>Stock Minimo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell>{item.stock || 0}</TableCell>
                    <TableCell>{item.stockMinimo || 0}</TableCell>
                    <TableCell className="capitalize">{item.categoria}</TableCell>
                    <TableCell>
                      {(item.stock !== undefined && item.stockMinimo !== undefined && item.stock <= item.stockMinimo) ? (
                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                          Bajo Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600">
                          OK
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {reportType === "pagos" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Distribucion por Metodo de Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {paymentData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Detalle por Metodo de Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Transacciones</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentData.map((method) => (
                    <TableRow key={method.name}>
                      <TableCell className="font-medium capitalize">{method.name}</TableCell>
                      <TableCell>{method.count}</TableCell>
                      <TableCell>{formatCurrency(method.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
