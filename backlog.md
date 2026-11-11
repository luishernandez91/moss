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

- [ ] **E0.5 · Autenticación**
  - Depende: E0.3, E0.4
  - Spec: pantalla 1
  - Criterios:
    - Login con correo y contraseña (hash argon2), sesión en cookie `httpOnly`, `secure`, `sameSite=lax`.
    - Usuario ligado a un socio. Rutas de API protegidas por defecto.
    - Script para crear los dos usuarios iniciales; sin registro público.
    - Recuperación de contraseña: fuera del MVP si no hay correo configurado; dejar la decisión anotada.

---

## Fase 1 · Dominio puro (`packages/domain`)

Sin base de datos ni HTTP. Todo con pruebas que usan los casos de la sección 10 de la especificación.

- [x] **D1 · Dinero y fechas de negocio**
  - Depende: E0.1
  - Criterios:
    - Tipo `Money` en centavos enteros; suma, resta, multiplicación por cantidad decimal con redondeo half-up, porcentaje.
    - `today(clock)` en `America/Mexico_City`; comparación de fechas sin hora.
    - Prueba: `0.01 × $110.00 = $1.10`; `4 × $0.50 = $2.00`.

- [ ] **D2 · Resolución de costos heredados**
  - Depende: D1
  - Spec: §2
  - Criterios:
    - Dado el árbol de productos, componentes, tamaño y extra, devuelve el desglose con origen de cada línea (`own`, `inherited`, `overridden`) y el total.
    - Componente con tamaño sustituye al genérico; `sustituye_componente_id` sustituye al heredado; `{tamano}` toma la variante del mismo tamaño.
    - Componentes con filtro de atributos sin variante elegida: usa el costo de la variante que coincide; si varias coinciden, exige elegir.
    - Pruebas: Kokedama Nochebuena chica = $53.10; Nochebuena mediana + Reno = $91.50; Kokedama Helecho sustituye fabricación.
    - Rechaza árboles de más de 3 niveles y ciclos.

- [ ] **D3 · Resolución de precio**
  - Depende: D1
  - Spec: §2
  - Criterios:
    - Orden: manual > especial de campaña (solo si la campaña está activa o por cerrar) > lista (fase 2, interfaz lista) > general.
    - Devuelve precio, origen y margen sobre el costo.
    - Aviso si el precio queda bajo el costo o bajo el margen mínimo configurado. Prueba: $50 sobre $53.10 da aviso de margen negativo.

- [ ] **D4 · Estados de campaña**
  - Depende: D1
  - Spec: §5
  - Criterios:
    - Estado derivado desde estado persistido + fechas + hoy.
    - Tabla de transiciones permitidas; cualquier otra lanza error de dominio con mensaje en español.
    - `canEdit`, `canRegisterMovements`, `canClose`, `canClone` por estado.
    - Reabrir exige motivo.

- [ ] **D5 · Empalme de campañas**
  - Depende: D4
  - Criterios:
    - Detecta empalme entre rangos cerrados `[inicio, fin]` del mismo tipo para estados programada, activa y por cerrar; ignora borradores, cerradas y canceladas.
    - Pruebas: 1–15 dic contra 10–31 dic mismo tipo → empalme; tipos distintos → sin empalme; fin = inicio de otra → empalme.

- [ ] **D6 · Prorrateo de costos fijos**
  - Depende: D1
  - Criterios:
    - Reparte los costos fijos de la campaña entre las unidades producidas; el residuo de centavos se asigna a la última unidad para que la suma cuadre.
    - Devuelve costo real por pieza = costo de receta + prorrateo, para comparar contra el costo de receta.

- [ ] **D7 · Cierre y reparto**
  - Depende: D1
  - Spec: §8 regla 7
  - Criterios:
    - Entrada: ventas, gastos con quién pagó (socio o caja), trabajo registrado por socio, % reinversión de la campaña (0% por defecto), participación (50/50 por defecto), inventario sobrante.
    - Inversión de cada socio = suma de los gastos que pagó en la campaña. Lo pagado por la caja no es inversión de nadie.
    - Orden: recuperar inversión → pagar trabajo → apartar reinversión → dividir la ganancia 50/50.
    - Salida por socio: inversión, recupera, trabajo, ganancia, total a recibir; más reinversión a caja.
    - Pruebas con la sección 10 de la especificación: reinversión 0% → Luis $2,170, el otro socio $1,430; reinversión 30% → $1,939 / $1,199 / caja $462; pérdida de $460 → Luis $1,170, el otro socio debe aportar $170. En todos, la suma cuadra con las ventas.
    - Con pérdida no hay reinversión.
    - El residuo de centavos al dividir 50/50 se asigna de forma determinista y documentada (ej. al socio con mayor inversión).

- [ ] **D8 · Clonación de campaña**
  - Depende: D4
  - Criterios:
    - Produce un borrador sin fechas con nombre "(copia)", presupuesto, % reinversión, notas e items.
    - Opción de costos: de la original o del catálogo. Precios especiales copiados con `requiere_revision = true`.
    - Nunca copia gastos, producciones, ventas ni inventario sobrante.

---

## Fase 1 · MVP: catálogo

- [ ] **C1 · Tipos de artículo y atributos**
  - Depende: E0.5
  - Spec: pantalla 3
  - Criterios:
    - Tablas, endpoints CRUD y pantalla.
    - Tipos de dato texto, número (con unidad), lista (con opciones), booleano; marca "define variante".
    - No se puede borrar un atributo usado por artículos; solo desactivar.

- [ ] **C2 · Artículos y variantes**
  - Depende: C1
  - Spec: pantallas 4 y 5
  - Criterios:
    - Atributos fijos y de variante validados contra el tipo (en `contracts`, reutilizado por web y API).
    - SKU único. Filtros de lista por tipo y por atributo usando `jsonb`.
    - Historial de costos por variante.
    - `db:seed` carga `docs/datos/catalogo-ejemplo.json`.

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

- [ ] **C5 · Extras**
  - Depende: C4
  - Spec: pantalla 9
  - Criterios: CRUD con componentes, minutos de armado, precio extra y productos a los que aplica.

---

## Fase 1 · MVP: campañas y operación

- [ ] **K1 · Campañas: modelo y lista**
  - Depende: D4, D5, E0.5
  - Spec: pantalla 11, §5
  - Criterios:
    - Tabla con restricción `EXCLUDE USING gist (type WITH =, daterange(start_date, end_date, '[]') WITH &&)` para estados que no sean borrador, cerrada o cancelada.
    - Error de empalme traducido a mensaje claro con la campaña con la que choca.
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

- [ ] **K4 · Registrar gasto**
  - Depende: K3
  - Spec: pantalla 14
  - Criterios:
    - Formulario con Signal Forms; foto del ticket opcional (almacenamiento local en desarrollo).
    - "Quién pagó" obligatorio: uno de los socios o "Caja del negocio".
    - Una compra ligada a un item actualiza su costo con origen "compra".
    - Rechazado si la campaña no admite movimientos.

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
    - Cascada y tabla por socio de D7; un total negativo se muestra como "debe aportar".
    - Confirmación explícita antes de cerrar.
    - Reabrir con motivo desde la campaña cerrada.

---

## Fase 1 · MVP: socios, tablero y configuración

- [ ] **S1 · Socios**
  - Depende: E0.5
  - Spec: pantalla 22
  - Criterios: participación en la ganancia 50/50 por defecto, editable y validada a 100%; por campaña: inversión, trabajo pagado, ganancia recibida y total.

- [ ] **S2 · Configuración**
  - Depende: C3
  - Spec: pantalla 24
  - Criterios: categorías de gasto, tipos de campaña, regla de empalme, participación por defecto (50/50), % reinversión por defecto (0%), margen mínimo, % anticipo mínimo, días de gracia.

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
- Pérdida dividida 50/50 (regla actual): confirmar con los socios que, si un socio invirtió poco, puede terminar debiendo dinero al cerrar una campaña con pérdida. La alternativa es repartir lo que haya en proporción a lo invertido.
