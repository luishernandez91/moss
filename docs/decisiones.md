# Decisiones de arquitectura

Registro breve de decisiones. Una entrada por decisión, la más reciente arriba. Formato: contexto, decisión, consecuencias.

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
