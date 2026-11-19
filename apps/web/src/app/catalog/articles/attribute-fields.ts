import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  buildAttributesSchema,
  type AttributeDefinitionForValues,
  type AttributeValues,
} from '@moss/contracts';

export type AttributeFieldDefinition = AttributeDefinitionForValues & { unit?: string | null };

/**
 * Valida valores capturados con el esquema de contracts (el mismo que usa la API). Los campos
 * vacíos se omiten. Devuelve los valores listos para enviar o los errores por clave.
 */
export function validateAttributeValues(
  definitions: readonly AttributeDefinitionForValues[],
  scope: 'fixed' | 'variant',
  raw: Readonly<Record<string, unknown>>,
): { values: AttributeValues | null; errors: Record<string, string> } {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim() === '') &&
        !(typeof value === 'number' && Number.isNaN(value)),
    ),
  );
  const parsed = buildAttributesSchema(definitions, scope).safeParse(cleaned);
  if (parsed.success) return { values: parsed.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? ('keys' in issue ? issue.keys[0] : ''));
    errors[key] ??= issue.message;
  }
  return { values: null, errors };
}

/** Campos de atributo construidos a partir de las definiciones de C1 (pantallas 4 y 5). */
@Component({
  selector: 'app-attribute-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatSlideToggleModule],
  template: `
    @for (definition of fields(); track definition.key) {
      @switch (definition.dataType) {
        @case ('boolean') {
          <mat-slide-toggle
            class="toggle"
            [checked]="values()[definition.key] === true"
            [aria-label]="definition.name"
            (change)="set(definition.key, $event.checked)"
          >
            {{ definition.name }}
          </mat-slide-toggle>
        }
        @case ('list') {
          <mat-form-field appearance="outline">
            <mat-label>{{ definition.name }}</mat-label>
            <select
              matNativeControl
              [attr.aria-label]="definition.name"
              [value]="values()[definition.key] ?? ''"
              (change)="set(definition.key, $any($event.target).value || undefined)"
            >
              <option value="">{{ definition.required ? 'Elige una opción' : 'Sin valor' }}</option>
              @for (option of definition.options; track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
            @if (errors()[definition.key]; as error) {
              <mat-error>{{ error }}</mat-error>
            }
          </mat-form-field>
        }
        @default {
          <mat-form-field appearance="outline">
            <mat-label>{{ definition.name }}</mat-label>
            <input
              matInput
              [type]="definition.dataType === 'number' ? 'number' : 'text'"
              [attr.aria-label]="definition.name"
              [value]="values()[definition.key] ?? ''"
              (input)="setInput(definition, $any($event.target).value)"
            />
            @if (definition.unit) {
              <span matTextSuffix>{{ definition.unit }}</span>
            }
            @if (errors()[definition.key]; as error) {
              <span class="error" role="alert">{{ error }}</span>
            }
          </mat-form-field>
        }
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 4px;
    }
    mat-form-field {
      width: 100%;
    }
    .toggle {
      margin: 4px 0 12px;
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class AttributeFields {
  readonly definitions = input.required<readonly AttributeFieldDefinition[]>();
  readonly scope = input.required<'fixed' | 'variant'>();
  readonly values = model.required<Record<string, unknown>>();
  readonly errors = input<Record<string, string>>({});

  /** Atributos del alcance; los inactivos solo si ya tienen valor. */
  protected readonly fields = computed(() =>
    this.definitions().filter(
      (definition) =>
        definition.definesVariant === (this.scope() === 'variant') &&
        (definition.active || this.values()[definition.key] !== undefined),
    ),
  );

  protected set(key: string, value: unknown): void {
    this.values.update((values) => ({ ...values, [key]: value }));
  }

  protected setInput(definition: AttributeFieldDefinition, raw: string): void {
    this.set(
      definition.key,
      definition.dataType === 'number' ? (raw === '' ? undefined : Number(raw)) : raw,
    );
  }
}
