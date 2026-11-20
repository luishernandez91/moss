// Proxy de Playwright hacia la API de pruebas: E2E_API_PORT, con 3100 por defecto.
export default {
  '/api': { target: `http://localhost:${process.env.E2E_API_PORT ?? 3100}`, secure: false },
};
