/**
 * Fechas de negocio: solo día, sin hora, calculadas en la zona del negocio.
 * Ver AGENTS.md, regla de dominio 7.
 */
export const BUSINESS_TIME_ZONE = 'America/Mexico_City';

/** Fecha de negocio en formato ISO `YYYY-MM-DD`. */
export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

/** Reloj inyectable para que las pruebas no dependan de la hora real. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function businessDate(value: string): BusinessDate {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RangeError(`Fecha inválida: "${value}". Usa el formato AAAA-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  if (check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Fecha inexistente: "${value}"`);
  }
  return value as BusinessDate;
}

/** Día calendario de un instante en la zona indicada. */
export function toBusinessDate(instant: Date, timeZone: string = BUSINESS_TIME_ZONE): BusinessDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return businessDate(`${get('year')}-${get('month')}-${get('day')}`);
}

/** "Hoy" en la zona del negocio. */
export function today(clock: Clock = systemClock): BusinessDate {
  return toBusinessDate(clock.now());
}

/** Compara dos fechas de negocio: negativo si a < b, 0 si son iguales, positivo si a > b. */
export function compareDates(a: BusinessDate, b: BusinessDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True si `date` está dentro del rango cerrado [start, end]. */
export function isWithin(date: BusinessDate, start: BusinessDate, end: BusinessDate): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}
