import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { stockUnitLabels, type StockUnit } from '@moss/contracts';
import { AttributeFields, type AttributeFieldDefinition } from './attribute-fields';

/** Lo que se captura de una variante, como texto en los campos de dinero y existencia. */
export interface VariantDraft {
  sku: string;
  attributes: Record<string, unknown>;
  averageCost: string;
  price: string;
  stock: string;
}

export const EMPTY_VARIANT: VariantDraft = {
  sku: '',
  attributes: {},
  averageCost: '',
  price: '',
  stock: '0',
};

/** SKU, atributos de variante, costo, precio y existencia; la unidad del artículo va como sufijo. */
@Component({
  selector: 'app-variant-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, AttributeFields],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>SKU</mat-label>
      <input
        matInput
        class="mono"
        [value]="draft().sku"
        (input)="patch({ sku: $any($event.target).value })"
      />
      @if (errors()['sku']; as error) {
        <span class="error" role="alert">{{ error }}</span>
      }
    </mat-form-field>
    <app-attribute-fields
      [definitions]="definitions()"
      scope="variant"
      [values]="draft().attributes"
      (valuesChange)="patch({ attributes: $event })"
      [errors]="attributeErrors()"
    />
    <div class="row">
      <mat-form-field appearance="outline">
        <mat-label>Costo promedio</mat-label>
        <span matTextPrefix>$&nbsp;</span>
        <input
          matInput
          inputmode="decimal"
          [value]="draft().averageCost"
          (input)="patch({ averageCost: $any($event.target).value })"
        />
        @if (unit() !== 'piece') {
          <span matTextSuffix>/{{ unitLabel() }}</span>
        }
        @if (errors()['averageCost']; as error) {
          <span class="error" role="alert">{{ error }}</span>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Precio (opcional)</mat-label>
        <span matTextPrefix>$&nbsp;</span>
        <input
          matInput
          inputmode="decimal"
          [value]="draft().price"
          (input)="patch({ price: $any($event.target).value })"
        />
        @if (errors()['price']; as error) {
          <span class="error" role="alert">{{ error }}</span>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Existencia</mat-label>
        <input
          matInput
          type="number"
          min="0"
          step="0.001"
          [value]="draft().stock"
          (input)="patch({ stock: $any($event.target).value })"
        />
        <span matTextSuffix>{{ unitLabel() }}</span>
        @if (errors()['stock']; as error) {
          <span class="error" role="alert">{{ error }}</span>
        }
      </mat-form-field>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 4px;
    }
    mat-form-field {
      width: 100%;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0 12px;
    }
    .mono {
      font-family: ui-monospace, monospace;
      text-transform: uppercase;
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class VariantFields {
  readonly definitions = input.required<readonly AttributeFieldDefinition[]>();
  readonly unit = input.required<StockUnit>();
  readonly draft = model.required<VariantDraft>();
  readonly errors = input<Record<string, string>>({});
  readonly attributeErrors = input<Record<string, string>>({});

  protected unitLabel(): string {
    return stockUnitLabels[this.unit()];
  }

  protected patch(change: Partial<VariantDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }
}
