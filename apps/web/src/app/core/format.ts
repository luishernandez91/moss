import type { Cents } from '@moss/domain';

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
