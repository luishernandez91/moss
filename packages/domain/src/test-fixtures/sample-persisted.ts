/**
 * El catálogo de ejemplo en la forma que guarda C4 (filas de productos, componentes con identidad
 * estable y valores por tamaño). Los ids de productos y componentes son los del JSON y los de
 * tamaño son sus nombres en español, igual que en `sample-catalog.ts`. Solo para pruebas.
 */
import catalog from '../../../../docs/datos/catalogo-ejemplo.json' with { type: 'json' };
import type { AttributeValue } from '../cost-resolution.js';
import type {
  CatalogArticle,
  CatalogSize,
  PersistedComponent,
  PersistedProduct,
  ProductCatalog,
} from '../product-catalog.js';
import type { AttributeDataType } from '../article-type.js';
import { pesos, sampleArticles } from './sample-catalog.js';

type RawPerSize = number | Record<string, number>;

interface RawComponent {
  id: string;
  articulo_id?: string;
  variante_sku?: string;
  filtro_atributos?: Record<string, AttributeValue>;
  concepto?: string;
  tipo?: string;
  cantidad?: RawPerSize;
  monto?: RawPerSize;
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

interface RawType {
  id: string;
  atributos: {
    nombre: string;
    tipo_dato: 'texto' | 'numero' | 'lista' | 'booleano';
    opciones?: string[];
    define_variante: boolean;
  }[];
}

const DATA_TYPES: Record<RawType['atributos'][number]['tipo_dato'], AttributeDataType> = {
  texto: 'text',
  numero: 'number',
  lista: 'list',
  booleano: 'boolean',
};

export const sampleSizes: CatalogSize[] = [
  { id: 'mini', label: 'Mini', active: true },
  { id: 'chico', label: 'Chico', active: true },
  { id: 'mediano', label: 'Mediano', active: true },
  { id: 'grande', label: 'Grande', active: true },
];

function values<T>(raw: RawPerSize, wrap: (value: number) => T) {
  return typeof raw === 'number'
    ? [{ sizeId: null, ...wrap(raw) }]
    : Object.entries(raw).map(([sizeId, value]) => ({ sizeId, ...wrap(value) }));
}

function toPersistedComponent(raw: RawComponent, productId: string): PersistedComponent {
  const base = {
    id: raw.id,
    productId,
    category: raw.tipo === 'mano_obra' ? ('labor' as const) : ('material' as const),
    replacesComponentId: raw.sustituye_componente_id ?? null,
  };
  if (raw.articulo_id === undefined) {
    return {
      ...base,
      kind: 'fixed',
      concept: raw.concepto!,
      values: values(raw.monto!, (amount) => ({ amount: pesos(amount) })),
    };
  }
  const { tamano, ...attributeFilter } = raw.filtro_atributos ?? {};
  return {
    ...base,
    kind: 'article',
    articleId: raw.articulo_id,
    variantId: raw.variante_sku ?? null,
    attributeFilter,
    variantSize:
      tamano === undefined
        ? null
        : tamano === '{tamano}'
          ? { match: 'produced' }
          : { match: 'size', sizeId: String(tamano) },
    concept: raw.concepto ?? null,
    values: values(raw.cantidad ?? 1, (quantity) => ({ quantity })),
  };
}

const rawProducts = catalog.productos as RawProduct[];

export const samplePersistedProducts: PersistedProduct[] = rawProducts.map((product) => ({
  id: product.id,
  parentId: product.parent_id,
  name: product.nombre,
  active: true,
  sizeOffer: product.tamanos ? { mode: 'explicit', sizeIds: product.tamanos } : { mode: 'inherit' },
  prices: Object.entries(product.precios ?? {}).map(([sizeId, price]) => ({
    sizeId,
    price: pesos(price),
  })),
}));

export const samplePersistedComponents: PersistedComponent[] = rawProducts.flatMap((product) =>
  product.componentes.map((component) => toPersistedComponent(component, product.id)),
);

const typeOf = new Map(
  (catalog.articulos as { id: string; tipo: string }[]).map((article) => [
    article.id,
    article.tipo,
  ]),
);
const types = catalog.tipos_articulo as RawType[];

export const sampleCatalogArticles: CatalogArticle[] = sampleArticles.map((article) => {
  const type = types.find((candidate) => candidate.id === typeOf.get(article.id))!;
  return {
    ...article,
    active: true,
    usesSize: type.atributos.some((attribute) => attribute.nombre === 'tamano'),
    variantAttributes: type.atributos
      .filter((attribute) => attribute.define_variante && attribute.nombre !== 'tamano')
      .map((attribute) => ({
        key: attribute.nombre,
        name: attribute.nombre,
        dataType: DATA_TYPES[attribute.tipo_dato],
        options: attribute.opciones ?? null,
      })),
  };
});

export function sampleProductCatalog(overrides: Partial<ProductCatalog> = {}): ProductCatalog {
  return {
    products: samplePersistedProducts,
    components: samplePersistedComponents,
    articles: sampleCatalogArticles,
    sizes: sampleSizes,
    ...overrides,
  };
}
