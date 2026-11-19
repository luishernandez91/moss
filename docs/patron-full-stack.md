# Patrón full stack

Cómo se construye una historia que cruza dominio, API y web. C1 (tipos de artículo y atributos) es la implementación de referencia; cópiala y ajusta los nombres.

## Capas y archivos

| Capa | Qué va | Referencia en C1 |
| --- | --- | --- |
| `packages/domain` | Reglas de negocio puras. Normalizan y validan; lanzan un error de dominio con `code` estable y `message` en español. Sin framework ni I/O. | `src/article-type.ts` (`ArticleTypeError`, `createAttributeDefinition`, `attributeKey`) |
| `packages/contracts` | Esquemas Zod de **forma** para peticiones, respuestas y parámetros de ruta: tipos, recortes, longitudes, uniones discriminadas, `strictObject` para rechazar campos de más. Reexporta constantes y etiquetas del dominio. Las reglas que cruzan registros (nombres únicos, claves) **no** van aquí. | `src/article-types.ts` |
| `apps/api/src/database/schema.ts` | Tablas en inglés (ver equivalencias en `docs/especificacion.md` §9). Unicidad, llaves foráneas y CHECK que respaldan las reglas del dominio. | `articleTypes`, `attributes` |
| `apps/api/drizzle/` | Migración nueva con `pnpm db:generate --name <slug>`; nunca editar una aplicada. | `0002_article_types.sql` |
| `apps/api/src/<contexto>/` | Módulo Nest por contexto. Controlador delgado que valida con `@Body/@Param/@Query({ schema })`; servicio que carga datos, llama al dominio y persiste. Sin reglas propias. | `catalog/` |
| `apps/web/src/app/<contexto>/<pantalla>/` | Un `@Service()` de datos (`httpResource` para leer, `HttpClient` para modificar y `reload()`), la página `OnPush` y sus diálogos con Signal Forms. Si la interfaz necesita aplicar una regla al editar (p. ej. completar «requerido»), usa una función del dominio, nunca una copia. | `catalog/article-types/` |

## Errores

| Situación | Respuesta | Cómo |
| --- | --- | --- |
| Forma inválida (Zod) | 400 `VALIDATION_ERROR` con `details` | `createValidationPipe` global |
| Sin sesión | 401 | Guard global de E0.5; nada es público salvo `@Public()` |
| No existe | 404 con código propio (`ARTICLE_TYPE_NOT_FOUND`) | `NotFoundException({ code, message })` en el servicio |
| Regla de dominio | 422 con el `code` y `message` del dominio | `runDomainRule(ErrorClass, () => regla(...))` (`common/domain-errors.ts`) |
| Choque con datos guardados | 409 con el `code` del dominio; `details` sale de `error.conflict` | `runDomainRule(UsageErrorClass, () => regla(...), 409)` |
| Carrera que rechaza la base (23505) | 409 con el mismo `code` que la regla | `guardWrite(() => insert/update, { unique: { code, message } })` |
| El padre se borró entre la validación y la escritura (23503) | 404 del padre | `guardWrite(..., { foreignKey: () => new NotFoundException(...) })` |
| Inesperado | 500 genérico; se registra en el log | `ApiExceptionFilter` |

La web muestra siempre el `message` de la API con `apiErrorMessage(error)` (`core/api-error.ts`): dentro del diálogo en un `role="alert"`, o en un snackbar para acciones en línea. Un control en línea que falla vuelve a su estado anterior (`change.source.checked = !change.checked`), porque recargar los datos no lo corrige si el valor no cambió. Las acciones destructivas piden confirmación con `ConfirmDialog`.

## Pruebas (primero, en este orden)

1. **Dominio** (`*.spec.ts` junto al archivo): casos numéricos o de reglas de la especificación, incluidos los mensajes exactos de error.
2. **Contratos** (`packages/contracts/src/*.spec.ts`): qué forma acepta y rechaza cada esquema.
3. **API e2e** (`apps/api/test/*.e2e-spec.ts`, supertest contra PostgreSQL real): 401 sin sesión en cada endpoint, CRUD completo, 400/404/409/422 y efectos en la base. Los datos llevan un prefijo único y se borran en `afterAll`; la sesión se crea con `setPassword` + `issueSession`.
4. **Web unitaria** (`*.spec.ts` del componente): `provideHttpClientTesting` y `HttpTestingController`; `BreakpointObserver` simulado para escritorio y celular. Llama `TestBed.tick()` antes de `expectOne`: `whenStable()` esperaría la petición pendiente de `httpResource`.
5. **Playwright** (`apps/web/e2e/*.spec.ts`, proyectos desktop 1440 px y mobile Pixel 7 a 390 px): el flujo completo de la pantalla, sin desborde horizontal y una captura por proyecto con `testInfo.outputPath`. Espera a que cada diálogo se cierre (`toHaveCount(0)`) antes de seguir o de capturar. Borra lo que creó en `afterEach`.

Después: compara las capturas con `docs/diseno/pantallas/NN-*` y registra las diferencias en su README.

## Trampas del stack

- Drizzle en la API **no** usa `casing: 'snake_case'` (solo lo usa drizzle-kit): nombra explícitamente las columnas `snake_case` (`uuid('article_type_id')`). Si no, la migración sale bien pero las consultas fallan con «column "createdAt" does not exist».
- `@Param({ schema })` valida el objeto completo de parámetros; usa `z.uuid()` para los IDs.
- `schema.ts` importa constantes de `@moss/domain` (p. ej. los valores de un enum); por eso `pnpm db:generate` compila los paquetes antes. Si corres `drizzle-kit` dentro de `apps/api`, corre `pnpm build:packages` primero o la migración saldrá de un `dist` viejo.
- Los cambios en `packages/*` no se ven en las apps hasta `pnpm build:packages`. Playwright arranca `apps/api/dist`: `pnpm e2e` ya compila todo, pero si corres `playwright test` dentro de `apps/web`, compila antes con `pnpm build:packages && pnpm --filter api build`.
- El servidor de desarrollo de Angular preempaqueta `@moss/domain` y `@moss/contracts` en `apps/web/.angular/cache`. Si agregas una exportación y el navegador dice «does not provide an export named …», borra esa carpeta (`rm -rf apps/web/.angular/cache`) y vuelve a arrancar.
- `httpResource` y pruebas: `fixture.whenStable()` espera las peticiones pendientes. Si una petición depende de otra (detalle → historial), responde la primera, espera una tarea (`await new Promise((r) => setTimeout(r))`) y llama `TestBed.tick()` antes de `expectOne` de la segunda.
- PostgreSQL: un `GROUP BY` sobre una expresión con parámetros (`col ->> $1`) no reconoce la misma expresión del `SELECT` (`$4`); agrupa por posición (`groupBy(sql\`1\`)`).
- `defaultNow()` es `now()`, la hora de inicio de la transacción: filas creadas en la misma transacción empatan. Si el orden de creación importa, usa `default(sql\`clock_timestamp()\`)`.
- Lo que Playwright crea y no tiene endpoint de borrado lo limpia `apps/api/test/browser-fixture.mjs` al terminar (catálogo con prefijo `e2e `).
- Playwright y diálogos de Material: el foco pasa al primer campo cuando termina la animación de apertura. Si la prueba escribe antes, el texto puede caer en otro campo (se vio bajo carga: «SKU» recibió el costo). Después de abrir un diálogo llama `openedDialog(page)` (`apps/web/e2e/dialogs.ts`).
- Un diálogo que necesita datos que se cargan con `httpResource` los lee vivos del servicio, no como copia al abrirse: si se abre antes de que lleguen, se quedaría vacío.
