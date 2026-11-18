# Decisiones de arquitectura

Registro breve de decisiones. Una entrada por decisión, la más reciente arriba. Formato: contexto, decisión, consecuencias.

## 2026-11-18 · Estados de campaña (D4)

- **Contexto:** §5 define seis estados y lo que permite cada uno, pero no dice si un borrador con fechas incompletas es válido, si se puede programar una campaña cuyo inicio ya pasó, qué pasa con el precio especial de una campaña con datos inválidos, ni quién es dueño de la lista de estados (estaba duplicada en `packages/contracts` y en `price-resolution.ts`).
- **Decisión:**
  - `packages/domain/src/campaign-status.ts` es el único dueño de los estados: `PERSISTED_CAMPAIGN_STATUSES`, `CAMPAIGN_STATUSES` y `campaignStatusLabels`. `packages/contracts` construye sus `z.enum` con esas listas y reexporta las etiquetas (confirmado con el usuario). Para eso `contracts` depende de `@moss/domain` y la regla de dependencias de `AGENTS.md` pasa de «solo tipos» a «tipos y constantes, sin lógica».
  - `deriveCampaignStatus(campaign, clock)`: `scheduled` antes del inicio, `active` entre inicio y fin (ambos incluidos), `closing` después del fin; borrador, cerrada y cancelada no cambian con la fecha. «Hoy» sale de `today(clock)` en `America/Mexico_City`.
  - Un borrador no valida fechas («sin validar fechas», §5): puede no tenerlas, tener una sola o tener el inicio después del fin. Cualquier otro estado guardado exige ambas con inicio ≤ fin; si no, `MISSING_DATES` o `INVALID_DATE_RANGE`.
  - `transitionCampaign(campaign, action, { clock, reason })` decide sobre el estado derivado y devuelve el nuevo estado guardado y la entrada de bitácora `{ action, reason }`; la API agrega usuario y fecha (§8, regla 11). Tabla: `schedule` borrador → programada; `unschedule` y `cancel` solo desde programada (antes del inicio); `close` solo desde por cerrar; `reopen` cerrada → programada, que se deriva como por cerrar o activa. Cualquier otro par es `TRANSITION_NOT_ALLOWED` con un mensaje que nombra la acción y el estado actual.
  - Programar una campaña con inicio en el pasado se permite: queda activa o por cerrar de inmediato (confirmado con el usuario).
  - El motivo es opcional en todas las acciones y obligatorio al reabrir (`REASON_REQUIRED`); se guarda recortado, y uno vacío como `null`.
  - Eliminar no es una transición, porque no queda estado que guardar: `assertCanDelete` solo permite borradores.
  - Permisos por estado derivado: `canEdit` (borrador, programada), `canExtendEndDate` (activa; el empalme es D5), `canRegisterMovements` (activa, por cerrar), `canClose` (por cerrar), `canClone` (cerrada, cancelada), `canDelete` (borrador), `isReadOnly` (cerrada, cancelada).
  - `resolvePrice` usa `isCampaignOpen`, que no lanza: una campaña con fechas inválidas no está abierta y su precio especial no aplica (confirmado con el usuario). Cambia el caso «programada con inicio pero sin fin», que en D3 aplicaba el precio especial; ninguna prueba de D3 lo cubría.
- **Consecuencias:** la API debe derivar el estado con el reloj inyectado antes de cada acción y guardar la entrada de bitácora que devuelve la transición. La web usa los helpers `can*` para mostrar u ocultar acciones. El cierre automático tras N días de gracia (§5, opcional) no está en D4.

## 2026-11-18 · Resolución de precio en una venta (D3)

- **Contexto:** la especificación (§2, §8 regla 5) da el orden de resolución, pero no dice cómo entra el extra en el precio, si aplica un precio especial copiado al clonar y marcado para revisión, ni si el precio general se hereda del producto padre. Además, D3 necesita saber si la campaña está activa o por cerrar antes de que exista D4.
- **Decisión:**
  - `resolvePrice` en `packages/domain` es una función pura. Recibe el costo unitario ya resuelto (D2 o snapshot), el precio general, el precio especial del item de campaña, el ajuste manual y el margen mínimo configurado. El reloj se inyecta y «hoy» sale de `today()` en `America/Mexico_City`. La lista de precios (fase 2) es una función `PriceListLookup` inyectada que recibe el artículo, la cantidad, la fecha y el canal.
  - Orden: manual (exige motivo no vacío) > especial de campaña > lista > general. Sin ninguno → `NO_PRICE`. Se devuelven el precio aplicado, su origen (`manual`, `campaign`, `list`, `general`; en la base `manual`, `campana`, `lista`, `general`), el precio de lista (lista o general, aunque gane otro origen), el margen y el aviso.
  - Extras (confirmado con el usuario): el `precio_extra` se suma al precio general, de lista o especial. El ajuste manual es el precio total de la pieza.
  - Un precio especial con `requiere_revision` no aplica hasta revisarse (confirmado con el usuario). El resultado indica por qué se ignoró un precio especial (`campaign_not_open` o `requires_review`).
  - El precio general no se hereda del producto padre (confirmado con el usuario). Un ajuste manual o un precio especial vigente bastan aunque no haya precio general ni de lista; en ese caso `listPrice` es null y `venta_items.precio_lista` admite NULL (confirmado con el usuario; §9 se actualizó).
  - La lista se consulta con la fecha de la venta (`saleDate`, por defecto hoy) para respetar su vigencia en ventas atrasadas. La ventana del precio especial usa hoy, porque el estado de la campaña es el actual.
  - Un extra solo aplica a productos: con una variante vendida sola es `ADDON_NOT_ALLOWED`. La compatibilidad del extra con el producto la valida D2 al calcular el costo.
  - Un monto que no es entero de centavos da `INVALID_AMOUNT` y uno negativo `NEGATIVE_AMOUNT`. Se validan todos los orígenes aunque gane el manual: el precio de lista hace falta para el snapshot y un dato inválido del catálogo debe fallar visible.
  - Activa o por cerrar ⇔ estado guardado `scheduled` y hoy ≥ inicio. La fecha fin no cierra la ventana: después del fin la campaña queda por cerrar. Es un helper interno; D4 lo sustituirá con el estado derivado.
  - Margen sobre el precio con `marginPercent`. El aviso se aplica al precio aplicado de cualquier origen: `below_cost` si precio < costo; si no, `below_min_margin` si (precio − costo) × 100 < margen mínimo × precio, sin dividir; el producto con un mínimo decimal (11.3%) se corrige a 12 cifras para que un margen igual al mínimo no avise por error de flotantes. Precio igual al costo avisa margen mínimo; precio y costo en $0 no avisan. `evaluateMargin` se exporta para el semáforo de K3.
- **Consecuencias:** K3 y K6 usan `evaluateMargin` y `resolvePrice`; la API debe pasar el costo con el extra incluido y el precio del extra por separado. El semáforo (verde, ámbar, rojo) puede mapearse a sin aviso, `below_min_margin` y `below_cost`. Cuando llegue D4, el helper de campaña abierta debe reemplazarse por el estado derivado.

## 2026-11-18 · Resolución de costos heredados (D2)

- **Contexto:** la especificación (§2) dice que un componente con tamaño sustituye al genérico, pero no dice cómo se emparejan, ni qué pasa si una cantidad por tamaño no incluye el tamaño pedido. El catálogo de ejemplo escribe las cantidades como objetos por tamaño, mientras que el esquema (§9) usa filas con `tamano_id`.
- **Decisión:**
  - `resolveCost` en `packages/domain` es una función pura. El costo de cada artículo sale de una función `CostLookup` inyectada, que por defecto es el costo promedio del catálogo; así K5 puede pasar los costos de la campaña. Los montos fijos no pasan por esa función.
  - Una cantidad o un monto escrito como objeto por tamaño equivale a un componente por tamaño. Dentro de un mismo producto, los componentes se agrupan por clave: artículo + SKU fijo + filtro en los de artículo, y concepto en los de monto fijo. En cada grupo, el que tiene tamaño gana al genérico, y el genérico aparece como `overridden`. Entre niveles solo se sustituye con `sustituye_componente_id`, que sustituye el grupo del componente heredado (incluida su versión con tamaño). Todas las versiones de un grupo deben sustituir al mismo heredado.
  - `NO_COMPONENT_FOR_SIZE`: un grupo genérico cuyas cantidades por tamaño no incluyen el tamaño pedido es un error, salvo que un descendiente lo sustituya para ese tamaño. Un componente con `tamano` explícito que no coincide simplemente no aplica.
  - Los tamaños del producto (`tamanos`) se heredan del ancestro más cercano que los define. Un tamaño fuera de la lista da `SIZE_NOT_OFFERED`.
  - Filtro de atributos: si coinciden varias variantes, se exige elegir una por id de componente. Elegir una que no cumple el filtro, o elegir para un componente que no está en la receta, es un error.
  - Las líneas sustituidas se devuelven para que la pantalla 8 las muestre tachadas. Si su variante no se puede resolver, su costo queda en `null`; nunca suman al total.
  - El extra aplica si `aplica_a` contiene el producto o alguno de sus ancestros. Sus líneas van al final, con origen `own`.
- **Consecuencias:** C2 y la UI de recetas deben respetar estas reglas. Al guardar una receta conviene validar en la API los mismos errores, para no descubrirlos hasta el cálculo. El caso de §10 «Nochebuena mediana + Reno = $91.50» omite la tierra; con el catálogo de ejemplo el resultado es $93.15. Ambos casos tienen prueba, y la especificación no se cambió.

## 2026-11-11 · Inversión por socio y reparto 50/50

- **Contexto:** los dos socios compran insumos por separado para cada campaña.
- **Decisión:** cada gasto registra qué socio lo pagó (o la caja del negocio). Al cerrar, cada socio recupera su inversión y su trabajo, y la ganancia se divide 50/50. La reinversión es opcional por campaña (0% por defecto). Con pérdida, la pérdida también se divide 50/50.
- **Consecuencias:** un socio puede terminar "debiendo aportar" en una campaña con pérdida si invirtió poco. Pendiente de confirmar con los socios.

## 2026-11-10 · Stack TypeScript de punta a punta

- **Contexto:** dos socios, uso principal desde celular, desarrollo con Claude Code y Codex. Se evaluaron Laravel + Filament y NestJS + Angular.
- **Decisión:** monorepo pnpm con Angular 22, NestJS 12, PostgreSQL 18 y Drizzle ORM. Lógica de negocio en `packages/domain`, esquemas Zod compartidos en `packages/contracts`.
- **Consecuencias:** un solo lenguaje y tipos compartidos; el compilador atrapa errores de los agentes. Más código que mantener que con Filament.

## 2026-11-10 · PostgreSQL en lugar de MySQL

- **Contexto:** el empalme de campañas debe ser imposible aunque haya un bug, y los atributos de artículos son variables por tipo.
- **Decisión:** PostgreSQL con `EXCLUDE USING gist` sobre `daterange` y columnas `jsonb` para atributos.
- **Consecuencias:** requiere la extensión `btree_gist` para combinar `type` con el rango de fechas.

## 2026-11-10 · Drizzle en lugar de Prisma

- **Contexto:** el modelo usa restricciones y tipos propios de PostgreSQL (`EXCLUDE`, `daterange`, `jsonb`) y consultas recursivas para el árbol de productos.
- **Decisión:** Drizzle ORM, con esquema en TypeScript y SQL explícito donde haga falta.
- **Consecuencias:** las restricciones `EXCLUDE` se escriben como SQL en la migración. Menos abstracción que Prisma; más control.

## 2026-11-10 · Dinero en centavos enteros

- **Decisión:** todos los montos se guardan y calculan en centavos enteros. Redondeo half-up una sola vez por componente.
- **Consecuencias:** formateo a pesos solo en la capa de presentación.

## 2026-11-10 · Código en inglés, interfaz en español

- **Decisión:** identificadores, tablas y commits en inglés; textos de UI y documentación en español. El glosario de `AGENTS.md` es la referencia de traducción.
- **Consecuencias:** la especificación usa nombres en español; al implementar, traducir con el glosario y no inventar sinónimos.
