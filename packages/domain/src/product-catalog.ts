/**
 * C4 · Productos y recetas (§2, §4 pantallas 7 y 8, §9). Reglas puras sobre la forma en que se
 * guardan productos y recetas: cada componente tiene identidad estable y sus valores por tamaño
 * (`recipe_component_values`); la oferta de tamaños es «heredar» o una lista explícita. Normaliza
 * esa forma a la entrada de D2 (`resolveCost`/`previewCost`) y valida lo que D2 rechazaría en
 * cualquier tamaño, para no descubrirlo hasta el cálculo. La API lee, bloquea y persiste.
 */
import type { AttributeDataType } from './article-type.js';
import {
  CostResolutionError,
  SIZE_PLACEHOLDER,
  componentGroupKey,
  previewCost,
  resolveProductChain,
  type Article,
  type AttributeValue,
  type CostPreview,
  type PerSize,
  type Product,
  type RecipeComponent,
  type SizeId,
} from './cost-resolution.js';
import type { Cents } from './money.js';
import { evaluateMargin, type MarginWarning } from './price-resolution.js';

export const PRODUCT_NAME_MAX = 100;
export const COMPONENT_CONCEPT_MAX = 120;
/** `recipe_component_values.quantity numeric(12,4)`. */
export const QUANTITY_DECIMALS_MAX = 4;
export const QUANTITY_MAX = 99_999_999.9999;
export const RECIPE_CATEGORIES = ['material', 'labor'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

/** «Heredar» toma la lista del ancestro más cercano que la define; en la raíz, sin restricción. */
export type SizeOffer = { mode: 'inherit' } | { mode: 'explicit'; sizeIds: readonly SizeId[] };
/** Tamaño de la variante del componente: el que se produce (`{tamano}`) o uno fijo. */
export type VariantSizeMatch = { match: 'produced' } | { match: 'size'; sizeId: SizeId };

export interface ProductPrice {
  sizeId: SizeId;
  price: Cents;
}

export interface PersistedProduct {
  id: string;
  parentId: string | null;
  name: string;
  active: boolean;
  sizeOffer: SizeOffer;
  /** Precio general propio por tamaño. Un tamaño sin fila no tiene precio (null, sin herencia). */
  prices: readonly ProductPrice[];
}

interface PersistedComponentBase {
  id: string;
  productId: string;
  category: RecipeCategory;
  replacesComponentId: string | null;
}

export interface PersistedArticleComponent extends PersistedComponentBase {
  kind: 'article';
  articleId: string;
  variantId: string | null;
  attributeFilter: Readonly<Record<string, AttributeValue>>;
  variantSize: VariantSizeMatch | null;
  concept: string | null;
  /** Un valor genérico (`sizeId` null) o uno por tamaño; nunca ambos. */
  values: readonly { sizeId: SizeId | null; quantity: number }[];
}

export interface PersistedFixedComponent extends PersistedComponentBase {
  kind: 'fixed';
  concept: string;
  values: readonly { sizeId: SizeId | null; amount: Cents }[];
}

export type PersistedComponent = PersistedArticleComponent | PersistedFixedComponent;

export interface CatalogAttribute {
  key: string;
  name: string;
  dataType: AttributeDataType;
  options: readonly string[] | null;
}

/** Artículo con lo que C4 necesita para validar recetas. Sus variantes llevan `active`. */
export interface CatalogArticle extends Article {
  active: boolean;
  /** Marca «se usa en recetas» (§2): solo esos artículos se agregan a una receta. */
  usedInRecipes: boolean;
  /** Su tipo usa tamaño (C3): solo entonces un componente puede pedir tamaño de variante. */
  usesSize: boolean;
  /** Atributos que definen variante: las únicas claves válidas en un filtro. */
  variantAttributes: readonly CatalogAttribute[];
}

export interface CatalogSize {
  id: SizeId;
  label: string;
  active: boolean;
}

/** Catálogo completo. Los componentes en el orden de la receta; los tamaños en su orden (C3). */
export interface ProductCatalog {
  products: readonly PersistedProduct[];
  components: readonly PersistedComponent[];
  articles: readonly CatalogArticle[];
  sizes: readonly CatalogSize[];
}

export type ProductErrorCode =
  | 'CYCLE'
  | 'TREE_TOO_DEEP'
  | 'PARENT_NOT_FOUND'
  | 'INVALID_PRODUCT_NAME'
  | 'DUPLICATE_PRODUCT_NAME'
  | 'INVALID_SIZE_OFFER'
  | 'SIZE_NOT_FOUND'
  | 'SIZE_NOT_OFFERED'
  | 'DUPLICATE_PRICE'
  | 'INVALID_PRICE'
  | 'INVALID_COMPONENT'
  | 'INVALID_COMPONENT_VALUES'
  | 'ARTICLE_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'INVALID_ATTRIBUTE_FILTER'
  | 'SIZE_NOT_ALLOWED'
  | 'DUPLICATE_COMPONENT'
  | 'INVALID_REPLACEMENT'
  | 'COMPONENT_IN_USE'
  | 'SIZE_INACTIVE'
  | 'ARTICLE_INACTIVE'
  | 'ARTICLE_NOT_FOR_RECIPES'
  | 'VARIANT_INACTIVE'
  | 'PARENT_INACTIVE';

export class ProductError extends Error {
  override name = 'ProductError';
  constructor(
    readonly code: ProductErrorCode,
    message: string,
    /** Datos del choque para `details` en un 409. */
    readonly conflict?: unknown,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Normalización a D2

/** Convierte la forma persistida a los productos de D2. Supone un catálogo ya validado. */
export function toCostProducts(
  products: readonly PersistedProduct[],
  components: readonly PersistedComponent[],
): Product[] {
  const byProduct = new Map<string, RecipeComponent[]>();
  for (const component of components) {
    byProduct.set(component.productId, [
      ...(byProduct.get(component.productId) ?? []),
      toCostComponent(component),
    ]);
  }
  return products.map((product) => ({
    id: product.id,
    parentId: product.parentId,
    name: product.name,
    ...(product.sizeOffer.mode === 'explicit' && { sizes: [...product.sizeOffer.sizeIds] }),
    components: byProduct.get(product.id) ?? [],
  }));
}

/**
 * Identidad de un componente guardado dentro de su producto: la clave de grupo de D2 (artículo,
 * variante fija, tamaño de variante y filtro, o concepto). Única por producto (`DUPLICATE_COMPONENT`).
 */
export function persistedComponentKey(component: PersistedComponent): string {
  return componentGroupKey(toCostComponent(component));
}

function perSize<T extends number>(
  values: readonly { sizeId: SizeId | null; value: T }[],
): PerSize<T> {
  const generic = values.find((entry) => entry.sizeId === null);
  if (generic) return generic.value;
  return Object.fromEntries(values.map((entry) => [entry.sizeId, entry.value]));
}

function toCostComponent(component: PersistedComponent): RecipeComponent {
  const base = {
    id: component.id,
    category: component.category,
    ...(component.replacesComponentId !== null && {
      replacesComponentId: component.replacesComponentId,
    }),
  };
  if (component.kind === 'fixed') {
    return {
      ...base,
      kind: 'fixed',
      concept: component.concept,
      amount: perSize(component.values.map(({ sizeId, amount }) => ({ sizeId, value: amount }))),
    };
  }
  return {
    ...base,
    kind: 'article',
    articleId: component.articleId,
    quantity: perSize(
      component.values.map(({ sizeId, quantity }) => ({ sizeId, value: quantity })),
    ),
    ...(component.concept !== null && { concept: component.concept }),
    ...(component.variantId !== null && { variantId: component.variantId }),
    ...(Object.keys(component.attributeFilter).length > 0 && {
      attributeFilter: component.attributeFilter,
    }),
    ...(component.variantSize !== null && {
      variantSize:
        component.variantSize.match === 'produced'
          ? SIZE_PLACEHOLDER
          : component.variantSize.sizeId,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Árbol y oferta de tamaños

function asProductError<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (
      error instanceof CostResolutionError &&
      ['CYCLE', 'TREE_TOO_DEEP', 'PARENT_NOT_FOUND'].includes(error.code)
    ) {
      throw new ProductError(error.code as ProductErrorCode, error.message);
    }
    throw error;
  }
}

/** Cadena raíz → producto (consulta recursiva en memoria). Rechaza ciclos y más de 3 niveles. */
export function productChain(
  products: readonly PersistedProduct[],
  productId: string,
): PersistedProduct[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return asProductError(() => resolveProductChain(byId, productId));
}

/** Tamaños que ofrece un producto y quién los define. `sizeIds` null = sin restricción. */
export function effectiveSizeOffer(
  products: readonly PersistedProduct[],
  productId: string,
): { sizeIds: SizeId[] | null; definedBy: string | null } {
  const definer = productChain(products, productId).findLast(
    (product) => product.sizeOffer.mode === 'explicit',
  );
  return definer && definer.sizeOffer.mode === 'explicit'
    ? { sizeIds: [...definer.sizeOffer.sizeIds], definedBy: definer.id }
    : { sizeIds: null, definedBy: null };
}

// ---------------------------------------------------------------------------------------------
// Validación del catálogo

const sizeLabel = (catalog: ProductCatalog, sizeId: SizeId) =>
  catalog.sizes.find((size) => size.id === sizeId)?.label ?? sizeId;

function assertSizeExists(catalog: ProductCatalog, sizeId: SizeId, context: string): void {
  if (!catalog.sizes.some((size) => size.id === sizeId)) {
    throw new ProductError('SIZE_NOT_FOUND', `${context}: el tamaño «${sizeId}» no existe.`);
  }
}

function describe(component: PersistedComponent, catalog: ProductCatalog): string {
  if (component.kind === 'fixed' || component.concept !== null) return `«${component.concept}»`;
  const article = catalog.articles.find((candidate) => candidate.id === component.articleId);
  return `«${article?.name ?? component.articleId}»`;
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Valida productos y recetas. Lanza `ProductError` (422) ante lo que D2 rechazaría en cualquier
 * tamaño o lo que la base no puede guardar. No lanza por errores que dependen de los datos del
 * catálogo en un tamaño (`NO_COMPONENT_FOR_SIZE`, `NO_MATCHING_VARIANT`, ambigüedad): esos se
 * muestran por tamaño en `assessProductCosts`.
 *
 * Nombres y árbol se validan siempre en todo el catálogo. Con `changedIds`, oferta, precios,
 * componentes y sustituciones se validan solo en esos productos y sus descendientes (los que
 * heredan el cambio), para que un dato que quedó inválido en otra rama (p. ej. la opción de un
 * filtro que se quitó) no bloquee escrituras ajenas.
 */
export function validateProductCatalog(
  catalog: ProductCatalog,
  changedIds?: readonly string[],
): void {
  const { products } = catalog;
  const names = new Map<string, PersistedProduct>();
  for (const product of products) {
    const name = product.name.trim();
    if (name.length === 0 || name.length > PRODUCT_NAME_MAX || name !== product.name) {
      throw new ProductError(
        'INVALID_PRODUCT_NAME',
        `Escribe un nombre de producto de 1 a ${PRODUCT_NAME_MAX} caracteres.`,
      );
    }
    const key = name.toLocaleLowerCase('es-MX');
    if (names.has(key)) {
      throw new ProductError('DUPLICATE_PRODUCT_NAME', `Ya existe un producto llamado «${name}».`);
    }
    names.set(key, product);
  }

  for (const product of products) productChain(products, product.id);

  const changed = changedIds === undefined ? null : new Set(changedIds);
  const scoped = products.filter(
    (product) =>
      changed === null || productChain(products, product.id).some((level) => changed.has(level.id)),
  );

  for (const product of scoped) {
    if (product.sizeOffer.mode !== 'explicit') continue;
    const { sizeIds } = product.sizeOffer;
    if (sizeIds.length === 0 || new Set(sizeIds).size !== sizeIds.length) {
      throw new ProductError(
        'INVALID_SIZE_OFFER',
        `«${product.name}»: elige al menos un tamaño, sin repetir, o hereda los tamaños.`,
      );
    }
    for (const sizeId of sizeIds) assertSizeExists(catalog, sizeId, `«${product.name}»`);
  }

  const offers = new Map(
    products.map((product) => [product.id, effectiveSizeOffer(products, product.id).sizeIds]),
  );
  const assertOffered = (productId: string, sizeId: SizeId, what: string) => {
    const product = products.find((candidate) => candidate.id === productId)!;
    assertSizeExists(catalog, sizeId, `«${product.name}»`);
    const offer = offers.get(productId);
    if (offer && !offer.includes(sizeId)) {
      throw new ProductError(
        'SIZE_NOT_OFFERED',
        `«${product.name}» tiene ${what} para ${sizeLabel(catalog, sizeId)}, que no está en sus tamaños (${offer.map((id) => sizeLabel(catalog, id)).join(', ')}).`,
      );
    }
  };

  for (const product of scoped) {
    const seen = new Set<SizeId>();
    for (const { sizeId, price } of product.prices) {
      if (seen.has(sizeId)) {
        throw new ProductError(
          'DUPLICATE_PRICE',
          `«${product.name}» tiene más de un precio para ${sizeLabel(catalog, sizeId)}.`,
        );
      }
      seen.add(sizeId);
      if (!Number.isSafeInteger(price) || price < 0) {
        throw new ProductError(
          'INVALID_PRICE',
          `«${product.name}»: el precio debe estar en centavos enteros, sin negativos.`,
        );
      }
      assertOffered(product.id, sizeId, 'precio');
    }
  }

  const productIds = new Set(products.map((product) => product.id));
  const componentsByProduct = new Map<string, PersistedComponent[]>();
  for (const component of catalog.components) {
    if (!productIds.has(component.productId)) {
      throw new ProductError(
        'INVALID_COMPONENT',
        `El componente ${component.id} pertenece a un producto que no existe.`,
      );
    }
    componentsByProduct.set(component.productId, [
      ...(componentsByProduct.get(component.productId) ?? []),
      component,
    ]);
  }

  for (const product of scoped) {
    const own = componentsByProduct.get(product.id) ?? [];
    const keys = new Map<string, PersistedComponent>();
    for (const component of own) {
      validateComponent(catalog, product, component, assertOffered);
      const key = componentGroupKey(toCostComponent(component));
      const previous = keys.get(key);
      if (previous) {
        throw new ProductError(
          'DUPLICATE_COMPONENT',
          `«${product.name}» repite el componente ${describe(component, catalog)}; usa un solo componente con valores por tamaño.`,
        );
      }
      keys.set(key, component);
    }
  }

  validateReplacements(catalog, scoped, componentsByProduct);
}

function validateComponent(
  catalog: ProductCatalog,
  product: PersistedProduct,
  component: PersistedComponent,
  assertOffered: (productId: string, sizeId: SizeId, what: string) => void,
): void {
  const context = `«${product.name}», componente ${describe(component, catalog)}`;
  if (!(RECIPE_CATEGORIES as readonly string[]).includes(component.category)) {
    throw new ProductError('INVALID_COMPONENT', `${context}: tipo de componente inválido.`);
  }
  if (component.replacesComponentId === component.id) {
    throw new ProductError(
      'INVALID_REPLACEMENT',
      `${context}: un componente no puede sustituirse a sí mismo.`,
    );
  }
  const concept = component.concept;
  if (
    (component.kind === 'fixed' || concept !== null) &&
    (concept === null ||
      concept.trim().length === 0 ||
      concept.trim() !== concept ||
      concept.length > COMPONENT_CONCEPT_MAX)
  ) {
    throw new ProductError(
      'INVALID_COMPONENT',
      `«${product.name}»: escribe un concepto de 1 a ${COMPONENT_CONCEPT_MAX} caracteres.`,
    );
  }

  // Valores: uno genérico o uno por tamaño, sin mezclar ni repetir.
  const values: { sizeId: SizeId | null; value: number }[] =
    component.kind === 'fixed'
      ? component.values.map(({ sizeId, amount }) => ({ sizeId, value: amount }))
      : component.values.map(({ sizeId, quantity }) => ({ sizeId, value: quantity }));
  const generic = values.filter((entry) => entry.sizeId === null);
  const sized = values.filter((entry) => entry.sizeId !== null);
  if (values.length === 0 || (generic.length > 0 && values.length > 1)) {
    throw new ProductError(
      'INVALID_COMPONENT_VALUES',
      `${context}: indica un valor para todos los tamaños o uno por tamaño, sin mezclarlos.`,
    );
  }
  if (new Set(sized.map((entry) => entry.sizeId)).size !== sized.length) {
    throw new ProductError('INVALID_COMPONENT_VALUES', `${context}: repite un tamaño.`);
  }
  for (const { value } of values) {
    const valid =
      component.kind === 'fixed'
        ? Number.isSafeInteger(value) && value >= 0
        : Number.isFinite(value) &&
          value > 0 &&
          value <= QUANTITY_MAX &&
          hasAtMostDecimals(value, QUANTITY_DECIMALS_MAX);
    if (!valid) {
      throw new ProductError(
        'INVALID_COMPONENT_VALUES',
        component.kind === 'fixed'
          ? `${context}: el monto debe estar en centavos enteros, sin negativos.`
          : `${context}: la cantidad debe ser mayor que 0 y tener hasta ${QUANTITY_DECIMALS_MAX} decimales.`,
      );
    }
  }
  for (const { sizeId } of sized)
    assertOffered(product.id, sizeId!, `un valor de ${describe(component, catalog)}`);

  if (component.kind === 'fixed') return;

  const article = catalog.articles.find((candidate) => candidate.id === component.articleId);
  if (!article) {
    throw new ProductError(
      'ARTICLE_NOT_FOUND',
      `«${product.name}»: el artículo de un componente no existe.`,
    );
  }
  if (component.variantId !== null) {
    if (!article.variants.some((variant) => variant.id === component.variantId)) {
      throw new ProductError(
        'VARIANT_NOT_FOUND',
        `${context}: la variante elegida no es de «${article.name}».`,
      );
    }
    if (Object.keys(component.attributeFilter).length > 0 || component.variantSize !== null) {
      throw new ProductError(
        'INVALID_COMPONENT',
        `${context}: con una variante fija no se usa filtro ni tamaño de variante.`,
      );
    }
  }
  for (const [key, value] of Object.entries(component.attributeFilter)) {
    const attribute = article.variantAttributes.find((candidate) => candidate.key === key);
    const valid =
      attribute !== undefined &&
      (attribute.dataType === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : attribute.dataType === 'boolean'
          ? typeof value === 'boolean'
          : typeof value === 'string' &&
            value.length > 0 &&
            (attribute.dataType !== 'list' || (attribute.options ?? []).includes(value)));
    if (!valid) {
      throw new ProductError(
        'INVALID_ATTRIBUTE_FILTER',
        attribute
          ? `${context}: valor inválido para «${attribute.name}» en el filtro.`
          : `${context}: «${key}» no es un atributo que defina variante de «${article.name}».`,
      );
    }
  }
  if (component.variantSize !== null) {
    if (!article.usesSize) {
      throw new ProductError('SIZE_NOT_ALLOWED', `${context}: «${article.name}» no usa tamaño.`);
    }
    if (component.variantSize.match === 'size') {
      assertSizeExists(catalog, component.variantSize.sizeId, context);
    }
  }
}

/** Una sustitución apunta a un componente de un ancestro estricto y cada uno se sustituye una vez por rama. */
function validateReplacements(
  catalog: ProductCatalog,
  scoped: readonly PersistedProduct[],
  componentsByProduct: ReadonlyMap<string, readonly PersistedComponent[]>,
): void {
  for (const product of scoped) {
    const chain = productChain(catalog.products, product.id);
    const inherited = new Set<string>();
    const replaced = new Map<string, string>();
    for (const level of chain) {
      const own = componentsByProduct.get(level.id) ?? [];
      for (const component of own) {
        const target = component.replacesComponentId;
        if (target === null) continue;
        if (!inherited.has(target)) {
          throw new ProductError(
            'INVALID_REPLACEMENT',
            `«${level.name}»: el componente ${describe(component, catalog)} sustituye a uno que no es un componente heredado de sus ancestros.`,
          );
        }
        const previous = replaced.get(target);
        if (previous !== undefined && previous !== component.id) {
          throw new ProductError(
            'INVALID_REPLACEMENT',
            `«${level.name}»: el componente ${describe(component, catalog)} sustituye a uno que ya fue sustituido en un ancestro.`,
          );
        }
        replaced.set(target, component.id);
      }
      for (const component of own) inherited.add(component.id);
    }
  }
}

/** 409 si algún descendiente sustituye a un componente que se quiere quitar. */
export function assertComponentsRemovable(
  catalog: ProductCatalog,
  removedIds: readonly string[],
): void {
  const removed = new Set(removedIds);
  const conflicts = catalog.components
    .filter(
      (component) =>
        component.replacesComponentId !== null &&
        removed.has(component.replacesComponentId) &&
        !removed.has(component.id),
    )
    .map((component) => ({
      componentId: component.replacesComponentId!,
      productId: component.productId,
      replacedBy: component.id,
    }));
  if (conflicts.length === 0) return;
  const names = [
    ...new Set(
      conflicts.map(
        (conflict) => catalog.products.find((product) => product.id === conflict.productId)?.name,
      ),
    ),
  ];
  throw new ProductError(
    'COMPONENT_IN_USE',
    `No se puede quitar el componente: ${names.map((name) => `«${name}»`).join(', ')} lo sustituye. Quita primero esa sustitución.`,
    conflicts,
  );
}

// ---------------------------------------------------------------------------------------------
// Registros desactivados

export interface ProductReferences {
  product: PersistedProduct;
  components: readonly PersistedComponent[];
}

function referencesOf(state: ProductReferences | null) {
  const sizes = new Set<SizeId>();
  const articles = new Set<string>();
  const variants = new Set<string>();
  if (!state) return { parent: null, sizes, articles, variants };
  const { product, components } = state;
  if (product.sizeOffer.mode === 'explicit')
    product.sizeOffer.sizeIds.forEach((id) => sizes.add(id));
  product.prices.forEach((price) => sizes.add(price.sizeId));
  for (const component of components) {
    component.values.forEach((value) => value.sizeId !== null && sizes.add(value.sizeId));
    if (component.kind === 'fixed') continue;
    articles.add(component.articleId);
    if (component.variantId !== null) variants.add(component.variantId);
    if (component.variantSize?.match === 'size') sizes.add(component.variantSize.sizeId);
  }
  return { parent: product.parentId, sizes, articles, variants };
}

/**
 * Un producto solo puede agregar referencias a registros activos (padre, tamaños, artículos y
 * variantes fijas) y a artículos que se usan en recetas. Las que ya tenía se conservan aunque se
 * hayan desactivado o desmarcado después.
 */
export function assertNewReferencesActive(
  before: ProductReferences | null,
  after: ProductReferences,
  catalog: ProductCatalog,
): void {
  const previous = referencesOf(before);
  const next = referencesOf(after);
  if (next.parent !== null && next.parent !== previous.parent) {
    const parent = catalog.products.find((product) => product.id === next.parent);
    if (parent && !parent.active) {
      throw new ProductError(
        'PARENT_INACTIVE',
        `El producto «${parent.name}» está desactivado; elige un padre activo.`,
      );
    }
  }
  for (const sizeId of next.sizes) {
    if (previous.sizes.has(sizeId)) continue;
    const size = catalog.sizes.find((candidate) => candidate.id === sizeId);
    if (size && !size.active) {
      throw new ProductError(
        'SIZE_INACTIVE',
        `El tamaño «${size.label}» está desactivado; elige uno activo.`,
      );
    }
  }
  for (const articleId of next.articles) {
    if (previous.articles.has(articleId)) continue;
    const article = catalog.articles.find((candidate) => candidate.id === articleId);
    if (article && !article.active) {
      throw new ProductError(
        'ARTICLE_INACTIVE',
        `El artículo «${article.name}» está desactivado; elige uno activo.`,
      );
    }
    if (article && !article.usedInRecipes) {
      throw new ProductError(
        'ARTICLE_NOT_FOR_RECIPES',
        `«${article.name}» no está marcado como «se usa en recetas».`,
      );
    }
  }
  for (const variantId of next.variants) {
    if (previous.variants.has(variantId)) continue;
    const variant = catalog.articles
      .flatMap((article) => article.variants)
      .find((candidate) => candidate.id === variantId);
    if (variant && variant.active === false) {
      throw new ProductError(
        'VARIANT_INACTIVE',
        `La variante ${variant.sku} está desactivada; elige una activa.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Costo, precio y margen por tamaño

export type SizeCostStatus = 'ok' | 'needs_choice' | 'error';

export interface SizeCost {
  sizeId: SizeId;
  status: SizeCostStatus;
  /** Costo D2; null si falta elegir variante o hay un error en ese tamaño. */
  cost: Cents | null;
  /** Precio general propio; null si no hay (sin herencia, D3). */
  price: Cents | null;
  marginPercent: number | null;
  warning: MarginWarning | null;
  error: { code: string; message: string } | null;
}

export interface ProductCostSummary {
  productId: string;
  sizes: SizeCost[];
}

export interface CostOptions {
  /** Margen mínimo de D3; 0 hasta que S2 lo haga configurable. */
  minMarginPercent: number;
}

/** Tamaños que se muestran: la oferta efectiva en el orden del catálogo, o todos los activos. */
export function displayedSizes(catalog: ProductCatalog, productId: string): SizeId[] {
  const { sizeIds } = effectiveSizeOffer(catalog.products, productId);
  return catalog.sizes
    .filter((size) => (sizeIds ? sizeIds.includes(size.id) : size.active))
    .map((size) => size.id);
}

function margin(cost: Cents | null, price: Cents | null, options: CostOptions) {
  if (cost === null || price === null) return { marginPercent: null, warning: null };
  return evaluateMargin(cost, price, options.minMarginPercent);
}

/** Costo, precio y margen de cada producto en cada tamaño que ofrece (pantalla 7). */
export function assessProductCosts(
  catalog: ProductCatalog,
  options: CostOptions,
): ProductCostSummary[] {
  const products = toCostProducts(catalog.products, catalog.components);
  return catalog.products.map((product) => ({
    productId: product.id,
    sizes: displayedSizes(catalog, product.id).map((sizeId): SizeCost => {
      const price = product.prices.find((entry) => entry.sizeId === sizeId)?.price ?? null;
      try {
        const preview = previewCost({
          products,
          articles: catalog.articles,
          productId: product.id,
          size: sizeId,
        });
        if (preview.total === null) {
          return {
            sizeId,
            status: 'needs_choice',
            cost: null,
            price,
            marginPercent: null,
            warning: null,
            error: null,
          };
        }
        return {
          sizeId,
          status: 'ok',
          cost: preview.total,
          price,
          ...margin(preview.total, price, options),
          error: null,
        };
      } catch (error) {
        if (!(error instanceof CostResolutionError)) throw error;
        return {
          sizeId,
          status: 'error',
          cost: null,
          price,
          marginPercent: null,
          warning: null,
          error: { code: error.code, message: error.message },
        };
      }
    }),
  }));
}

export interface ProductCostDetail
  extends CostPreview, Omit<SizeCost, 'sizeId' | 'status' | 'cost' | 'error'> {}

/** Desglose de un producto en un tamaño con las variantes elegidas (pantalla 8). Lanza errores de D2. */
export function productCostDetail(
  catalog: ProductCatalog,
  input: {
    productId: string;
    sizeId: SizeId;
    variantChoices?: Readonly<Record<string, string>>;
    minMarginPercent: number;
  },
): ProductCostDetail {
  const preview = previewCost({
    products: toCostProducts(catalog.products, catalog.components),
    articles: catalog.articles,
    productId: input.productId,
    size: input.sizeId,
    ...(input.variantChoices && { variantChoices: input.variantChoices }),
  });
  const product = catalog.products.find((candidate) => candidate.id === input.productId)!;
  const price = product.prices.find((entry) => entry.sizeId === input.sizeId)?.price ?? null;
  return { ...preview, price, ...margin(preview.total, price, input) };
}
