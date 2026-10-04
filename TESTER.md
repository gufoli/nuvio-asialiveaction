# Pruebas en Nuvio — 0.1.5

No hace falta tocar GitHub ni ejecutar comandos.

1. Si tienes instalada la entrada antigua de `man-zanilla`, elimina solo esa entrada y añade:
   `https://raw.githubusercontent.com/gufoli/nuvio-asialiveaction/main/manifest.json`
   Confirma **0.1.5**. Las siguientes actualizaciones se harán desde esta nueva entrada.
2. Abre **Oldboy (2003)** y busca fuentes. Indica si aparecen fuentes de Asia Live Action.
   Actualmente sus hosts dinámicos no están soportados: cero fuentes es una limitación conocida,
   no prueba de que el repositorio no se haya instalado.
3. Prueba **Good Morning Call**, temporada 1 episodio 1 y temporada 2 episodio 1.
   Indica si aparecen fuentes y, si alguna reproduce, si corresponde al episodio solicitado.
4. Si tienes otro título que reproduzca desde AsiaLiveAction en la web, prueba ese mismo título en Nuvio.
5. Si aparecen fuentes, comprueba arranque, audio, subtítulos y avance unos minutos.

Envíame: versión y dispositivo de Nuvio, título/año o temporada/episodio,
y captura del resultado o error. No envíes claves API ni tokens.

El botón genérico «Proveedor de pruebas» consulta TMDB 603 (The Matrix).
Que devuelva cero fuentes no demuestra un fallo de AsiaLiveAction: ese título puede no estar en el catálogo.
Ya no se sustituye esa película por falsos vídeos de diagnóstico.


## Resultado recibido — 2026-10-04

**Oldboy (2003), Android, 0.1.5:** el filtro Asia Live Action aparece durante la carga y desaparece al finalizar. Nuvio oculta los proveedores que terminan con cero streams. Esto confirma que el plugin está instalado y se ejecuta; el resultado actual para Oldboy es **0 fuentes reproducibles**.

No hace falta repetir esta prueba hasta que se publique un extractor de host nuevo.
