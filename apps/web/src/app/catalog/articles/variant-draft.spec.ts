import { readVariantDraft } from './variant-draft';
import { EMPTY_VARIANT } from './variant-fields';
describe('captura de tamaño', () => {
  const draft = { ...EMPTY_VARIANT, sku: 'S', averageCost: '10', stock: '1' };
  it('exige tamaño usando dominio y lo manda como dimensión de la variante', () => {
    expect(readVariantDraft([], draft, true).variant).toBeNull();
    const result = readVariantDraft([], { ...draft, sizeId: 'small' }, true);
    expect(result.variant).toMatchObject({ sizeId: 'small', attributes: {} });
    expect(readVariantDraft([], { ...draft, sizeId: 'small' }, false).variant).toBeNull();
  });
});
