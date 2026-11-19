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
| `apps/web/src/app/<contexto>/<pantalla>/` | Un `@Service()` de datos (`httpResource` para leer, `HttpClient` para modificar y `reload()`), la página `OnPush` y sus diálogos con Signal Forms. | `catalog/article-types/` |

## Errores

| Situación | Respuesta | Cómo |
| --- | --- | --- |
| Forma inválida (Zod) | 400 `VALIDATION_ERROR` con `details` | `createValidationPipe` global |
| Sin sesión | 401 | Guard global de E0.5; nada es público salvo `@Public()` |
| No existe | 404 con código propio (`ARTICLE_TYPE_NOT_FOUND`) | `NotFoundException({ code, message })` en el servicio |
| Regla de dominio | 422 con el `code` y `message` del dominio | `runDomainRule(ErrorClass, () => regla(...))` (`common/domain-errors.ts`) |
| Carrera que rechaza la base (23505) | 409 con el mismo `code` que la regla | `guardUnique(() => insert/update, { code, message })` |
| Inesperado | 500 genérico; se registra en el log | `ApiExceptionFilter` |

La web muestra siempre el `message` de la API con `apiErrorMessage(error)` (`core/api-error.ts`): dentro del diálogo en un `role="alert"`, o en un snackbar para acciones en línea. Las acciones destructivas piden confirmación con `ConfirmDialog`.

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
- Los cambios en `packages/*` no se ven en las apps hasta `pnpm build:packages`. Playwright arranca `apps/api/dist`: `pnpm e2e` ya compila todo, pero si corres `playwright test` dentro de `apps/web`, compila antes con `pnpm build:packages && pnpm --filter api build`.
