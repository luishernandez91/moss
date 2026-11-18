import { add, cents, multiply, type Cents } from './money.js';

export const SIZE_PLACEHOLDER = '{tamano}';
export const MAX_PRODUCT_TREE_DEPTH = 3;

export type SizeId = string;
export type AttributeValue = string | number | boolean;
export type PerSize<T> = T | Readonly<Record<SizeId, T>>;

export interface Variant {
  sku: string;
  attributes: Readonly<Record<string, AttributeValue>>;
  averageCost: Cents;
}

export interface Article {
  id: string;
  name: string;
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
  variantSku?: string;
  attributeFilter?: Readonly<Record<string, AttributeValue>>;
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
  variantChoices?: Readonly<Record<string, string>>;
  costOf?: CostLookup;
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
  variantSku: string | null;
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
  const { size, addOn, variantChoices = {}, costOf = defaultCostOf } = input;
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const articlesById = new Map(input.articles.map((article) => [article.id, article]));

  const chain = productChain(productsById, input.productId);
  const leaf = chain[chain.length - 1]!;
  assertSizeOffered(chain, size);
  if (addOn && !addOn.appliesTo.some((id) => chain.some((product) => product.id === id))) {
    throw new CostResolutionError(
      'ADDON_NOT_APPLICABLE',
      `El extra «${addOn.name}» no aplica a «${leaf.name}».`,
    );
  }
  assertUniqueComponentIds(chain, addOn);

  // Raíz → hoja: cada nivel puede sustituir componentes de sus ancestros.
  const levels: Level[] = [];
  for (const product of chain) {
    const level = selectForSize(product.components, size, {
      source: { kind: 'product', productId: product.id },
      ownerName: product.name,
      isOwn: product === leaf,
    });
    for (const entry of level.entries) {
      const targetId = entry.component.replacesComponentId;
      if (entry.active && targetId !== undefined) {
        applyReplacement(levels, entry, targetId);
      }
    }
    levels.push(level);
  }
  const firstUncovered = levels.flatMap((level) => [...level.uncovered.values()])[0];
  if (firstUncovered) {
    throw firstUncovered;
  }

  const addOnLevel = addOn
    ? selectForSize(addOn.components, size, {
        source: { kind: 'addOn', addOnId: addOn.id },
        ownerName: addOn.name,
        isOwn: true,
      })
    : null;
  const addOnUncovered = addOnLevel ? [...addOnLevel.uncovered.values()][0] : undefined;
  if (addOnUncovered) {
    throw addOnUncovered;
  }
  for (const entry of addOnLevel?.entries ?? []) {
    if (entry.component.replacesComponentId !== undefined) {
      throw new CostResolutionError(
        'INVALID_REPLACEMENT',
        `El componente ${entry.component.id} del extra «${entry.ownerName}» no puede sustituir componentes del producto.`,
      );
    }
  }

  // Orden de la pantalla 8: propios, luego heredados del padre y del abuelo; el extra al final.
  const entries = [
    ...levels.toReversed().flatMap((level) => level.entries),
    ...(addOnLevel?.entries ?? []),
  ];
  assertKnownChoices(entries, variantChoices);

  const lines = entries.map((entry) =>
    toLine(entry, { size, articlesById, variantChoices, costOf }),
  );
  const total = add(
    ...lines.flatMap((line) =>
      line.origin !== 'overridden' && line.subtotal !== null ? [line.subtotal] : [],
    ),
  );

  return { productId: leaf.id, size, addOnId: addOn?.id ?? null, lines, total };
}

/** Devuelve la cadena raíz → producto. Rechaza ciclos, padres inexistentes y más de 3 niveles. */
function productChain(productsById: Map<string, Product>, productId: string): Product[] {
  const product = productsById.get(productId);
  if (!product) {
    throw new CostResolutionError('PRODUCT_NOT_FOUND', `No existe el producto «${productId}».`);
  }
  const chain: Product[] = [];
  const visited = new Set<string>();
  let current: Product | undefined = product;
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

function assertSizeOffered(chain: readonly Product[], size: SizeId): void {
  const definer = chain.findLast((product) => product.sizes !== undefined);
  if (definer?.sizes && !definer.sizes.includes(size)) {
    const leaf = chain[chain.length - 1]!;
    throw new CostResolutionError(
      'SIZE_NOT_OFFERED',
      `«${leaf.name}» no se produce en tamaño ${size}; tamaños disponibles: ${definer.sizes.join(', ')}.`,
    );
  }
}

function assertUniqueComponentIds(chain: readonly Product[], addOn: AddOn | undefined): void {
  const seen = new Set<string>();
  const all = [...chain.flatMap((product) => product.components), ...(addOn?.components ?? [])];
  for (const component of all) {
    if (seen.has(component.id)) {
      throw new CostResolutionError(
        'DUPLICATE_COMPONENT',
        `El id de componente ${component.id} se repite en la receta.`,
      );
    }
    seen.add(component.id);
  }
}

/** Clave que identifica "el mismo componente" dentro de un producto (genérico frente a con tamaño). */
function groupKey(component: RecipeComponent): string {
  if (component.kind === 'fixed') {
    return `fixed|${component.concept}`;
  }
  const filter = Object.entries(component.attributeFilter ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `article|${component.articleId}|${component.variantSku ?? ''}|${JSON.stringify(filter)}`;
}

function perSizeValue<T extends number>(value: PerSize<T>, size: SizeId): T | undefined {
  return typeof value === 'number' ? value : value[size];
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

function describeComponent(component: RecipeComponent): string {
  return component.kind === 'fixed' || component.concept !== undefined
    ? `«${component.concept}» (${component.id})`
    : `${component.id} (artículo ${component.articleId})`;
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
): Level {
  const groups = new Map<string, RecipeComponent[]>();
  for (const component of components) {
    const key = groupKey(component);
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
        const defined = Object.keys(perSizeValueOf(missing)).join(', ');
        uncovered.set(
          key,
          new CostResolutionError(
            'NO_COMPONENT_FOR_SIZE',
            `Ningún componente ${describeComponent(missing)} de «${owner.ownerName}» aplica al tamaño ${size}; solo está definido para: ${defined}.`,
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
          `«${owner.ownerName}» tiene ${duplicates.length} componentes iguales para el tamaño ${size}: ${duplicates.map((member) => member.id).join(', ')}.`,
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
function applyReplacement(ancestors: readonly Level[], replacement: Entry, targetId: string): void {
  const level = ancestors.find((candidate) => candidate.groupByComponentId.has(targetId));
  if (!level) {
    throw new CostResolutionError(
      'INVALID_REPLACEMENT',
      `El componente ${replacement.component.id} de «${replacement.ownerName}» sustituye a ${targetId}, que no es un componente heredado.`,
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
      `El componente ${replacement.component.id} de «${replacement.ownerName}» sustituye a ${targetId}, que ya fue sustituido por ${target.replacedBy}.`,
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
      variantSku: null,
      quantity: 1,
      unitCost: amount,
      subtotal: multiply(amount, 1),
    };
  }

  const article = context.articlesById.get(component.articleId);
  if (!article) {
    throw new CostResolutionError(
      'ARTICLE_NOT_FOUND',
      `El componente ${component.id} de «${entry.ownerName}» usa el artículo «${component.articleId}», que no existe.`,
    );
  }
  const quantity = perSizeValue(component.quantity, context.size)!;
  const lineBase = {
    ...base,
    concept: component.concept ?? article.name,
    articleId: article.id,
    quantity,
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
    );
  } catch (error) {
    if (overridden && error instanceof CostResolutionError) {
      return { ...lineBase, variantSku: null, unitCost: null, subtotal: null };
    }
    throw error;
  }
  const unitCost = cents(context.costOf(variant, article));
  return {
    ...lineBase,
    variantSku: variant.sku,
    unitCost,
    subtotal: multiply(unitCost, quantity),
  };
}

function pickVariant(
  component: ArticleComponent,
  article: Article,
  size: SizeId,
  chosenSku: string | undefined,
  ownerName: string,
): Variant {
  const filter = Object.entries(component.attributeFilter ?? {});
  const candidates =
    component.variantSku !== undefined
      ? article.variants.filter((variant) => variant.sku === component.variantSku)
      : article.variants.filter((variant) =>
          filter.every(
            ([attribute, expected]) =>
              variant.attributes[attribute] === (expected === SIZE_PLACEHOLDER ? size : expected),
          ),
        );

  if (chosenSku !== undefined) {
    const chosen = candidates.find((variant) => variant.sku === chosenSku);
    if (!chosen) {
      throw new CostResolutionError(
        'VARIANT_NOT_ALLOWED',
        `La variante ${chosenSku} no cumple el filtro del componente ${component.id} de «${ownerName}» («${article.name}»).`,
      );
    }
    return chosen;
  }
  if (candidates.length === 0) {
    throw new CostResolutionError(
      'NO_MATCHING_VARIANT',
      `Ninguna variante de «${article.name}» cumple el filtro del componente ${component.id} de «${ownerName}» en tamaño ${size}.`,
    );
  }
  if (candidates.length > 1) {
    throw new CostResolutionError(
      'AMBIGUOUS_VARIANT',
      `«${article.name}» coincide con ${candidates.length} variantes (${candidates.map((variant) => variant.sku).join(', ')}) en el componente ${component.id}; elige una.`,
    );
  }
  return candidates[0]!;
}
