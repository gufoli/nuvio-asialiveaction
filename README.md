# Asia Live Action — Nuvio 0.1.7

Proveedor no oficial, sin dependencias. Busca por identidad TMDB y por temporada/episodio exactos.

## Instalar o actualizar

En la sección de plugins/repositorios de **Nuvio Full**, añadir o actualizar:

```text
https://raw.githubusercontent.com/gufoli/nuvio-asialiveaction/main/manifest.json
```

Si vienes del repositorio de `man-zanilla`, elimina **solo ese repositorio** de Nuvio y añade la URL de `gufoli` indicada arriba. Actualizar la entrada antigua seguirá consultando la cuenta anterior.

Si ya está instalado desde `gufoli`, actualizar el repositorio y comprobar que el proveedor muestra **0.1.7**.
Si conserva 0.1.2, quitar únicamente este repositorio y añadir la misma URL de nuevo.
No es necesario descargar ZIP, copiar código ni modificar GitHub.

La variante nativa apiVersion 6 queda reservada para una futura Kino 0.9.50+: la versión pública actual de Kino admite hasta apiVersion 5. El proveedor Nuvio sigue siendo la ruta compatible hoy.

## Qué está corregido

- Lee la estructura `allVideos` que usa actualmente AsiaLiveAction y los iframes públicos.
- Ignora el iframe social de Facebook, iframes vacíos y plantillas `${video[1]}`.
- Prueba varios enlaces de reproducción del mismo título/episodio cuando están disponibles.
- Rechaza otros TMDB, temporadas, episodios, hosts falsos y redirecciones de identidad incorrecta.
- Resuelve rutas relativas contra la URL final y conserva los parámetros de los streams.
- Reconoce redirecciones directas hacia HLS/MP4 sin descargar el vídeo como HTML y rechaza destinos HTML disfrazados de vídeo.
- Endurece la validación de hosts y prueba la disponibilidad pública de los archivos de instalación en GitHub Actions.
- No devuelve diagnósticos ni páginas HTML como supuestos vídeos; TMDB 603 es un título normal.
- No inventa calidad HD ni afirma idioma/subtítulos que el extractor no ha comprobado.
- Diagnóstico sin API keys, tokens, cuerpos HTML ni URLs completas en logs.

## Límite importante de esta versión

**Detectar un servidor no significa que su vídeo se pueda extraer.**

Este proveedor resuelve enlaces HLS/MP4/MKV/WebM declarados directamente y hasta dos niveles de embeds.
No ejecuta JavaScript remoto. Desde 0.1.7 incorpora un adaptador específico para **Byse**:
consulta sus endpoints JSON públicos y descifra el bloque de reproducción AES-256-GCM con
`crypto.subtle`, que Nuvio ya implementa de forma nativa. La URL HLS/MP4 resultante se entrega
al reproductor con Referer/Origin sin descargar el vídeo dentro del scraper.

Los hosts dinámicos UPN/RPM/Ezplayer siguen sin adaptador específico. La reproducción real de
Oldboy con Byse está **pendiente de verificación en dispositivo**; no se declara funcional hasta
que arranque vídeo y audio en Nuvio.

TMDB usa la clave inyectada por Nuvio. Sin metadatos, intenta la búsqueda del sitio por ID,
siempre con identidad estricta; esa búsqueda no garantiza encontrar una ficha
(la consulta pública `?s=670` no encontró Oldboy durante la auditoría).

No se saltan cuentas, CAPTCHA, membresías, restricciones de acceso ni DRM.

## Pruebas y mantenimiento

Node 18+ para pruebas locales; CI configurada para Node 20, 22 y 24:

```bash
npm run check
npm run diagnose -- 670 movie
npm run diagnose -- 65693 tv 2 1
```

`diagnose` es para mantenimiento; el usuario solo tiene que probar la app.
Puede usarse `TMDB_API_KEY` como variable de entorno local, sin guardarla en archivos.
Código de salida: 0 si encontró streams, 1 si no los encontró, 2 si falta el ID o falla el CLI.

Límites por consulta: 18 peticiones, 6 resultados, 6 embeds por página, 2 niveles de embeds,
7 segundos por petición y presupuesto de 28 segundos. Un timeout detiene la consulta para
no acumular peticiones abandonadas cuando el runtime ignora AbortSignal.
Se rechazan cuerpos de más de 2 millones de caracteres después de leerlos; esto no limita
el buffer que el host ya haya reservado. Sin timers del host, rige su timeout nativo.

Ver [auditoría y evidencia](AUDIT.md) y [pruebas en dispositivo](TESTER.md).

### Byse AES-GCM (0.1.7)

El adaptador Byse admite dos contratos públicos observados: playback directo en
`/api/videos/<id>/` y el flujo `embed/details → embed/playback`. En ambos casos valida
la forma del JSON, concatena las partes de clave, exige clave AES de 32 bytes e IV de 12 bytes
y descifra el payload GCM con etiqueta de 128 bits. Un payload inválido falla cerrado.

La implementación se escribió para este proyecto a partir del comportamiento público documentado,
sin copiar código. Referencias revisadas: `johnneerdael/nexio-nagare` (MIT),
`yuzono/anime-extensions` (Apache-2.0) y el runtime `dotjarden/NuvioMobile` (GPL-3.0)
para confirmar que Nuvio expone WebCrypto/AES-GCM.

### Redirecciones (0.1.6)

Las redirecciones HTTP se siguen manualmente con un máximo de cuatro saltos,
rechazando destinos locales o con URL inválida. Cuando `Location` apunta
directamente a un HLS/MP4, se entrega la URL sin pedir el cuerpo del vídeo al
puente HTTP de Nuvio. Esto reduce el riesgo de cargar bytes de vídeo como HTML.

**Límite:** no se garantiza que el destino sea reproducible sin una comprobación
real; los hosts dinámicos protegidos siguen sin adaptador. Si el runtime ignora
`redirect:manual`, podría descargar el cuerpo antes de devolver la respuesta.

### Inspección HTTP del sitio (mantenimiento)

`Inspect public AsiaLiveAction pages` en GitHub Actions ejecuta un
chequeo no invasivo de la ficha pública de Oldboy y, solo si es accesible,
de una página de reproductor. También puede iniciarse manualmente desde
Actions. Solo publica códigos HTTP y nombres de hosts; `success` significa
que la inspección se ejecutó, no que el vídeo funcione.


## Variante nativa de Kino (experimental)

La carpeta `kino/` contiene un plugin nativo separado para **Kino 0.9.50+ (apiVersion 6), todavía no disponible en la versión pública estable comprobada el 2026-10-04**. No sustituye ni modifica
el scraper de Nuvio. Su objetivo es resolver los reproductores dinámicos de Asia Live Action con
`kino.browser.capture`: Kino abre la página pública del reproductor en una WebView oculta y devuelve
las peticiones multimedia que la propia página realiza, con sus cabeceras. El plugin no ejecuta con
`eval` ni `new Function` el JavaScript descargado de los servidores.

Primera etapa: películas. **No intentes instalar esta carpeta todavía**: el Kino público actual
rechaza apiVersion 6 con «Este plugin necesita una versión más nueva de Kino». Se conserva para
cuando 0.9.50/API 6 llegue realmente a la app. Mientras tanto, el desarrollo activo va por Nuvio 0.1.7.
