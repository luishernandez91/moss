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
| Menú | Secciones Pedidos, Catálogo y Negocio con Clientes, Calendario, Inventario y Listas de precios | Es la navegación objetivo; las opciones de fase 2 se muestran cuando exista su historia |

Las pantallas 13, 14, 17 y 22 se regeneraron el 11 nov 2026 con la inversión por socio y el reparto 50/50 (ver `docs/decisiones.md`).

Si regeneras una pantalla, reemplaza ambos archivos con el mismo nombre y borra su fila de esta tabla cuando ya no haya diferencias.
