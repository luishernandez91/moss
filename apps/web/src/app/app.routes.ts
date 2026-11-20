import type { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { Shell } from './core/shell/shell';
import { NAV_ITEMS } from './core/navigation';

/** Pantallas con historia implementada; el resto muestra la página provisional. */
const IMPLEMENTED = ['inicio', 'tipos-de-articulo', 'catalogo', 'socios', 'configuracion', 'campanas'];

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
        path: 'campanas',
        title: 'Campañas · Moss & Roots',
        loadComponent: () => import('./campaigns/campaigns-page').then((m) => m.CampaignsPage),
      },
      {
        path: 'inicio',
        title: 'Dashboard · Moss & Roots',
        loadComponent: () => import('./pages/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'catalogo',
        title: 'Catálogo · Moss & Roots',
        loadComponent: () => import('./catalog/articles/articles-page').then((m) => m.ArticlesPage),
      },
      {
        path: 'catalogo/:id',
        title: 'Artículo · Moss & Roots',
        loadComponent: () =>
          import('./catalog/articles/article-detail-page').then((m) => m.ArticleDetailPage),
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
      { path: 'configuracion', pathMatch: 'full', redirectTo: 'configuracion/tamanos' },
      {
        path: 'configuracion/tamanos',
        title: 'Tamaños · Moss & Roots',
        loadComponent: () => import('./catalog/sizes/sizes-page').then((m) => m.SizesPage),
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
