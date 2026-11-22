# Tamaños (C3)

PostgreSQL 18 en Docker y CI; mínimo soportado 15 por el índice `NULLS NOT DISTINCT`. La migración nueva comprueba el mínimo antes de crear el catálogo y sembrar Mini, Chico, Mediano y Grande. No modifica migraciones anteriores ni convierte datos de C2.

## Recrear la base local anterior a C3

Se acordó que no hay datos de C2 que conservar. Se recrea solo la base afectada, sin tocar las demás del contenedor (no uses `docker compose down -v`, que borra el volumen completo). Recrear la base de desarrollo elimina sus usuarios: después hay que crear las cuentas de nuevo con `pnpm auth:set-password <correo> [nombre]`.

```bash
# Base de desarrollo (ajusta el nombre si .env usa otro)
docker exec moss-db-1 psql -U moss -d postgres -c "DROP DATABASE moss WITH (FORCE)"
docker exec moss-db-1 psql -U moss -d postgres -c "CREATE DATABASE moss"
pnpm db:migrate
pnpm db:seed
pnpm db:verify

# Base de pruebas, solo si pnpm db:verify falla sobre ella
docker exec moss-db-1 psql -U moss -d postgres -c "DROP DATABASE moss_test WITH (FORCE)"
docker exec moss-db-1 psql -U moss -d postgres -c "CREATE DATABASE moss_test"
DATABASE_URL=postgres://moss:moss@localhost:5432/moss_test pnpm db:migrate
DATABASE_URL=postgres://moss:moss@localhost:5432/moss_test pnpm db:verify
```

El init de Docker crea `moss_test`; ajustar el puerto si `.env` usa otro. Para API e2e y Playwright:

```bash
DATABASE_URL_TEST=postgres://moss:moss@localhost:5432/moss_test pnpm --filter api test:e2e
DATABASE_URL_TEST=postgres://moss:moss@localhost:5432/moss_test pnpm e2e
```

## Seed y recetas

El JSON conserva sus nombres en español. `tamano` se extrae de las variantes y se guarda como `size_id`: mini→mini, chico→small, mediano→medium, grande→large. No se crea la definición de atributo `tamano`. El seed detecta los tipos que usan tamaño por las definiciones, variantes y filtros de recetas; en el ejemplo solo Planta (5 artículos, 11 variantes). Las macetas conservan forma, diámetro y color, sin tamaño global.

El seed es transaccional e idempotente: crea faltantes, no cambia capturas existentes. Un tamaño desconocido, desactivado para una asignación nueva o un tipo existente incompatible aborta con contexto. Las pruebas ejecutan el seed dos veces y comprueban referencias de recetas con `{tamano}` y con tamaños literales contra los IDs sembrados, sin el atributo anterior.

C4 siembra productos y recetas con la misma traducción. `{tamano}` en un filtro se guarda como `recipe_components.variant_size_produced` (el tamaño que se produce) y un tamaño literal como `variant_size_id`; ninguno queda en `attribute_filter`. Las cantidades y montos por tamaño, la oferta (`tamanos`) y los precios por tamaño usan `size_id`, y la variante fija se guarda por ID a partir de su SKU. D2 empareja por `article_variants.size_id`. Ver «Productos y recetas (C4)» en `docs/decisiones.md`.

## Integridad y orden

Dominio y API exigen tamaño exactamente cuando el tipo lo usa. Las escrituras de tamaños, cambios de tipo, creación de artículos, edición/alta de variantes y seed comparten un bloqueo asesor transaccional. Evita que cambiar el tipo, desactivar/borrar un tamaño o reordenar se intercalen con una asignación validada antes del cambio. La FK RESTRICT y la unicidad respaldan referencias y combinaciones incluso para SQL directo.

El bloqueo se identifica con la constante compartida `CATALOG_WRITE_LOCK` en `catalog-write.ts`, consumida por el mismo helper en API y seed. El borrado traduce los errores PostgreSQL `23503`/`23001` a `SIZE_IN_USE` únicamente cuando el constraint es `article_variants_size_id_sizes_id_fk`; si es otro o no se informa, propaga el error original.

No se agrega trigger por ahora: los escritores soportados son API y seed, ambos validados y serializados. Un trigger tendría que cubrir variantes, cambios de tipo y reasignaciones de artículo con el mismo protocolo de concurrencia. Si se habilitan importadores o escrituras SQL de negocio, conviene agregar esa defensa. SQL directo hoy puede violar la relación `uses_size`/`size_id`; no es un camino de escritura soportado.

`sort_order` no es único. Se ordena por `(sort_order, id)` y se reescribe la permutación completa en una transacción; miembros faltantes, repetidos o nuevos causan 409 sin cambios parciales. No requiere `DEFERRABLE`. Si se añade unicidad al orden en el futuro, deberá ser una restricción diferible.

Los tamaños desactivados conservan las referencias y son renombrables; se muestran en filtros solo cuando están en uso (también por variantes inactivas). No pueden asignarse a variantes nuevas, pero una edición puede conservar su tamaño desactivado. El borrado en uso responde 409 `SIZE_IN_USE`.
