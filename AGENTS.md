# AGENTS.md — Moss & Roots

Instrucciones para agentes de código (Claude Code, Codex y otros). Léelas completas antes de cada tarea.

## Qué es y para qué

Sistema web interno para llevar las finanzas de Moss & Roots, un negocio de kokedamas y plantas ornamentales con dos socios. Todo se organiza por **campañas**: cada gasto, producción y venta pertenece a una campaña con presupuesto, fechas y estado. El sistema calcula el costo real de cada pieza a partir de recetas heredadas, resuelve precios y reparte la ganancia entre socios al cerrar.

Los usuarios son dos personas, casi siempre desde el celular. La prioridad es que los números sean correctos; la segunda, que registrar una venta en el tianguis tome segundos.

- Especificación funcional completa: `docs/especificacion.md` (léela antes de tocar dominio o pantallas).
- Plan de trabajo e historias: `backlog.md`.
- Decisiones de arquitectura: `docs/decisiones.md`.
- Diseño de pantallas: imágenes de referencia en `docs/diseno/pantallas/` (desktop y mobile por pantalla, con el número de la especificación, ej. `13-detalle-de-campana-desktop.png`). El índice y las diferencias conocidas están en `docs/diseno/pantallas/README.md`. Los prompts que las generaron están en `docs/diseno/prompts-pantallas.md`.
- **Las imágenes son referencia de layout y jerarquía, no la fuente de verdad.** Si una imagen contradice la especificación en cifras, campos o reglas, gana la especificación. Abre solo las imágenes de la pantalla de tu historia, no toda la carpeta.

## Stack (no cambiar versiones mayores sin pedirlo)

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 24 LTS, pnpm (workspaces) |
| Lenguaje | TypeScript 6, `strict: true` en todos los paquetes |
| Web | Angular 22: standalone, zoneless, signals, Signal Forms, `OnPush` por defecto, `@Service()`, `httpResource` |
| UI | Angular Material + CDK, tema propio con tokens |
| API | NestJS 12 en ESM, validación con esquemas Zod (opción `schema` de Standard Schema en `@Body`, `@Query`, `@Param`) |
| Base de datos | PostgreSQL 18, Drizzle ORM y Drizzle Kit para migraciones |
| Pruebas | Vitest (unitarias e integración), Playwright (e2e) |
| Lint y formato | oxlint, Prettier |

Las versiones exactas viven en `package.json` y `pnpm-lock.yaml`. Si una API que recuerdas no existe en la versión instalada, revisa la documentación de esa versión; no bajes ni subas la dependencia para que tu código compile.

## Estructura

```
apps/web          Angular. Pantallas, estado de UI, llamadas HTTP.
apps/api          NestJS. Módulos por contexto, persistencia, auth.
packages/domain   TypeScript puro. Reglas de negocio y cálculos. Sin dependencias de framework ni de I/O.
packages/contracts Esquemas Zod y tipos compartidos entre web y API.
docs/             Especificación, decisiones y diseño.
```

Dependencias permitidas: `web → contracts, domain` · `api → contracts, domain` · `contracts → domain` (solo tipos) · `domain → nada`. Nunca importes de `apps/*` dentro de `packages/*`.

## Comandos

```bash
cp .env.example .env    # la primera vez
pnpm install
pnpm db:up              # PostgreSQL 18 en Docker
pnpm db:migrate         # aplica migraciones de Drizzle
pnpm dev                # base + API (:3000) + web (:4200, proxy /api)
pnpm test               # Vitest en todos los paquetes (compila packages/* antes)
pnpm --filter @moss/domain test
pnpm --filter api test:e2e   # API contra PostgreSQL real
pnpm e2e                # Playwright, desktop y celular (la primera vez: pnpm --filter web exec playwright install chromium)
pnpm lint               # oxlint
pnpm typecheck          # tsc --noEmit en todos los paquetes
pnpm format             # Prettier
pnpm db:generate        # genera migración desde src/database/schema.ts
pnpm db:seed            # carga docs/datos/catalogo-ejemplo.json (se implementa en C2)
```

`packages/domain` y `packages/contracts` se consumen compilados (`dist/`). Los scripts raíz los compilan antes; si corres un comando dentro de una app y no ve un cambio de un paquete, corre `pnpm build:packages`.

**Antes de dar una tarea por terminada:** `pnpm typecheck && pnpm lint && pnpm test` sin errores. Si tocaste pantallas, también `pnpm e2e` para el flujo afectado.

## Reglas de dominio que no se negocian

1. **Dinero en centavos enteros** (`number` entero o `bigint`, columna `integer`/`bigint`). Nunca flotantes para montos. Las cantidades fraccionarias de insumo (0.01 de bulto) se multiplican y se redondean a centavos una sola vez, al final del cálculo de cada componente, con redondeo half-up.
2. **Toda lógica de negocio vive en `packages/domain`** como funciones puras con pruebas: resolución de costos heredados, resolución de precios, estados de campaña, empalme, prorrateo de costos fijos, cierre y reparto. La API orquesta y persiste; la web muestra. Si escribes un cálculo en un controlador, servicio de Nest o componente de Angular, está en el lugar equivocado.
3. **Snapshots.** Producción y venta guardan costo unitario, precio de lista, precio aplicado y origen del precio en el momento del registro. Nunca recalcules el pasado a partir del catálogo actual.
4. **No contar dos veces.** El resultado de una campaña sale de gastos y ventas reales. El costo de receta sirve para precios y comparación, nunca se suma al resultado.
5. **Estados de campaña.** Se persisten solo `draft`, `scheduled`, `closed`, `cancelled`. `active` y `closing` se derivan de las fechas con la zona `America/Mexico_City`. Una campaña `closed` o `cancelled` es de solo lectura en dominio, API y UI.
6. **Empalme.** Restricción `EXCLUDE USING gist` sobre `daterange(start_date, end_date, '[]')` por tipo de campaña, para estados `scheduled` y cerrables. Además, validación en dominio para dar un mensaje claro.
7. **Fechas.** Fechas de negocio como `date` (sin hora). Timestamps en UTC. "Hoy" siempre se calcula en `America/Mexico_City`, con una función de dominio que recibe el reloj inyectado.

## Glosario (español en UI y docs, inglés en código)

| Negocio | Código |
| --- | --- |
| Campaña / item de campaña | `Campaign` / `CampaignItem` |
| Tipo de artículo / artículo / variante / atributo | `ArticleType` / `Article` / `Variant` / `Attribute` |
| Tamaño | `Size` |
| Producto / subproducto | `Product` (con `parentId`) |
| Componente de receta | `RecipeComponent` |
| Extra (reno, moño) | `AddOn` |
| Gasto / costo fijo | `Expense` / `FixedCost` |
| Producción | `ProductionRun` |
| Venta / partida de venta | `Sale` / `SaleLine` |
| Socio / reparto | `Partner` / `ProfitSplit` |
| Precio especial / origen del precio | `specialPrice` / `priceSource` |
| Inventario sobrante | `leftoverInventory` |
| Bitácora de campaña | `CampaignEvent` |
| Cliente / cotización / pedido / anticipo | `Customer` / `Quote` / `Order` / `Deposit` |

Textos visibles para el usuario: español de México, montos como `$1,540.00`, fechas como `10 nov 2026`.

## Cómo trabajar

1. Toma **una historia** del backlog. Lee sus criterios de aceptación y las secciones de `docs/especificacion.md` que cita.
2. Si la historia toca dominio: escribe primero las pruebas con los casos numéricos de la especificación, confirma que fallan y luego implementa.
3. Cambios pequeños y verificables. Un PR por historia, rama `feat/<id>-<slug>` (ej. `feat/D2-cost-resolution`).
4. Commits en formato Conventional Commits, en inglés: `feat(domain): resolve inherited recipe costs`.
5. Al terminar, marca la historia en `backlog.md` y anota cualquier decisión nueva en `docs/decisiones.md`.

## Límites

- **Pregunta antes de:** agregar una dependencia, cambiar el esquema de una tabla existente, cambiar una regla de dominio, o tocar algo fuera de la historia.
- **Nunca:** editar una migración ya aplicada (crea una nueva), desactivar una prueba para que pase, usar `any` sin comentario que lo justifique, guardar secretos en el repositorio (usa `.env`, con `.env.example` versionado), ni borrar datos de campañas cerradas.
- Si la especificación y el código se contradicen, detente y pregunta. No adivines la regla de negocio.
