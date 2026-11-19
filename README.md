# Moss & Roots

Sistema interno de finanzas por campañas para Moss & Roots: costos de producción heredados por producto, precios, ventas y reparto entre socios.

- Especificación: [`docs/especificacion.md`](docs/especificacion.md)
- Plan de trabajo: [`backlog.md`](backlog.md)
- Reglas para agentes de código: [`AGENTS.md`](AGENTS.md)
- Decisiones: [`docs/decisiones.md`](docs/decisiones.md)

## Requisitos

- Node.js 24 (`nvm use`)
- pnpm 10 (`corepack enable`)
- Docker (para PostgreSQL)

## Primeros pasos

```bash
cp .env.example .env
pnpm install
pnpm db:up          # PostgreSQL 18 en Docker
pnpm db:migrate     # aplica migraciones
pnpm auth:set-password <correo> [nombre]  # crea cada cuenta; pide contraseña oculta
pnpm dev            # API en :3000 y web en :4200
```

Antes de arrancar, genera `SESSION_SECRET` y guárdalo en `.env` siguiendo [la guía de autenticación](docs/autenticacion.md). No hay credenciales compartidas de desarrollo.

Abre http://localhost:4200 e inicia sesión. El dashboard indica si la API y la base de datos están conectadas.

## Estructura

```
apps/web            Angular 22 (standalone, zoneless, Angular Material)
apps/api            NestJS 12 (ESM) + Drizzle ORM
packages/domain     Reglas de negocio puras con pruebas
packages/contracts  Esquemas Zod compartidos entre web y API
docker/             Inicialización de PostgreSQL
docs/               Especificación, decisiones, diseño y datos de ejemplo
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm auth:set-password <correo> [nombre]` | Crea usuario/socio o cambia contraseña e invalida sus sesiones |
| `pnpm dev` | Levanta la base, la API y la web en modo desarrollo |
| `pnpm test` | Pruebas unitarias de todos los paquetes |
| `pnpm --filter api test:e2e` | Pruebas de la API contra PostgreSQL |
| `pnpm e2e` | Pruebas de la web con Playwright (`pnpm --filter web exec playwright install` la primera vez) |
| `pnpm typecheck` | Revisión de tipos |
| `pnpm lint` | oxlint |
| `pnpm db:generate` | Genera una migración a partir del esquema de Drizzle |
| `pnpm db:migrate` | Aplica migraciones |
| `pnpm db:down` | Detiene PostgreSQL |
