# Especificación del sistema Moss & Roots

Versión del 10 nov 2026. Fuente editable: documento "Especificación del sistema Moss & Roots" en Claude. Esta copia es la referencia para los agentes; si cambia una regla, actualiza ambas.

Nombres de tablas y entidades en español en este documento. En código se usan en inglés según el glosario de `AGENTS.md`.

## 1. Propósito y principios

El sistema registra las finanzas de Moss & Roots por campañas: cuánto se invierte, cuánto se vende, cuánto cuesta realmente cada pieza y cuánto le toca a cada socio. Lo usan dos socios, principalmente desde el celular.

- **Campaña como centro de costos.** Todo gasto, producción y venta pertenece a una campaña con presupuesto, fechas y estado. Un pedido para evento es una campaña de tipo evento.
- **Costos unitarios y costos fijos son distintos.** Los unitarios (planta, hilo, fabricación) viven en la receta de cada producto. Los fijos (plaza, gasolina, publicidad) se registran en la campaña y se prorratean por unidad.
- **Un solo catálogo.** Plantas, macetas, sustratos, fertilizantes y materiales son artículos con atributos configurables por tipo y variantes con costo, precio y existencia propios.
- **Herencia de costos.** Un subproducto hereda la receta de su producto padre y puede agregar o sustituir componentes.
- **El pasado no cambia.** Cada producción y venta guarda una copia del costo y del precio del momento. Las campañas cerradas son de solo lectura.
- **El reparto es explícito.** Cada socio registra lo que invierte en cada campaña. Al cerrar, primero cada socio recupera su inversión y su trabajo, y la ganancia restante se divide 50/50.

## 2. Modelo de costos y precios

El costo de una pieza se calcula desde su receta heredada, con el tamaño y el extra elegidos, y se congela al producir o vender.

**Artículos.** Cada artículo pertenece a un tipo (Planta, Maceta, Sustrato, Fertilizantes y vitaminas, Material). El tipo define sus atributos: tipo de dato, unidad, opciones, si es requerido y si define variante. Una planta es un artículo tipo Planta cuya variante es el tamaño (mini, chico, mediano, grande). Cada artículo se marca como "se vende solo", "se usa en recetas", o ambas. Ejemplo completo: `docs/datos/catalogo-ejemplo.json`.

**Productos y subproductos.** Árbol con `parent_id`, hasta 3 niveles. Ejemplo: Kokedama → Kokedama Nochebuena, Kokedama Helecho; Planta en maceta → Cactus en maceta de concreto.

**Componentes de receta.** Pueden ser:

- un artículo con cantidad, con filtro de atributos opcional ("maceta redonda de 8 cm": el color se elige al producir);
- mano de obra con monto fijo (fabricación $20 por kokedama chica).

Un componente sin tamaño aplica a todos los tamaños; uno con tamaño sustituye al genérico. `{tamano}` en un filtro significa "el mismo tamaño que se produce". Un subproducto puede agregar componentes o sustituir uno heredado (`sustituye_componente_id`).

**Extras.** Complementos que se aplican a cualquier subproducto compatible: Reno, Moño, Estrella, Bufanda. Tienen componentes, minutos de armado y precio extra.

**Ejemplo de cálculo, Kokedama Nochebuena chica:**

| Componente | Origen | Costo |
| --- | --- | --- |
| Nochebuena chica | Variante del artículo | $30.00 |
| Fabricación (chica) | Heredado de Kokedama | $20.00 |
| Hilo, 4 m × $0.50 | Heredado de Kokedama | $2.00 |
| Tierra, 0.01 bulto × $110 | Heredado de Kokedama | $1.10 |
| Fibra de coco | Heredado de Kokedama | $0.00 |
| **Total** | | **$53.10** |

**Resolución del costo de un componente**

1. Snapshot guardado en la producción.
2. Costo de la campaña (item de campaña).
3. Costo vigente del catálogo.

**Resolución del precio en una venta**

1. Ajuste manual en la venta, con motivo.
2. Precio especial del item en la campaña.
3. Lista de precios por canal o cantidad (fase 2).
4. Precio general del producto por tamaño, o de la variante.

En cada venta se guardan el precio de lista, el precio aplicado y su origen (`general`, `lista`, `campana`, `manual`).

## 3. Pantallas: acceso y general

**1. Iniciar sesión** · MVP

- Login con correo y contraseña, y recuperación de contraseña.
- Cada usuario está ligado a un socio.

**2. Dashboard** · MVP

- KPIs globales: vendido, gastado, resultado y campañas activas.
- Gráfica de ventas semanales.
- Campañas activas con barra de presupuesto.
- Alertas: presupuesto ≥ 85%, margen bajo, entregas próximas, saldos pendientes y campañas por cerrar.

## 4. Pantallas: catálogo

**3. Tipos de artículo y atributos** · MVP

- CRUD de tipos: Planta, Maceta, Sustrato, Fertilizantes y vitaminas, Material.
- Atributos por tipo: tipo de dato, unidad, opciones, requerido y si define variante.

**4. Catálogo de artículos** · MVP

- Lista con filtros por tipo y por atributo (ej. macetas de 10 cm con existencia).
- Marcas "se vende" y "se usa en recetas".
- Alta de artículo con atributos fijos validados según su tipo.

**5. Detalle de artículo y variantes** · MVP

- Tabla de variantes: SKU, atributos, costo promedio, precio y existencia. En plantas, la variante es el tamaño.
- Alta solo de las variantes que existen, sin generar todas las combinaciones.
- Historial de costos.

**6. Inventario** · Fase 2

- Movimientos: compra, venta, consumo en producción, merma y ajuste.
- Existencia y costo promedio ponderado por variante.
- Alerta de existencia baja.
- Resuelve el inventario que pasa de una campaña a otra (macetas, sustratos).

**7. Productos** · MVP

- Árbol producto → subproducto, hasta 3 niveles.
- Costo calculado, precio y margen por tamaño en cada fila.

**8. Detalle de producto o subproducto** · MVP

- Receta con componentes heredados (gris, "Heredado"), propios y sustituidos (tachados, "Sustituido").
- Componentes de artículo, con filtro de atributos y `{tamano}`, o de mano de obra.
- Selector de tamaño que recalcula el costo.
- Precio de venta por tamaño y margen.

**9. Extras** · MVP

- CRUD de complementos: Reno, Moño, Estrella, Bufanda.
- Componentes, costo, minutos de armado y precio extra.
- Productos a los que aplica.

**10. Listas de precios** · Fase 2

- Menudeo, mayoreo, Marketplace.
- Precio por variante o por producto y tamaño, con cantidad mínima y vigencia.

## 5. Pantallas: campañas

Una campaña pasa por seis estados. Solo borrador, programada, cerrada y cancelada se guardan; activa y por cerrar se calculan con la fecha actual en `America/Mexico_City`, sin depender de un cron.

```
Borrador ⇄ Programada → (llega el inicio) Activa → (pasa el fin) Por cerrar → (cerrar) Cerrada
                 ↓                                        ↑ reabrir con motivo ↓
             Cancelada
Cerrada o Cancelada → clonar → Borrador sin fechas
```

La campaña no se bloquea al pasar la fecha fin: queda "por cerrar" para registrar movimientos atrasados, y se bloquea cuando los socios la cierran.

| Estado | Se puede |
| --- | --- |
| Borrador | Editar todo sin validar fechas. Eliminar. |
| Programada | Editar todo. Regresar a borrador. Cancelar. |
| Activa | Registrar gastos, producción y ventas. Extender la fecha fin si no empalma. |
| Por cerrar | Registrar movimientos atrasados. Capturar inventario sobrante. Cerrar. Opcional: cierre automático tras N días de gracia. |
| Cerrada | Solo lectura. Clonar. Reabrir con motivo registrado. |
| Cancelada | Solo lectura. Clonar. |

**11. Campañas** · MVP

- Lista con filtro por estado y pastillas de color.
- Vista de calendario o línea de tiempo.
- Acciones según estado: editar, programar, cancelar, clonar.

**12. Crear o editar campaña** · MVP

- Paso 1: nombre, tipo, presupuesto, fechas y % de reinversión.
- Paso 2: plantas y productos de la campaña, con costos copiados del catálogo y editables.
- Paso 3: revisión, guardar como borrador o programar.
- Validación de empalme entre campañas programadas, activas y por cerrar del mismo tipo (configurable). Los borradores no se validan.
- Al clonar: copia nombre, presupuesto, % de reinversión, notas e items, con la opción de tomar costos de la original o del catálogo. No copia gastos, producciones, ventas, inventario sobrante ni fechas. Los precios especiales se copian marcados para revisión.

**13. Detalle de campaña** · MVP

- KPIs: presupuesto, gastado, vendido, resultado, recuperación y cuánto falta para el punto de equilibrio.
- Pestaña Productos: costo de campaña, precio de lista, precio especial editable y margen con semáforo verde, ámbar o rojo. Aviso si el precio especial queda bajo el costo o bajo el margen mínimo.
- Pestañas Gastos, Producciones y Ventas.
- Pestaña Costos fijos: prorrateo por unidad producida.
- Pestaña Inversión por socio: cuánto ha invertido cada socio en la campaña (suma de sus gastos) y cuánto trabajo se le debe, con el detalle de cada compra.
- Gasto por categoría y costo de receta contra costo real.
- Bitácora: programar, cancelar, cerrar, reabrir con motivo.

**14. Registrar gasto** · MVP

- Monto, concepto, categoría, campaña, quién pagó, fecha y foto del ticket.
- "Quién pagó" es obligatorio: un socio (cuenta como su inversión en la campaña) o la caja del negocio (dinero reinvertido de campañas anteriores, no es inversión de nadie).
- Una compra de plantas actualiza el costo del item de campaña con origen "compra".

**15. Registrar producción** · MVP

- Subproducto, tamaño, extra y cantidad.
- Elección de variante cuando la receta lo pide (color de maceta).
- Quién fabricó.
- Snapshot del costo unitario.

**16. Venta rápida (celular)** · MVP

- Tarjetas grandes con foto, selector de tamaño y chips de extras.
- Carrito con precio resuelto: manual, especial de campaña, lista o general.
- Ajuste manual con motivo.
- Método de pago: efectivo o transferencia.
- Snapshot de costo y precio con su origen.

**17. Cierre y reparto** · MVP

- Inventario sobrante, valuado a costo. El producto de temporada vale $0 al cerrar.
- Cascada: ventas → recuperación de inversión por socio → pago de trabajo por socio → ganancia → reinversión opcional → ganancia a repartir 50/50.
- Por socio: inversión registrada, recupera inversión, pago por trabajo, ganancia (50%) y total a recibir.
- Si la campaña tiene pérdida, la pérdida también se divide 50/50: a cada socio se le devuelve lo que puso menos la mitad de la pérdida. Si el resultado de un socio es negativo, la pantalla lo muestra como "debe aportar" a la caja o al otro socio.
- Confirmación de cierre y bloqueo.

## 6. Pantallas: pedidos para eventos

Cada pedido aceptado crea una campaña de tipo evento, con presupuesto igual a su costo estimado. Por eso el empalme se valida por tipo de campaña: un evento del 20 de diciembre coincide con la campaña de Nochebuena.

**18. Clientes** · Fase 2

- CRUD: nombre, WhatsApp, tipo (particular o empresa) e historial de pedidos.

**19. Cotizador** · Fase 2

- Partidas con producto, tamaño, extra, personalización y cantidad.
- Costo calculado con la receta y los costos vigentes.
- Precio sugerido según margen objetivo, con descuento por volumen opcional.
- Vigencia de la cotización (ej. 7 días).
- Estados: borrador, enviada, aceptada, rechazada, vencida.
- Texto para WhatsApp o PDF.

**20. Detalle de pedido** · Fase 2

- Fecha y lugar de entrega.
- Estados: confirmado, en producción, listo, entregado, cancelado.
- Pagos: anticipo y liquidación, con saldo pendiente.
- Bloqueo del paso a "en producción" si el anticipo no cubre el mínimo (por defecto 50%, al menos el costo de materiales).
- Lista de compras automática a partir de la receta, con margen de merma de 5–10%.
- Horas de fabricación contra la fecha de entrega, con aviso si no alcanza.
- El grabado o la personalización se cotizan como extra con costo de proveedor o material.

**21. Calendario de entregas** · Fase 2

- Entregas próximas, saldos pendientes y cotizaciones por vencer.

## 7. Pantallas: socios, reportes y configuración

**22. Socios** · MVP

- Participación en la ganancia: 50/50 fija por defecto, editable en configuración (debe sumar 100%).
- Por campaña: inversión registrada, trabajo pagado, ganancia recibida y total.

**23. Reportes** · Fase 2

- Margen por subproducto y tamaño.
- Punto de equilibrio en piezas.
- Costo de receta contra costo real por campaña.
- Ventas a precio especial contra precio de lista.
- Rentabilidad por tipo de campaña.
- Filtros por rango de fechas y exportación.

**24. Configuración** · MVP

- Tamaños y categorías de gasto.
- Tipos de campaña y regla de empalme (activada por defecto, por tipo).
- Valores por defecto: participación en la ganancia (50/50), % de reinversión (0%, opcional por campaña), margen mínimo para el aviso (30%), % de anticipo mínimo (50%) y días de gracia para el cierre automático.
- Usuarios y su socio.

## 8. Reglas de negocio

1. **No contar dos veces.** El resultado de la campaña sale de los gastos reales. El costo de receta sirve para fijar precios y para comparar contra el costo real; nunca se suma al resultado.
2. **Snapshots.** Cada producción guarda el costo unitario; cada venta guarda costo, precio de lista, precio aplicado y origen del precio. Cambiar el catálogo no altera el pasado.
3. **Items de campaña.** Al crear la campaña se copian solo los artículos y productos elegidos, con el costo vigente. El catálogo sigue siendo la fuente principal; un item agregado después se copia en ese momento.
4. **Compras reales.** Una compra registrada como gasto actualiza el costo del item de campaña y lo marca con origen "compra".
5. **Precio especial.** Solo aplica mientras la campaña está activa o por cerrar. Se avisa si queda bajo el costo o bajo el margen mínimo.
6. **Empalme.** Se fuerza en PostgreSQL con una restricción `EXCLUDE` sobre `daterange` por tipo de campaña, y se valida también en dominio para dar un mensaje claro.
7. **Inversión y reparto al cierre.** La inversión de un socio en una campaña es la suma de los gastos que pagó en ella; lo pagado por la caja del negocio no es inversión de nadie. Ganancia = ventas − todos los gastos − trabajo registrado. Al cerrar, a cada socio se le devuelve su inversión y se le paga su trabajo; de la ganancia se aparta el % de reinversión de la campaña (0% por defecto) y el resto se divide 50/50. Con pérdida, la pérdida también se divide 50/50.
8. **Trabajo.** Fabricación de kokedama: $20 por pieza chica. El armado de extras se paga a $2.50 por minuto.
9. **Inventario de temporada.** Al cerrar, el producto de temporada que sobra (nochebuena) se valúa en $0.
10. **Fechas.** Todo cálculo de "hoy" usa `America/Mexico_City`.
11. **Bitácora.** Programar, cancelar, cerrar y reabrir quedan registrados con usuario, fecha y motivo.

## 9. Esquema de datos de referencia

Modelo lógico. Montos en centavos enteros. La implementación en Drizzle traduce nombres con el glosario de `AGENTS.md`.

```sql
-- Catálogo
tipos_articulo(id, nombre)
atributos(id, tipo_articulo_id, nombre,
          tipo_dato ENUM('texto','numero','lista','booleano'),
          unidad NULL, opciones JSONB NULL, requerido, define_variante)
articulos(id, tipo_articulo_id, nombre, descripcion, foto,
          atributos_fijos JSONB, se_vende, se_usa_en_recetas, activo)
articulo_variantes(id, articulo_id, sku, atributos JSONB,
          costo_promedio, precio NULL, existencia, activo)
movimientos_inventario(id, variante_id, campana_id NULL,
          tipo ENUM('compra','venta','consumo','merma','ajuste'),
          cantidad, costo_unitario, fecha)
tamanos(id, nombre, orden)

-- Productos y recetas
productos(id, parent_id NULL, nombre, activo)
producto_precios(id, producto_id, tamano_id, precio)
componentes(id, producto_id, articulo_id NULL, filtro_atributos JSONB NULL,
          concepto, tipo ENUM('material','mano_obra'), cantidad, monto,
          tamano_id NULL, sustituye_componente_id NULL)
extras(id, nombre, precio_extra, minutos_armado)
extra_componentes(id, extra_id, articulo_id NULL, concepto, tipo, cantidad, monto)

-- Campañas
campanas(id, nombre, tipo, presupuesto, inicio NULL, fin NULL,
         estado ENUM('borrador','programada','cerrada','cancelada'),
         pct_reinversion, inventario_sobrante, clonada_de_id NULL, cerrada_en NULL)
campana_items(id, campana_id, producto_id NULL, variante_id NULL, tamano_id NULL,
         costo_campana, origen_costo ENUM('catalogo','compra','manual'),
         precio_especial NULL, motivo_precio NULL, requiere_revision, activo)
campana_eventos(id, campana_id, accion, motivo, usuario_id, creado_en)
gastos(id, campana_id, categoria, concepto, monto, pagado_por_socio_id, fecha, ticket NULL)
producciones(id, campana_id, producto_id, tamano_id, extra_id NULL, variante_elegida JSONB NULL,
         cantidad, costo_unitario_snapshot, fabricado_por_socio_id, fecha)
ventas(id, campana_id, fecha, canal, metodo_pago)
venta_items(id, venta_id, producto_id NULL, variante_id NULL, tamano_id NULL, extra_id NULL,
         cantidad, costo_unitario_snapshot, precio_lista, precio_aplicado,
         origen_precio ENUM('general','lista','campana','manual'), motivo_ajuste NULL)

-- Socios
socios(id, nombre, participacion_pct, usuario_id NULL)

-- Pedidos (fase 2)
clientes(id, nombre, whatsapp, tipo, notas)
cotizaciones(id, cliente_id, fecha_evento, vigencia_hasta, margen_objetivo, descuento, estado, total)
cotizacion_items(id, cotizacion_id, producto_id, tamano_id, extra_id NULL,
         personalizacion NULL, cantidad, costo_unitario, precio_unitario)
pedidos(id, cotizacion_id, campana_id, fecha_entrega, lugar_entrega, estado, anticipo_minimo_pct)
pedido_pagos(id, pedido_id, tipo ENUM('anticipo','liquidacion'), monto, metodo, fecha)

-- Listas de precios (fase 2)
listas_precios(id, nombre)
precios_lista(id, lista_id, variante_id NULL, producto_id NULL, tamano_id NULL,
         precio, cantidad_minima, vigente_desde)
```

En `campana_items`, `producto_id` y `variante_id` son excluyentes: exactamente uno tiene valor. El JSON de atributos se valida en el backend contra la definición del tipo.

## 10. Casos de prueba con números reales

| Caso | Esperado |
| --- | --- |
| Costo Kokedama Nochebuena chica (catálogo de ejemplo) | $53.10 |
| Costo Kokedama Nochebuena mediana + Reno: planta $45, hilo $3, fabricación $25, reno $18.50 | $91.50 |
| Campaña: ventas $3,600, gastos $1,460 (Luis $1,400 en plantas y gasolina; el otro socio $60 de hilo), trabajo $600 del otro socio, reinversión 0% | Ganancia $1,540; $770 por socio |
| Reparto por socio del caso anterior | Luis recibe $1,400 + $770 = $2,170; el otro socio $60 + $600 + $770 = $1,430 (suma $3,600) |
| Mismo caso con reinversión 30% | Reinversión $462; $539 por socio; Luis $1,939; el otro socio $1,199; caja $462 |
| Pérdida: ventas $1,000, gastos $1,460 (Luis $1,400, el otro socio $60), sin trabajo | Pérdida $460, $230 por socio; Luis recibe $1,170; el otro socio debe aportar $170 (suma $1,000) |
| Gasto pagado por la caja del negocio | No suma a la inversión de ningún socio |
| Empalme: campaña nueva del 1 al 15 dic contra una programada del 10 al 31 dic, mismo tipo | Rechazada |
| Empalme: mismo rango, tipos distintos (evento y temporada) | Aceptada |
| Precio especial $50 sobre costo $53.10 | Aviso de margen negativo |
