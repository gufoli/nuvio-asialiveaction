# Asia Live Action — Nuvio 0.1.4

Proveedor no oficial, sin dependencias. Busca por identidad TMDB y por temporada/episodio exactos.

## Instalar o actualizar

En la sección de plugins/repositorios de **Nuvio Full**, añadir o actualizar:

```text
https://raw.githubusercontent.com/gufoli/nuvio-asialiveaction/main/manifest.json
```

Si vienes del repositorio de `man-zanilla`, elimina **solo ese repositorio** de Nuvio y añade la URL de `gufoli` indicada arriba. Actualizar la entrada antigua seguirá consultando la cuenta anterior.

Si ya está instalado desde `gufoli`, actualizar el repositorio y comprobar que el proveedor muestra **0.1.4**.
Si conserva 0.1.2, quitar únicamente este repositorio y añadir la misma URL de nuevo.
No es necesario descargar ZIP, copiar código ni modificar GitHub.

La compatibilidad real con Kino queda pendiente; no se ha probado en ese runtime.

## Qué está corregido

- Lee la estructura `allVideos` que usa actualmente AsiaLiveAction y los iframes públicos.
- Ignora el iframe social de Facebook, iframes vacíos y plantillas `${video[1]}`.
- Prueba varios enlaces de reproducción del mismo título/episodio cuando están disponibles.
- Rechaza otros TMDB, temporadas, episodios, hosts falsos y redirecciones de identidad incorrecta.
- Resuelve rutas relativas contra la URL final y conserva los parámetros de los streams.
- No devuelve diagnósticos ni páginas HTML como supuestos vídeos; TMDB 603 es un título normal.
- No inventa calidad HD ni afirma idioma/subtítulos que el extractor no ha comprobado.
- Diagnóstico sin API keys, tokens, cuerpos HTML ni URLs completas en logs.

## Límite importante de esta versión

**Detectar un servidor no significa que su vídeo se pueda extraer.**

Este proveedor resuelve enlaces HLS/MP4/MKV/WebM declarados directamente y hasta dos niveles de embeds.
No ejecuta el JavaScript descargado de una web ni tiene adaptadores específicos para los actuales
players dinámicos Byse/UPN/RPM/Ezplayer. La ficha real de Oldboy expone esos cuatro hosts;
la reproducción de Oldboy sigue **pendiente**, y puede devolver cero streams.
No se ha verificado reproducción audiovisual en Nuvio ni en Kino.

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
