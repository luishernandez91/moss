import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { NAV_ITEMS } from './core/navigation';

async function renderShell(desktop: boolean): Promise<string> {
  const observer: Pick<BreakpointObserver, 'observe'> = {
    observe: () => of({ matches: desktop, breakpoints: {} } satisfies BreakpointState),
  };
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [provideRouter([]), { provide: BreakpointObserver, useValue: observer }],
  }).compileComponents();
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('App', () => {
  it('en escritorio muestra todas las pantallas del MVP en la barra lateral', async () => {
    const text = await renderShell(true);
    for (const item of NAV_ITEMS) {
      expect(text).toContain(item.label);
    }
  });

  it('en celular muestra la barra inferior con Vender y Más', async () => {
    const text = await renderShell(false);
    for (const label of ['Inicio', 'Campañas', 'Vender', 'Catálogo', 'Más']) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain('Configuración');
  });
});
