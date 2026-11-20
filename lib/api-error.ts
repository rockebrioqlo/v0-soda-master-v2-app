/**
 * Error de una respuesta de la API con su estado y código (sesión 6, C4):
 * deja que la pantalla muestre un mensaje accionable según `codigo`
 * (por ejemplo `PERMISO_APERTURA_MESA`) en vez de un aviso genérico.
 */
export class ErrorApi extends Error {
  status: number
  codigo?: string
  constructor(mensaje: string, status: number, codigo?: string) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.status = status
    this.codigo = codigo
  }
}

/** Convierte una respuesta no exitosa en `ErrorApi` con el mensaje real del servidor. */
export async function errorDeRespuesta(res: Response, porDefecto: string): Promise<ErrorApi> {
  const data = await res.json().catch(() => ({}))
  return new ErrorApi(data?.error || `${porDefecto} (error ${res.status})`, res.status, data?.codigo)
}

/** Mensaje para el usuario: si falta el permiso de apertura de mesa, dice qué hacer. */
export function mensajeAccionable(error: unknown, porDefecto: string): string {
  if (error instanceof ErrorApi && error.codigo === 'PERMISO_APERTURA_MESA') {
    return 'No tienes permiso para abrir mesas. Pídele al admin un permiso temporal (o un rol adicional de mesero permanente).'
  }
  return error instanceof Error && error.message ? error.message : porDefecto
}
