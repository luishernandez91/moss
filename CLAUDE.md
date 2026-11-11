@AGENTS.md

# Notas solo para Claude Code

Las reglas del proyecto están en `AGENTS.md` (importado arriba) y aplican igual aquí. Esta sección agrega solo lo específico de Claude Code.

## Flujo por historia

- Empieza cada historia nueva con `/clear` para no arrastrar contexto de la anterior.
- Para historias de dominio (prefijo `D` en el backlog) o que cambien el esquema de base de datos, usa **plan mode** primero y espera aprobación antes de escribir código.
- Para historias de UI, antes de escribir código abre las dos imágenes de la pantalla que cita la historia (`docs/diseno/pantallas/NN-*-desktop.png` y `NN-*-mobile.png`), revisa en `docs/diseno/pantallas/README.md` si tiene diferencias conocidas y lee la sección de la especificación. Donde la imagen y la especificación no coincidan, sigue la especificación.
- Cuando la historia esté implementada y en verde, pide una revisión con un subagente que no haya visto el trabajo: que lea el diff contra los criterios de aceptación y las reglas de dominio de `AGENTS.md`, y reporte solo hallazgos concretos.

## Verificación

- No digas que algo funciona sin haber corrido `pnpm typecheck && pnpm lint && pnpm test`.
- En cambios de UI, toma capturas con Playwright a 390 px y a 1440 px de ancho. Revisa que no haya desbordes ni textos cortados y compáralas con las imágenes de referencia de la pantalla: estructura, jerarquía y orden de los elementos deben coincidir; colores exactos y cifras de ejemplo no.
- Si al implementar descubres que una imagen de referencia ya no coincide con la especificación, agrega la diferencia a la tabla de `docs/diseno/pantallas/README.md`.
- Si una prueba falla por una razón que no entiendes, detente y explica; no la modifiques para que pase.

## Contexto

- No leas `pnpm-lock.yaml`, `dist/`, `node_modules/` ni migraciones generadas salvo que la tarea lo requiera.
- La especificación es larga: lee solo las secciones que cita la historia.
- Si descubres algo que todo agente debería saber (un comando, una trampa del stack), propón agregarlo a `AGENTS.md` en lugar de a este archivo.
