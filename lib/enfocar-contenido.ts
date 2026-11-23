/**
 * Sesión 21b (K2, #8): la app es una sola página (SPA) y al cambiar de pantalla el foco se quedaba en el botón del
 * menú. Esto lo pasa al contenido principal (`<main id="contenido" tabIndex={-1}>`, sin anillo de foco porque no es
 * un control) para que un lector anuncie la pantalla nueva y el siguiente Tab caiga dentro de ella.
 */
export function enfocarContenido(): void {
  if (typeof document === 'undefined') return
  const main = document.getElementById('contenido')
  if (main) main.focus({ preventScroll: true })
}
