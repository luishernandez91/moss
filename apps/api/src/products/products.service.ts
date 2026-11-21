import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import {
  CostResolutionError,
  ProductError,
  assertComponentsRemovable,
  assertNewReferencesActive,
  assessProductCosts,
  cents,
  displayedSizes,
  effectiveSizeOffer,
  productCostDetail,
  validateProductCatalog,
  type PersistedComponent,
  type PersistedProduct,
  type ProductCatalog,
} from '@moss/domain';
import type {
  CreateProduct,
  ProductCost,
  ProductCostQuery,
  ProductDetail,
  ProductListItem,
  ProductPricesInput,
  RecipeComponentView,
  RecipeInput,
  UpdateProduct,
} from '@moss/contracts';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  productPrices,
  productSizes,
  products,
  recipeComponentValues,
  recipeComponents,
} from '../database/schema.js';
import { guardWrite, runDomainRule } from '../common/domain-errors.js';
import { catalogWrite } from '../catalog/catalog-write.js';
import {
  loadProductCatalog,
  productAncestors,
  productTreeOrder,
  type LoadedCatalog,
} from './product-catalog.query.js';

/** Margen mínimo de D3 hasta que S2 lo haga configurable: solo avisa precio bajo el costo. */
const MIN_MARGIN_PERCENT = 0;

const notFound = () =>
  new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'No se encontró el producto.' });
const changed = () =>
  new ConflictException({
    code: 'PRODUCT_CHANGED',
    message: 'El producto cambió desde que lo abriste. Recarga para ver la versión actual.',
  });
const duplicateName = {
  code: 'DUPLICATE_PRODUCT_NAME',
  message: 'Ya existe un producto con ese nombre.',
};

/** Pantallas 7 y 8. Sin DELETE: los productos se desactivan. Toda escritura bajo el bloqueo de catálogo. */
@Injectable()
export class ProductsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(includeInactive: boolean): Promise<ProductListItem[]> {
    const loaded = await loadProductCatalog(this.db);
    const { catalog } = loaded;
    const costs = new Map(
      assessProductCosts(catalog, { minMarginPercent: MIN_MARGIN_PERCENT }).map((row) => [
        row.productId,
        row.sizes,
      ]),
    );
    const byId = new Map(catalog.products.map((product) => [product.id, product]));
    // Sin inactivos, se conservan los ancestros inactivos de un producto activo para no romper el árbol.
    const visible = new Set<string>();
    for (const product of catalog.products) {
      if (!includeInactive && !product.active) continue;
      for (let id: string | null = product.id; id !== null && !visible.has(id);) {
        visible.add(id);
        id = byId.get(id)?.parentId ?? null;
      }
    }
    const tree = await productTreeOrder(this.db);
    return tree
      .filter((node) => visible.has(node.id))
      .map(({ id, depth }) => {
        const product = byId.get(id)!;
        return {
          id,
          parentId: product.parentId,
          name: product.name,
          active: product.active,
          version: loaded.versions.get(id)!,
          depth,
          sizeOffer: sizeOfferView(product),
          sizeOfferFrom: effectiveSizeOffer(catalog.products, id).definedBy,
          componentNames: catalog.components
            .filter((component) => component.productId === id)
            .map((component) => componentName(component, loaded)),
          sizes: costs.get(id) ?? [],
        };
      });
  }

  async detail(id: string, db: Database = this.db): Promise<ProductDetail> {
    const loaded = await loadProductCatalog(db);
    const { catalog } = loaded;
    const product = catalog.products.find((candidate) => candidate.id === id);
    if (!product) throw notFound();
    const ancestors = await productAncestors(db, id);
    const view = (component: PersistedComponent) => componentView(component, loaded);
    const shown = new Set(displayedSizes(catalog, id));
    return {
      id,
      parentId: product.parentId,
      name: product.name,
      active: product.active,
      version: loaded.versions.get(id)!,
      ancestors,
      children: catalog.products
        .filter((candidate) => candidate.parentId === id)
        .map(({ id: childId, name, active }) => ({ id: childId, name, active })),
      sizeOffer: sizeOfferView(product),
      sizeOfferFrom: effectiveSizeOffer(catalog.products, id).definedBy,
      sizes: loaded.sizeRows.filter((size) => shown.has(size.id)),
      prices: product.prices.map(({ sizeId, price }) => ({ sizeId, price })),
      components: catalog.components.filter((component) => component.productId === id).map(view),
      inherited: ancestors
        .toReversed()
        .flatMap((ancestor) =>
          catalog.components
            .filter((component) => component.productId === ancestor.id)
            .map((component) => ({ ...view(component), productName: ancestor.name })),
        ),
    };
  }

  async cost(id: string, query: ProductCostQuery): Promise<ProductCost> {
    const loaded = await loadProductCatalog(this.db);
    if (!loaded.catalog.products.some((product) => product.id === id)) throw notFound();
    if (!loaded.sizeRows.some((size) => size.id === query.sizeId)) {
      throw new NotFoundException({ code: 'SIZE_NOT_FOUND', message: 'No se encontró el tamaño.' });
    }
    const detail = runDomainRule(CostResolutionError, () =>
      productCostDetail(loaded.catalog, {
        productId: id,
        sizeId: query.sizeId,
        variantChoices: query.choices,
        minMarginPercent: MIN_MARGIN_PERCENT,
      }),
    );
    return {
      productId: id,
      sizeId: query.sizeId,
      lines: detail.lines.map((line) => ({
        componentId: line.componentId,
        concept: line.concept,
        kind: line.kind,
        category: line.category,
        origin: line.origin,
        sourceProductId: line.source.kind === 'product' ? line.source.productId : null,
        articleId: line.articleId,
        stockUnit: line.articleId
          ? (loaded.articleInfo.get(line.articleId)?.stockUnit ?? null)
          : null,
        variantId: line.variantId,
        variantSku: line.variantSku,
        variantInactive: line.variantInactive,
        quantity: line.quantity,
        unitCost: line.unitCost,
        subtotal: line.subtotal,
        replacedBy: line.replacedBy,
      })),
      total: detail.total,
      pendingChoices: detail.pendingChoices.map((choice) => ({
        componentId: choice.componentId,
        articleId: choice.articleId,
        candidates: choice.candidates.map((candidate) => ({
          ...candidate,
          attributes: { ...candidate.attributes },
        })),
      })),
      price: detail.price,
      marginPercent: detail.marginPercent,
      warning: detail.warning,
    };
  }

  create(input: CreateProduct): Promise<ProductDetail> {
    return catalogWrite(this.db, async (tx) => {
      const loaded = await loadProductCatalog(tx);
      const product: PersistedProduct = {
        id: randomUUID(),
        parentId: input.parentId,
        name: input.name,
        active: true,
        sizeOffer: input.sizeOffer,
        prices: [],
      };
      const next = { ...loaded.catalog, products: [...loaded.catalog.products, product] };
      checkCatalog(null, { product, components: [] }, next);
      await guardWrite(
        () =>
          tx.insert(products).values({
            id: product.id,
            parentId: product.parentId,
            name: product.name,
            inheritsSizes: product.sizeOffer.mode === 'inherit',
          }),
        { unique: duplicateName },
      );
      await writeOffer(tx, product);
      return this.detail(product.id, tx);
    });
  }

  update(id: string, patch: UpdateProduct): Promise<ProductDetail> {
    return this.write(id, patch.version, [], async (tx, loaded, current) => {
      const product: PersistedProduct = {
        ...current,
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.parentId !== undefined && { parentId: patch.parentId }),
        ...(patch.sizeOffer !== undefined && { sizeOffer: patch.sizeOffer }),
        ...(patch.active !== undefined && { active: patch.active }),
      };
      const own = ownComponents(loaded.catalog, id);
      checkCatalog(
        { product: current, components: own },
        { product, components: own },
        replaceProduct(loaded.catalog, product),
      );
      await guardWrite(
        () =>
          tx
            .update(products)
            .set({
              name: product.name,
              parentId: product.parentId,
              active: product.active,
              inheritsSizes: product.sizeOffer.mode === 'inherit',
            })
            .where(eq(products.id, id)),
        { unique: duplicateName },
      );
      if (patch.sizeOffer !== undefined) await writeOffer(tx, product);
    });
  }

  setPrices(id: string, input: ProductPricesInput): Promise<ProductDetail> {
    return this.write(id, input.version, [], async (tx, loaded, current) => {
      const product: PersistedProduct = {
        ...current,
        prices: input.prices.map(({ sizeId, price }) => ({ sizeId, price: cents(price) })),
      };
      const own = ownComponents(loaded.catalog, id);
      checkCatalog(
        { product: current, components: own },
        { product, components: own },
        replaceProduct(loaded.catalog, product),
      );
      await tx.delete(productPrices).where(eq(productPrices.productId, id));
      if (product.prices.length > 0) {
        await tx
          .insert(productPrices)
          .values(product.prices.map(({ sizeId, price }) => ({ productId: id, sizeId, price })));
      }
    });
  }

  setRecipe(id: string, input: RecipeInput): Promise<ProductDetail> {
    const articleIds = input.components.flatMap((component) =>
      component.kind === 'article' ? [component.articleId] : [],
    );
    return this.write(id, input.version, articleIds, async (tx, loaded, current) => {
      const { catalog } = loaded;
      const own = ownComponents(catalog, id);
      const ownIds = new Set(own.map((component) => component.id));
      for (const component of input.components) {
        if (component.id !== undefined && !ownIds.has(component.id)) {
          throw new UnprocessableEntityException({
            code: 'COMPONENT_NOT_FOUND',
            message: 'Un componente de la receta no pertenece a este producto. Recarga la receta.',
          });
        }
      }
      const kept = new Set(input.components.flatMap((component) => component.id ?? []));
      const removed = own.filter((component) => !kept.has(component.id)).map((c) => c.id);
      runDomainRule(ProductError, () => assertComponentsRemovable(catalog, removed), 409);

      const next: PersistedComponent[] = input.components.map((component) => {
        const base = {
          id: component.id ?? randomUUID(),
          productId: id,
          category: component.category,
          replacesComponentId: component.replacesComponentId,
        };
        return component.kind === 'fixed'
          ? {
              ...base,
              kind: 'fixed',
              concept: component.concept,
              values: component.values.map(({ sizeId, amount }) => ({
                sizeId,
                amount: cents(amount),
              })),
            }
          : {
              ...base,
              kind: 'article',
              articleId: component.articleId,
              variantId: component.variantId,
              attributeFilter: component.attributeFilter,
              variantSize: component.variantSize,
              concept: component.concept,
              values: component.values,
            };
      });
      checkCatalog(
        { product: current, components: own },
        { product: current, components: next },
        {
          ...catalog,
          components: [
            ...catalog.components.filter((component) => component.productId !== id),
            ...next,
          ],
        },
      );

      if (removed.length > 0) {
        await tx.delete(recipeComponents).where(inArray(recipeComponents.id, removed));
      }
      for (const [position, component] of next.entries()) {
        const row = {
          productId: id,
          position,
          articleId: component.kind === 'article' ? component.articleId : null,
          variantId: component.kind === 'article' ? component.variantId : null,
          attributeFilter: component.kind === 'article' ? { ...component.attributeFilter } : {},
          variantSizeProduced:
            component.kind === 'article' && component.variantSize?.match === 'produced',
          variantSizeId:
            component.kind === 'article' && component.variantSize?.match === 'size'
              ? component.variantSize.sizeId
              : null,
          concept: component.concept,
          category: component.category,
          replacesComponentId: component.replacesComponentId,
        };
        if (ownIds.has(component.id)) {
          await tx.update(recipeComponents).set(row).where(eq(recipeComponents.id, component.id));
          await tx
            .delete(recipeComponentValues)
            .where(eq(recipeComponentValues.componentId, component.id));
        } else {
          await tx.insert(recipeComponents).values({ id: component.id, ...row });
        }
        await tx.insert(recipeComponentValues).values(
          component.kind === 'fixed'
            ? component.values.map(({ sizeId, amount }) => ({
                componentId: component.id,
                sizeId,
                amount,
              }))
            : component.values.map(({ sizeId, quantity }) => ({
                componentId: component.id,
                sizeId,
                quantity,
              })),
        );
      }
    });
  }

  /**
   * Escritura de un producto existente: bloqueo de catálogo, fila `FOR UPDATE`, versión esperada,
   * cambio validado por el dominio y versión + 1, todo en una transacción.
   */
  private write(
    id: string,
    version: number,
    extraArticleIds: readonly string[],
    apply: (tx: Database, loaded: LoadedCatalog, current: PersistedProduct) => Promise<void>,
  ): Promise<ProductDetail> {
    return catalogWrite(this.db, async (tx) => {
      const [row] = await tx
        .select({ version: products.version })
        .from(products)
        .where(eq(products.id, id))
        .for('update');
      if (!row) throw notFound();
      if (row.version !== version) throw changed();
      const loaded = await loadProductCatalog(tx, extraArticleIds);
      const current = loaded.catalog.products.find((product) => product.id === id)!;
      await apply(tx, loaded, current);
      await tx
        .update(products)
        .set({ version: row.version + 1 })
        .where(eq(products.id, id));
      return this.detail(id, tx);
    });
  }
}

function checkCatalog(
  before: Parameters<typeof assertNewReferencesActive>[0],
  after: Parameters<typeof assertNewReferencesActive>[1],
  next: ProductCatalog,
): void {
  runDomainRule(ProductError, () => {
    validateProductCatalog(next);
    assertNewReferencesActive(before, after, next);
  });
}

function ownComponents(catalog: ProductCatalog, productId: string): PersistedComponent[] {
  return catalog.components.filter((component) => component.productId === productId);
}

function replaceProduct(catalog: ProductCatalog, product: PersistedProduct): ProductCatalog {
  return {
    ...catalog,
    products: catalog.products.map((candidate) =>
      candidate.id === product.id ? product : candidate,
    ),
  };
}

async function writeOffer(tx: Database, product: PersistedProduct): Promise<void> {
  await tx.delete(productSizes).where(eq(productSizes.productId, product.id));
  if (product.sizeOffer.mode === 'explicit') {
    await tx
      .insert(productSizes)
      .values(product.sizeOffer.sizeIds.map((sizeId) => ({ productId: product.id, sizeId })));
  }
}

function sizeOfferView(product: PersistedProduct): ProductDetail['sizeOffer'] {
  return product.sizeOffer.mode === 'explicit'
    ? { mode: 'explicit', sizeIds: [...product.sizeOffer.sizeIds] }
    : { mode: 'inherit' };
}

function componentName(component: PersistedComponent, loaded: LoadedCatalog): string {
  if (component.concept !== null) return component.concept;
  return component.kind === 'article'
    ? (loaded.articleInfo.get(component.articleId)?.name ?? '')
    : '';
}

function componentView(component: PersistedComponent, loaded: LoadedCatalog): RecipeComponentView {
  const article =
    component.kind === 'article' ? loaded.articleInfo.get(component.articleId) : undefined;
  const variant =
    component.kind === 'article' && component.variantId !== null
      ? loaded.variantInfo.get(component.variantId)
      : undefined;
  return {
    id: component.id,
    productId: component.productId,
    kind: component.kind,
    category: component.category,
    name: componentName(component, loaded),
    concept: component.concept,
    articleId: component.kind === 'article' ? component.articleId : null,
    articleName: article?.name ?? null,
    articleActive: article?.active ?? null,
    stockUnit: article?.stockUnit ?? null,
    variantId: component.kind === 'article' ? component.variantId : null,
    variantSku: variant?.sku ?? null,
    variantActive: variant?.active ?? null,
    attributeFilter: component.kind === 'article' ? { ...component.attributeFilter } : {},
    variantSize: component.kind === 'article' ? component.variantSize : null,
    replacesComponentId: component.replacesComponentId,
    values: component.values.map((value) => ({
      sizeId: value.sizeId,
      quantity: 'quantity' in value ? value.quantity : null,
      amount: 'amount' in value ? value.amount : null,
    })),
  };
}
