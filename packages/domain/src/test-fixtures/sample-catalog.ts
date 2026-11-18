/**
 * Convierte docs/datos/catalogo-ejemplo.json (nombres en español, pesos como número)
 * a los tipos de dominio (inglés, centavos). Solo para pruebas.
 */
import catalog from '../../../../docs/datos/catalogo-ejemplo.json' with { type: 'json' };
import type {
  AddOn,
  Article,
  AttributeValue,
  PerSize,
  Product,
  RecipeComponent,
} from '../cost-resolution.js';
import { fromPesos, type Cents } from '../money.js';

type RawPerSize = number | Record<string, number>;

interface RawComponent {
  id?: string;
  articulo_id?: string;
  variante_sku?: string;
  filtro_atributos?: Record<string, AttributeValue>;
  concepto?: string;
  tipo?: string;
  cantidad?: RawPerSize;
  monto?: RawPerSize;
  tamano?: string;
  sustituye_componente_id?: string;
}

interface RawProduct {
  id: string;
  parent_id: string | null;
  nombre: string;
  tamanos?: string[];
  componentes: RawComponent[];
  precios?: Record<string, number> | null;
}

interface RawAddOn {
  id: string;
  nombre: string;
  aplica_a: string[];
  componentes: RawComponent[];
  precio_extra: number;
}

interface RawArticle {
  id: string;
  nombre: string;
  variantes: {
    sku: string;
    atributos: Record<string, AttributeValue>;
    costo_promedio: number;
    precio?: number | null;
  }[];
}

export function pesos(value: number): Cents {
  return fromPesos(String(value));
}

function perSizePesos(value: RawPerSize): PerSize<Cents> {
  if (typeof value === 'number') {
    return pesos(value);
  }
  return Object.fromEntries(Object.entries(value).map(([size, amount]) => [size, pesos(amount)]));
}

function toComponent(raw: RawComponent, fallbackId: string): RecipeComponent {
  const base = {
    id: raw.id ?? fallbackId,
    category: raw.tipo === 'mano_obra' ? ('labor' as const) : ('material' as const),
    ...(raw.tamano !== undefined && { size: raw.tamano }),
    ...(raw.sustituye_componente_id !== undefined && {
      replacesComponentId: raw.sustituye_componente_id,
    }),
  };
  if (raw.articulo_id !== undefined) {
    return {
      ...base,
      kind: 'article',
      articleId: raw.articulo_id,
      quantity: raw.cantidad ?? 1,
      ...(raw.concepto !== undefined && { concept: raw.concepto }),
      ...(raw.variante_sku !== undefined && { variantSku: raw.variante_sku }),
      ...(raw.filtro_atributos !== undefined && { attributeFilter: raw.filtro_atributos }),
    };
  }
  if (raw.monto === undefined || raw.concepto === undefined) {
    throw new Error(`Componente sin artículo ni monto en el catálogo: ${fallbackId}`);
  }
  return { ...base, kind: 'fixed', concept: raw.concepto, amount: perSizePesos(raw.monto) };
}

export const sampleArticles: Article[] = (catalog.articulos as RawArticle[]).map((article) => ({
  id: article.id,
  name: article.nombre,
  variants: article.variantes.map((variant) => ({
    sku: variant.sku,
    attributes: variant.atributos,
    averageCost: pesos(variant.costo_promedio),
  })),
}));

export const sampleProducts: Product[] = (catalog.productos as RawProduct[]).map((product) => ({
  id: product.id,
  parentId: product.parent_id,
  name: product.nombre,
  ...(product.tamanos !== undefined && { sizes: product.tamanos }),
  components: product.componentes.map((component, index) =>
    toComponent(component, `${product.id}-${index + 1}`),
  ),
}));

export const sampleAddOns: AddOn[] = (catalog.extras as RawAddOn[]).map((addOn) => ({
  id: addOn.id,
  name: addOn.nombre,
  appliesTo: addOn.aplica_a,
  components: addOn.componentes.map((component, index) =>
    toComponent(component, `${addOn.id}-${index + 1}`),
  ),
}));

export function sampleAddOn(id: string): AddOn {
  const addOn = sampleAddOns.find((candidate) => candidate.id === id);
  if (!addOn) {
    throw new Error(`Extra inexistente en el catálogo de ejemplo: ${id}`);
  }
  return addOn;
}

/** Precio general de un producto por tamaño (`precios`), sin herencia. Null si no tiene. */
export function sampleProductPrice(productId: string, size: string): Cents | null {
  const product = (catalog.productos as RawProduct[]).find(
    (candidate) => candidate.id === productId,
  );
  if (!product) {
    throw new Error(`Producto inexistente en el catálogo de ejemplo: ${productId}`);
  }
  const price = product.precios?.[size];
  return price === undefined ? null : pesos(price);
}

/** Precio de venta de una variante (`precio`). Null si no se vende sola. */
export function sampleVariantPrice(sku: string): Cents | null {
  for (const article of catalog.articulos as RawArticle[]) {
    const variant = article.variantes.find((candidate) => candidate.sku === sku);
    if (variant) {
      return variant.precio === undefined || variant.precio === null ? null : pesos(variant.precio);
    }
  }
  throw new Error(`Variante inexistente en el catálogo de ejemplo: ${sku}`);
}

/** Precio del extra (`precio_extra`). */
export function sampleAddOnPrice(id: string): Cents {
  const addOn = (catalog.extras as RawAddOn[]).find((candidate) => candidate.id === id);
  if (!addOn) {
    throw new Error(`Extra inexistente en el catálogo de ejemplo: ${id}`);
  }
  return pesos(addOn.precio_extra);
}
