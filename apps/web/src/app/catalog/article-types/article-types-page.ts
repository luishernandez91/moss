import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import type { ComponentType } from '@angular/cdk/portal';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { attributeDataTypeLabels, type ArticleType, type Attribute } from '@moss/contracts';
import { firstValueFrom, map } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { ConfirmDialog, type ConfirmDialogData } from '../../core/confirm-dialog';
import { ArticleTypesApi } from './article-types-api';
import { AttributeDialog, type AttributeDialogData } from './attribute-dialog';
import { TypeDialog, type TypeDialogData } from './type-dialog';

const DIALOG: MatDialogConfig = { width: 'min(520px, calc(100vw - 32px))', maxWidth: '100vw' };

/** Pantalla 3 · Tipos de artículo y atributos (C1). */
@Component({
  selector: 'app-article-types-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatSlideToggleModule],
  templateUrl: './article-types-page.html',
  styleUrl: './article-types-page.scss',
})
export class ArticleTypesPage {
  private readonly api = inject(ArticleTypesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly labels = attributeDataTypeLabels;
  protected readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((state) => state.matches)),
    { initialValue: true },
  );

  protected readonly types = this.api.types;
  protected readonly loadError = computed(() =>
    this.types.error() ? apiErrorMessage(this.types.error()) : '',
  );
  private readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed<ArticleType | undefined>(() => {
    const types = this.types.value();
    return types.find((type) => type.id === this.selectedId()) ?? types[0];
  });
  protected readonly variantSummary = computed(() => {
    const names = (this.selected()?.attributes ?? [])
      .filter((attribute) => attribute.active && attribute.definesVariant)
      .map((attribute) => attribute.name.toLowerCase());
    if (names.length === 0) return 'Ningún atributo define variante.';
    const verb = names.length === 1 ? 'atributo define' : 'atributos definen';
    return `${names.length} ${verb} variante: ${names.join(' × ')}.`;
  });

  protected activeCount(type: ArticleType): number {
    return type.attributes.filter((attribute) => attribute.active).length;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  /** Texto secundario de la tarjeta en celular. */
  protected detail(attribute: Attribute): string {
    switch (attribute.dataType) {
      case 'list':
        return attribute.options?.join(', ') ?? '';
      case 'number':
        return attribute.unit ? `En ${attribute.unit}` : 'Número';
      case 'boolean':
        return 'Sí o no';
      default:
        return 'Texto libre';
    }
  }

  protected async newType(): Promise<void> {
    const id = await this.open<TypeDialog, TypeDialogData, string>(TypeDialog, {});
    if (id) this.selectedId.set(id);
  }

  protected async renameType(type: ArticleType): Promise<void> {
    await this.open<TypeDialog, TypeDialogData, string>(TypeDialog, { type });
  }

  protected async deleteType(type: ArticleType): Promise<void> {
    const confirmed = await this.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      title: 'Borrar tipo',
      message: `Se borrará «${type.name}» con todos sus atributos.`,
      confirm: 'Borrar',
    });
    if (!confirmed) return;
    await this.run(() => this.api.deleteType(type.id));
    this.selectedId.set(null);
  }

  protected async editAttribute(typeId: string, attribute?: Attribute): Promise<void> {
    await this.open<AttributeDialog, AttributeDialogData, boolean>(AttributeDialog, {
      typeId,
      ...(attribute && { attribute }),
    });
  }

  protected toggleRequired(typeId: string, attribute: Attribute, required: boolean): Promise<void> {
    return this.run(() => this.api.updateAttribute(typeId, attribute.id, { required }));
  }

  /** Definir variante exige requerido: se envían juntos para que la regla de dominio se cumpla. */
  protected toggleVariant(
    typeId: string,
    attribute: Attribute,
    definesVariant: boolean,
  ): Promise<void> {
    return this.run(() =>
      this.api.updateAttribute(typeId, attribute.id, {
        definesVariant,
        ...(definesVariant && { required: true }),
      }),
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.snackBar.open(apiErrorMessage(error), 'Cerrar', { duration: 6000 });
      this.types.reload();
    }
  }

  private open<C, D, R>(component: ComponentType<C>, data: D): Promise<R | undefined> {
    return firstValueFrom(this.dialog.open<C, D, R>(component, { ...DIALOG, data }).afterClosed());
  }
}
