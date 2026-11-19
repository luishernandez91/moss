import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Material mueve el foco al primer campo del diálogo cuando termina la animación de apertura. Si
 * la prueba escribe antes, el foco cambia a mitad de un `fill` y el texto cae en otro campo. Esta
 * espera sincroniza con ese momento.
 */
export async function openedDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog').last();
  await expect(
    dialog.locator('input:focus, select:focus, button:focus, textarea:focus'),
  ).toHaveCount(1);
  return dialog;
}
