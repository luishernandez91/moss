# Patrón full stack

Referencia: C1, tipos de artículo y atributos. Construir desde dominio y contratos hacia API y Angular. Dependencias: web y API → contracts/domain; contracts → tipos y constantes de domain; domain → nada.

## Capas y archivos

| Capa | Qué va | Referencia en C1 |
| --- | --- | --- |
| `packages/domain` | Reglas de negocio puras. Normalizan y validan; lanzan un error de dominio con `code` estable y `message` en español. Sin framework ni I/O. | `src/article-type.ts` (`ArticleTypeError`, `createAttributeDefinition`, `attributeKey`) |
| `packages/contracts` | Esquemas Zod de **forma** para peticiones, respuestas y parámetros de ruta: tipos, recortes, longitudes, uniones discriminadas, `strictObject` para rechazar campos de más. Reexporta constantes y etiquetas del dominio. Las reglas que cruzan registros (nombres únicos, claves) **no** van aquí. | `src/article-types.ts` |
| `apps/api/src/database/schema.ts` | Tablas en inglés (ver equivalencias en `docs/especificacion.md` §9). Unicidad, llaves foráneas y CHECK que respaldan las reglas del dominio. | `articleTypes`, `attributes` |
| `apps/api/drizzle/` | Migración nueva con `pnpm db:generate --name <slug>`; nunca editar una aplicada. | `0002_article_types.sql` |
| `apps/api/src/<contexto>/` | Módulo Nest por contexto. Controlador delgado que valida con `@Body/@Param/@Query({ schema })`; servicio que carga datos, llama al dominio y persiste. Sin reglas propias. | `catalog/` |
| `apps/web/src/app/<contexto>/<pantalla>/` | Un `@Service()` de datos (`httpResource` para leer, `HttpClient` para modificar y `reload()`), la página `OnPush` y sus diálogos con Signal Forms. Si la interfaz necesita aplicar una regla al editar (p. ej. completar «requerido»), usa una función del dominio, nunca una copia. | `catalog/article-types/` |

## Carpetas y nombres

- BD: tablas, columnas, restricciones, enums y sus valores en inglés; tablas y columnas en `snake_case`. Código: tipos y clases en `PascalCase`, propiedades y funciones en `camelCase`; archivos en `kebab-case`.
- Mantener el glosario de `AGENTS.md` y las equivalencias de §9. Ejemplos: `article_types` / `articleTypes` / `ArticleType`, `article_type_id` / `articleTypeId`. Español en etiquetas, mensajes y documentación; los nombres capturados por usuarios son datos.
- Dominio: archivo de entidad o regla en singular (`article-type.ts`) y prueba contigua (`article-type.spec.ts`). Exportaciones públicas en `src/index.ts`.
- Contratos: archivo por recurso HTTP (`article-types.ts`), esquemas `createArticleTypeSchema`, `updateArticleTypeSchema`, tipos inferidos y pruebas contiguas. No importar funciones de negocio desde dominio; las validaciones de representación pertenecen a Zod y las reglas del conjunto de datos al dominio.
- API: carpeta por contexto (`catalog/`); archivos `catalog.module.ts`, `article-types.controller.ts`, `article-types.service.ts`. Reutilizar `common/` y la inyección de `DATABASE`; no agregar una capa de repositorios genéricos sin una necesidad concreta.
- Web: carpeta por contexto y pantalla (`catalog/article-types/`); servicio `article-types-api.ts`, página `article-types-page.ts` con HTML/SCSS separados y diálogos por intención (`type-dialog.ts`, `attribute-dialog.ts`). Las piezas pequeñas de C1 usan plantilla y estilos en el propio archivo. `core/` aloja utilidades compartidas, no reglas del negocio.
- Endpoints y DTO de API en inglés (`/api/article-types`). C1 conserva rutas de navegación visibles en español (`/tipos-de-articulo`); son rutas de la interfaz, no nombres de tablas ni identificadores TypeScript.
- Imports internos de API y paquetes compilados en ESM con extensión `.js`, según los archivos de C1. En Angular, seguir sus imports y configuración existentes.

## Transacciones e integridad

Una validación de dominio recibe los datos que necesita y devuelve un resultado o error. El servicio de API decide cuándo leer, bloquear y persistir; el dominio nunca abre una transacción ni conoce Drizzle.

En C1, las escrituras de catálogo observadas son sentencias individuales, con restricciones de unicidad/FK y `guardWrite`. Esto no protege una operación que depende de varias filas. E0.5 sí usa `db.transaction` para crear o actualizar usuario y socio de forma atómica.

Para operaciones sobre varias filas:

1. Abrir `db.transaction`; todas las lecturas y escrituras de la operación usan `tx`, no la conexión exterior.
2. Leer y bloquear las filas necesarias antes de validar contra su estado, siempre en un orden estable por ID. `SELECT ... FOR UPDATE` serializa cambios de filas existentes; no impide por sí solo insertar filas nuevas.
3. Comparar la versión esperada enviada por el cliente con la leída bajo bloqueo. Un bloqueo sin esa comparación no detecta que un formulario está obsoleto.
4. Ejecutar las reglas puras sobre el conjunto completo y persistir todo o nada. Incrementar la versión en la misma transacción; devolver los valores y versiones definitivos.
5. Propagar el error para provocar rollback. Traducirlo a HTTP sin responder éxito parcial ni ocultar errores inesperados.

Las restricciones de BD respaldan las reglas que pueden expresar: rango, granularidad, unicidad y referencias. Un `CHECK` de una fila no garantiza una suma entre dos filas: esa invariante exige validar y actualizar el conjunto bajo la misma transacción en todos sus caminos de escritura.

Para límites de altas, contar filas sin serializar las inserciones permite carreras. Usar un bloqueo asesor transaccional compartido por todos los caminos de alta antes de consultar el total, incluso con la tabla vacía. La regla de límite vive en dominio; la capa de persistencia orquesta el bloqueo.

El token de versión puede ser un entero no negativo con valor inicial 0. Cada escritura incrementa la versión en la misma transacción. Probar que dos solicitudes con las mismas versiones no se sobrescriben y que un conflicto revierte el conjunto completo.

## Errores

| Situación | Respuesta | Cómo |
| --- | --- | --- |
| Forma inválida (Zod) | 400 `VALIDATION_ERROR` con `details` | `createValidationPipe` global |
| Sin sesión | 401 | Guard global de E0.5; nada es público salvo `@Public()` |
| No existe | 404 con código propio (`ARTICLE_TYPE_NOT_FOUND`) | `NotFoundException({ code, message })` en el servicio |
| Regla de dominio | 422 con el `code` y `message` del dominio | `runDomainRule(ErrorClass, () => regla(...))` (`common/domain-errors.ts`) |
| Carrera que rechaza la base (23505) | 409 con el mismo `code` que la regla | `guardWrite(() => insert/update, { unique: { code, message } })` |
| El padre se borró entre la validación y la escritura (23503) | 404 del padre | `guardWrite(..., { foreignKey: () => new NotFoundException(...) })` |
| Versión enviada distinta de la vigente | 409 con código propio del recurso | Comparación de todas las versiones bajo `FOR UPDATE`; rollback completo |
| Inesperado | 500 genérico; se registra en el log | `ApiExceptionFilter` |

La web muestra siempre el `message` de la API con `apiErrorMessage(error)` (`core/api-error.ts`): dentro del diálogo en un `role="alert"`, o en un snackbar para acciones en línea. Un control en línea que falla vuelve a su estado anterior (`change.source.checked = !change.checked`), porque recargar los datos no lo corrige si el valor no cambió. Las acciones destructivas piden confirmación con `ConfirmDialog`. En un conflicto de versión, conservar la captura para que el usuario pueda compararla, ofrecer recargar los datos actuales y exigir una nueva revisión antes de reenviar; no reintentar automáticamente con versiones nuevas.

## Pruebas (primero, en este orden)

1. **Dominio** (`*.spec.ts` junto al archivo): casos numéricos o de reglas de la especificación, incluidos los mensajes exactos de error.
2. **Contratos** (`packages/contracts/src/*.spec.ts`): qué forma acepta y rechaza cada esquema.
3. **API e2e** (`apps/api/test/*.e2e-spec.ts`, supertest contra PostgreSQL real): 401 sin sesión en cada endpoint, operaciones permitidas del recurso, 400/404/409/422 y efectos en la base. Los datos temporales llevan un prefijo único; para entidades permanentes, serializar las suites y restaurar los valores originales en `afterEach` sin borrar las entidades; la sesión se crea con `setPassword` + `issueSession`.
4. **Web unitaria** (`*.spec.ts` del componente): `provideHttpClientTesting` y `HttpTestingController`; `BreakpointObserver` simulado para escritorio y celular. Llama `TestBed.tick()` antes de `expectOne`: `whenStable()` esperaría la petición pendiente de `httpResource`.
5. **Playwright** (`apps/web/e2e/*.spec.ts`, proyectos desktop 1440 px y mobile Pixel 7 a 390 px): el flujo completo de la pantalla, sin desborde horizontal y una captura por proyecto con `testInfo.outputPath`. Espera a que cada diálogo se cierre (`toHaveCount(0)`) antes de seguir o de capturar. En `afterEach`, limpiar solo datos temporales propios y restaurar los valores originales de entidades permanentes. Serializar proyectos que modifiquen el mismo conjunto de registros.

Después: compara las capturas con `docs/diseno/pantallas/NN-*` y registra las diferencias en su README.

## Trampas del stack

- Drizzle en la API **no** usa `casing: 'snake_case'` (solo lo usa drizzle-kit): nombra explícitamente las columnas `snake_case` (`uuid('article_type_id')`). Si no, la migración sale bien pero las consultas fallan con «column "createdAt" does not exist».
- `@Param({ schema })` valida el objeto completo de parámetros; usa `z.uuid()` para los IDs.
- `schema.ts` importa constantes de `@moss/domain` (p. ej. los valores de un enum); por eso `pnpm db:generate` compila los paquetes antes. Si corres `drizzle-kit` dentro de `apps/api`, corre `pnpm build:packages` primero o la migración saldrá de un `dist` viejo.
- Los cambios en `packages/*` no se ven en las apps hasta `pnpm build:packages`. Playwright arranca `apps/api/dist`: `pnpm e2e` ya compila todo, pero si corres `playwright test` dentro de `apps/web`, compila antes con `pnpm build:packages && pnpm --filter api build`.
- El servidor de desarrollo de Angular preempaqueta `@moss/domain` y `@moss/contracts` en `apps/web/.angular/cache`. Si agregas una exportación y el navegador dice «does not provide an export named …», borra esa carpeta (`rm -rf apps/web/.angular/cache`) y vuelve a arrancar.
