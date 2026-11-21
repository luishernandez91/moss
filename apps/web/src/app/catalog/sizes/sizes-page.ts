import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { Size } from '@moss/contracts';
import { SizesApi } from './sizes-api';
import { SizeDialog } from './size-dialog';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { apiErrorMessage } from '../../core/api-error';
@Component({
  selector: 'app-sizes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './sizes-page.html',
  styleUrl: './sizes-page.scss',
})
export class SizesPage {
  private readonly api = inject(SizesApi);
  private readonly dialog = inject(MatDialog);
  protected readonly sizes = this.api.list();
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly apiErrorMessage = apiErrorMessage;
  protected async edit(size: Size | null = null) {
    const saved = await firstValueFrom(
      this.dialog
        .open(SizeDialog, {
          data: size,
          width: 'min(480px, calc(100vw - 32px))',
          maxWidth: '100vw',
        })
        .afterClosed(),
    );
    if (saved) this.sizes.reload();
  }
  protected async remove(size: Size) {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Borrar tamaño',
            message: `¿Borrar «${size.label}»? Si está en uso, puedes desactivarlo.`,
            confirm: 'Borrar',
          },
          width: 'min(480px, calc(100vw - 32px))',
        })
        .afterClosed(),
    );
    if (confirmed) await this.run(() => this.api.remove(size.id));
  }
  protected toggle(size: Size) {
    return this.run(() => this.api.update(size.id, { active: !size.active }));
  }
  protected move(index: number, offset: number) {
    const ids = this.sizes.value().map((s) => s.id);
    const other = index + offset;
    if (other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    return this.run(() => this.api.order(ids));
  }
  private async run(action: () => Promise<unknown>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.sizes.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
