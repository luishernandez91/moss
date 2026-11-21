import { TestBed } from '@angular/core/testing';
import { VariantFields, EMPTY_VARIANT } from './variant-fields';
describe('VariantFields tamaño', () => {
  it('solo muestra selector cuando aplica y conserva un tamaño desactivado existente', async () => {
    TestBed.configureTestingModule({ imports: [VariantFields] });
    const f = TestBed.createComponent(VariantFields);
    f.componentRef.setInput('definitions', []);
    f.componentRef.setInput('unit', 'piece');
    f.componentRef.setInput('draft', EMPTY_VARIANT);
    f.componentRef.setInput('sizes', [
      { id: 'a', label: 'Activo', active: true },
      { id: 'b', label: 'Anterior', active: false },
      { id: 'c', label: 'Otro', active: false },
    ]);
    TestBed.tick();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('select[aria-label="Tamaño"]')).toBeNull();
    f.componentRef.setInput('usesSize', true);
    f.componentRef.setInput('currentSizeId', 'b');
    f.componentRef.setInput('draft', { ...EMPTY_VARIANT, sizeId: 'b' });
    TestBed.tick();
    await f.whenStable();
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Tamaño"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'a', 'b']);
    expect(select.value).toBe('b');
  });
});
