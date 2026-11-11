export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  /** Historia del backlog que implementa la pantalla. */
  readonly story: string;
}

/** Pantallas del MVP en el orden de la barra lateral. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: 'inicio', label: 'Dashboard', icon: 'dashboard', story: 'S3' },
  { path: 'campanas', label: 'Campañas', icon: 'event_note', story: 'K1' },
  { path: 'vender', label: 'Venta rápida', icon: 'point_of_sale', story: 'K6' },
  { path: 'catalogo', label: 'Catálogo', icon: 'inventory_2', story: 'C2' },
  { path: 'tipos-de-articulo', label: 'Tipos de artículo', icon: 'category', story: 'C1' },
  { path: 'productos', label: 'Productos', icon: 'spa', story: 'C4' },
  { path: 'extras', label: 'Extras', icon: 'redeem', story: 'C5' },
  { path: 'socios', label: 'Socios', icon: 'groups', story: 'S1' },
  { path: 'configuracion', label: 'Configuración', icon: 'settings', story: 'S2' },
];

/** Accesos de la barra inferior en celular; el resto vive en "Más". */
export const MOBILE_TABS: readonly string[] = ['inicio', 'campanas', 'vender', 'catalogo'];
