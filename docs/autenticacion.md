# Autenticación interna

E0.5 permite el acceso de los dos socios. No hay registro público, cuentas de ejemplo precreadas ni recuperación por correo (F2.9). No se agregaron dependencias.

## Desarrollo local

1. Copia `.env.example` a `.env`, instala dependencias y levanta PostgreSQL con `pnpm db:up`.
2. Genera un secreto con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guarda el resultado como `SESSION_SECRET` en `.env`. No lo subas al repositorio. La API exige al menos 32 bytes; usa siempre un valor aleatorio propio.
3. Ejecuta `pnpm db:migrate` para crear `users` y `partners`.
4. Crea cada cuenta con `pnpm auth:set-password <correo> [nombre]`, por ejemplo `pnpm auth:set-password luis@example.test Luis`. El comando pide una contraseña de al menos 6 caracteres sin mostrarla. Usa correos y contraseñas propios; los ejemplos no son credenciales compartidas.
5. Ejecuta `pnpm dev` y entra en http://localhost:4200. Web y API comparten origen mediante el proxy `/api`.

El comando normaliza el correo (sin espacios exteriores y en minúsculas). Si la cuenta es nueva, crea también el socio con UUID, participación de 5000 puntos base y versión 0; rechaza una tercera alta bajo bloqueo asesor transaccional. Sin nombre, usa la parte anterior a `@`. Si ya existe, cambia la contraseña, conserva el socio y su nombre e incrementa `users.session_version` en la misma transacción. No acepta contraseñas como argumento ni por una tubería: requiere terminal interactiva.

Variables en `.env.example`: `DATABASE_URL`, `API_PORT`, `SESSION_SECRET`, `NODE_ENV`, `TRUST_PROXY_HOPS` y `TZ_BUSINESS`. Usa `NODE_ENV=development` para HTTP local; `production` exige HTTPS para enviar la cookie. No hay variable para contraseñas de usuarios.

## Sesión y cambios de contraseña

- Hash scrypt asíncrono de Node: N=32768, r=8, p=3, maxmem=64 MiB, clave de 64 bytes, sal aleatoria de 16 bytes por contraseña.
- Cookie `moss.sid` firmada HMAC-SHA256, con `userId`, `sessionVersion` y vencimiento absoluto a 30 días. `HttpOnly`, `SameSite=Lax`, `Path=/api`, sin Domain; `Secure` en producción. No se guarda en localStorage ni hay tabla de sesiones. Usar la app no extiende el vencimiento.
- `GET /api/auth/me` comprueba la firma, el vencimiento, la existencia del usuario/socio y la versión de sesión, como cualquier ruta protegida.
- Para invalidar las sesiones de una cuenta, vuelve a ejecutar `auth:set-password`. La versión anterior se rechaza en la siguiente petición protegida.
- Para invalidar **todas** las sesiones, genera otro `SESSION_SECRET` y reinicia la API con ese valor.
- `POST /api/auth/logout` admite petición sin cuerpo y borra la cookie. No revoca copias externas: estas siguen válidas hasta vencer, cambiar la contraseña o rotar el secreto.

## Protección de peticiones

Todas las rutas de API están protegidas por defecto, salvo health, login y logout. Las rutas internas de Angular comprueban la sesión antes de entrar; una respuesta 401 de una ruta protegida regresa al acceso. Los métodos POST, PUT, PATCH y DELETE con cuerpo requieren `Content-Type: application/json` (se admite `charset=utf-8`). No hay token CSRF ni CORS con credenciales entre orígenes. Logout sin cuerpo es válido.

Cinco fallos de credenciales por IP bloquean 15 minutos desde el quinto fallo, con respuesta 429 y `Retry-After`. Un acierto borra el contador. Las entradas vencidas se eliminan en cada consulta/registro; los contadores inactivos vencen a los 15 minutos. El mapa vive en memoria de una instancia: reiniciar borra los contadores. No es un limitador distribuido.

En local, `TRUST_PROXY_HOPS=0`. Detrás de un proxy controlado, configura el número exacto de saltos y asegúrate de que el proxy sustituya las cabeceras de IP y sea el único acceso a la API. No confíes en cabeceras de clientes directos. En producción, sirve web y API bajo el mismo origen con HTTPS.

## Pruebas

`pnpm test` ejecuta las pruebas unitarias, incluyendo scrypt real. Con PostgreSQL y migraciones aplicadas, `pnpm --filter api test:e2e` verifica login, guards, cookies y versiones. `pnpm e2e` construye API/paquetes y levanta servidores aislados en 3100 y 4300 para probar el flujo de acceso en escritorio y celular.

Las pruebas reutilizan dos cuentas `@example.test` en una base dedicada (`*_test`, o la base efímera de CI). Las suites de API se ejecutan en serie y los proyectos Playwright de Socios ejecutan desktop antes de mobile. Cada prueba que edita socios restaura nombres y participaciones originales en `afterEach`, sin borrar socios ni retroceder versiones. Si defines `DATABASE_URL_TEST`, integración y navegador usan esa base (aplica antes las migraciones allí). Los secretos de prueba de CI y Playwright se usan solo en sus procesos; nunca son valores de despliegue.
