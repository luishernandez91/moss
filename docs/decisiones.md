# Decisiones de arquitectura

Registro breve de decisiones. Una entrada por decisión, la más reciente arriba. Formato: contexto, decisión, consecuencias.

## 2026-11-19 · Artículos y variantes (C2)

- **Contexto:** C2 implementa las pantallas 4 y 5 sobre el modelo híbrido de C1. Faltaba definir cómo se representa un artículo sin atributos de variante, la unidad de existencia, qué genera historial de costo, los cambios incompatibles a atributos en uso y el comportamiento del seed.
- **Decisión** (diseño aprobado por el usuario con ajustes):
  - Tablas `articles`, `article_variants` (la tabla de equivalencias de §9 se corrigió de `variants`) y `variant_cost_changes`, en la migración `0003_articles`.
  - Valores de atributo validados con `buildAttributesSchema(definitions, scope)` de `packages/contracts`, en web y API: fijos en `articles.fixed_attributes`, de variante en `article_variants.attributes`. Requeridos activos obligatorios; inactivos opcionales; claves desconocidas rechazadas.
  - Un artículo sin atributos de variante tiene una sola variante explícita con `{}` (§9: costo, precio y existencia solo existen en la variante). Crear un artículo exige al menos una variante.
  - SKU (recortado en mayúsculas, `^[A-Z0-9][A-Z0-9-]{0,39}$`) único en todo el catálogo y combinación única por artículo, también contra inactivas. El conflicto con una inactiva responde con `details: { variantId, active: false }` y la interfaz ofrece «Reactivar». Artículos y variantes no se borran; se desactivan.
  - Duplicados detectados por el dominio: 422 `DUPLICATE_SKU` / `DUPLICATE_COMBINATION`, igual que las claves duplicadas de C1; la carrera que rechaza la base responde 409 con el mismo código.
  - `articles.stock_unit` obligatoria, en inglés según la regla de nombres: `piece`, `m`, `kg`, `l`, `bag` (pieza, m, kg, l, bulto en la interfaz). La interfaz muestra la unidad como sufijo («$0.50/m», «300 m», «2 bultos»); las piezas van sin sufijo («$30.00», «30»), como en las imágenes 04 y 05, salvo el resumen del detalle («25 piezas en existencia»). Un sí/no requerido apagado se envía como «no». Existencia `numeric(12,3)` capturada a mano hasta F2.1. La unidad no cambia después de crear el artículo. En D2 es obligatoria (`Article.stockUnit`), igual que el `NOT NULL` de la base, aunque el costeo no la usa. Si una unidad se capturó mal, se corrige con el procedimiento del README de pantallas (desactivar, liberar los SKU y crear el artículo correcto). `pnpm db:seed` lista por nombre los artículos que quedaron en piezas por no tener `unidad_consumo`.
  - Historial: entrada `initial` al crear una variante (también en el seed, sin socio) y `manual` al editar el costo promedio, solo si cambia. Precio, existencia y atributos no generan entrada. El socio se guarda con `ON DELETE SET NULL`.
  - Cambios a atributos en uso (`assessAttributeChange`, 409): borrar, quitar o renombrar una opción en uso (también si solo cambian mayúsculas: los valores y el esquema distinguen mayúsculas), cambiar la unidad o «define variante» → `ATTRIBUTE_IN_USE`; marcar requerido con valores faltantes, crear un atributo requerido o de variante en un tipo con artículos, o marcar «define variante» si el tipo tiene variantes → `ATTRIBUTE_VALUES_MISSING`. Solo un atributo activo exige valor: reactivar uno requerido con valores faltantes también es `ATTRIBUTE_VALUES_MISSING`, y un atributo sin valores que deja de definir variante y queda requerido exige valor en los artículos del tipo. Marcar «define variante» sin indicar «requerido» lo vuelve requerido. La clave es inmutable: un cambio de clave llega al dominio y responde 422 `KEY_IMMUTABLE` (antes 400). El tipo de dato sigue siendo 400. Borrar un tipo con artículos → `ARTICLE_TYPE_IN_USE`.
  - Filtros: `attr=clave:valor` separado en el primer «:»; `inStock` exige una variante activa con existencia que cumpla también los filtros de variante (con o sin ellos).
  - Redondeo a centavos: un solo helper, `roundRatioToCents(numerador, denominador)`, half-up simétrico exacto con `bigint`. `multiply` (que ahora toma la cantidad como el decimal escrito), `percentageBps` y el prorrateo de D6 lo usan. `percentage` conserva su implementación (`multiply(amount, percent / 100)`) y solo acepta porcentajes enteros, que es la regla del proyecto: con decimales, `percent / 100` en flotante (0.7 → 0.006999…) daría un centavo menos con el nuevo `multiply`, así que un decimal lanza `MoneyError` y `percentSchema` en contracts los rechaza; F2.1 lo usará para promedios ponderados. Las pruebas de D2, D3, D6 y D7 no cambiaron.
  - Seed: `pnpm db:seed` crea en una transacción solo lo que falta (tipos por nombre, atributos por clave, artículos por tipo y nombre, variantes por SKU) y nunca actualiza ni borra. Un choque aborta todo y nombra el conflicto, incluido un artículo existente con otra unidad de existencia. `unidad_consumo` llena `stock_unit` y no se crea como atributo; sin ella, `piece`. Etiquetas en español con un mapa que genera exactamente cada clave. `{tamano}` → `{size}` queda para C4.
- **Consecuencias:** un tipo con artículos no puede ganar un atributo de variante; se registró C6 (valor por defecto en una transacción). K4 y F2.1 agregarán motivos de historial por compra y movimientos. Sin dependencias nuevas.

## 2026-11-19 · Socios, participación y concurrencia (S1)

- **Contexto:** pantallas 22 y 24, §8 regla 7 y §9; S1 y S2 mencionan participación. Dos socios creados desde `pnpm auth:set-password`; D7 recibe `shareBps`.
- **Decisión aprobada:** `partners.share_bps INTEGER NOT NULL DEFAULT 5000`, con CHECK de rango 0–10000 y múltiplo de 100. La UI acepta porcentajes enteros 0–100; Zod valida puntos base enteros y múltiplos de 100. El dominio valida exactamente dos IDs distintos y suma 10000. D7 conserva su granularidad genérica de puntos base.
- Una sola fuente de verdad en `partners`: S2 reutilizará el editor y endpoint de S1, sin otra configuración de participación. UI permite editar nombres y participación, sin alta ni baja; nombres recortados de 1 a 100 caracteres.
- `partners.version INTEGER NOT NULL DEFAULT 0`, CHECK `version >= 0`. PUT del conjunto con `{ id, name, shareBps, version }` para ambos. Leer y bloquear las dos filas con `SELECT ... FOR UPDATE`, en orden por ID; comparar ambas versiones, devolver 409 `PARTNERS_CHANGED` si cualquiera cambió. Guardar ambas filas e incrementar versiones en una transacción. No reintentar conflictos automáticamente.
- CLI: bloqueo asesor transaccional antes de comprobar el límite de dos altas. Conservar cambios de contraseña de cuentas existentes. La prueba verifica tercera alta rechazada y cambio de contraseña permitido, sin prueba de concurrencia del CLI.
- Antes de confirmar, el editor muestra: «El cambio aplicará al cierre de todas las campañas que aún no estén cerradas. Los cierres ya registrados no cambian.» S1 no depende de K1 y no bloquea el guardado por falta de campañas. K1 añadirá la lista por nombre y estado de las campañas no cerradas afectadas.
- La participación vigente aplica a cierres futuros, incluidas campañas abiertas. K7 guardará porcentajes utilizados y resultados como snapshot; no recalcular cierres guardados. Hasta K7, «Por campaña» es un estado vacío y los montos se muestran como `—`; sin tablas de K7 ni cifras ficticias. Después se leerán inversión, trabajo devengado/pagado/impago, resultado y total del snapshot; negativo = «Debe aportar».
- Pruebas de API que modifican socios serializadas; Playwright del spec de socios serializado entre desktop/mobile. En `afterEach` restaurar nombres y participaciones originales, sin borrar socios ni retroceder sus versiones. Prueba de PUT concurrentes: un éxito y un 409, sin mezcla ni escritura parcial. También cubrir cada versión obsoleta por separado.
- **Referencia visual:** `docs/diseno/pantallas/22-socios-desktop.png` y `22-socios-mobile.png`. Conservar composición, jerarquía y etiquetas «Ganancia %», «Invertido», «Trabajo pagado», «Ganancia recibida», columna «Invirtió» y «Reparto de la ganancia. Debe sumar 100%». La especificación manda y las diferencias se documentan en el PR. No usar cifras de imágenes como datos, semillas ni valores por defecto.
- Adjuntar capturas de implementación a 390 y 1440 px junto a la referencia correspondiente antes de pedir revisión.
- Aislamiento local S1: worktree propio, bases `moss_s1` / `moss_s1_test`, proyecto Compose `moss_s1`, PostgreSQL 5433, API 3100, web/proxy/Playwright 4300 → 3100. Exportar explícitamente la conexión de pruebas. No cambiar valores predeterminados del repo.
- C1 se fusionó antes de implementar S1; se actualizó con main antes de generar la nueva migración. Nunca modificar migraciones fusionadas.

## 2026-11-19 · Color requerido en materiales del catálogo de ejemplo

- **Contexto:** `docs/datos/catalogo-ejemplo.json` definía `material.color` con `requerido: false` y `define_variante: true`, que la regla de C1 «define variante ⇒ requerido» rechaza. Se revisaron los artículos de tipo material: hilo de cáñamo (natural), liga de tela (café, rojo) y limpiapipas (café). Todas sus variantes tienen color.
- **Decisión:** se marca `color` como requerido en el catálogo de ejemplo y se conserva la regla de C1 (confirmado con el usuario). El resto de los atributos que definen variante en el ejemplo ya eran requeridos.
- **Consecuencias:** el seed de C2 puede cargar el catálogo sin excepciones a la regla. Se retira el pendiente que la decisión de C1 había dejado para C2.

## 2026-11-19 · Tipos de artículo y atributos (C1)

- **Contexto:** C1 es la primera historia full stack y define el patrón de las demás. La especificación modela atributos en tablas y valores en JSONB (§9), pero no decía cómo se identifican los valores si se renombra un atributo, cómo desactivar un atributo ni qué reglas cruzan sus campos.
- **Decisión:**
  - Modelo híbrido (confirmado con el usuario): definiciones en `article_types` y `attributes` con unicidad, llaves foráneas y CHECK; valores en JSONB (C2), validados contra la definición. Para 2 usuarios y un catálogo chico no se justifican tablas tipadas de valores.
  - `attributes.key` se genera del nombre al crear (`attributeKey`: sin acentos, minúsculas, `_`) y no cambia; el nombre visible sí. Un nombre distinto con la misma clave («Diametro» frente a «Diámetro») es `KEY_CONFLICT`. Los nombres de atributo son únicos por tipo sin distinguir mayúsculas ni espacios, y un nombre cuya clave ya existe es `KEY_CONFLICT`. Los nombres de tipo se comparan por su clave generada: no distinguen mayúsculas, acentos, espacios ni signos («Maceta.» repite «Maceta»). Los índices únicos de la base (`lower(name)`, `(tipo, key)`) son el respaldo para carreras.
  - `attributes.active` permite desactivar. El tipo de dato no se edita. «Define variante» implica «requerido» (dominio y CHECK). Unidad solo en número; opciones (al menos una, sin repetidas) si y solo si es lista.
  - Borrar un tipo borra sus atributos en cascada. El bloqueo por uso (409 `ATTRIBUTE_IN_USE`, cambios incompatibles y tipos con artículos) se registró como criterio de C2, porque hasta entonces no hay artículos.
  - Errores: el dominio lanza `ArticleTypeError` con código y mensaje; la API responde 422 con `runDomainRule`, 400 por forma (Zod), 404 con código propio y 409 si la base rechaza una carrera de unicidad; si el tipo se borra entre la validación y la escritura de un atributo, la llave foránea rota responde 404 (`guardWrite`). La interfaz usa `applyVariantRule` del dominio para completar «requerido» al marcar «define variante». Patrón documentado en `docs/patron-full-stack.md`.
  - Playwright móvil conserva el Pixel 7 con viewport de 390×844 (confirmado con el usuario).
- **Consecuencias:** las historias siguientes copian el patrón. Drizzle en la API no usa `casing`, así que las columnas `snake_case` se nombran explícitamente en `schema.ts`. Sin dependencias nuevas.

## 2026-11-19 · Nombres en inglés en base de datos y código

- **Contexto:** AGENTS.md pide código en inglés, pero la especificación (§9) modela en español y la decisión de D3 decía que el origen del precio se guardaría «en la base» como `manual`, `campana`, `lista`, `general`. C1 crea el primer enum de la base, así que hacía falta fijar la regla antes.
- **Decisión:**
  - Base de datos y código en inglés: tablas, columnas, enums y literales del dominio. Español solo en la interfaz (etiquetas, mensajes) y en la documentación.
  - §9 conserva el modelo en español y agrega una tabla de equivalencias español → inglés de tablas y enums, en lugar de reescribirse.
  - Sustituye expresamente lo dicho en D3 sobre valores en español en la base: `price_source` guarda `general`, `list`, `campaign`, `manual`.
  - Inventario de `packages/domain` y `packages/contracts`: los tipos ya usaban inglés (`PriceSource`, `CampaignItemCostOrigin`, `category`, estados). El único literal en español era `SIZE_PLACEHOLDER = '{tamano}'`, que pasa a `'{size}'`; además se corrigen dos comentarios que hablaban de valores en español en la base. Es solo un renombre (commit aparte en el PR de C1).
  - `docs/datos/catalogo-ejemplo.json` sigue en los nombres de la especificación. La fixture de pruebas de D2 traduce `{tamano}` a `SIZE_PLACEHOLDER`, y el seed de C2 hará la misma traducción.
- **Consecuencias:** las historias que crean tablas usan los nombres de la tabla de equivalencias. Los valores capturados por los usuarios son datos y se guardan como se escriben; la clave de atributo se deriva del nombre (ver la decisión de C1).

## 2026-11-19 · Columna de notas en campañas

- **Contexto:** la pantalla 12 dice que al clonar se copian las notas y D8 las copia en dominio, pero `campanas` en §9 no tenía dónde guardarlas. La decisión de D8 dejó pendiente dónde persistirlas.
- **Decisión:** `campanas` tiene la columna `notas` (texto, NULL), confirmado con el usuario. K1 la crea junto con la tabla y K2 la captura y la persiste al clonar.
- **Consecuencias:** se resuelve el pendiente de «Clonación de campaña (D8)», sin editar esa entrada histórica. Solo cambia documentación: no hay migración porque la tabla de campañas aún no existe.

## 2026-11-19 · Clonación de campaña (D8)

- **Contexto:** §5 (pantalla 12) lista lo que se copia al clonar, pero omite el tipo de campaña (obligatorio para el empalme), menciona notas que no están en `campanas` (§9), no dice qué origen de costo queda en los items copiados ni qué pasa si un item ya no está en el catálogo, ni cómo nombrar la copia de una copia.
- **Decisión:**
  - `cloneCampaign` en `packages/domain` es pura. Los IDs nuevos salen de `newId` inyectado: primero la campaña y luego uno por item en orden de entrada; un ID vacío, repetido o igual a uno de la original es `INVALID_GENERATED_ID`. Errores de dominio `CampaignCloneError` con código y mensaje en español.
  - Solo se clonan campañas cerradas o canceladas (§5, tabla y diagrama), con `canClone` de D4; si no, `CLONE_NOT_ALLOWED`. No se usa reloj: ambos estados son persistidos.
  - Se copian nombre, tipo (confirmado con el usuario; §5 se actualizó), presupuesto, `reinvestmentBps`, notas e items, con `clonedFromId`. Las notas se copian en dominio sin cambiar el esquema; §9 aún no tiene columna de notas y agregarla (en K1) queda pendiente de aprobación. Las participaciones no se copian porque no son por campaña (pantallas 22 y 24). Nunca se copian gastos, aportaciones, producciones, ventas, inventario sobrante, fechas ni bitácora; clonar no genera evento (§8 regla 11). El clon nace borrador sin fechas, inventario sobrante en $0.
  - Nombre: se recorta, se quitan los sufijos «(copia)» finales y se agrega uno solo («X (copia)» → «X (copia)»). Sin numerar: los nombres no son únicos.
  - Costos «de la original»: se copia el costo; el origen se conserva salvo `compra`, que pasa a `manual`, porque el gasto que lo respaldaba no se copia (§8 regla 4). Costos «del catálogo»: un `CatalogCostLookup` inyectado (la API lo construye con `resolveCost` de D2) da el costo con origen `catalogo`. Si el item no existe o está inactivo en el catálogo, conserva su costo original con el origen ajustado, se copia con `activo = false` y genera el aviso `CATALOG_ITEM_UNAVAILABLE` (confirmado con el usuario).
  - `requiere_revision` es exclusivo del precio especial (D3): es verdadero si y solo si el item tiene precio especial copiado. No se usa para la disponibilidad del catálogo. Sin precio especial no se conserva un motivo huérfano.
  - Los items inactivos de la original se copian inactivos.
- **Consecuencias:** K2 persiste el resultado en una transacción, muestra los avisos y permite reactivar un item revisado. Falta decidir dónde se persisten las notas (§9 no tiene la columna). D8 no cambia esquema ni agrega dependencias.

## 2026-11-19 · Prorrateo de costos fijos (D6)

- **Contexto:** la especificación pide prorratear los costos fijos «por unidad» (§1) y «por unidad producida» (pantalla 13), para comparar costo de receta contra costo real. El backlog asignaba el residuo «a la última unidad», distinto de la regla de residuo de D7, y no había unidades planeadas en el modelo.
- **Decisión:**
  - `allocateFixedCosts` en `packages/domain` es pura. Recibe el total de costos fijos y líneas de costeo (ID, unidades producidas, suma de costos de receta de los snapshots de producción). El llamador decide qué gastos son fijos y arma las líneas.
  - Base: unidades producidas, sin unidades planeadas ni pesos. Peso de cada línea = sus unidades. Si una campaña real muestra distorsión entre productos de tamaño o esfuerzo muy distinto, se agregará un peso entero opcional por línea con valor 1 por defecto, de modo que el comportamiento actual no cambie.
  - Residuo con `allocate`: entre líneas, por ID ascendente UTF-16 sin configuración regional, sin residuo para líneas sin unidades; dentro de cada línea, con pesos iguales (`base` y `unitsWithExtraCent`), así ninguna pieza difiere en más de 1¢. Sustituye la frase «a la última unidad» del backlog.
  - Las cifras por pieza (`fixedPerUnit`, `recipeUnitCost`, `realUnitCost`) son informativas y se redondean half-up una sola vez desde los totales, con `bigint`. El monto exacto es `allocated`; Σ allocated + unallocated = total.
  - Sin unidades producidas no hay base: el total queda en `unallocated` y las cifras por pieza son `null`.
  - Errores de dominio `FixedCostAllocationError` con código y mensaje en español, como D7. `MoneyError` solo por desbordamiento.
- **Consecuencias:** no hay doble conteo. `calculateProfitSplit` (D7) ya descuenta todos los gastos reales, fijos incluidos; D6 no devuelve resultado ni montos de socios; K7 (que depende de D6) puede mostrar sus cifras, pero nunca las pasa a `calculateProfitSplit` ni las suma al resultado. Solo redistribuye por pieza un gasto que ya existe, para la pestaña Costos fijos, la comparación receta contra real y los reportes. No persiste snapshots ni modifica catálogo o precios. Sin dependencias nuevas ni cambios de esquema.

## 2026-11-18 · Autenticación interna mínima (E0.5)

- **Contexto:** el sistema lo usan dos socios. Se aprobó reducir la autenticación a funciones de Node y las dependencias ya instaladas, con invalidación por usuario al cambiar contraseña.
- **Decisión:**
  - scrypt asíncrono de `node:crypto`, N=32768, r=8, p=3, clave de 64 bytes y sal aleatoria de 16 bytes que se renueva con cada contraseña. `maxmem` explícito de 64 MiB para no alcanzar el límite por defecto de Node. Comparación con `timingSafeEqual` y prueba que ejecuta el hash real.
  - Cookie `moss.sid` firmada con HMAC-SHA256 y `SESSION_SECRET`: contiene `userId`, `sessionVersion` y vencimiento absoluto a 30 días, sin renovación deslizante. `httpOnly`, `SameSite=lax`, `Path=/api`, sin Domain, `secure` en producción. Sin tabla de sesiones ni librerías nuevas.
  - Tablas mínimas `users` (UUID, correo único normalizado, hash, `session_version` entero default 0) y `partners` (UUID, nombre, usuario único). El UUID de socio es un string compatible con D7. Cada petición protegida consulta la cuenta y compara la versión de la cookie con la base.
  - Un comando `pnpm auth:set-password <correo> [nombre]` solicita la contraseña sin mostrarla (mínimo 6 caracteres). Crea usuario y socio en una transacción o cambia el hash e incrementa `session_version`. Si el socio ya existe, conserva su ID y nombre; al crear sin nombre usa la parte anterior a `@`. Sin registro público ni recuperación por correo (F2.9).
  - Guard global de API (health, login y logout públicos) y guard de rutas Angular. Los métodos que modifican estado exigen `application/json` solo cuando llevan cuerpo; POST de logout sin cuerpo es válido. Sin token CSRF ni CORS con credenciales entre orígenes. El proxy de web mantiene el mismo origen.
  - Cinco fallos por IP bloquean 15 minutos desde el quinto fallo. Mapa en memoria; limpieza de entradas vencidas en cada consulta/registro; éxito borra el contador y contadores inactivos caducan tras 15 minutos. `TRUST_PROXY_HOPS=0` por defecto; solo se configura detrás de proxies controlados.
- **Consecuencias:** cambiar contraseña invalida las sesiones previas de esa cuenta. Rotar `SESSION_SECRET` y reiniciar la API invalida todas. Logout solo borra la cookie: una copia externa continúa válida hasta vencimiento, cambio de contraseña o rotación del secreto. El limitador es por proceso y se vacía al reiniciar; el despliegue mínimo usa una instancia. La API necesita consultar PostgreSQL para validar la versión, aunque no persiste sesiones. No hay credenciales de desarrollo compartidas: cada desarrollador crea las cuentas mediante el comando. Procedimiento en `docs/autenticacion.md`.

## 2026-11-18 · Registro de aportaciones en K4

- **Contexto:** la decisión de D7 dejó pendiente asignar la persistencia y UI de aportaciones a K7 o a una historia nueva.
- **Decisión:** K4, ahora «Registrar gastos y aportaciones», registra la aportación del socio a caja como movimiento de campaña junto a los gastos. La aportación sigue siendo financiación, no un gasto. K7 solo consume esos movimientos al calcular el cierre con D7.
- **Consecuencias:** se resuelve la asignación pendiente de «Reparto en cascada, puntos base y aportaciones (D7)», sin editar esa entrada histórica. El backlog concentra captura y persistencia en K4; la dependencia existente de K7 respecto de K4 ya cubre las aportaciones. Este ajuste solo organiza el trabajo futuro, sin implementar K4 ni modificar el cálculo de D7.

## 2026-11-18 · Reparto en cascada, puntos base y aportaciones (D7)

- **Contexto:** el cálculo inicial descontaba todo el trabajo devengado antes de repartir la pérdida y podía pagar trabajo a costa del capital del otro socio. Los socios aprobaron recuperar primero caja y capital, pagar trabajo solo con el remanente e identificar aportaciones que financian gastos de caja.
- **Decisión:**
  - Esta entrada sustituye expresamente la regla de **trabajo como costo para el reparto** y la recuperación bruta de caja de «Cálculo de cierre y reparto (D7)» y de las decisiones anteriores. Las entradas históricas se conservan sin editar. `result = ventas − gastos − trabajo devengado` permanece como indicador informativo; no determina por sí solo la pérdida que se reparte.
  - `contributions?: readonly PartnerContribution[]`, con `[]` por defecto. Cada aportación tiene socio conocido y monto entero seguro no negativo, con los mismos errores de dominio que los gastos. Capital personal (`investment` y `recoveredInvestment`) = gastos pagados por el socio + sus aportaciones. Caja neta (`cashBoxRecovery`) = gastos de caja − aportaciones totales. Las aportaciones son financiación, no gasto: caja neta + capital = todos los gastos.
  - Se recuperan íntegros caja neta y capital. Con saldo negativo no se paga trabajo ni hay reinversión; solo esa pérdida de capital se distribuye según participación en `resultShare`. Con saldo no negativo, el trabajo se paga hasta donde alcance, prorrateando por el trabajo devengado de cada socio mediante `allocate`. Solo tras pagar todo el trabajo se aparta reinversión de la ganancia y se reparte el restante.
  - `labor` sigue siendo trabajo devengado; `laborPaid` es el pago efectivo y `laborUnpaid = labor − laborPaid` es informativo. **El trabajo impago no se arrastra a otras campañas ni genera deuda.** Total personal = capital recuperado + trabajo pagado + `resultShare`; un total negativo conserva `owes: true`.
  - La caja neta se recupera completa incluso con pérdida; puede ser negativa si las aportaciones exceden sus gastos, indicando devolución de aportación no gastada. `cashBoxTotal = cashBoxRecovery + reinvestment`. Siempre se comprueba totales personales + total de caja = ventas. Ejemplo: ventas $100, gasto de caja $20 y aportación de Luis $50 → Luis $90, otro $40, caja −$30.
  - `shareBps` sustituye a `sharePercent`: enteros seguros 0–10000, 5000 por defecto por socio, suma exactamente 10000. `reinvestmentBps` sustituye a `reinvestmentPercent`: enteros seguros 0–10000, por defecto 0. Se mantienen `INVALID_SHARES` e `INVALID_REINVESTMENT` con mensajes en español.
  - `money.ts` incorpora `percentageBps`, con producto y half-up simétrico exactos mediante `bigint`, y una ruta exacta en `allocate` para pesos enteros seguros (bps o centavos de trabajo). Se conserva `percentage` y el soporte de pesos decimales; las pruebas originales de dinero permanecen intactas. Dinero cambia en un commit separado anterior al ajuste de D7. El residuo sigue el ID ascendente UTF-16, tanto en trabajo como en ganancia/pérdida, omitiendo pesos cero.
  - **Vigencia:** la regla aplica a campañas cerradas a partir de esta decisión. No recalcular cierres ya liquidados. K7 deberá guardar una copia fija (snapshot) de todo el resultado del cierre y consultar ese snapshot; D7 sigue siendo un cálculo puro sin persistencia ni migración de datos históricos.
  - Nochebuena real: ventas $1,380, capital Luis $1,400 y otro $50, trabajo del otro $600 → déficit de capital $70, participación −$35 cada uno; Luis $1,365 y otro $15, trabajo pagado $0 e impago $600. Frente al cálculo anterior ($1,065/$315), son +$300 para Luis y −$300 para el otro. `result` sigue en −$670. Este recálculo es un caso de prueba; no autoriza modificar un cierre liquidado.
- **Consecuencias:** actualizar contrato, pruebas y especificación de D7 en el mismo PR #7, sin fusionarlo sin aprobación. El registro de aportaciones (persistencia y UI) corresponde a K7 o a una historia nueva, pendiente de definir en el backlog. Inventario sigue separado y solo informativo; la valuación estacional en $0 corresponde al llamador.

## 2026-11-18 · Cálculo de cierre y reparto (D7)

- **Contexto:** D7 requiere un cierre en centavos que conserve exactamente las ventas, incluyendo trabajo, reinversión, pérdidas e inventario. Faltaba definir el destino del dinero de los gastos pagados por caja y el orden del residuo.
- **Decisión:**
  - `calculateProfitSplit` en `packages/domain/src/profit-split.ts` es pura y usa exclusivamente `add`, `subtract`, `percentage` y `allocate` de `money.ts` para operar montos. Recibe ventas, gastos con pagador explícito (`partner` con ID o `cash_box`), dos socios con trabajo pendiente y participación (50% por socio por defecto), reinversión (0% por defecto) e inventario ya valuado.
  - Inversión personal = gastos pagados por ese socio. Resultado = ventas − todos los gastos − todo el trabajo. Se recupera íntegra la inversión, se paga el trabajo, se aparta la reinversión solo con resultado positivo y se reparte el restante según participaciones. La recuperación se muestra íntegra y la pérdida por separado en `resultShare`; el total puede ser negativo y `owes` permite mostrar «Debe aportar».
  - **Caja (confirmado con los socios):** recupera íntegros los gastos que pagó, incluso con pérdida, como inversionista sin participación en el resultado. Los socios absorben toda la pérdida según sus participaciones porque el dinero de la caja pertenece a ambos. `cashBoxRecovery` y `reinvestment` se devuelven separados; `cashBoxTotal` es su suma. Siempre se comprueba que totales de socios + `cashBoxTotal` = ventas; un descuadre lanza `UNBALANCED_SPLIT`.
  - Ejemplos de caja: ventas $100 y gasto de caja $20 → resultado $80, $40 por socio y recuperación de caja $20. Ventas $10 y gasto de caja $20 → resultado −$10, cada socio debe aportar $5 y caja recupera $20. Caso mixto: ventas $3,600, Luis $1,400, otro socio $60 más trabajo $600, gasto de caja $100 y reinversión 30% → resultado $1,440, $504 de ganancia por socio, totales $1,904 / $1,164 y caja $532 (recuperación $100 + reinversión $432).
  - Residuo: ordenar por ID ascendente mediante comparación de cadenas UTF-16, sin configuración regional, antes de llamar `allocate`; el primer socio con participación positiva recibe el centavo sobrante, también en pérdidas (con signo negativo). La salida sigue ese orden y no depende del orden de entrada. Participación cero nunca recibe residuo.
  - Reinversión: `percentage` redondea half-up una vez, antes del reparto. Inventario: se devuelve separado y se calcula `resultIncludingInventory = result + leftoverInventory` solo como información. Nunca cambia pagos ni habilita reinversión. El llamador valúa el inventario de temporada en $0.
  - Validaciones: exactamente dos IDs distintos y no vacíos; pagadores conocidos; montos de entrada enteros seguros y no negativos; porcentajes finitos entre 0 y 100, con participaciones que suman 100. Se permiten porcentajes decimales y 0/100. `ProfitSplitError` lleva código y mensaje en español; los desbordamientos monetarios conservan `MoneyError`.
- **Consecuencias:** el llamador pasa trabajo pendiente sin duplicarlo en los gastos; el costo de receta no entra al cálculo. D7 solo calcula y no muta campañas: la autorización y transición de cierre siguen en D4, y K7 orquestará persistencia y bloqueo. Sin dependencias nuevas ni cambios de esquema. Pruebas con §10, el caso real de Nochebuena, caja, residuo, inventario, validaciones e igualdad exacta con ventas.

## 2026-11-18 · Pérdida dividida 50/50 confirmada

- **Contexto:** la entrada «2026-11-11 · Inversión por socio y reparto 50/50» dejó pendiente confirmar que un socio pudiera terminar debiendo dinero.
- **Decisión:** los socios confirman que la pérdida también se divide 50/50 por defecto (según la participación configurada si cambia). Un total negativo se conserva y se muestra como «Debe aportar». Con pérdida no hay reinversión. Esta decisión reemplaza expresamente la nota «Pendiente de confirmar con los socios» de la entrada del 2026-11-11, que se conserva sin editar como registro histórico.
- **Consecuencias:** se cierra la pregunta abierta del backlog. En el caso de ventas $1,000 e inversiones $1,400 / $60, sin trabajo, Luis recibe $1,170 y el otro socio debe aportar $170; la suma sigue siendo $1,000.

## 2026-11-18 · Empalme no configurable

- **Contexto:** la pantalla 24 permitía desactivar el empalme por tipo de campaña, y D5 lo modeló con una política `{ enabled }`. Eso chocaba con la restricción de K1 y §8 regla 6, que no tiene excepciones: con la regla desactivada, el dominio aceptaba una campaña que la base rechazaba.
- **Decisión:** dos campañas del mismo tipo nunca se empalman, y no es configurable. Para correr dos campañas a la vez se usan tipos distintos (ej. `temporada` y `evento`). `findCampaignOverlaps` y `assertNoCampaignOverlap` ya no reciben política y siempre validan el empalme dentro del mismo tipo. Esta entrada reemplaza la parte de la política de la entrada de D5.
- **Consecuencias:** la restricción de K1 `EXCLUDE USING gist (type WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (status = 'scheduled')` queda incondicional, igual que el dominio. La pantalla 24 solo administra los tipos de campaña, sin interruptor de empalme (la imagen de referencia todavía lo muestra; ver `docs/diseno/pantallas/README.md`). Se cierra la pregunta abierta sobre el interruptor contra la restricción.

## 2026-11-18 · Empalme de campañas (D5)

- **Contexto:** §5 (pantalla 12), §6 y §8 regla 6 piden validar el empalme por tipo de campaña en dominio con la misma semántica que la restricción `EXCLUDE USING gist (type WITH =, daterange(start_date, end_date, '[]') WITH &&)` de K1. §7 (pantalla 24) hace la regla configurable «activada por defecto, por tipo». La especificación no dice cómo se valida la candidata (un borrador no valida fechas en D4), qué pasa con datos rotos ni en qué acciones corre la validación.
- **Decisión:**
  - `packages/domain/src/campaign-overlap.ts`: `findCampaignOverlaps(candidate, existing, { policy })` devuelve todas las campañas con las que choca (`id`, `name`, `type`, `startDate`, `endDate`); `assertNoCampaignOverlap` lanza `CampaignOverlapError` con código `OVERLAP`, esas mismas campañas en `conflicts` y un mensaje en español que nombra la primera con fechas ISO (la interfaz formatea las fechas desde `conflicts`). `rangesOverlap` se exporta.
  - Semántica igual a la base: rangos cerrados con ambos extremos incluidos (empalman si inicioA ≤ finB y inicioB ≤ finA; terminar el día que empieza la otra empalma, terminar el día antes no). Solo participan campañas con estado guardado `scheduled`, que cubre programada, activa y por cerrar; borradores, cerradas y canceladas nunca chocan. No se usa el reloj. El tipo se compara con igualdad exacta, como `type WITH =`; es el id del tipo configurado en la pantalla 24.
  - La candidata no lleva estado: todas las acciones que validan empalme la dejan en `scheduled`, así que sus fechas se validan con `assertValidSchedule` de D4 como programada (`MISSING_DATES`, `INVALID_DATE_RANGE`), aunque la regla esté desactivada. Al editar se excluye por su id; una campaña nueva lleva `id: null`.
  - Una campaña existente que participa (programada, del mismo tipo, distinta de la candidata) con fechas inválidas lanza el error de D4 con el mismo código, y el mensaje nombra esa campaña para que no parezca un error de las fechas que se están capturando. Un dato roto falla visible (confirmado con el usuario). Las que no participan no se validan.
  - Política `{ enabled: boolean }`, activada por defecto. Como solo se comparan campañas del mismo tipo, la configuración por tipo de la pantalla 24 se reduce a un booleano que la API resuelve para el tipo de la candidata (confirmado con el usuario). Desactivada no reporta empalmes.
  - Orden de los empalmes: fecha de inicio, luego fecha fin, nombre (`localeCompare` en español) e id, para que sea determinista.
  - **Acciones que deben correr la validación cuando exista la API:** programar (`schedule`); reabrir (`reopen`, porque la campaña vuelve a `scheduled`); editar las fechas de una campaña programada; y extender la fecha fin de una activa (`canExtendEndDate`). Regresar a borrador, cancelar y cerrar no la necesitan: la campaña deja de participar.
- **Consecuencias:** la API llama `assertNoCampaignOverlap` antes de guardar y devuelve `conflicts` para que la web nombre las campañas; K1 también debe traducir la violación de la restricción para el caso de carreras. Queda abierto para K1 cómo convive la regla configurable con el `EXCLUDE` incondicional (ver «Preguntas abiertas» en `backlog.md`).

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
