# Backlog — Moss & Roots

Cada historia es una unidad de trabajo para un agente: una rama, un PR. El orden importa: respeta las dependencias. Marca `[x]` al terminar y mueve las decisiones nuevas a `docs/decisiones.md`.

**Formato:** `ID · título` · Spec = sección de `docs/especificacion.md` · Depende = historias previas · Criterios = lo que debe ser verdad para cerrarla.

**Definición de terminado (aplica a todas):** `pnpm typecheck && pnpm lint && pnpm test` en verde; pruebas nuevas para la lógica agregada; textos de UI en español; pantalla revisada a 390 px y 1440 px si hubo UI.

---

## Fase 0 · Fundaciones

- [x] **E0.1 · Monorepo y herramientas**
  - Depende: —
  - Criterios:
    - Workspaces pnpm: `apps/web`, `apps/api`, `packages/domain`, `packages/contracts`.
    - TypeScript 6 `strict` en todos; `tsconfig` base compartido.
    - oxlint y Prettier configurados; scripts raíz `dev`, `test`, `lint`, `typecheck`, `e2e`, `db:generate`, `db:migrate`, `db:seed` (ver `AGENTS.md`).
    - `.nvmrc` con Node 24; `engines` en `package.json`.
    - CI (GitHub Actions) que corre typecheck, lint y test en cada PR.

- [x] **E0.2 · Base de datos local y Drizzle**
  - Depende: E0.1
  - Criterios:
    - `docker-compose.yml` con PostgreSQL 18; extensión `btree_gist` habilitada en la primera migración.
    - Drizzle configurado en `apps/api`; `db:generate` y `db:migrate` funcionan.
    - `.env.example` con `DATABASE_URL`, `SESSION_SECRET`, `TZ_BUSINESS=America/Mexico_City`.

- [x] **E0.3 · Esqueleto de API**
  - Depende: E0.2
  - Criterios:
    - NestJS 12 en ESM; módulo de salud `GET /health`.
    - Validación con esquemas Zod de `packages/contracts` (opción `schema` en decoradores).
    - Filtro global de errores con respuesta `{ code, message, details? }` en español.
    - Prueba de integración con Vitest contra una base de pruebas.

- [x] **E0.4 · Esqueleto web**
  - Depende: E0.1
  - Criterios:
    - Angular 22 standalone y zoneless; Angular Material con tema propio (tokens de color del diseño).
    - Layout con barra lateral en desktop y barra inferior en celular; rutas vacías para todas las pantallas MVP.
    - Utilidades de formato: `formatMoney(centavos)` → `$1,540.00`, `formatDate` → `10 nov 2026`.
    - Una prueba e2e con Playwright que abre la app.

- [x] **E0.5 · Autenticación**
  - Depende: E0.3, E0.4
  - Spec: pantalla 1
  - Criterios:
    - Login con correo y contraseña; scrypt de Node con sal aleatoria, N=32768, r=8, p=3 y maxmem=64 MiB. Sin dependencias nuevas.
    - Cookie firmada HMAC, vencimiento a 30 días, `httpOnly`, `sameSite=lax`, `secure` en producción; sin tabla de sesiones. Incluye `session_version`, comprobada contra el usuario.
    - Usuario ligado a un socio con UUID. Guard global de API (health, login y logout públicos), guard de rutas Angular y logout.
    - `pnpm auth:set-password <correo> [nombre]`: crea usuario y socio o cambia contraseña; entrada oculta por terminal, mínimo 6 caracteres. El cambio incrementa `session_version` e invalida las sesiones del usuario.
    - Cinco fallos de login por IP bloquean 15 minutos; mapa en memoria con limpieza de entradas vencidas. Métodos que modifican estado exigen JSON solo cuando tienen cuerpo.
    - Sin registro público ni recuperación por correo (F2.9). Rotar `SESSION_SECRET` invalida todas las sesiones; logout solo borra la cookie.
    - Pruebas de hash real, login, protección, expiración/alteración, versión, bloqueo y flujo web desktop/celular. Operación local en `docs/autenticacion.md`.

---

## Fase 1 · Dominio puro (`packages/domain`)

Sin base de datos ni HTTP. Todo con pruebas que usan los casos de la sección 10 de la especificación.

- [x] **D1 · Dinero y fechas de negocio**
  - Depende: E0.1
  - Criterios:
    - Tipo `Money` en centavos enteros; suma, resta, multiplicación por cantidad decimal con redondeo half-up, porcentaje.
    - `today(clock)` en `America/Mexico_City`; comparación de fechas sin hora.
    - Prueba: `0.01 × $110.00 = $1.10`; `4 × $0.50 = $2.00`.

- [x] **D2 · Resolución de costos heredados**
  - Depende: D1
  - Spec: §2
  - Criterios:
    - Dado el árbol de productos, componentes, tamaño y extra, devuelve el desglose con origen de cada línea (`own`, `inherited`, `overridden`) y el total.
    - Componente con tamaño sustituye al genérico; `sustituye_componente_id` sustituye al heredado; `{tamano}` toma la variante del mismo tamaño.
    - Componentes con filtro de atributos sin variante elegida: usa el costo de la variante que coincide; si varias coinciden, exige elegir.
    - Pruebas: Kokedama Nochebuena chica = $53.10; Nochebuena mediana + Reno = $91.50; Kokedama Helecho sustituye fabricación.
    - Rechaza árboles de más de 3 niveles y ciclos.

- [x] **D3 · Resolución de precio**
  - Depende: D1
  - Spec: §2
  - Criterios:
    - Orden: manual > especial de campaña (solo si la campaña está activa o por cerrar) > lista (fase 2, interfaz lista) > general.
    - Devuelve precio, origen y margen sobre el costo.
    - Aviso si el precio queda bajo el costo o bajo el margen mínimo configurado. Prueba: $50 sobre $53.10 da aviso de margen negativo.

- [x] **D4 · Estados de campaña**
  - Depende: D1
  - Spec: §5
  - Criterios:
    - Estado derivado desde estado persistido + fechas + hoy.
    - Tabla de transiciones permitidas; cualquier otra lanza error de dominio con mensaje en español.
    - `canEdit`, `canRegisterMovements`, `canClose`, `canClone` por estado.
    - Reabrir exige motivo.

- [x] **D5 · Empalme de campañas**
  - Depende: D4
  - Criterios:
    - Detecta empalme entre rangos cerrados `[inicio, fin]` del mismo tipo para estados programada, activa y por cerrar; ignora borradores, cerradas y canceladas.
    - Pruebas: 1–15 dic contra 10–31 dic mismo tipo → empalme; tipos distintos → sin empalme; fin = inicio de otra → empalme.

- [x] **D6 · Prorrateo de costos fijos**
  - Depende: D1
  - Spec: §1, pantalla 13, §8 regla 1
  - Criterios:
    - Reparte los costos fijos de la campaña entre las unidades producidas (por unidad, sin pesos) con `allocate`: entre líneas, el residuo de centavos va por ID ascendente UTF-16; dentro de cada línea, con pesos iguales, de modo que ninguna pieza difiere en más de 1¢. La suma asignada cuadra con el total; sin unidades producidas, el total queda sin asignar.
    - Devuelve costo real por pieza = costo de receta + prorrateo, para comparar contra el costo de receta.
    - Solo para precio y comparación: no participa en el cierre, que ya descuenta los gastos fijos reales en D7.

- [x] **D7 · Cierre y reparto**
  - Depende: D1
  - Spec: §8 regla 7
  - Criterios:
    - Entrada: ventas, gastos con pagador (socio o caja), aportaciones opcionales ([] por defecto), trabajo devengado por socio, reinversión en puntos base (0 por defecto), participación en puntos base (5000 por socio por defecto; suma exacta 10000), inventario sobrante.
    - Capital de cada socio = gastos que pagó + aportaciones a caja. Caja neta = gastos pagados por caja − aportaciones; puede ser negativa. Las aportaciones no son gastos.
    - Orden: recuperar caja neta → recuperar capital → pagar trabajo con el remanente (a prorrata si no alcanza) → apartar reinversión → repartir ganancia por participación. Si falta capital, trabajo pagado $0 y solo esa pérdida se reparte.
    - Salida por socio: inversión, recupera, trabajo devengado, pagado e impago informativo, participación en resultado y total; más recuperación neta y reinversión de caja. El trabajo impago no genera deuda ni se arrastra a otras campañas. `result` conserva ventas − gastos − trabajo devengado como indicador informativo.
    - Pruebas con la sección 10 de la especificación: reinversión 0% → Luis $2,170, el otro socio $1,430; reinversión 30% → $1,939 / $1,199 / caja $462; pérdida de $460 → Luis $1,170, el otro socio debe aportar $170. En todos, la suma cuadra con las ventas.
    - Con pérdida o trabajo parcialmente pagado no hay reinversión. Casos: ventas $1,200/capital otro $1,000/trabajo Luis $400 → $200/$1,000; ventas $600/capital Luis $300 y otro $700/trabajo Luis $400 → $100/$500; Nochebuena real → $1,365/$15 y trabajo impago $600.
    - La caja recupera íntegra su financiación neta incluso con pérdida, sin participación en el resultado. Totales de socios + total de caja = ventas, incluyendo caja neta negativa.
    - Residuo de centavos de trabajo y ganancia/pérdida: `allocate` con pesos enteros exactos, por ID ascendente UTF-16; pesos cero no reciben residuo. Reinversión con `percentageBps` exacto y half-up.
    - Vigencia: cierres desde esta decisión; no recalcular los ya liquidados. K7 debe persistir el snapshot del cierre. K4 registra las aportaciones (persistencia y UI) como movimientos de campaña junto a los gastos; K7 solo las consume al cerrar.

- [x] **D8 · Clonación de campaña**
  - Depende: D4
  - Spec: §5 (estados, pantalla 12), §9
  - Criterios:
    - Solo desde cerrada o cancelada. Produce un borrador sin fechas con nombre "base (copia)" (sin duplicar el sufijo), tipo, presupuesto, % reinversión, notas e items; IDs de un generador inyectado.
    - Opción de costos: de la original (compra → manual) o del catálogo (origen catálogo). Un item no disponible en el catálogo conserva su costo, se copia inactivo y genera el aviso `CATALOG_ITEM_UNAVAILABLE`. Precios especiales copiados con `requiere_revision = true`; ese campo es exclusivo del precio especial.
    - Nunca copia gastos, aportaciones, producciones, ventas, inventario sobrante, fechas ni bitácora. No copia participaciones (no son por campaña).

---

## Fase 1 · MVP: catálogo

- [x] **C1 · Tipos de artículo y atributos**
  - Depende: E0.5
  - Spec: pantalla 3, §9
  - Criterios:
    - Tablas, endpoints CRUD y pantalla.
    - Tipos de dato texto, número (con unidad), lista (con opciones), booleano; marca "define variante" (implica requerido).
    - Clave estable por atributo generada del nombre; un choque de claves es un error de dominio claro. El tipo de dato no se edita.
    - Atributos desactivables y borrables. El bloqueo por uso en artículos pasa a C2.

- [x] **C2 · Artículos y variantes**
  - Depende: C1
  - Spec: pantallas 4 y 5, §9
  - Criterios:
    - Atributos fijos y de variante validados contra el tipo (`buildAttributesSchema` en `contracts`, reutilizado por web y API).
    - SKU único y combinación única por artículo, también contra inactivas (volver a crearla es reactivarla). Sin borrado: artículos y variantes se desactivan y reactivan, con «Mostrar inactivas».
    - `articles.stock_unit` (pieza, m, kg, l, bulto) para la existencia (`numeric(12,3)`) y el costo de todas las variantes; la interfaz la muestra como sufijo.
    - Filtros de lista por tipo, por atributo fijo o de variante (`attr=clave:valor`, separado en el primer «:»), con existencia y por nombre o SKU, usando `jsonb`.
    - Historial de costos por variante: entrada inicial al crear y manual al editar el costo promedio.
    - `db:seed` carga `docs/datos/catalogo-ejemplo.json` (traduce `{tamano}` a `{size}` y los enums con la tabla de equivalencias de §9).
    - Borrar un atributo usado por artículos o variantes responde 409 `ATTRIBUTE_IN_USE`; solo se puede desactivar. También 409 al quitar o renombrar una opción en uso, cambiar la unidad o «define variante» de un atributo en uso, y `ATTRIBUTE_VALUES_MISSING` al marcar requerido con valores faltantes, crear un atributo requerido o de variante en un tipo con artículos, o marcar «define variante» si el tipo tiene variantes. Cambiar la clave es 422 `KEY_IMMUTABLE`.
    - Borrar un tipo de artículo con artículos responde 409 `ARTICLE_TYPE_IN_USE` y no borra nada.

- [ ] **C3 · Tamaños**
  - Depende: E0.5
  - Spec: pantalla 24
  - Criterios: CRUD con orden; mini, chico, mediano, grande sembrados.

- [ ] **C4 · Productos y recetas**
  - Depende: C2, C3, D2
  - Spec: pantallas 7 y 8
  - Criterios:
    - Árbol de productos hasta 3 niveles; consulta recursiva.
    - Editor de receta: componentes de artículo con filtro de atributos o de mano de obra, por tamaño opcional, con sustitución.
    - Precio por tamaño. El costo mostrado viene de D2; la UI no calcula.
    - Pantalla de detalle con selector de tamaño y desglose (heredado en gris, sustituido tachado).
    - `db:seed` agrega productos y recetas del catálogo de ejemplo, de forma idempotente como en C2, y traduce `{tamano}` a `{size}` en los filtros de receta.

- [ ] **C5 · Extras**
  - Depende: C4
  - Spec: pantalla 9
  - Criterios: CRUD con componentes, minutos de armado, precio extra y productos a los que aplica.

- [ ] **C6 · Nuevo atributo requerido o de variante en un tipo con artículos**
  - Depende: C2
  - Spec: pantalla 3
  - Criterios: nuevo atributo requerido o de variante en un tipo con artículos, con valor por defecto aplicado en una transacción (a los artículos si es fijo, a las variantes si define variante). Sin esto, C2 responde 409 `ATTRIBUTE_VALUES_MISSING`.

---

## Fase 1 · MVP: campañas y operación

- [ ] **K1 · Campañas: modelo y lista**
  - Depende: D4, D5, E0.5
  - Spec: pantalla 11, §5
  - Criterios:
    - El editor de participación (S1) lista por nombre y estado las campañas no cerradas afectadas.
    - Tabla con restricción `EXCLUDE USING gist (type WITH =, daterange(start_date, end_date, '[]') WITH &&)` para estados que no sean borrador, cerrada o cancelada.
    - Error de empalme traducido a mensaje claro con la campaña con la que choca.
    - Columna `notas` (texto, NULL) en `campanas` (§9), editable en la pantalla 12; D8 la copia al clonar.
    - Lista con filtro por estado y pastillas; vista de línea de tiempo.

- [ ] **K2 · Crear, editar, programar y clonar**
  - Depende: K1, D8, C4
  - Spec: pantalla 12
  - Criterios:
    - Asistente de 3 pasos; guardar como borrador sin fechas.
    - Paso 2 copia items del catálogo con costo vigente y origen "catalogo".
    - Clonar desde cerradas o canceladas.
    - Bitácora `campana_eventos` en cada transición.

- [ ] **K3 · Detalle de campaña**
  - Depende: K2
  - Spec: pantalla 13
  - Criterios:
    - KPIs, pestañas Productos, Gastos, Producciones, Ventas, Costos fijos, Inversión por socio, Bitácora.
    - Inversión por socio: total invertido y trabajo por cobrar de cada socio, con detalle de sus compras.
    - Precio especial editable con semáforo de margen (D3).
    - Solo lectura completa en cerrada o cancelada, también en API.

- [ ] **K4 · Registrar gastos y aportaciones**
  - Depende: K3
  - Spec: pantalla 14
  - Criterios:
    - Formulario con Signal Forms; foto del ticket opcional (almacenamiento local en desarrollo).
    - "Quién pagó" obligatorio: uno de los socios o "Caja del negocio".
    - Persistencia y UI para registrar aportaciones de socios a la caja como movimientos de campaña junto a los gastos, identificando socio e importe. Son financiación, no gastos; no se suman al gasto de la campaña. K7 consume estas aportaciones en el cierre.
    - Una compra ligada a un item actualiza su costo con origen "compra".
    - Registro de gastos y aportaciones rechazado si la campaña no admite movimientos.

- [ ] **K5 · Registrar producción**
  - Depende: K3, D2
  - Spec: pantalla 15
  - Criterios:
    - Elige subproducto, tamaño, extra, cantidad y variante cuando la receta lo pide.
    - Guarda `costo_unitario_snapshot` calculado con la resolución de costos (snapshot > campaña > catálogo).

- [ ] **K6 · Venta rápida**
  - Depende: K3, D3
  - Spec: pantalla 16
  - Criterios:
    - Diseñada primero para 390 px: tarjetas grandes, tamaño y extras con un toque, carrito fijo abajo.
    - Precio resuelto por D3; ajuste manual exige motivo.
    - Guarda snapshots de costo y precio con origen. Registrar una venta de 2 piezas toma 4 toques o menos.

- [ ] **K7 · Cierre y reparto**
  - Depende: K4, K5, K6, D6, D7, S1
  - Spec: pantalla 17
  - Criterios:
    - Captura de inventario sobrante; producto de temporada en $0.
    - Cascada y tabla por socio de D7; un total negativo se muestra como "Debe aportar". Trabajo devengado, pagado e impago separados; el impago no genera deuda ni se arrastra.
    - Guardar una copia fija (snapshot) de todo el resultado del cierre y mostrarla sin recalcular. La nueva regla de D7 aplica desde su decisión; preservar cierres ya liquidados.
    - Consumir las aportaciones registradas en K4 para el cálculo de D7; K7 no captura ni registra aportaciones.
    - Confirmación explícita antes de cerrar.
    - Reabrir con motivo desde la campaña cerrada.

---

## Fase 1 · MVP: socios, tablero y configuración

- [x] **S1 · Socios**
  - Depende: E0.5
  - Spec: pantalla 22
  - Criterios: participación en la ganancia 50/50 por defecto, editable y validada a 100%; por campaña: inversión, trabajo pagado, ganancia recibida y total.
  - Entrega S1: nombres y porcentajes enteros, `share_bps` y `version`, PUT atómico con 409 ante cambios concurrentes, aviso fijo de cierres futuros y límite de dos altas en CLI. «Por campaña» muestra estado vacío hasta los snapshots de K7, sin crear sus tablas. S2 reutiliza el editor y su fuente única; K1 agrega el listado de campañas afectadas. Capturas: `docs/diseno/revisiones/S1/README.md`.

- [ ] **S2 · Configuración**
  - Depende: C3
  - Spec: pantalla 24
  - Criterios: categorías de gasto, tipos de campaña, participación por defecto (50/50; reutiliza `partners.share_bps` y el editor de S1), % reinversión por defecto (0%), margen mínimo, % anticipo mínimo, días de gracia.

- [ ] **S3 · Dashboard**
  - Depende: K3
  - Spec: pantalla 2
  - Criterios: KPIs globales, ventas semanales, campañas activas con presupuesto y alertas (≥ 85% presupuesto, margen bajo, campañas por cerrar).

---

## Fase 2

- [ ] **F2.1 · Inventario** (pantalla 6): movimientos, costo promedio ponderado, existencia, alertas. Depende: C2, K5, K6.
- [ ] **F2.2 · Listas de precios** (pantalla 10): por canal y cantidad mínima con vigencia; conectar en D3. Depende: D3, C4.
- [ ] **F2.3 · Clientes** (pantalla 18). Depende: E0.5.
- [ ] **F2.4 · Cotizador** (pantalla 19): costo automático, margen objetivo, vigencia, texto para WhatsApp. Depende: F2.3, D2.
- [ ] **F2.5 · Pedidos** (pantalla 20): campaña tipo evento, anticipo mínimo, lista de compras, capacidad de producción. Depende: F2.4, K2.
- [ ] **F2.6 · Calendario de entregas** (pantalla 21). Depende: F2.5.
- [ ] **F2.7 · Reportes** (pantalla 23): margen por subproducto, punto de equilibrio, receta vs real, especial vs lista, exportación. Depende: K7.
- [ ] **F2.8 · Cierre automático** tras días de gracia. Depende: K7, S2.
- [ ] **F2.9 · Recuperación de contraseña** por correo. Depende: E0.5.

---

## Preguntas abiertas

- ¿Dónde se despliega? (VPS, Railway, Fly.io). Define el almacenamiento de fotos de tickets.
- ¿Se necesita trabajar sin conexión en el tianguis? Si sí, la venta rápida necesita cola local y sincronización; hoy no está en el alcance.
