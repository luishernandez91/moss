# Prompts de diseño por pantalla

Un prompt por pantalla. Cada uno genera una sola imagen con la versión **desktop (1440 px)** y la **mobile (390 px)** lado a lado, para que se diseñen juntas. Los prompts están en inglés porque los generadores de imágenes responden mejor así; los textos de la interfaz se piden en español.

Cada prompt es independiente: cópialo completo. Las cifras son las de la especificación (`docs/especificacion.md`), así los bocetos quedan congruentes con la lógica del sistema.

**Si el texto sale ilegible o amontonado:** genera desktop y mobile por separado, quitando del prompt la parte de la otra versión.

---

## 1. Iniciar sesión

```
High-fidelity UI mockup of the login screen of "Moss & Roots", an internal finance app for a small handmade plant business (kokedamas).

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: split layout. Left half: a soft illustration of a kokedama (moss ball plant) with a small poinsettia, on a pale green background. Right half: centered card with a small leaf logo and the name "Moss & Roots", fields "Correo" and "Contraseña" with show/hide icon, a full-width primary button "Entrar", and a quiet link "¿Olvidaste tu contraseña?".
Mobile: no illustration, logo on top, the same two fields and the "Entrar" button full width, link below.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, rounded inputs, simple line icons. All UI text in Spanish (Mexico).

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 2. Dashboard

```
High-fidelity UI mockup of the dashboard of "Moss & Roots", an internal finance app for a small handmade plant business (kokedamas) run by two partners.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar (Dashboard, Campañas, Venta rápida, Catálogo, Productos, Extras, Socios, Reportes, Configuración). Top row of four KPI cards: "Vendido $8,450.00", "Gastado $5,120.00", "Resultado +$3,330.00" in green, "Campañas activas 2". Below, a line chart "Ventas por semana" over 8 weeks. Right column: list "Campañas activas" with two cards, "Nochebuena 2026" with a budget progress bar at 87% in terracotta and "Suculentas para eventos" at 40%. Alert panel: "Nochebuena 2026 va al 87% del presupuesto", "Precio especial con margen bajo en Kokedama Poto chica", "Campaña Día de Muertos por cerrar".
Mobile: KPI cards in a 2x2 grid, the chart below, then the alert list and active campaigns stacked; bottom tab bar (Inicio, Campañas, Vender, Catálogo, Más) with a prominent center "Vender" button.

Style: clean modern web app, light neutral background with a faint green tint, white cards, deep moss green primary color, terracotta only for warnings, muted red for losses, green for profits, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, cluttered layout, stock photos of people, watermarks.
```

## 3. Tipos de artículo y atributos

```
High-fidelity UI mockup of the "Tipos de artículo" settings screen of "Moss & Roots", an internal finance app for a small plant business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Master-detail layout. Left column lists article types with counts: "Planta (5)", "Maceta (3)", "Sustrato (3)", "Fertilizantes y vitaminas (3)", "Material (3)"; "Maceta" is selected. Right panel "Atributos de Maceta" shows a table with columns Atributo, Tipo de dato, Unidad, Opciones, Requerido, Define variante: rows "Material · Lista · — · concreto, barro, cerámica · Sí · No", "Drenaje · Sí/No · — · — · Sí · No", "Forma · Lista · — · redonda, cuadrada, hexagonal · Sí · Sí", "Diámetro · Número · cm · — · Sí · Sí", "Color · Lista · — · gris, blanco, negro, terracota · Sí · Sí". Toggle switches for Requerido and Define variante, a "Nuevo atributo" button, and a "Nuevo tipo" button.
Mobile: list of types; tapping shows a stacked list of attribute cards, each with its data type chip and two small toggles.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, rounded inputs, simple line icons, small leaf logo. All UI text in Spanish (Mexico).

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 4. Catálogo de artículos

```
High-fidelity UI mockup of the article catalog of "Moss & Roots", an internal finance app for a small plant business that sells kokedamas, plants, pots, substrates and fertilizers.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Top: search bar, type filter chips (Todos, Planta, Maceta, Sustrato, Fertilizantes y vitaminas, Material) and an attribute filter "Diámetro: 10 cm" applied, plus "Nuevo artículo" button. Table with small product photos and columns Artículo, Tipo, Variantes, Costo desde, Existencia, "Se vende", "Se usa en recetas": rows "Nochebuena · Planta · 3 · $30.00 · 30", "Poto · Planta · 2 · $25.00 · 18", "Maceta de concreto · Maceta · 5 · $9.00 · 125", "Tierra preparada · Sustrato · 2 · $35.00 · 12", "Fertilizante foliar 20-20-20 · Fertilizantes y vitaminas · 1 · $45.00 · 6", "Hilo de cáñamo · Material · 1 · $0.50/m · 300 m". Check icons for the two flags.
Mobile: search on top, horizontal scrolling type chips, then a list of cards with photo, name, type chip, cost and stock.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 5. Detalle de artículo y variantes

```
High-fidelity UI mockup of the article detail screen "Maceta de concreto" in "Moss & Roots", an internal finance app for a small plant business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Header with photo of a small grey concrete pot, name "Maceta de concreto", type chip "Maceta", fixed attributes "Material: concreto · Drenaje: sí", toggles "Se vende" and "Se usa en recetas". Main table "Variantes" with columns SKU, Forma, Diámetro, Color, Costo promedio, Precio, Existencia: "MAC-CON-R08-GR · redonda · 8 cm · gris · $15.00 · $35.00 · 25", "MAC-CON-R08-BL · redonda · 8 cm · blanco · $15.00 · $35.00 · 20", "MAC-CON-R10-GR · redonda · 10 cm · gris · $18.00 · $45.00 · 12", "MAC-CON-C10-NE · cuadrada · 10 cm · negro · $20.00 · $50.00 · 8", "MAC-CON-H06-BL · hexagonal · 6 cm · blanco · $9.00 · $25.00 · 60". Button "Agregar variante". Side panel "Historial de costo" with a small step line for the selected variant.
Mobile: header card, then variants as stacked cards with SKU, attribute chips, cost, price and stock; history collapsed under a "Ver historial" row.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 6. Inventario

```
High-fidelity UI mockup of the inventory screen of "Moss & Roots", an internal finance app for a small plant business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Top summary cards: "Valor del inventario $4,280.00", "Variantes con existencia baja 3", "Movimientos este mes 46". Table of stock by variant with columns Variante, Existencia, Costo promedio, Valor, Estado; low-stock rows marked with a terracotta "Bajo" pill (e.g. "Maceta de cerámica redonda 10 cm blanco · 6"). Right panel "Movimientos recientes": "Compra · 30 Nochebuena chica · $900.00 · 2 nov", "Consumo en producción · 15 Maceta concreto 8 cm · 5 nov", "Venta · 4 Poto chico · 6 nov", "Merma · 2 Nochebuena chica · 8 nov". Buttons "Registrar compra", "Registrar merma", "Ajuste".
Mobile: summary cards stacked, a segmented control "Existencias | Movimientos", list rows with pills, floating "+" button.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, terracotta only for warnings, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 7. Productos

```
High-fidelity UI mockup of the products screen of "Moss & Roots", an internal finance app for a small business that makes kokedamas (moss ball plants).

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Expandable tree table with columns Producto, Tamaños, Costo (chico), Precio (chico), Margen. Parent row "Kokedama" (base recipe, no price) expanded to children "Kokedama Nochebuena · chico, mediano, grande · $53.10 · $120.00 · 56%", "Kokedama Helecho Boston · chico, mediano · $62.85 · $140.00 · 55%", "Kokedama Poto · chico, mediano · $48.10 · $110.00 · 56%". Second parent "Planta en maceta" with children "Cactus en maceta de concreto" and "Centro de mesa suculenta mini". Margin shown as green pill badges; indentation and tree lines show hierarchy. Button "Nuevo producto".
Mobile: collapsible groups per parent product, child rows as cards with cost, price and a margin pill.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, green for healthy margins, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 8. Detalle de producto o subproducto

```
High-fidelity UI mockup of the product detail screen "Kokedama Nochebuena" in "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Header with photo of a small poinsettia kokedama, breadcrumb "Kokedama › Kokedama Nochebuena", segmented size selector "Chico | Mediano | Grande" with Chico selected. Main panel "Receta" table with columns Componente, Origen, Cantidad, Costo: "Nochebuena chica · Propio · 1 · $30.00", "Fabricación (chica) · Heredado · — · $20.00", "Hilo de cáñamo · Heredado · 4 m · $2.00", "Tierra preparada · Heredado · 0.01 bulto · $1.10", "Fibra de coco · Heredado · 1 · $0.00". Inherited rows in grey text with a small "Heredado" tag. Total row "$53.10". Side summary card: "Costo $53.10", "Precio $120.00", "Margen 56%" in green, with editable price field per size. Buttons "Agregar componente", "Sustituir heredado".
Mobile: size selector on top, summary card (cost, price, margin), then the recipe as a list with grey inherited rows.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 9. Extras

```
High-fidelity UI mockup of the "Extras" screen of "Moss & Roots", an internal finance app for a small kokedama business. Extras are removable Christmas decorations added to a kokedama.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Grid of four cards, each with a small photo of a coconut-fiber kokedama with a red poinsettia wearing the decoration: "Reno" (pipe-cleaner antlers, red pompom nose), "Moño" (red ribbon bow), "Estrella" (small wooden star), "Bufanda" (red and white felt scarf). Each card shows its material cost, assembly minutes, total cost and extra price, e.g. Reno: "Material $6.00", "Armado 5 min", "Costo $18.50", "Precio extra +$59.00"; Moño: "Material $6.00", "Armado 3 min", "Costo $13.50", "Precio extra +$59.00". Each card has a chip "Aplica a: Kokedama". Button "Nuevo extra". One card opened in a side panel with its component list.
Mobile: cards stacked in a single column with the same figures.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 10. Listas de precios

```
High-fidelity UI mockup of the price lists screen of "Moss & Roots", an internal finance app for a small plant business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Tabs for lists: "General", "Mayoreo", "Marketplace". "Mayoreo" selected. Table with columns Producto o variante, Tamaño, Cantidad mínima, Precio, Vigente desde, Margen: "Kokedama Nochebuena · chico · 10 · $99.00 · 15 nov 2026 · 46%", "Kokedama Nochebuena · chico · 30 · $89.00 · 15 nov 2026 · 40%", "Centro de mesa suculenta mini · mini · 50 · $79.00 · 1 nov 2026 · 63%". Margin badges colored green or amber. Buttons "Nueva lista", "Agregar precio".
Mobile: list selector dropdown on top, then price rows as cards with quantity tiers.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, amber for low margin, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 11. Campañas

```
High-fidelity UI mockup of the campaigns list of "Moss & Roots", an internal finance app where every expense and sale belongs to a campaign.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Status filter chips with colored dots: Todas, Borrador (grey), Programada (blue), Activa (green), Por cerrar (amber), Cerrada (dark grey), Cancelada (muted red). Toggle "Lista | Línea de tiempo"; timeline view shown on top as a horizontal band Oct–Jan with campaigns placed by date, no overlaps within the same type: "Día de Muertos" (closed, Oct), "Nochebuena 2026" (active, 1 Nov–24 Dec), "Reyes 2027" (scheduled, Jan). Below, campaign cards: name, status pill, type chip ("Temporada" or "Evento"), date range, budget progress bar, and three figures Gastado / Vendido / Resultado, e.g. "Nochebuena 2026 · $2,060.00 · $3,600.00 · +$1,540.00". Card menu with "Clonar". Button "Nueva campaña".
Mobile: horizontally scrolling status chips, then stacked campaign cards; timeline as a compact vertical list grouped by month.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, green for profit, muted red for loss, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 12. Crear o editar campaña

```
High-fidelity UI mockup of the "Nueva campaña" wizard of "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Stepper on top: "1 Datos · 2 Productos y costos · 3 Revisión", step 2 active. Step 2 shows a species picker with checkboxes per size (Nochebuena: chico ✓, mediano ✓, grande; Poto: chico ✓) and below a table of copied items with columns Item, Tamaño, Costo, Origen, Precio especial: "Nochebuena · chico · $30.00 · Del catálogo", "Nochebuena · mediano · $45.00 · Editado" (editable cell highlighted), "Kokedama Nochebuena · chico · $53.10 · Del catálogo · $99.00". Origin shown as small tags "Del catálogo" or "Editado". An inline warning banner in terracotta: "Las fechas 1–15 dic se empalman con Nochebuena 2026 (10–31 dic)". Footer buttons "Guardar borrador", "Atrás", "Siguiente".
Mobile: stepper as "Paso 2 de 3", item list as cards with editable cost, sticky footer with "Guardar borrador" and "Siguiente".

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, terracotta only for warnings, rounded inputs, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 13. Detalle de campaña

```
High-fidelity UI mockup of the campaign detail "Nochebuena 2026" in "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Header with name, green "Activa" pill, dates "1 nov – 24 dic 2026", buttons "Registrar gasto", "Registrar producción", "Vender". KPI row: "Presupuesto $3,000.00", "Gastado $2,060.00" with 69% progress bar, "Vendido $3,600.00", "Resultado +$1,540.00" in green, "Recuperación 175%". Tabs: Productos, Gastos, Producciones, Ventas, Costos fijos, Inversión por socio, Bitácora; "Productos" active with a table: Producto, Tamaño, Costo, Precio de lista, Precio especial (editable), Margen with traffic-light pills: "Kokedama Nochebuena · chico · $53.10 · $120.00 · — · 56% green", "Kokedama Nochebuena + Reno · chico · $71.60 · $179.00 · — · 60% green", "Kokedama Poto · chico · $48.10 · $110.00 · $60.00 · 20% amber". Side panel: horizontal bars "En qué se fue el dinero" (Plantas $900, Gasolina $500, Mano de obra $600, Hilo $60) and a card "Costo de receta $53.10 vs costo real $61.20 por pieza", and a card "Inversión por socio: Luis $1,400.00 · Socio 2 $60.00 + $600.00 de trabajo".
Mobile: header and KPIs as a 2x2 grid, tabs as a scrollable segmented control, product rows as cards; sticky bottom button "Vender".

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, amber for low margin, muted red for loss, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 14. Registrar gasto

```
High-fidelity UI mockup of the "Registrar gasto" form of "Moss & Roots", an internal finance app for a small plant business run by two partners.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar, form in a centered card over the campaign detail. Fields: large amount input "$900.00", "Concepto: 30 nochebuenas chicas en Atlacomulco", "Categoría" dropdown set to "Plantas", "Campaña: Nochebuena 2026", "Pagó" as a three-option segmented control "Luis | Socio 2 | Caja del negocio" with helper text "Cuenta como inversión de Luis en esta campaña", "Fecha 2 nov 2026", optional link "Ligar a item: Nochebuena chica" with helper text "Actualiza el costo de la campaña a $30.00", and an upload area "Foto del ticket" showing a receipt thumbnail. Buttons "Cancelar" and "Guardar gasto".
Mobile: full-screen sheet, numeric keypad-friendly amount at the top in large type, fields stacked, camera button for the receipt, sticky "Guardar gasto" button.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, rounded inputs, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 15. Registrar producción

```
High-fidelity UI mockup of the "Registrar producción" form of "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar, form card. Fields: "Producto" searchable select set to "Kokedama Nochebuena", size chips "Chico | Mediano | Grande" with Chico selected, "Extra" chips "Ninguno | Reno | Moño | Estrella | Bufanda" with Reno selected, "Cantidad 10" with stepper, "Fabricó" segmented control "Luis | Socio 2", "Fecha 6 nov 2026". A read-only summary card: "Costo unitario al momento $71.60" with a small breakdown (Receta $53.10 + Reno $18.50) and "Total producción $716.00". Helper text: "El costo se guarda y no cambia aunque cambie el catálogo". Buttons "Cancelar", "Guardar producción".
Mobile: full-screen sheet with the same fields stacked, size and extra as large tappable chips, summary card above a sticky save button.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, rounded inputs, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 16. Venta rápida

```
High-fidelity UI mockup of the quick sale screen "Venta rápida" of "Moss & Roots", used at a street market (tianguis) to sell kokedamas in seconds. Mobile is the primary design.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text. Give the smartphone more visual weight.

Mobile: top bar "Nochebuena 2026" with green "Activa" pill. Grid of large product tiles with real-looking photos of coconut-fiber kokedamas with red poinsettias and green plants: "Kokedama Nochebuena $120", "Kokedama Poto $110", "Kokedama Helecho $140", "Cactus en maceta $95". Under the selected tile, size chips "Chico | Mediano" and extra chips "Reno +$59 | Moño +$59 | Estrella +$59 | Bufanda +$59". Bottom sheet cart: "2 × Kokedama Nochebuena chica + Reno $179.00 c/u", total "$358.00" in large type, payment toggle "Efectivo | Transferencia", and a big moss-green button "Cobrar $358.00". A small "Ajustar precio" link.
Desktop: product grid on the left two thirds, cart panel fixed on the right with the same content.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, large touch targets, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 17. Cierre y reparto

```
High-fidelity UI mockup of the campaign closing screen "Cierre de campaña · Nochebuena 2026" in "Moss & Roots", an internal finance app for a small business run by two partners.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Top: field "Inventario sobrante" set to "$0.00" with note "Producto de temporada: se valúa en $0". Waterfall chart: "Ventas $3,600" → "Recupera inversión −$1,460" → "Pago de trabajo −$600" → "Ganancia $1,540" → "Reinversión 0% $0" → "A repartir 50/50 $1,540". Below, a table per partner with columns Socio, Invirtió, Recupera inversión, Pago por trabajo, Ganancia 50%, Total a recibir: "Luis · $1,400.00 · $1,400.00 · $0.00 · $770.00 · $2,170.00", "Socio 2 · $60.00 · $60.00 · $600.00 · $770.00 · $1,430.00", and a row "Caja del negocio · $0.00". Check "Suma $3,600.00". Confirmation box: "Al cerrar, la campaña queda de solo lectura" and primary button "Cerrar campaña".
Mobile: the waterfall as a vertical list of steps with amounts, then one card per partner with their total in large type, sticky "Cerrar campaña" button.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, green for profit, muted red for deductions, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 18. Clientes

```
High-fidelity UI mockup of the customers screen "Clientes" of "Moss & Roots", an internal app for a small business that sells kokedamas and event centerpieces.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Search bar, filter chips "Particular | Empresa", button "Nuevo cliente". Table: Cliente, Tipo, WhatsApp, Pedidos, Total comprado, Último pedido: "Despacho Contable Ruiz · Empresa · 55 1234 5678 · 2 · $4,950.00 · 3 dic 2026", "Mariana López (boda) · Particular · 55 8765 4321 · 1 · $5,000.00 · 20 dic 2026". Side panel for the selected customer with notes and a list of quotes and orders with status pills.
Mobile: searchable list of customer cards with a WhatsApp icon button and order count.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 19. Cotizador

```
High-fidelity UI mockup of the quote builder "Nueva cotización" in "Moss & Roots", an internal app for a small business that makes kokedamas and succulent centerpieces for events.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Header fields: "Cliente: Mariana López (boda)", "Fecha del evento 20 dic 2026", "Vigencia hasta 18 nov 2026", "Margen objetivo 50%". Line items table: Producto, Tamaño, Extra, Personalización, Cantidad, Costo unitario, Precio unitario, Subtotal: "Centro de mesa suculenta mini · mini · — · Grabado 'M & J' · 50 · $29.40 · $100.00 · $5,000.00". Right summary card updating live: "Costo total $1,470.00", "Precio $5,000.00", "Margen 71%" green, "Descuento por volumen 0%", "Anticipo mínimo 50% = $2,500.00". Status pill "Borrador". Buttons "Copiar para WhatsApp", "Descargar PDF", "Marcar como enviada".
Mobile: header fields stacked, line items as cards, summary sticky at the bottom with total and margin.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 20. Detalle de pedido

```
High-fidelity UI mockup of the order detail "Pedido · Boda Mariana López" in "Moss & Roots", an internal app for a small business that makes event centerpieces with succulents.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Header with status stepper "Confirmado › En producción › Listo › Entregado" (Confirmado active), delivery "20 dic 2026 · Salón Jardín, Tultitlán", linked campaign chip "Evento · Boda López". Payments card: "Total $5,000.00", "Anticipo $2,500.00 pagado 12 nov", "Saldo $2,500.00" in amber, button "Registrar pago". Shopping list card generated from the recipe with 10% waste margin: "55 Echeveria mini", "55 Maceta concreto hexagonal 6 cm blanco", "4.4 L Mezcla para cactus", checkboxes to mark as bought. Capacity card: "Fabricación estimada 5 h · Días disponibles 8 · Suficiente" in green. Button "Pasar a producción" enabled because the deposit covers the minimum.
Mobile: status stepper compact on top, then payment, shopping list and capacity as stacked cards.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, amber for pending balances, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 21. Calendario de entregas

```
High-fidelity UI mockup of the delivery calendar "Calendario de entregas" in "Moss & Roots", an internal app for a small kokedama and event centerpiece business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Month view of December 2026 with event chips on dates: "3 dic · Despacho Ruiz · 30 kokedamas", "20 dic · Boda López · 50 centros de mesa", plus small markers for quotes expiring ("Vence cotización"). Right panel "Pendientes": "Saldo $2,500.00 · Boda López", "Cotización por vencer · Posada Colegio Arboledas · 18 nov". Chips colored by status: confirmed, in production, ready.
Mobile: agenda list grouped by week, each delivery as a card with date, customer, quantity, status pill and balance.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, amber for pending items, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 22. Socios

```
High-fidelity UI mockup of the partners screen "Socios" in "Moss & Roots", an internal finance app for a small business owned by two partners.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Two partner cards side by side with initials avatars (no photos): "Luis · Ganancia 50% · Invertido $1,400.00 · Trabajo pagado $0.00 · Ganancia recibida $770.00" and "Socio 2 · Ganancia 50% · Invertido $60.00 · Trabajo pagado $600.00 · Ganancia recibida $770.00". Below, a table "Por campaña" with columns Campaña, Socio, Invirtió, Trabajo, Ganancia, Total: rows for "Nochebuena 2026" and "Día de Muertos". Button "Editar participación" with helper text "La participación debe sumar 100%".
Mobile: partner cards stacked, then the per-campaign table as grouped cards.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```

## 23. Reportes

```
High-fidelity UI mockup of the reports screen "Reportes" in "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar. Top: date range picker "1 oct – 31 dic 2026" and button "Exportar". Panels: (1) horizontal bar chart "Margen por subproducto y tamaño" with Kokedama Nochebuena chica 56%, Kokedama Nochebuena + Reno 60%, Kokedama Poto chica 56%, Cactus en maceta 52%; (2) card "Punto de equilibrio: 18 piezas" for Nochebuena 2026 with a small progress bar "Vendidas 30"; (3) table "Costo de receta vs costo real" per campaign: "Nochebuena 2026 · $53.10 · $61.20 · +15%" in amber; (4) donut "Ventas a precio especial vs lista" 22% / 78%; (5) "Rentabilidad por tipo de campaña": Temporada vs Evento.
Mobile: one report per card in a vertical scroll, charts simplified, date range in a sticky header.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, amber for deviations, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, 3D charts, stock photos of people, watermarks.
```

## 24. Configuración

```
High-fidelity UI mockup of the settings screen "Configuración" in "Moss & Roots", an internal finance app for a small kokedama business.

Composition: one image showing the same screen twice, side by side: a desktop browser window at 1440 px wide on the left and a smartphone at 390 px wide on the right, on a soft neutral background, crisp readable text.

Desktop: left sidebar plus a secondary settings menu: Tamaños, Categorías de gasto, Tipos de campaña, Valores por defecto, Usuarios. "Valores por defecto" selected with fields: "% de reinversión 30%", "Margen mínimo para aviso 30%", "% de anticipo mínimo 50%", "Días de gracia para cierre automático 15", "Tarifa de fabricación kokedama chica $20.00", "Armado de extras $2.50 por minuto". Another visible card "Tipos de campaña" with rows "Temporada" and "Evento" and a toggle "No permitir empalme dentro del mismo tipo" on. Card "Categorías de gasto" with editable chips: Plantas, Materiales, Gasolina, Publicidad, Plaza, Mano de obra, Otros.
Mobile: settings menu as a list; tapping "Valores por defecto" opens the fields stacked with a sticky "Guardar" button.

Style: clean modern web app, light neutral background with a faint green tint, white surfaces, deep moss green primary color, rounded inputs, tabular numbers, simple line icons, small leaf logo. All UI text in Spanish (Mexico), amounts in MXN.

Avoid: lorem ipsum, English UI text, dark mode, neon colors, stock photos of people, watermarks.
```
