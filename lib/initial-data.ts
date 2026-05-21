// Initial data for Soda Master V2 - All data simulated locally
// TODO: Replace with fetch to Neon

import { 
  Mesa, 
  Usuario, 
  Producto, 
  Ingrediente, 
  Comanda,
  PermisosDescuento,
  Configuracion,
  Rol
} from './types'

// Pre-hashed PINs using bcrypt (these are hashed versions of the PINs)
// In a real scenario, these would be hashed at user creation time
// PIN 1234 -> hash, PIN 2222 -> hash, etc.
// For the prototype, we'll hash on initialization

export const initialMesas: Mesa[] = [
  { id: '1', nombre: 'Mesa 1', capacidad: 2, estado: 'libre' },
  { id: '2', nombre: 'Mesa 2', capacidad: 4, estado: 'ocupada' },
  { id: '3', nombre: 'Mesa 3', capacidad: 4, estado: 'reservada' },
  { id: '4', nombre: 'Mesa 4', capacidad: 6, estado: 'libre' },
  { id: '5', nombre: 'Mesa 5', capacidad: 2, estado: 'ocupada' },
]

export const initialUsuarios: Omit<Usuario, 'pinHash'>[] = [
  { id: '1', nombre: 'Admin', email: 'admin@soda.cl', rol: 'administrador', activo: true, intentosFallidos: 0, bloqueadoHasta: null },
  { id: '2', nombre: 'Carlos', email: 'carlos@soda.cl', rol: 'mesero', activo: true, intentosFallidos: 0, bloqueadoHasta: null },
  { id: '3', nombre: 'María', email: 'maria@soda.cl', rol: 'cocina', activo: true, intentosFallidos: 0, bloqueadoHasta: null },
  { id: '4', nombre: 'Pedro', email: 'pedro@soda.cl', rol: 'bar', activo: true, intentosFallidos: 0, bloqueadoHasta: null },
  { id: '5', nombre: 'Laura', email: 'laura@soda.cl', rol: 'cajero', activo: true, intentosFallidos: 0, bloqueadoHasta: null },
]

export const userPins: Record<string, string> = {
  '1': '1234',
  '2': '2222',
  '3': '3333',
  '4': '4444',
  '5': '5555',
}

export const initialProductos: Producto[] = [
  // Burgers
  { id: 'b1', nombre: 'Burger Clásica', categoria: 'burgers', precio: 4500, stock: 999, stockMinimo: 10, formato: 'unidad', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'b2', nombre: 'Burger Doble', categoria: 'burgers', precio: 5500, stock: 999, stockMinimo: 10, formato: 'unidad', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'b3', nombre: 'Burger Vegetariana', categoria: 'burgers', precio: 4200, stock: 999, stockMinimo: 10, formato: 'unidad', esIngredienteEspecial: false, costoAdicional: 0 },
  
  // Entradas
  { id: 'e1', nombre: 'Nachos', categoria: 'entradas', precio: 2500, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0, variantes: [{ nombre: 'Pequeño', precio: 2500 }, { nombre: 'Grande', precio: 3500 }] },
  { id: 'e2', nombre: 'Fingers de Pollo', categoria: 'entradas', precio: 3000, stock: 80, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0, variantes: [{ nombre: '4 uds', precio: 3000 }, { nombre: '8 uds', precio: 5500 }] },
  { id: 'e3', nombre: 'Alitas de Pollo', categoria: 'entradas', precio: 3500, stock: 60, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0, variantes: [{ nombre: '6 uds', precio: 3500 }, { nombre: '12 uds', precio: 6500 }] },
  
  // Acompañamientos
  { id: 'a1', nombre: 'Papas Fritas', categoria: 'acompañamientos', precio: 1500, stock: 200, stockMinimo: 20, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'a2', nombre: 'Papas Rústicas', categoria: 'acompañamientos', precio: 1800, stock: 150, stockMinimo: 15, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'a3', nombre: 'Onion Rings', categoria: 'acompañamientos', precio: 2000, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  
  // Postres
  { id: 'p1', nombre: 'Brownie con Helado', categoria: 'postres', precio: 2800, stock: 50, stockMinimo: 5, formato: 'unidad', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'p2', nombre: 'Cheesecake', categoria: 'postres', precio: 2500, stock: 40, stockMinimo: 5, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'p3', nombre: 'Helado Chocolate', categoria: 'postres', precio: 1500, stock: 60, stockMinimo: 10, formato: 'bola', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'p4', nombre: 'Helado Vainilla', categoria: 'postres', precio: 1500, stock: 60, stockMinimo: 10, formato: 'bola', esIngredienteEspecial: false, costoAdicional: 0 },
  
  // Bebidas
  { id: 'd1', nombre: 'Coca Cola', categoria: 'bebidas', precio: 1500, stock: 200, stockMinimo: 30, formato: 'vaso', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd2', nombre: 'Sprite', categoria: 'bebidas', precio: 1500, stock: 150, stockMinimo: 25, formato: 'vaso', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd3', nombre: 'Jugo Natural', categoria: 'bebidas', precio: 2000, stock: 80, stockMinimo: 15, formato: 'vaso', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd4', nombre: 'Agua Mineral', categoria: 'bebidas', precio: 1000, stock: 300, stockMinimo: 50, formato: 'botella', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd5', nombre: 'Cerveza', categoria: 'bebidas', precio: 2500, stock: 100, stockMinimo: 20, formato: 'botella', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd6', nombre: 'Vino Tinto', categoria: 'bebidas', precio: 3500, stock: 40, stockMinimo: 10, formato: 'copa', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'd7', nombre: 'Vino Blanco', categoria: 'bebidas', precio: 3500, stock: 40, stockMinimo: 10, formato: 'copa', esIngredienteEspecial: false, costoAdicional: 0 },
  
  // Salsas
  { id: 's1', nombre: 'Salsa Cheddar', categoria: 'salsas', precio: 0, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 's2', nombre: 'Salsa BBQ', categoria: 'salsas', precio: 0, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 's3', nombre: 'Salsa Mayo', categoria: 'salsas', precio: 0, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 's4', nombre: 'Salsa Picante', categoria: 'salsas', precio: 0, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 's5', nombre: 'Chimichurri', categoria: 'salsas', precio: 0, stock: 100, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: false, costoAdicional: 0 },
  
  // Ingredientes especiales (productos que se pueden agregar a burgers)
  { id: 'ie1', nombre: 'Huevo Frito', categoria: 'acompañamientos', precio: 500, stock: 100, stockMinimo: 20, formato: 'unidad', esIngredienteEspecial: true, costoAdicional: 500 },
  { id: 'ie2', nombre: 'Bacon Extra', categoria: 'acompañamientos', precio: 800, stock: 80, stockMinimo: 15, formato: 'porción', esIngredienteEspecial: true, costoAdicional: 800 },
  { id: 'ie3', nombre: 'Queso Azul', categoria: 'acompañamientos', precio: 600, stock: 50, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: true, costoAdicional: 600 },
  { id: 'ie4', nombre: 'Rúcula', categoria: 'acompañamientos', precio: 400, stock: 70, stockMinimo: 10, formato: 'porción', esIngredienteEspecial: true, costoAdicional: 400 },
]

export const initialIngredientes: Ingrediente[] = [
  { id: 'i1', nombre: 'Queso', stock: 500, stockMinimo: 50 },
  { id: 'i2', nombre: 'Tomate', stock: 300, stockMinimo: 30 },
  { id: 'i3', nombre: 'Lechuga', stock: 400, stockMinimo: 40 },
  { id: 'i4', nombre: 'Tocino', stock: 200, stockMinimo: 20 },
  { id: 'i5', nombre: 'Cebolla', stock: 350, stockMinimo: 35 },
  { id: 'i6', nombre: 'Palta', stock: 45, stockMinimo: 10 },
  { id: 'i7', nombre: 'Champiñones', stock: 30, stockMinimo: 5 },
  { id: 'i8', nombre: 'Jalapeño', stock: 100, stockMinimo: 15 },
]

// Inventario de materias primas
export const initialInventario: Producto[] = [
  { id: 'inv1', nombre: 'Pan Hamburguesa', categoria: 'acompañamientos', precio: 0, stock: 1500, stockMinimo: 200, formato: 'unidades', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'inv2', nombre: 'Carne Vacuno', categoria: 'acompañamientos', precio: 0, stock: 120, stockMinimo: 20, formato: 'kg', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'inv3', nombre: 'Bebidas Cola', categoria: 'bebidas', precio: 0, stock: 350, stockMinimo: 50, formato: 'litros', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'inv4', nombre: 'Palta (inventario)', categoria: 'acompañamientos', precio: 0, stock: 45, stockMinimo: 10, formato: 'kg', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'inv5', nombre: 'Champiñones (inventario)', categoria: 'acompañamientos', precio: 0, stock: 30, stockMinimo: 5, formato: 'kg', esIngredienteEspecial: false, costoAdicional: 0 },
  { id: 'inv6', nombre: 'Salsa BBQ (inventario)', categoria: 'salsas', precio: 0, stock: 25, stockMinimo: 5, formato: 'litros', esIngredienteEspecial: false, costoAdicional: 0 },
]

export const initialComandas: Comanda[] = []

export const initialPermisosDescuento: Record<Rol, PermisosDescuento> = {
  administrador: { puede: true, limiteMax: 100, requiereMotivo: false },
  cajero: { puede: true, limiteMax: 15, requiereMotivo: true },
  mesero: { puede: false, limiteMax: 0, requiereMotivo: true },
  cocina: { puede: false, limiteMax: 0, requiereMotivo: true },
  bar: { puede: false, limiteMax: 0, requiereMotivo: true },
}

export const initialConfiguracion: Configuracion = {
  nombreRestaurante: 'Soda Master V2',
  logoUrl: '',
  fuenteTicket: 'monospace',
  tamañoFuente: 12,
  encabezadoTicket: '¡Gracias por su visita!',
  pieTicket: 'Vuelva pronto - Soda Master V2',
  stockMinimoPorDefecto: 10,
  modoMantenimiento: false,
}

export const ingredientesEstandar = [
  'Queso', 'Tomate', 'Lechuga', 'Tocino', 
  'Cebolla', 'Palta', 'Champiñones', 'Jalapeño'
]

export const salsasDisponibles = [
  'Cheddar', 'BBQ', 'Mayo', 'Picante', 'Chimichurri'
]
