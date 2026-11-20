import { fromPesos, type Cents } from '@moss/domain';

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `154000` → `$1,540.00`. Solo para presentación; los cálculos se hacen en centavos. */
export function formatMoney(amount: Cents | number): string {
  return moneyFormatter.format(amount / 100);
}

/** `2026-11-10` → `10 nov 2026`. */
export function formatDate(isoDate: string): string {
  const formatted = dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  return formatted.replace(/\./g, '').replace(/ de /g, ' ');
}

const instantFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

/** Instante UTC (`2026-11-04T18:30:00Z`) como fecha en `America/Mexico_City`: `4 nov 2026`. */
export function formatDateTime(isoInstant: string): string {
  return instantFormatter.format(new Date(isoInstant)).replace(/\./g, '').replace(/ de /g, ' ');
}

const quantityFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 });

/** Unidad de existencia (C2); las piezas se muestran sin sufijo. */
type StockUnitCode = 'piece' | 'm' | 'kg' | 'l' | 'bag';
const UNIT_SUFFIX: Record<StockUnitCode, [singular: string, plural: string] | null> = {
  piece: null,
  m: ['m', 'm'],
  kg: ['kg', 'kg'],
  l: ['l', 'l'],
  bag: ['bulto', 'bultos'],
};

/** `300` en metros → `300 m`; `2` bultos → `2 bultos`; piezas sin unidad: `1,500`. */
export function formatStock(quantity: number, unit: StockUnitCode): string {
  const amount = quantityFormatter.format(quantity);
  const suffix = UNIT_SUFFIX[unit];
  return suffix ? `${amount} ${quantity === 1 ? suffix[0] : suffix[1]}` : amount;
}

/** Costo por unidad: `$0.50/m`, `$110.00/bulto`; en piezas, solo el monto. */
export function formatUnitCost(amount: Cents | number, unit: StockUnitCode): string {
  const suffix = UNIT_SUFFIX[unit];
  return suffix ? `${formatMoney(amount)}/${suffix[0]}` : formatMoney(amount);
}

/** Monto escrito en pesos («15.50», «$1,540») a centavos; `null` si no es un monto válido. */
export function parsePesos(text: string): Cents | null {
  try {
    return fromPesos(text.replace(/[$,\s]/g, ''));
  } catch {
    return null;
  }
}

/** Centavos a texto editable en pesos: `1550` → `15.50`. */
export function pesosText(amount: Cents | number): string {
  return (amount / 100).toFixed(2);
}

/** `1 nov – 24 dic 2026`; con años distintos, ambos completos. Un borrador puede no tener fechas. */
export function formatDateRange(start: string | null, end: string | null): string {
  if (start === null && end === null) return 'Sin fechas';
  if (end === null) return `Desde ${formatDate(start!)}`;
  if (start === null) return `Hasta ${formatDate(end)}`;
  if (start === end) return formatDate(start);
  const from = formatDate(start);
  const to = formatDate(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? from.replace(/ \d{4}$/, '') : from} – ${to}`;
}
