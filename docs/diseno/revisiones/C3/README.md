# Revisión visual C3 · 20 nov 2026

Capturas de Playwright a 1440 × 900 y 390 × 844 px, escala CSS. Datos ficticios de `moss_test`; los nombres `e2e` y tamaños «Especial» son fixtures, no nuevos valores del catálogo inicial.

| Pantalla | Escritorio | Celular |
| --- | --- | --- |
| Configuración → Tamaños | [Captura](tamanos-desktop.png) | [Captura](tamanos-mobile.png) |
| Detalle de variantes | [Captura](variantes-desktop.png) | [Captura](variantes-mobile.png) |
| Catálogo con tamaño y existencia | [Captura](filtro-desktop.png) | [Captura](filtro-mobile.png) |

Comparación con las referencias 03, 04, 05 y 24:

- 24 solo contiene el acceso a Tamaños; se incorpora una lista con nombre, estado, uso y acciones de orden/edición/actividad/borrado. Conserva tarjetas, jerarquía y navegación de C1/C2. En celular las acciones pasan a una segunda fila y el contenido tiene desplazamiento vertical dentro del shell.
- 03 incorpora «Usa tamaño» en el diálogo del tipo y muestra su estado. El interruptor se bloquea con explicación si hay artículos; cubierto por prueba unitaria y flujo de alta Playwright.
- 04 conserva chips y búsqueda; agrega selector Tamaño. La prueba verifica que Mediano con existencia no encuentre el artículo cuya existencia solo está en Chico. Los controles de filtros conservan el desplazamiento horizontal interno de C2.
- 05 conserva tabla en escritorio y tarjetas en móvil; Tamaño queda primero. Costos e historial siguen asociados a la variante. Las capturas muestran Chico y Mediano en el orden del catálogo.
- No se detectó desbordamiento horizontal de página a 390 ni a 1440 px. Los diálogos se esperan cerrados y las animaciones se deshabilitan al capturar.

Validación local: 545 pruebas de `pnpm test`, 68 pruebas API contra `moss_test` y 16 flujos Playwright en verde. Las capas de dominio, contratos, API, web y Playwright se ejecutaron en rojo antes de su implementación. C3 se ejecuta después del resto de proyectos y en serie entre escritorio/celular porque modifica el catálogo global de tamaños; `afterEach` elimina el tamaño temporal y restaura el orden original.
