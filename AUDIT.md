# Auditoría 0.1.4 — 2026-10-04

Base revisada: `576ebba3f847ecc961f6dbeafe9c0b991a7896fa` (main, 0.1.2 diagnóstica).
La corrección se publica como 0.1.4 para no confundirla con el paquete externo 0.1.3.
No se ha usado ese ZIP como fuente: el código actual de GitHub es la base auditada.

## Hallazgos y cambios

| Prioridad | Evidencia | Corrección |
|---|---|---|
| Alta | La ficha real de Oldboy tiene iframe vacío y `var allVideos` con cuatro servidores; el parser anterior solo leía iframes e incluía Facebook. | Parser JSON sin eval para `allVideos`; filtro de iframes sociales, vacíos y plantillas. |
| Alta | TMDB 603 devolvía HTML de diagnóstico etiquetado como MP4. | Retirada de la excepción; diagnóstico explícito `diagnose`, separado de `getStreams`. |
| Alta | `playbackLink` buscaba `/f/` o `/e/` en cualquier parte de cualquier URL. | Coincidencia anclada al dominio y ruta del sitio; ID, temporada y episodio enteros. |
| Media | Validación de ficha aceptaba palabras genéricas como «Serie» o «Película». | Se exige enlace de reproducción exacto y se valida identidad tras la redirección. |
| Media | Una única opción rota impedía probar otras opciones. | Hasta seis reproductores exactos, con deduplicación. |
| Media | Sin timeout y con árbol de iframes potencialmente amplio. | Presupuesto de peticiones/tiempo, profundidad limitada y parada tras timeout. |
| Media | URL relativa y Referer se calculaban antes de redirecciones. | Base y cabeceras calculadas con URL final. Resolver compatible sin URL nativo. |
| Media | Logs con URLs completas y mensajes de excepciones. | Solo códigos de estado, host y HTTP; sin claves ni tokens. |
| Media | Calidad HD, idioma y subtítulos se afirmaban sin verificar. | Calidad Auto salvo marcador explícito; no se declara idioma de una pista no inspeccionada. |
| Baja | README con TU_USUARIO, versiones mezcladas y registros antiguos presentados como vigentes. | URL real, versión sincronizada, guía tester y archivo histórico identificado. |

## Verificación ejecutada

- `npm run check`: **29/29 pruebas pasan**, Node **24.19.0**; sintaxis JavaScript válida.
- `git diff --check`: sin errores de espacios.
- Pruebas con fetch simulado: película completa hasta HLS, serie S2E1, rechazo de S1/E10,
  especiales S0, búsqueda exacta, redirects, varios players, deduplicación, límites,
  timeout de fetch y de body, claves omitidas de logs, metadatos inválidos y manifiesto.
- Contexto VM sin URL ni AbortController: recorrido de película pasa.
  **Esto no equivale a ejecutar QuickJS/Hermes ni a probar Nuvio.**
- Workflow añadido para repetir estas pruebas en Node 20, 22 y 24 en GitHub Actions.
  Su resultado se debe consultar en Actions; no se supone aprobado solo por existir el YAML.

## Evidencia HTTP real y límites

Comprobaciones GET sin cuenta ni cookies:

- `https://asialiveaction.com/pelicula/670-oldboy-sub-espanol/`: HTTP 200;
  enlace exacto a `/f/1/670/0018111/`.
- Player anterior: HTTP 200; cuatro entradas públicas `allVideos` (Byse, UPN, RPM, Ezplayer).
  El parser corregido devuelve los cuatro servidores; no incluye Facebook ni `${video[1]}`.
- Tres páginas de hosts consultadas (Byse, UPN, RPM): HTTP 200, aplicaciones JavaScript;
  sin URL HLS/MP4 utilizable directamente en el HTML recibido.
- Lectura de los scripts públicos de Byse confirma configuración de reproducción dinámica;
  el GET de playback devolvió HTTP 405. No se implementó un adaptador a ciegas.
- `https://asialiveaction.com/?s=670`: no contiene enlace exacto de Oldboy.
  La búsqueda numérica es fallback de mejor esfuerzo, no sustituto garantizado de TMDB.
- CLI con fetch nativo en este entorno y sin clave TMDB: timeout del sitio y cero streams.
  Las comprobaciones HTTP anteriores se realizaron con curl; no prueban el transporte de Nuvio.

**Pendiente real:** adaptadores comprobados para los hosts dinámicos actuales y reproducción
real (vídeo, audio, subtítulos, avance) en Nuvio/Kino. Oldboy puede seguir sin fuentes.
No se ha afirmado reproducción funcional, resolución/idioma real ni compatibilidad total.

La verificación de extensiones se basa en estructura declarada, no en decodificar el vídeo
ni validar cada playlist/segmento final. No hay adaptadores para DRM, CAPTCHA o acceso restringido.
Los límites de tamaño se aplican tras leer el body: el runtime controla el buffer de red.

## Contrato Nuvio consultado

- `https://github.com/tapframe/NuvioStreaming` (redirección vigente a la app):
  `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/js/JsBindings.kt`
  y `PluginRepository.kt`.
- El host llama `module.exports.getStreams` o `globalThis.getStreams`, inyecta TMDB_API_KEY,
  usa fetch/timers y su prueba genérica solicita TMDB 603.
- No se añadieron dependencias ni se copió código de extractores externos.

## Siguiente trabajo

Añadir un adaptador de host solo después de obtener un flujo público reproducible, compatible
con el runtime y verificado hasta la respuesta final. Probarlo con fixtures sanitizados y
comprobación real antes de declarar ese host compatible. El usuario aporta pruebas de dispositivo;
el mantenimiento del código y de GitHub queda en este repositorio.

## Traslado a gufoli — 2026-10-04

Se traslada el estado de trabajo 0.1.4 al repositorio público `gufoli/nuvio-asialiveaction`,
conservando el commit inicial del destino. No se modifica el motor durante el traslado.
El historial anterior no se importa; la base y la evidencia anterior quedan identificadas arriba.
La cuenta anterior y su manifiesto devolvían HTTP 404 sin sesión; el acceso autorizado no era
una verificación suficiente para la instalación. En adelante se debe comprobar también el acceso
anónimo HTTP al manifiesto y al archivo del proveedor antes de entregar la URL.
