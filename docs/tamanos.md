# Tamaños (C3)

PostgreSQL 18 en Docker y CI; mínimo soportado 15 por el índice `NULLS NOT DISTINCT`. La migración nueva comprueba el mínimo antes de crear el catálogo y sembrar Mini, Chico, Mediano y Grande. No modifica migraciones anteriores ni convierte datos de C2.

## Recrear la base local anterior a C3

Se acordó que no hay datos de C2 que conservar. Estos comandos eliminan el volumen local (incluidos usuarios); después hay que crear las cuentas de nuevo con `pnpm auth:set-password <correo> [nombre]`.

```bash
docker compose down -v
pnpm db:up
pnpm db:migrate
pnpm db:seed
DATABASE_URL=postgres://moss:moss@localhost:5432/moss_test pnpm db:migrate
```

El init de Docker crea `moss_test`; ajustar el puerto si `.env` usa otro. Para API e2e y Playwright:

```bash
DATABASE_URL_TEST=postgres://moss:moss@localhost:5432/moss_test pnpm --filter api test:e2e
DATABASE_URL_TEST=postgres://moss:moss@localhost:5432/moss_test pnpm e2e
```

## Seed y recetas

El JSON conserva sus nombres en español. `tamano` se extrae de las variantes y se guarda como `size_id`: mini→mini, chico→small, mediano→medium, grande→large. No se crea la definición de atributo `tamano`. El seed detecta los tipos que usan tamaño por las definiciones, variantes y filtros de recetas; en el ejemplo solo Planta (5 artículos, 11 variantes). Las macetas conservan forma, diámetro y color, sin tamaño global.

El seed es transaccional e idempotente: crea faltantes, no cambia capturas existentes. Un tamaño desconocido, desactivado para una asignación nueva o un tipo existente incompatible aborta con contexto. Las pruebas ejecutan el seed dos veces y comprueban referencias de recetas con `{tamano}` y con tamaños literales contra los IDs sembrados, sin el atributo anterior. La persistencia de productos/recetas y el emparejamiento de D2 por `size_id` siguen en C4; C3 no afirma cargar recetas que aún no tienen tablas.

## Integridad y orden

Dominio y API exigen tamaño exactamente cuando el tipo lo usa. Las escrituras de tamaños, cambios de tipo, creación de artículos, edición/alta de variantes y seed comparten un bloqueo asesor transaccional. Evita que cambiar el tipo, desactivar/borrar un tamaño o reordenar se intercalen con una asignación validada antes del cambio. La FK RESTRICT y la unicidad respaldan referencias y combinaciones incluso para SQL directo.

No se agrega trigger por ahora: los escritores soportados son API y seed, ambos validados y serializados. Un trigger tendría que cubrir variantes, cambios de tipo y reasignaciones de artículo con el mismo protocolo de concurrencia. Si se habilitan importadores o escrituras SQL de negocio, conviene agregar esa defensa. SQL directo hoy puede violar la relación `uses_size`/`size_id`; no es un camino de escritura soportado.

`sort_order` no es único. Se ordena por `(sort_order, id)` y se reescribe la permutación completa en una transacción; miembros faltantes, repetidos o nuevos causan 409 sin cambios parciales. No requiere `DEFERRABLE`. Si se añade unicidad al orden en el futuro, deberá ser una restricción diferible.

Los tamaños desactivados conservan las referencias y son renombrables; se muestran en filtros solo cuando están en uso (también por variantes inactivas). No pueden asignarse a variantes nuevas, pero una edición puede conservar su tamaño desactivado. El borrado en uso responde 409 `SIZE_IN_USE`.
