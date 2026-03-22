import React from 'react';
import { Store, User, View } from '../types';

interface ResponsiveSidebarProps {
  user: User;
  stores: Store[];
  activeStoreId: string;
  onChangeStore: (storeId: string) => void;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  currentView: View;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const iconClasses = 'h-5 w-5';

const icon = (path: string) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={iconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const NAV_ICON = {
  sales: icon('M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2 2m2-2l-1.6-8M17 17a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'),
  reports: icon('M5 3v18m7-10v10m7-14v14'),
  inventory: icon('M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10'),
  lifecycle: icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'),
  purchaseOrders: icon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 004 0M9 5a2 2 0 012-2h2a2 2 0 012 2'),
  products: icon('M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v11a2 2 0 002 2h10a2 2 0 002-2V8'),
  credits: icon('M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8V7m0 9v1m0-1c-1.11 0-2.08-.4-2.6-1M14.6 9c-.52-.6-1.49-1-2.6-1m9 4a9 9 0 11-18 0 9 9 0 0118 0z'),
  advances: icon('M17 9V7a5 5 0 00-10 0v2M5 9h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2m7 4h.01M12 13a2 2 0 00-2 2v1a2 2 0 104 0v-1a2 2 0 00-2-2z'),
  dailyReport: icon('M9 17v-6m3 6V7m3 10v-3m3 3h-3a2 2 0 01-2-2V5a2 2 0 012-2h3a2 2 0 012 2v10a2 2 0 01-2 2zM3 17h3a2 2 0 002-2v-4a2 2 0 00-2-2H3a2 2 0 00-2 2v4a2 2 0 002 2z'),
  users: icon('M16 7a4 4 0 11-8 0 4 4 0 018 0zm5 14a9 9 0 00-18 0'),
  configuration: icon('M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.3 2.3a1.7 1.7 0 001.1 2.6c1.7.4 1.7 2.9 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.8 3.3-2.3 2.3a1.7 1.7 0 00-2.6 1.1c-.4 1.7-2.9 1.7-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.3-.8-2.3-2.3a1.7 1.7 0 00-1.1-2.6c-1.7-.4-1.7-2.9 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.8-3.3 2.3-2.3a1.7 1.7 0 002.6-1.1z'),
  paymentMethods: icon('M3 10h18M7 15h2m3 0h5M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z'),
  brands: icon('M5 6h14M5 10h14M5 14h14M5 18h14'),
  models: icon('M4 7h16M4 12h10M4 17h16'),
};

const LOGOUT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className={iconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H8m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h5a3 3 0 013 3v1" />
  </svg>
);

type SectionItem = {
  label: string;
  view: View;
  icon: React.ReactNode;
};

const MAIN_ITEMS: SectionItem[] = [
  { label: 'POS', view: 'sales', icon: NAV_ICON.sales },
  { label: 'Panel Comercial (Reportes)', view: 'reports', icon: NAV_ICON.reports },
  { label: 'Reporte Diario', view: 'dailyReport', icon: NAV_ICON.dailyReport },
  { label: 'Inventario', view: 'inventory', icon: NAV_ICON.inventory },
  { label: 'Compras', view: 'purchaseOrders', icon: NAV_ICON.purchaseOrders },
  { label: 'Productos', view: 'products', icon: NAV_ICON.products },
  { label: 'Creditos', view: 'credits', icon: NAV_ICON.credits },
  { label: 'Adelantos', view: 'advances', icon: NAV_ICON.advances },
];

const ADMIN_ITEMS: SectionItem[] = [
  { label: 'Marcas', view: 'brands', icon: NAV_ICON.brands },
  { label: 'Modelos', view: 'models', icon: NAV_ICON.models },
  { label: 'Metodos Pago', view: 'paymentMethods', icon: NAV_ICON.paymentMethods },
  { label: 'Usuarios', view: 'users', icon: NAV_ICON.users },
  { label: 'Configuracion', view: 'configuration', icon: NAV_ICON.configuration },
];

const NavButton = ({
  label,
  view,
  iconNode,
  isActive,
  collapsed,
  onClick,
}: {
  label: string;
  view: View;
  iconNode: React.ReactNode;
  isActive: boolean;
  collapsed: boolean;
  onClick: (view: View) => void;
}) => (
  <button
    onClick={() => onClick(view)}
    className={[
      'group flex w-full items-center rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all',
      isActive
        ? 'border-[#0ea5a0]/40 bg-[#0ea5a0]/12 text-slate-900 shadow-[0_8px_24px_rgba(14,165,160,0.18)]'
        : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900',
      collapsed ? 'justify-center px-2' : '',
    ].join(' ')}
    title={collapsed ? label : undefined}
  >
    <span className={isActive ? 'text-[#0b8f8b]' : 'text-[#0ea5a0] group-hover:text-[#0b8f8b]'}>{iconNode}</span>
    {!collapsed && <span className="ml-3 truncate">{label}</span>}
  </button>
);

const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({
  user,
  stores,
  activeStoreId,
  onChangeStore,
  onNavigate,
  onLogout,
  currentView,
  isCollapsed,
  isMobileOpen,
  onMobileClose,
}) => {
  const isInventoryOnlyRole = user.role === 'inventory_manager' || user.role === 'warehouse';
  const canSwitchStore = user.role !== 'seller';
  const canAccessAdminSection = user.role === 'admin' || user.role === 'store_admin';

  const visibleMainItems = isInventoryOnlyRole
    ? MAIN_ITEMS.filter(item => item.view === 'inventory' || item.view === 'lifecycle')
    : MAIN_ITEMS;

  return (
    <>
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-[#f7fbff]/95 p-4 text-slate-900 shadow-xl backdrop-blur-xl transition-all duration-300',
          isCollapsed ? 'w-24' : 'w-72',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
      >
        <div className={['mb-6 flex items-center', isCollapsed ? 'justify-center' : 'gap-3'].join(' ')}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0ea5a0] to-[#3b82f6] text-lg font-black text-white shadow-[0_10px_22px_rgba(14,165,160,0.35)]">
            V
          </div>
          {!isCollapsed && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0ea5a0]">ERP Suite</p>
              <h1 className="font-title text-xl font-semibold text-slate-900">VALNI</h1>
            </div>
          )}
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto pr-1">
          {!isCollapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Modulos</p>}
          <div className="space-y-1">
            {visibleMainItems.map(item => (
              <NavButton
                key={item.view}
                label={item.label}
                view={item.view}
                iconNode={item.icon}
                isActive={currentView === item.view}
                collapsed={isCollapsed}
                onClick={view => {
                  onNavigate(view);
                  onMobileClose();
                }}
              />
            ))}
          </div>

          {canAccessAdminSection && (
            <div className="mt-6 border-t border-white/10 pt-4">
              {!isCollapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Seguridad</p>}
              <div className="space-y-1">
                {ADMIN_ITEMS.map(item => (
                  <NavButton
                    key={item.view}
                    label={item.label}
                    view={item.view}
                    iconNode={item.icon}
                    isActive={currentView === item.view}
                    collapsed={isCollapsed}
                    onClick={view => {
                      onNavigate(view);
                      onMobileClose();
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          {!isCollapsed && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tienda activa</p>
              <select
                value={activeStoreId || stores[0]?.id || ''}
                onChange={event => onChangeStore(event.target.value)}
                className="input-style !h-11 !w-full !py-0 !text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={!canSwitchStore}
              >
                {stores.length === 0 && <option value="">Sin tiendas</option>}
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} {store.type === 'warehouse' ? '· Almacen' : ''}
                  </option>
                ))}
              </select>
              {!canSwitchStore && (
                <p className="mt-2 text-[10px] font-semibold text-slate-500">
                  Tu perfil usa tienda fija.
                </p>
              )}
            </div>
          )}

          <div className={['mb-3 flex items-center rounded-xl border border-slate-200 bg-white p-2', isCollapsed ? 'justify-center' : 'gap-2'].join(' ')}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0ea5a0]/14 text-sm font-bold text-[#0b8f8b]">
              {user.fullName.charAt(0)}
            </span>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">{user.role}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              onLogout();
              onMobileClose();
            }}
            className={[
              'flex w-full items-center rounded-xl border border-red-700 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700',
              isCollapsed ? 'justify-center' : 'justify-start',
            ].join(' ')}
            title={isCollapsed ? 'Cerrar sesion' : undefined}
          >
            {LOGOUT_ICON}
            {!isCollapsed && <span className="ml-2">Cerrar sesion</span>}
          </button>
        </div>
      </aside>

      {isMobileOpen && (
        <button
          aria-label="Cerrar menu lateral"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={onMobileClose}
        />
      )}
    </>
  );
};

export default ResponsiveSidebar;
