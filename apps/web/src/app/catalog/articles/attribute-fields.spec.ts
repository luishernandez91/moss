import { TestBed } from '@angular/core/testing';
import type { AttributeDefinitionForValues } from '@moss/contracts';
import { AttributeFields, validateAttributeValues } from './attribute-fields';

const definitions: AttributeDefinitionForValues[] = [
  {
    key: 'material',
    name: 'Material',
    dataType: 'list',
    options: ['concreto', 'barro'],
    required: true,
    definesVariant: false,
    active: true,
  },
  {
    key: 'drenaje',
    name: 'Drenaje',
    dataType: 'boolean',
    options: null,
    required: false,
    definesVariant: false,
    active: true,
  },
  {
    key: 'codigo',
    name: 'Código',
    dataType: 'text',
    options: null,
    required: false,
    definesVariant: false,
    active: true,
  },
  {
    key: 'peso',
    name: 'Peso',
    dataType: 'number',
    options: null,
    required: false,
    definesVariant: false,
    active: true,
  },
  {
    key: 'diametro',
    name: 'Diámetro',
    dataType: 'number',
    options: null,
    required: true,
    definesVariant: true,
    active: true,
  },
];

describe('AttributeFields', () => {
  it('muestra un control por atributo del alcance según su tipo de dato', async () => {
    const fixture = TestBed.createComponent(AttributeFields);
    fixture.componentRef.setInput('definitions', definitions);
    fixture.componentRef.setInput('scope', 'fixed');
    fixture.componentRef.setInput('values', {});
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select[aria-label="Material"]')).not.toBeNull();
    expect(element.querySelector('[role="switch"][aria-label="Drenaje"]')).not.toBeNull();
    expect(element.querySelector('input[aria-label="Código"][type="text"]')).not.toBeNull();
    expect(element.querySelector('input[aria-label="Peso"][type="number"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Diámetro"]')).toBeNull();
  });

  it('valida con el esquema de contracts y devuelve errores por atributo', () => {
    expect(validateAttributeValues(definitions, 'fixed', { material: 'barro', peso: 2 })).toEqual({
      values: { material: 'barro', peso: 2 },
      errors: {},
    });
    const invalid = validateAttributeValues(definitions, 'fixed', { material: 'vidrio' });
    expect(invalid.values).toBeNull();
    expect(Object.keys(invalid.errors)).toEqual(['material']);
    // Un campo de texto vacío se omite en lugar de enviarse como valor vacío.
    expect(
      validateAttributeValues(definitions, 'fixed', { material: 'barro', codigo: '  ' }).values,
    ).toEqual({ material: 'barro' });
  });
});
