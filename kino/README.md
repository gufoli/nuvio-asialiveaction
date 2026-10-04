# Asia Live Action para Kino — experimental

Esta carpeta es un plugin **nativo de Kino 0.9.50+ / apiVersion 6**, separado del scraper de Nuvio.
**No es instalable en la versión pública actual de Kino comprobada el 2026-10-04**, cuyo código y
contrato publicados admiten hasta apiVersion 5. Se conserva como trabajo futuro.

## Por qué existe

El scraper de Nuvio puede localizar la ficha y los reproductores de Asia Live Action, pero los hosts
actuales construyen el enlace de video ejecutando JavaScript. La conversión automática Nuvio → Kino
sigue llamando al mismo `getStreams`, así que no arregla ese límite.

Esta variante usa la API oficial de Kino 0.9.50:

1. `kino.fetch` intenta leer la página normalmente.
2. Si hay HTTP 403 o una comprobación automática del navegador, `kino.browser.page` deja que la
   WebView oculta de Kino lea la página; no resuelve captchas.
3. Al reproducir, solo se aceptan enlaces de reproductor de Asia Live Action que coincidan con el
   TMDB solicitado.
4. `kino.browser.capture` abre ese reproductor y devuelve las peticiones HLS/DASH/MP4 reales y las
   cabeceras que necesita el reproductor.
5. No se usa `eval`, `new Function` ni ejecución de JavaScript descargado dentro del plugin.

## Estado

La versión 0.1.0 cubre **películas**. Series se añadirán después de verificar el flujo real en un
dispositivo. Las pruebas automáticas validan búsqueda, identidad TMDB, fallback 403 → navegador,
captura de vídeo, fallback entre reproductores y rechazo de referencias externas.

El manifiesto se valida en CI contra una revisión fijada del SDK oficial de Kino 0.9.50. El propio
SDK recuerda que `kino.browser.capture` y `kino.browser.page` solo pueden verificarse dentro de la
app, por lo que la reproducción sigue marcada como pendiente hasta la primera prueba en Android.

## Instalación futura

No intentes instalar esta carpeta todavía. El Kino público actual responde correctamente:
`Este plugin necesita una versión más nueva de Kino`.

Cuando la app pública soporte realmente apiVersion 6, la dirección prevista será:

`https://github.com/gufoli/nuvio-asialiveaction/tree/main/kino`

Hasta entonces la ruta soportada es el repositorio Nuvio de la raíz.
