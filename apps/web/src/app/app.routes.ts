import type { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { Shell } from './core/shell/shell';
import { NAV_ITEMS } from './core/navigation';

/** Pantallas con historia implementada; el resto muestra la página provisional. */
const IMPLEMENTED = ['inicio', 'tipos-de-articulo', 'socios'];

const pendingRoutes: Routes = NAV_ITEMS.filter((item) => !IMPLEMENTED.includes(item.path)).map(
  (item) => ({
    path: item.path,
    title: `${item.label} · Moss & Roots`,
    loadComponent: () => import('./pages/pending-page').then((m) => m.PendingPage),
    data: { title: item.label, story: item.story },
  }),
);

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Moss & Roots',
    loadComponent: () => import('./pages/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Dashboard · Moss & Roots',
        loadComponent: () => import('./pages/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'tipos-de-articulo',
        title: 'Tipos de artículo · Moss & Roots',
        loadComponent: () =>
          import('./catalog/article-types/article-types-page').then((m) => m.ArticleTypesPage),
      },
      {
        path: 'socios',
        title: 'Socios · Moss & Roots',
        loadComponent: () => import('./partners/partners-page').then((m) => m.PartnersPage),
      },
      ...pendingRoutes,
      {
        path: 'mas',
        title: 'Más · Moss & Roots',
        loadComponent: () => import('./pages/more-page').then((m) => m.MorePage),
      },
      { path: '**', redirectTo: 'inicio' },
    ],
  },
];
