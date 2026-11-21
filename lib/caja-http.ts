/**
 * Esquemas zod `.strict()` de caja (sesión 14.5b-2, F45). Los campos son los que mandan hoy las
 * pantallas; `usuario_id` y `usuario_nombre` que mandaba el cliente son heredados y se rechazan: quién
 * abre, mueve o cierra la caja sale de la sesión.
 */
import { z } from 'zod'
import { uuid } from '@/lib/validacion-http'

/** Pesos chilenos sin decimales (la pantalla solo deja dígitos). */
const pesos = z.number().int().min(0).max(100_000_000)
const notas = (max: number) => z.string().trim().max(max).nullish()

export const CajaAbrirSchema = z
  .object({
    fondo_inicial: pesos,
    notas: notas(500),
  })
  .strict()

export const MOVIMIENTOS_CAJA = ['retiro', 'deposito', 'ajuste'] as const

export const CajaMovimientoSchema = z
  .object({
    tipo: z.enum(MOVIMIENTOS_CAJA),
    monto: pesos.min(1),
    descripcion: notas(300),
  })
  .strict()

export const CajaCerrarSchema = z
  .object({
    caja_id: uuid,
    efectivo_contado: pesos,
    notas: notas(500),
  })
  .strict()
