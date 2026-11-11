@AGENTS.md

# Notas solo para Claude Code

Las reglas del proyecto están en `AGENTS.md` (importado arriba) y aplican igual aquí. Esta sección agrega solo lo específico de Claude Code.

## Flujo por historia

- Empieza cada historia nueva con `/clear` para no arrastrar contexto de la anterior.
- Para historias de dominio (prefijo `D` en el backlog) o que cambien el esquema de base de datos, usa **plan mode** primero y espera aprobación antes de escribir código.
- Para historias de UI, revisa el prompt de la pantalla en `docs/diseno/prompts-pantallas.md` y la sección de la especificación que cita la historia.
- Cuando la historia esté implementada y en verde, pide una revisión con un subagente que no haya visto el trabajo: que lea el diff contra los criterios de aceptación y las reglas de dominio de `AGENTS.md`, y reporte solo hallazgos concretos.

## Verificación

- No digas que algo funciona sin haber corrido `pnpm typecheck && pnpm lint && pnpm test`.
- En cambios de UI, abre la pantalla con Playwright a 390 px y a 1440 px de ancho y revisa que no haya desbordes ni textos cortados.
- Si una prueba falla por una razón que no entiendes, detente y explica; no la modifiques para que pase.

## Contexto

- No leas `pnpm-lock.yaml`, `dist/`, `node_modules/` ni migraciones generadas salvo que la tarea lo requiera.
- La especificación es larga: lee solo las secciones que cita la historia.
- Si descubres algo que todo agente debería saber (un comando, una trampa del stack), propón agregarlo a `AGENTS.md` en lugar de a este archivo.
