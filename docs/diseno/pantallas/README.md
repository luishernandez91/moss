# Pantallas de referencia

Diseños generados con Claude Design a partir de `../prompts-pantallas.md`. Cada pantalla tiene versión desktop (1440 px) y mobile (390 px), exportadas a 1x. El número coincide con la pantalla de `docs/especificacion.md` y con el campo "Spec" de las historias de `backlog.md`.

**Son referencia visual, no la fuente de verdad.** Si una imagen contradice la especificación (cifras, campos, reglas), gana la especificación. Las cifras de las imágenes son ilustrativas.

| # | Pantalla | Desktop | Mobile | Fase |
| --- | --- | --- | --- | --- |
| 01 | Iniciar sesión | `01-iniciar-sesion-desktop.png` | `01-iniciar-sesion-mobile.png` | MVP |
| 02 | Dashboard | `02-dashboard-desktop.png` | `02-dashboard-mobile.png` | MVP |
| 03 | Tipos de artículo | `03-tipos-de-articulo-desktop.png` | `03-tipos-de-articulo-mobile.png` | MVP |
| 04 | Catálogo de artículos | `04-catalogo-desktop.png` | `04-catalogo-mobile.png` | MVP |
| 05 | Detalle de artículo | `05-detalle-de-articulo-desktop.png` | `05-detalle-de-articulo-mobile.png` | MVP |
| 06 | Inventario | `06-inventario-desktop.png` | `06-inventario-mobile.png` | Fase 2 |
| 07 | Productos | `07-productos-desktop.png` | `07-productos-mobile.png` | MVP |
| 08 | Detalle de producto | `08-detalle-de-producto-desktop.png` | `08-detalle-de-producto-mobile.png` | MVP |
| 09 | Extras | `09-extras-desktop.png` | `09-extras-mobile.png` | MVP |
| 10 | Listas de precios | `10-listas-de-precios-desktop.png` | `10-listas-de-precios-mobile.png` | Fase 2 |
| 11 | Campañas | `11-campanas-desktop.png` | `11-campanas-mobile.png` | MVP |
| 12 | Crear o editar campaña | `12-crear-campana-desktop.png` | `12-crear-campana-mobile.png` | MVP |
| 13 | Detalle de campaña | `13-detalle-de-campana-desktop.png` | `13-detalle-de-campana-mobile.png` | MVP |
| 14 | Registrar gasto | `14-registrar-gasto-desktop.png` | `14-registrar-gasto-mobile.png` | MVP |
| 15 | Registrar producción | `15-registrar-produccion-desktop.png` | `15-registrar-produccion-mobile.png` | MVP |
| 16 | Venta rápida | `16-venta-rapida-desktop.png` | `16-venta-rapida-mobile.png` | MVP |
| 17 | Cierre y reparto | `17-cierre-y-reparto-desktop.png` | `17-cierre-y-reparto-mobile.png` | MVP |
| 18 | Clientes | `18-clientes-desktop.png` | `18-clientes-mobile.png` | Fase 2 |
| 19 | Cotizador | `19-cotizador-desktop.png` | `19-cotizador-mobile.png` | Fase 2 |
| 20 | Detalle de pedido | `20-detalle-de-pedido-desktop.png` | `20-detalle-de-pedido-mobile.png` | Fase 2 |
| 21 | Calendario de entregas | `21-calendario-de-entregas-desktop.png` | `21-calendario-de-entregas-mobile.png` | Fase 2 |
| 22 | Socios | `22-socios-desktop.png` | `22-socios-mobile.png` | MVP |
| 23 | Reportes | `23-reportes-desktop.png` | `23-reportes-mobile.png` | Fase 2 |
| 24 | Configuración | `24-configuracion-desktop.png` | `24-configuracion-mobile.png` | MVP |

Componentes compartidos en `componentes/`: `menu-lateral.png` (navegación desktop), `barra-inferior.png` (navegación mobile) y `miniatura.png` (foto de producto).

## Diferencias conocidas con la especificación

| # | La imagen muestra | La especificación dice |
| --- | --- | --- |
| 01 | Enlace de recuperación de contraseña | E0.5 solo ofrece correo, contraseña y error; la recuperación por correo corresponde a F2.9 |
| Menú | Secciones Pedidos, Catálogo y Negocio con Clientes, Calendario, Inventario y Listas de precios | Es la navegación objetivo; las opciones de fase 2 se muestran cuando exista su historia |
| 03 | Contador de «Maceta» en 3 con cinco atributos en la tabla | El contador es el número de atributos activos del tipo |
| 03 | Breadcrumb «Configuración › Catálogo» y la opción Configuración activa en el menú | La pantalla pertenece al catálogo (§4) y tiene su propia entrada «Tipos de artículo»; el breadcrumb dice «Catálogo» |
| 03 | Interruptor «Requerido» editable en atributos que definen variante | Un atributo que define variante siempre es requerido: el interruptor queda activado y deshabilitado |
| 04, 05 | Fotos de artículo | Sin fotos en C2: un ícono genérico. El almacenamiento de archivos depende del despliegue (pregunta abierta del backlog) |
| 05 | Gráfica escalonada del historial de costo | Lista de entradas (fecha · motivo · costo); sin gráfica en C2 |
| 04, 05 | Costo y existencia de piezas sin unidad; «$0.50/m» y «300 m» en otros artículos | Igual que la imagen: la unidad de existencia del artículo va como sufijo, salvo en piezas |
| 05 | Muestras de color junto al valor | El color es una opción de lista, no un código de color: se muestra solo el texto |
| 04, 05 | Sin filtros ni acciones para inactivos | Artículos y variantes no se borran: «Mostrar inactivos» o «Mostrar inactivas» y la acción «Reactivar» |
| 04 | La pastilla «Diámetro: 10 cm» aparece sin forma de agregarla | Al elegir un tipo aparece «Filtrar por atributo» (diálogo de atributo y valor) y «Con existencia» |
| 05 (mobile) | Barra superior «‹ Artículo» con lápiz | Enlace «‹ Catálogo» y menú «Acciones del artículo» dentro de la página; la barra superior es la del shell |
| 03 | Se puede agregar cualquier atributo a un tipo | Limitación de C2: un tipo con artículos no puede ganar un atributo requerido ni uno de variante (409 `ATTRIBUTE_VALUES_MISSING`). Se crea opcional y se llena; el de variante con valor por defecto queda para C6 |
| 03 | Sin interruptor de tamaño | C3 agrega «Usa tamaño» al diálogo y estado en el tipo; bloqueado con artículos existentes |
| 04 | Sin filtro global de tamaño | C3 agrega selector; los desactivados solo aparecen si están en uso |
| 05 | Solo columnas de atributos | C3 agrega Tamaño como primera columna (primer dato en tarjeta móvil) si el tipo lo usa; selector condicional en diálogos |
| 24 | Acceso a Tamaños, sin diseño de su editor | C3 usa `/configuracion/tamanos`: lista ordenada con nombre, estado, uso y botones Subir/Bajar/Editar/Desactivar/Borrar; filas apiladas en móvil. Configuración abre esta sección hasta S2; el resto sigue pendiente |
| 11 | Gastado, Vendido, Resultado y barra de % de presupuesto con cifras | «—» y sin barra: no hay gastos (K4) ni ventas (K6). Sin cifras de ejemplo |
| 11 | Botón «+ Nueva campaña» y menú ⋮ en cada tarjeta | Llegan con K2 (crear, editar, programar, cancelar, clonar) |
| 11 | Nota «Campañas del mismo tipo no se empalman» | «…, excepto eventos»: el tipo evento permite empalme; los eventos empalmados van en carriles separados |
| 11 (mobile) | Botón «+» en el encabezado | Llega con K2 |
| 11 | «Día de Muertos» cerrada en la línea de tiempo (prompt de la pantalla) | La línea de tiempo muestra solo programadas, activas y por cerrar; las cerradas, canceladas y borradores aparecen en la lista |
| 24 | Tarjeta «Tipos de campaña» con el interruptor «No permitir empalme dentro del mismo tipo» | Sin interruptor global: cada tipo tiene su marca «permite empalme» (temporada no, evento sí), según §7 pantalla 24 y la decisión «Empalme por tipo» |
| 22 | Importes y campañas de ejemplo; texto «Trabajo» abreviado en móvil | S1 muestra montos sin datos y estado vacío hasta K7; usa «Trabajo pagado» explícito y navegación MVP. Comparación: [revisión S1](../revisiones/S1/README.md) |

## Unidad de existencia mal capturada (pantallas 4 y 5)

La unidad de existencia de un artículo no se edita: cambiaría el significado del costo y la existencia de todas sus variantes. Si se capturó mal:

1. Desactiva el artículo (menú «Acciones del artículo» → «Desactivar artículo»).
2. Edita cada variante del artículo desactivado y cambia su SKU (por ejemplo, agrega `-OLD`), para liberar los SKU originales. El SKU es único también contra variantes inactivas.
3. Crea el artículo correcto con su unidad y las variantes con los SKU originales y los costos y existencias en la nueva unidad.

El historial de costo del artículo anterior se conserva en el desactivado.

Las pantallas 13, 14, 17 y 22 se regeneraron el 11 nov 2026 con la inversión por socio y el reparto 50/50 (ver `docs/decisiones.md`).

Si regeneras una pantalla, reemplaza ambos archivos con el mismo nombre y borra su fila de esta tabla cuando ya no haya diferencias.

Revisión C3 a 1440 y 390 px: [capturas y comparación](../revisiones/C3/README.md).
