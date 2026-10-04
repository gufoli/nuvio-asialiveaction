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

## Auditoría incremental 0.1.5 — 2026-10-04

- **Fallo reproducible en fixtures:** si un player devuelve HTTP 302 hacia un enlace HLS/MP4,
  el extractor seguía tratando la respuesta final como HTML y perdía el vídeo.
  Se detecta el tipo de la URL final y se devuelve como stream sin leer el cuerpo binario.
  Los destinos con `Content-Type: text/html` o JSON no se presentan como vídeos.
- Se restringen autoridades y hosts inválidos/locales en las URLs de entrada y salida.
  **Límite:** el motor HTTP que sigue redirects automáticamente puede alcanzar un destino
  intermedio antes de que este proveedor inspeccione `response.url`. Evitar esto del
  todo requeriría transporte que permita controlar manualmente cada salto; no se afirma
  defensa completa frente a DNS rebinding ni a redirecciones a redes privadas.
- Se añaden pruebas de regresión de ambos casos y un chequeo en CI de que los dos
  archivos de instalación sean accesibles por URL `raw.githubusercontent.com` anclada al commit.
- No se añadieron adaptadores no verificados para Byse/UPN/RPM/Ezplayer; vídeo y audio
  **en dispositivo** siguen pendientes de comprobación real.


## Evidencia real en Nuvio — 2026-10-04

Prueba en dispositivo Android con **Oldboy (2003)** y Asia Live Action 0.1.5:

- Nuvio carga y registra correctamente el proveedor: el filtro **Asia Live Action** aparece al iniciar la búsqueda.
- Al terminar la consulta el filtro desaparece y quedan las fuentes de otros proveedores.
- Este comportamiento coincide con el código actual de NuvioMobile: `ProviderFilterRow` solo conserva grupos con streams o que todavía estén cargando (`it.streams.isNotEmpty() || it.isLoading`).
- Por tanto, la desaparición **no indica desinstalación ni fallo del manifest**; demuestra que el scraper terminó con **0 streams** para Oldboy.
- Estado real: integración Nuvio/manifest confirmada en dispositivo; extracción de los reproductores dinámicos de AsiaLiveAction sigue pendiente.

No se añadirá una fila de diagnóstico falsa para mantener visible el filtro: solo se publicarán fuentes reproducibles reales.

## Revisión técnica 0.1.6 — 2026-10-04

Se ha inspeccionado el código público de NuvioMobile (FetchBridge.kt y
JsBindings.kt, repositorio `NuvioMedia/NuvioMobile`): el puente de fetch
materializa hasta 1 MiB de `response.bodyBytes` y genera también una copia
Base64 antes de entregar la respuesta a JavaScript. Aunque Android limita
la respuesta a 1 MiB, la detección de `.mp4` o `.m3u8` hecha **después**
del `fetch` en 0.1.5 no evitaba esa transferencia ni las copias en memoria.

Corrección: seguir explícitamente HTTP 301/302/303/307/308 mediante
`redirect:manual`; si Location ya es una ruta multimedia, entregarla sin
otro GET. Limitar saltos (4), detectar ciclos y validar cada URL antes de
solicitarla. Nuevas pruebas de redirección y regresión.

**Limitaciones:** el comportamiento real de hosts dinámicos, la accesibilidad
de la CDN, los redirects ignorados por el runtime, DRM y la reproducción en
dispositivo siguen sin verificarse. No añadir reproductores falsos.

Las pruebas en Github Actions verifican el control del flujo HTTP con respuestas simuladas. No se ha conseguido acceder al contenido actual de `asialiveaction.com` desde este entorno (error de acceso al solicitar las páginas públicas), por lo que ningún reproductor nuevo puede declararse funcional. El límite de 1 MiB se aplica en la implementación Android de NuvioMobile; otras plataformas pueden comportarse de forma distinta.

## Inspección HTTP pública desde GitHub Actions — 2026-10-04

Se añadió una prueba *no bloqueante* `.github/workflows/inspect-site.yml`
y `scripts/inspect-site.js`, limitada a la ficha de Oldboy y, solo si esta
resulta accesible, su primer reproductor en el propio dominio. No descarga
archivos multimedia, no accede a hosts externos y nunca registra tokens,
cookies ni URLs firmadas. No establece reproducción real.

**Ejecución GitHub Actions #37217069303:** `detailHttp=403`,
`detailFound=false`, `playerHttp=0`, `playerFound=false`.
El job terminó correctamente como herramienta diagnóstica: el HTTP 403
se clasifica como **acceso denegado desde el runner**, no como éxito de la
web ni como error del plugin. Tampoco demuestra que Android reciba el
mismo estado HTTP, porque pueden existir diferencias de red o acceso.

El siguiente paso real sigue siendo obtener acceso público normal y
autorizado a reproductores verificables. No se intentará sortear medidas
anti-bot, DRM, autenticación o restricciones del sitio.


## Aprendizaje de plugins Kino — 2026-10-04

Se revisó la documentación actual de `kinotvapp/kino-plugins`, el plugin Cuevana3k 2.1.2 de
`ice-dev-x/cu3v4n4` y el plugin Maratón de `xuper-plugin/maraton`.

- Cuevana3k confirma la utilidad de `streamHosts: "any"` cuando los CDN cambian, pero su extractor
  desempaqueta JavaScript de algunos hosts. Esa técnica no se incorpora: este proyecto mantiene la
  regla de no ejecutar JavaScript descargado.
- Maratón usa el mecanismo más adecuado para reproductores dinámicos: `kino.browser.capture`.
  La página corre en la WebView aislada de Kino y el plugin recibe las peticiones reales de vídeo,
  junto con Referer/User-Agent/Origin/Cookie cuando corresponden.
- La conversión automática Nuvio→Kino conserva `getStreams`, aumenta límites y permite hosts
  públicos, pero genera un plugin apiVersion 4 y no aporta por sí misma el navegador oculto de
  apiVersion 6. Por ello no resuelve nuestro bloqueo actual con players que construyen el stream
  mediante JavaScript.
- Se añadió una variante **nativa de Kino**, separada en `kino/`, que primero intenta lectura HTTP y
  ante 403/verificación usa `kino.browser.page`; al reproducir, abre únicamente reproductores
  exactos `/f/.../<TMDB>/...` del mismo sitio y usa `kino.browser.capture`. No abre una URL
  multimedia a ciegas ni ejecuta scripts remotos dentro de QuickJS.
- La primera versión nativa cubre solo películas para mantener una ruta de prueba pequeña y
  verificable. Series quedan fuera hasta confirmar la salida audiovisual real.

Evidencia automatizada: 7/7 pruebas de comportamiento y validación con el SDK oficial sincronizado
con Kino 0.9.50: **“Kino would accept this plugin”**. Pendiente real: WebView/reproducción en dispositivo.
