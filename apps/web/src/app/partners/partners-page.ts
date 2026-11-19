import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { PartnersApi } from './partners-api';
import { PartnersDialog } from './partners-dialog';
import { apiErrorMessage } from '../core/api-error';
@Component({
  selector: 'app-partners-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './partners-page.html',
  styleUrl: './partners-page.scss',
})
export class PartnersPage {
  protected readonly api = inject(PartnersApi);
  private readonly dialog = inject(MatDialog);
  protected readonly apiErrorMessage = apiErrorMessage;
  protected edit(): void {
    if (!this.api.partners.hasValue()) return;
    const partners = this.api.partners.value();
    if (partners?.length !== 2) return;
    this.dialog.open(PartnersDialog, {
      data: partners,
      width: '600px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }
}
