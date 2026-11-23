# C6 · Nuevas dimensiones

Revisión del 21 nov 2026. Referencias: `03-tipos-de-articulo-desktop.png` y `03-tipos-de-articulo-mobile.png`. Capturas reales de Playwright, con fixtures propias y base aislada; sin seed como preparación.

| Estado | Desktop, 1440×900 | Móvil, 390×844 |
| --- | --- | --- |
| Nuevo atributo booleano, valor inicial «No» | [Captura](C6-atributo-desktop.png) | [Captura](C6-atributo-mobile.png) |
| Activar tamaños, selección obligatoria | [Captura](C6-tamano-desktop.png) | [Captura](C6-tamano-mobile.png) |
| Tipo con atributos y tamaños habilitados | [Captura](C6-pantalla-desktop.png) | [Captura](C6-pantalla-mobile.png) |

Se conserva la jerarquía de la referencia: tipos a la izquierda y tabla en escritorio; selector de tipo y tarjetas en móvil. El tema y la navegación son los existentes de C3. La lista móvil usa el desplazamiento del shell; las capturas de pantalla muestran el viewport solicitado.

C6 agrega el valor inicial al diálogo de atributo y la acción «Activar tamaños» al menú del tipo. Ambos diálogos explican el alcance sobre inactivos y la aplicación por única vez. El booleano exige elegir «Sí» o «No», y un número vacío no equivale a cero. Las capturas muestran controles y acciones legibles, sin desborde horizontal. No hay rutas nuevas. El texto de ayuda deja de sugerir que se generan SKU automáticamente.

La revisión del flujo también cubre un artículo y una variante con formularios abiertos antes de agregar otra dimensión: reciben 409, conservan la captura, ofrecen recargar y exigen guardar de nuevo después de revisar. Se comprueban atributos y tamaño en API y que el historial de costo sea idéntico al original.

## Evidencia de pruebas

Primero se comprobaron fallos por ausencia de la implementación en dominio, contratos y endpoints; después fallaron las pruebas unitarias web y Playwright por falta del valor inicial obligatorio. La prueba de carrera con un atributo fijo opcional reprodujo la pérdida de su valor (`{}` en lugar de `{nuevo: 'inicial'}`) antes de incorporar la comparación del snapshot bajo bloqueo. La solución elegida por el usuario fue 409 y recarga, conservando el reemplazo intencional de atributos opcionales.

Validación local de C6 sobre la base C3:

- Dominio: 481 pruebas; contratos: 45; API unitaria: 19; web unitaria: 36.
- API contra PostgreSQL real: 102 pruebas, incluidas 27 de C6; filas activas e inactivas, cuatro tipos de valor, atomicidad, bloqueos, carreras ordenadas y seed incompatible sin escrituras parciales.
- Playwright completo: 18 casos. El flujo C6 incluye las dos operaciones y la recarga ante conflicto en ambos viewports.
- `typecheck`, lint y formato sin errores. Instalación limpia aplicando exclusivamente las migraciones existentes. Seed doble con los mismos datos e historial.
- Fixture de receta propia: mismos filtros, referencias SKU y desglose/total después de agregar atributos y tamaño. La comprobación con recetas persistidas de C4a debe realizarse tras el rebase.

## Puerta de integración con C4a

C6 no genera ni modifica migraciones. Antes de fusionar, cuando C4a esté en `main`, falta rebasar, comparar sus migraciones/journal/snapshot byte por byte, probar instalación limpia y actualización desde C3, repetir seed doble, comprobar recetas persistidas y ejecutar todas las suites y CI sobre ese commit. Los resultados anteriores no sustituyen esa verificación. C6 permanece sin marcar como terminada en el backlog hasta cerrar esta puerta.
