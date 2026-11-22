import type { StockUnit } from './article.js';
import { add, cents, multiply, type Cents } from './money.js';

/**
 * «Mismo tamaño que se produce» en el tamaño de variante de un componente; `{tamano}` en la
 * especificación. El tamaño es la dimensión global `sizeId` de la variante (C3), no un atributo.
 */
export const SIZE_PLACEHOLDER = '{size}';
export const MAX_PRODUCT_TREE_DEPTH = 3;

export type SizeId = string;
export type AttributeValue = string | number | boolean;
/** Valor genérico con valores por tamaño en el mismo componente (§2): el del tamaño gana. */
export interface SizedValues<T> {
  generic: T;
  bySize: Readonly<Record<SizeId, T>>;
}
/**
 * Cantidad o monto: uno para todos los tamaños, uno por tamaño (los tamaños sin valor no aplican)
 * o un genérico con valores por tamaño que lo sustituyen.
 */
export type PerSize<T> = T | Readonly<Record<SizeId, T>> | SizedValues<T>;

export interface Variant {
  id: string;
  sku: string;
  /** Tamaño global de la variante (C3); null si su tipo no usa tamaño. */
  sizeId: SizeId | null;
  attributes: Readonly<Record<string, AttributeValue>>;
  averageCost: Cents;
  /** Una variante inactiva no entra en filtros ni elecciones; una referencia fija sí la resuelve. */
  active?: boolean;
}

export interface Article {
  id: string;
  name: string;
  /** Unidad de la existencia y del costo promedio de sus variantes (`articles.stock_unit NOT NULL`). */
  stockUnit: StockUnit;
  variants: readonly Variant[];
}

interface ComponentBase {
  id: string;
  category: 'material' | 'labor';
  concept?: string;
  size?: SizeId;
  replacesComponentId?: string;
}

export interface ArticleComponent extends ComponentBase {
  kind: 'article';
  articleId: string;
  /** Variante fija, por id. Excluye filtro y tamaño de variante. */
  variantId?: string;
  /** Filtro sobre atributos que definen variante; el tamaño va en `variantSize`. */
  attributeFilter?: Readonly<Record<string, AttributeValue>>;
  /** `SIZE_PLACEHOLDER` = el tamaño que se produce; otro valor = ese tamaño (id). */
  variantSize?: SizeId;
  quantity: PerSize<number>;
}

export interface FixedComponent extends ComponentBase {
  kind: 'fixed';
  concept: string;
  amount: PerSize<Cents>;
}

export type RecipeComponent = ArticleComponent | FixedComponent;

export interface Product {
  id: string;
  parentId: string | null;
  name: string;
  sizes?: readonly SizeId[];
  components: readonly RecipeComponent[];
}

export interface AddOn {
  id: string;
  name: string;
  appliesTo: readonly string[];
  components: readonly RecipeComponent[];
}

export type CostLookup = (variant: Variant, article: Article) => Cents;

export interface ResolveCostInput {
  products: readonly Product[];
  articles: readonly Article[];
  productId: string;
  size: SizeId;
  addOn?: AddOn;
  /** Variante elegida por componente: id de componente → id de variante. */
  variantChoices?: Readonly<Record<string, string>>;
  costOf?: CostLookup;
  /** Etiqueta de un tamaño para los mensajes (los ids de C4 son UUID). Por defecto, el id. */
  sizeLabel?: (sizeId: SizeId) => string;
}

/** Cómo nombrar tamaños y artículos en los mensajes: el usuario no ve ids. */
interface Names {
  size: (sizeId: SizeId) => string;
  article: (articleId: string) => string;
}

export type LineOrigin = 'own' | 'inherited' | 'overridden';

export type LineSource =
  { kind: 'product'; productId: string } | { kind: 'addOn'; addOnId: string };

export interface CostLine {
  componentId: string;
  concept: string;
  kind: 'article' | 'fixed';
  category: 'material' | 'labor';
  origin: LineOrigin;
  source: LineSource;
  articleId: string | null;
  variantId: string | null;
  variantSku: string | null;
  /** La variante resuelta está desactivada (solo posible con una variante fija). */
  variantInactive: boolean;
  quantity: number;
  unitCost: Cents | null;
  subtotal: Cents | null;
  replacedBy: string | null;
}

export interface CostBreakdown {
  productId: string;
  size: SizeId;
  addOnId: string | null;
  lines: CostLine[];
  total: Cents;
}

export interface VariantCandidate {
  variantId: string;
  sku: string;
  sizeId: SizeId | null;
  attributes: Readonly<Record<string, AttributeValue>>;
  unitCost: Cents;
}

/** Componente cuyo filtro coincide con varias variantes: hay que elegir una (D2). */
export interface PendingChoice {
  componentId: string;
  articleId: string;
  candidates: VariantCandidate[];
}

/** Desglose que no lanza por ambigüedad: líneas pendientes sin costo y total null. */
export interface CostPreview extends Omit<CostBreakdown, 'total'> {
  total: Cents | null;
  pendingChoices: PendingChoice[];
}

export type CostResolutionErrorCode =
  | 'PRODUCT_NOT_FOUND'
  | 'PARENT_NOT_FOUND'
  | 'CYCLE'
  | 'TREE_TOO_DEEP'
  | 'SIZE_NOT_OFFERED'
  | 'NO_COMPONENT_FOR_SIZE'
  | 'ARTICLE_NOT_FOUND'
  | 'NO_MATCHING_VARIANT'
  | 'AMBIGUOUS_VARIANT'
  | 'VARIANT_NOT_ALLOWED'
  | 'UNKNOWN_VARIANT_CHOICE'
  | 'INVALID_REPLACEMENT'
  | 'DUPLICATE_COMPONENT'
  | 'ADDON_NOT_APPLICABLE';

export class CostResolutionError extends Error {
  override name = 'CostResolutionError';
  constructor(
    readonly code: CostResolutionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const defaultCostOf: CostLookup = (variant) => variant.averageCost;

/** Un componente ya filtrado por tamaño, listo para convertirse en línea. */
interface Entry {
  component: RecipeComponent;
  source: LineSource;
  ownerName: string;
  isOwn: boolean;
  groupKey: string;
  active: boolean;
  replacedBy: string | null;
}

interface Level {
  entries: Entry[];
  activeByGroup: Map<string, Entry>;
  groupByComponentId: Map<string, string>;
  /** Grupos sin componente para el tamaño; dejan de ser error si un descendiente los sustituye. */
  uncovered: Map<string, CostResolutionError>;
}

/**
 * Calcula el costo de una pieza a partir de su receta heredada, el tamaño y el extra.
 * Función pura: no consulta nada fuera de su entrada. El costo de cada artículo sale
 * de `costOf` (por defecto, el costo promedio del catálogo).
 */
export function resolveCost(input: ResolveCostInput): CostBreakdown {
  const { total, pendingChoices: _none, ...rest } = resolve(input, 'throw');
  return { ...rest, total: total! };
}

/**
 * Igual que `resolveCost`, pero un componente con varias variantes posibles no lanza
 * `AMBIGUOUS_VARIANT`: su línea queda sin costo, se devuelven sus candidatas y el total es null
 * hasta elegir. Nunca toma la primera ni promedia. Los demás errores se lanzan igual.
 */
export function previewCost(input: ResolveCostInput): CostPreview {
  return resolve(input, 'collect');
}

function resolve(input: ResolveCostInput, ambiguity: 'throw' | 'collect'): CostPreview {
  const { size, addOn, variantChoices = {}, costOf = defaultCostOf } = input;
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const articlesById = new Map(input.articles.map((article) => [article.id, article]));
  const names: Names = {
    size: input.sizeLabel ?? ((sizeId) => sizeId),
    article: (articleId) => articlesById.get(articleId)?.name ?? articleId,
  };

  const chain = resolveProductChain(productsById, input.productId);
  const leaf = chain[chain.length - 1]!;
  assertSizeOffered(chain, size, names);
  if (addOn && !addOn.appliesTo.some((id) => chain.some((product) => product.id === id))) {
    throw new CostResolutionError(
      'ADDON_NOT_APPLICABLE',
      `El extra «${addOn.name}» no aplica a «${leaf.name}».`,
    );
  }
  assertUniqueComponentIds(chain, addOn, names);

  // Raíz → hoja: cada nivel puede sustituir componentes de sus ancestros.
  const levels: Level[] = [];
  for (const product of chain) {
    const level = selectForSize(
      product.components,
      size,
      {
        source: { kind: 'product', productId: product.id },
        ownerName: product.name,
        isOwn: product === leaf,
      },
      names,
    );
    for (const entry of level.entries) {
      const targetId = entry.component.replacesComponentId;
      if (entry.active && targetId !== undefined) {
        applyReplacement(levels, entry, targetId, names);
      }
    }
    levels.push(level);
  }
  const firstUncovered = levels.flatMap((level) => [...level.uncovered.values()])[0];
  if (firstUncovered) {
    throw firstUncovered;
  }

  const addOnLevel = addOn
    ? selectForSize(
        addOn.components,
        size,
        { source: { kind: 'addOn', addOnId: addOn.id }, ownerName: addOn.name, isOwn: true },
        names,
      )
    : null;
  const addOnUncovered = addOnLevel ? [...addOnLevel.uncovered.values()][0] : undefined;
  if (addOnUncovered) {
    throw addOnUncovered;
  }
  for (const entry of addOnLevel?.entries ?? []) {
    if (entry.component.replacesComponentId !== undefined) {
      throw new CostResolutionError(
        'INVALID_REPLACEMENT',
        `El componente ${describeComponent(entry.component, names)} del extra «${entry.ownerName}» no puede sustituir componentes del producto.`,
      );
    }
  }

  // Orden de la pantalla 8: propios, luego heredados del padre y del abuelo; el extra al final.
  const entries = [
    ...levels.toReversed().flatMap((level) => level.entries),
    ...(addOnLevel?.entries ?? []),
  ];
  assertKnownChoices(entries, variantChoices);

  const pendingChoices: PendingChoice[] = [];
  const lines = entries.map((entry) =>
    toLine(entry, {
      size,
      articlesById,
      variantChoices,
      costOf,
      ambiguity,
      pendingChoices,
      names,
    }),
  );
  const total =
    pendingChoices.length > 0
      ? null
      : add(
          ...lines.flatMap((line) =>
            line.origin !== 'overridden' && line.subtotal !== null ? [line.subtotal] : [],
          ),
        );

  return { productId: leaf.id, size, addOnId: addOn?.id ?? null, lines, total, pendingChoices };
}

/** Devuelve la cadena raíz → producto. Rechaza ciclos, padres inexistentes y más de 3 niveles. */
export function resolveProductChain<P extends Pick<Product, 'id' | 'parentId' | 'name'>>(
  productsById: ReadonlyMap<string, P>,
  productId: string,
): P[] {
  const product = productsById.get(productId);
  if (!product) {
    throw new CostResolutionError('PRODUCT_NOT_FOUND', `No existe el producto «${productId}».`);
  }
  const chain: P[] = [];
  const visited = new Set<string>();
  let current: P | undefined = product;
  while (current) {
    if (visited.has(current.id)) {
      const path = [...chain.map((node) => node.name), current.name].join(' → ');
      throw new CostResolutionError('CYCLE', `El árbol de productos tiene un ciclo: ${path}.`);
    }
    visited.add(current.id);
    chain.push(current);
    if (current.parentId === null) {
      break;
    }
    const parent = productsById.get(current.parentId);
    if (!parent) {
      throw new CostResolutionError(
        'PARENT_NOT_FOUND',
        `El producto «${current.name}» tiene como padre «${current.parentId}», que no existe.`,
      );
    }
    current = parent;
  }
  // La profundidad se revisa al final para que un ciclo largo se reporte como ciclo.
  if (chain.length > MAX_PRODUCT_TREE_DEPTH) {
    throw new CostResolutionError(
      'TREE_TOO_DEEP',
      `«${product.name}» está a más de ${MAX_PRODUCT_TREE_DEPTH} niveles; el árbol de productos admite hasta ${MAX_PRODUCT_TREE_DEPTH} niveles.`,
    );
  }
  return chain.reverse();
}

function assertSizeOffered(chain: readonly Product[], size: SizeId, names: Names): void {
  const definer = chain.findLast((product) => product.sizes !== undefined);
  if (definer?.sizes && !definer.sizes.includes(size)) {
    const leaf = chain[chain.length - 1]!;
    throw new CostResolutionError(
      'SIZE_NOT_OFFERED',
      `«${leaf.name}» no se produce en tamaño ${names.size(size)}; tamaños disponibles: ${definer.sizes.map(names.size).join(', ')}.`,
    );
  }
}

function assertUniqueComponentIds(
  chain: readonly Product[],
  addOn: AddOn | undefined,
  names: Names,
): void {
  const seen = new Set<string>();
  const all = [...chain.flatMap((product) => product.components), ...(addOn?.components ?? [])];
  for (const component of all) {
    if (seen.has(component.id)) {
      throw new CostResolutionError(
        'DUPLICATE_COMPONENT',
        `El componente ${describeComponent(component, names)} aparece dos veces en la receta.`,
      );
    }
    seen.add(component.id);
  }
}

/**
 * Clave que identifica "el mismo componente" dentro de un producto (genérico frente a con tamaño):
 * artículo + variante fija + tamaño de variante + filtro, o el concepto en los de monto fijo.
 */
export function componentGroupKey(component: RecipeComponent): string {
  if (component.kind === 'fixed') {
    return `fixed|${component.concept}`;
  }
  const filter = Object.entries(component.attributeFilter ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `article|${component.articleId}|${component.variantId ?? ''}|${component.variantSize ?? ''}|${JSON.stringify(filter)}`;
}

function isSizedValues<T>(value: PerSize<T>): value is SizedValues<T> {
  return typeof value === 'object' && value !== null && 'generic' in value && 'bySize' in value;
}

/** Tamaño específico > genérico. */
function perSizeValue<T extends number>(value: PerSize<T>, size: SizeId): T | undefined {
  if (typeof value === 'number') return value;
  if (isSizedValues(value)) return value.bySize[size] ?? value.generic;
  return (value as Readonly<Record<SizeId, T>>)[size];
}

/** Tamaños con valor propio (para mensajes). */
function definedSizes(value: PerSize<number>): SizeId[] {
  if (typeof value === 'number') return [];
  return Object.keys(isSizedValues(value) ? value.bySize : value);
}

function perSizeValueOf(component: RecipeComponent): PerSize<number> {
  return component.kind === 'fixed' ? component.amount : component.quantity;
}

function appliesTo(component: RecipeComponent, size: SizeId): boolean {
  if (component.size !== undefined && component.size !== size) {
    return false;
  }
  return perSizeValue(perSizeValueOf(component), size) !== undefined;
}

/** Nombre de un componente en un mensaje: su concepto o el nombre de su artículo. */
function describeComponent(component: RecipeComponent, names: Names): string {
  return component.kind === 'fixed' || component.concept !== undefined
    ? `«${component.concept}»`
    : `«${names.article(component.articleId)}»`;
}

/**
 * Filtra los componentes de un nivel por tamaño. Dentro de un grupo (misma clave), el
 * componente con tamaño sustituye al genérico. Un grupo sin ningún componente aplicable
 * es un error si su cantidad estaba definida por tamaño y no incluye el pedido.
 */
function selectForSize(
  components: readonly RecipeComponent[],
  size: SizeId,
  owner: { source: LineSource; ownerName: string; isOwn: boolean },
  names: Names,
): Level {
  const groups = new Map<string, RecipeComponent[]>();
  for (const component of components) {
    const key = componentGroupKey(component);
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }

  const entries = new Map<string, Entry>();
  const activeByGroup = new Map<string, Entry>();
  const groupByComponentId = new Map<string, string>();
  const uncovered = new Map<string, CostResolutionError>();
  for (const [key, members] of groups) {
    for (const member of members) {
      groupByComponentId.set(member.id, key);
    }
    // Si las versiones de un mismo componente no sustituyen lo mismo, algún tamaño contaría dos veces.
    const targets = new Set(members.map((member) => member.replacesComponentId));
    if (targets.size > 1) {
      throw new CostResolutionError(
        'INVALID_REPLACEMENT',
        `Los componentes ${members.map((member) => member.id).join(', ')} de «${owner.ownerName}» son el mismo componente por tamaño y deben sustituir al mismo heredado.`,
      );
    }
    const applicable = members.filter((member) => appliesTo(member, size));
    if (applicable.length === 0) {
      const missing = members.find(
        (member) => member.size === undefined && member.replacesComponentId === undefined,
      );
      if (missing) {
        const defined = definedSizes(perSizeValueOf(missing)).map(names.size).join(', ');
        uncovered.set(
          key,
          new CostResolutionError(
            'NO_COMPONENT_FOR_SIZE',
            `Ningún componente ${describeComponent(missing, names)} de «${owner.ownerName}» aplica al tamaño ${names.size(size)}; solo está definido para: ${defined}.`,
          ),
        );
      }
      continue;
    }

    const sized = applicable.filter((member) => member.size !== undefined);
    const generic = applicable.filter((member) => member.size === undefined);
    for (const duplicates of [sized, generic]) {
      if (duplicates.length > 1) {
        throw new CostResolutionError(
          'DUPLICATE_COMPONENT',
          `«${owner.ownerName}» tiene ${duplicates.length} componentes iguales para el tamaño ${names.size(size)}: ${duplicates.map((member) => describeComponent(member, names)).join(', ')}.`,
        );
      }
    }
    const winner = sized[0] ?? generic[0]!;
    for (const member of applicable) {
      const entry: Entry = {
        component: member,
        ...owner,
        groupKey: key,
        active: member === winner,
        replacedBy: member === winner ? null : winner.id,
      };
      entries.set(member.id, entry);
      if (entry.active) {
        activeByGroup.set(key, entry);
      }
    }
  }

  return {
    entries: components.flatMap((component) => entries.get(component.id) ?? []),
    activeByGroup,
    groupByComponentId,
    uncovered,
  };
}

/**
 * `replacesComponentId` sustituye el componente heredado vigente en el grupo del objetivo,
 * aunque sea su versión con tamaño. Si el grupo no aplica al tamaño, la sustitución lo cubre.
 */
function applyReplacement(
  ancestors: readonly Level[],
  replacement: Entry,
  targetId: string,
  names: Names,
): void {
  const level = ancestors.find((candidate) => candidate.groupByComponentId.has(targetId));
  if (!level) {
    throw new CostResolutionError(
      'INVALID_REPLACEMENT',
      `El componente ${describeComponent(replacement.component, names)} de «${replacement.ownerName}» sustituye a un componente que no es heredado.`,
    );
  }
  const targetGroup = level.groupByComponentId.get(targetId)!;
  const target = level.activeByGroup.get(targetGroup);
  if (!target) {
    // El heredado no aplica a este tamaño; la sustitución lo cubre.
    level.uncovered.delete(targetGroup);
    return;
  }
  if (target.replacedBy !== null) {
    throw new CostResolutionError(
      'INVALID_REPLACEMENT',
      `El componente ${describeComponent(replacement.component, names)} de «${replacement.ownerName}» sustituye a ${describeComponent(target.component, names)}, que ya fue sustituido.`,
    );
  }
  target.replacedBy = replacement.component.id;
}

function assertKnownChoices(
  entries: readonly Entry[],
  variantChoices: Readonly<Record<string, string>>,
): void {
  const choosable = new Set(
    entries
      .filter((entry) => entry.replacedBy === null && entry.component.kind === 'article')
      .map((entry) => entry.component.id),
  );
  for (const componentId of Object.keys(variantChoices)) {
    if (!choosable.has(componentId)) {
      throw new CostResolutionError(
        'UNKNOWN_VARIANT_CHOICE',
        `Se eligió una variante para el componente ${componentId}, que no forma parte de la receta para este tamaño.`,
      );
    }
  }
}

interface LineContext {
  size: SizeId;
  articlesById: Map<string, Article>;
  variantChoices: Readonly<Record<string, string>>;
  costOf: CostLookup;
  ambiguity: 'throw' | 'collect';
  pendingChoices: PendingChoice[];
  names: Names;
}

function toLine(entry: Entry, context: LineContext): CostLine {
  const { component } = entry;
  const overridden = entry.replacedBy !== null;
  const base = {
    componentId: component.id,
    kind: component.kind,
    category: component.category,
    origin: overridden ? 'overridden' : entry.isOwn ? 'own' : 'inherited',
    source: entry.source,
    replacedBy: entry.replacedBy,
  } satisfies Partial<CostLine>;

  if (component.kind === 'fixed') {
    const amount = cents(perSizeValue(component.amount, context.size)!);
    return {
      ...base,
      concept: component.concept,
      articleId: null,
      variantId: null,
      variantSku: null,
      variantInactive: false,
      quantity: 1,
      unitCost: amount,
      subtotal: multiply(amount, 1),
    };
  }

  const article = context.articlesById.get(component.articleId);
  if (!article) {
    throw new CostResolutionError(
      'ARTICLE_NOT_FOUND',
      `Un componente de «${entry.ownerName}» usa el artículo «${component.articleId}», que no existe.`,
    );
  }
  const quantity = perSizeValue(component.quantity, context.size)!;
  const lineBase = {
    ...base,
    concept: component.concept ?? article.name,
    articleId: article.id,
    quantity,
  };

  const unresolved = {
    ...lineBase,
    variantId: null,
    variantSku: null,
    variantInactive: false,
    unitCost: null,
    subtotal: null,
  };
  let variant: Variant;
  try {
    // Una línea sustituida no usa la elección de variante: no se produce.
    variant = pickVariant(
      component,
      article,
      context.size,
      overridden ? undefined : context.variantChoices[component.id],
      entry.ownerName,
      context.names,
    );
  } catch (error) {
    if (overridden && error instanceof CostResolutionError) {
      return unresolved;
    }
    if (
      context.ambiguity === 'collect' &&
      error instanceof CostResolutionError &&
      error.code === 'AMBIGUOUS_VARIANT'
    ) {
      context.pendingChoices.push({
        componentId: component.id,
        articleId: article.id,
        candidates: variantCandidates(component, article, context.size).map((candidate) => ({
          variantId: candidate.id,
          sku: candidate.sku,
          sizeId: candidate.sizeId,
          attributes: candidate.attributes,
          unitCost: cents(context.costOf(candidate, article)),
        })),
      });
      return unresolved;
    }
    throw error;
  }
  const unitCost = cents(context.costOf(variant, article));
  return {
    ...lineBase,
    variantId: variant.id,
    variantSku: variant.sku,
    variantInactive: variant.active === false,
    unitCost,
    subtotal: multiply(unitCost, quantity),
  };
}

/**
 * Variantes que puede usar un componente: la fija (aunque esté inactiva: la referencia existente
 * se conserva) o las activas que cumplen el tamaño de variante y el filtro de atributos.
 */
function variantCandidates(component: ArticleComponent, article: Article, size: SizeId): Variant[] {
  if (component.variantId !== undefined) {
    return article.variants.filter((variant) => variant.id === component.variantId);
  }
  const wantedSize = component.variantSize === SIZE_PLACEHOLDER ? size : component.variantSize;
  const filter = Object.entries(component.attributeFilter ?? {});
  return article.variants.filter(
    (variant) =>
      variant.active !== false &&
      (wantedSize === undefined || variant.sizeId === wantedSize) &&
      filter.every(([attribute, expected]) => variant.attributes[attribute] === expected),
  );
}

function pickVariant(
  component: ArticleComponent,
  article: Article,
  size: SizeId,
  chosenId: string | undefined,
  ownerName: string,
  names: Names,
): Variant {
  const name = describeComponent(component, names);
  const candidates = variantCandidates(component, article, size);

  if (chosenId !== undefined) {
    const chosen = candidates.find((variant) => variant.id === chosenId);
    if (!chosen) {
      const label = article.variants.find((variant) => variant.id === chosenId)?.sku ?? chosenId;
      throw new CostResolutionError(
        'VARIANT_NOT_ALLOWED',
        `La variante ${label} no cumple el filtro del componente ${name} de «${ownerName}».`,
      );
    }
    return chosen;
  }
  if (candidates.length === 0) {
    throw new CostResolutionError(
      'NO_MATCHING_VARIANT',
      `Ninguna variante de «${article.name}» cumple el filtro del componente ${name} de «${ownerName}» en tamaño ${names.size(size)}.`,
    );
  }
  if (candidates.length > 1) {
    throw new CostResolutionError(
      'AMBIGUOUS_VARIANT',
      `«${article.name}» coincide con ${candidates.length} variantes (${candidates.map((variant) => variant.sku).join(', ')}) en el componente ${name} de «${ownerName}»; elige una.`,
    );
  }
  return candidates[0]!;
}
