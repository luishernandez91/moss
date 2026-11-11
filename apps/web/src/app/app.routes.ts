import type { Routes } from '@angular/router';
import { NAV_ITEMS } from './core/navigation';

const pendingRoutes: Routes = NAV_ITEMS.filter((item) => item.path !== 'inicio').map((item) => ({
  path: item.path,
  title: `${item.label} · Moss & Roots`,
  loadComponent: () => import('./pages/pending-page').then((m) => m.PendingPage),
  data: { title: item.label, story: item.story },
}));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'inicio',
    title: 'Dashboard · Moss & Roots',
    loadComponent: () => import('./pages/dashboard-page').then((m) => m.DashboardPage),
  },
  ...pendingRoutes,
  {
    path: 'mas',
    title: 'Más · Moss & Roots',
    loadComponent: () => import('./pages/more-page').then((m) => m.MorePage),
  },
  { path: '**', redirectTo: 'inicio' },
];
