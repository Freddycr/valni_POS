import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OverdueInstallmentAlert, Store, User, View, Warehouse } from '../types';
import {
  getActiveWarehouseId,
  getOverdueInstallmentAlerts,
  getWarehouses,
  setActiveWarehouseId as persistActiveWarehouseId
} from '../services/api';

interface AppTopbarProps {
  user: User;
  stores: Store[];
  activeStoreId: string;
  onChangeStore: (storeId: string) => void;
  currentView: View;
  onNavigate: (view: View) => void;
  onOpenMobileSidebar: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
}

const VIEW_LABELS: Record<View, string> = {
  login: 'Inicio de Sesion',
  sales: 'POS',
  reports: 'Panel Comercial (Reportes)',
  dailyReport: 'Reporte Diario',
  users: 'Usuarios',
  whatsapp: 'Clientes',
  paymentMethods: 'Configuracion',
  products: 'Productos',
  brands: 'Productos',
  models: 'Productos',
  configuration: 'Configuracion',
  purchaseOrders: 'Compras',
  inventory: 'Inventario',
  lifecycle: 'Trazabilidad',
  credits: 'Creditos',
  advances: 'Adelantos',
};

const SEARCH_VIEWS: Array<{ view: View; title: string; subtitle: string }> = [
  { view: 'sales', title: 'POS', subtitle: 'Punto de venta' },
  { view: 'reports', title: 'Panel Comercial (Reportes)', subtitle: 'KPIs y tablero comercial' },
  { view: 'inventory', title: 'Inventario', subtitle: 'Stock, movimientos y ajustes' },
  { view: 'lifecycle', title: 'Trazabilidad', subtitle: 'Ciclo de vida de productos' },
  { view: 'purchaseOrders', title: 'Compras', subtitle: 'Pedidos y recepciones' },
  { view: 'products', title: 'Productos', subtitle: 'Productos, marcas y modelos' },
  { view: 'brands', title: 'Marcas', subtitle: 'Productos: marcas' },
  { view: 'models', title: 'Modelos', subtitle: 'Productos: modelos' },
  { view: 'credits', title: 'Creditos', subtitle: 'Gestion de creditos y cuotas' },
  { view: 'advances', title: 'Adelantos', subtitle: 'Reservas y pagos adelantados' },
  { view: 'dailyReport', title: 'Reporte Diario', subtitle: 'Resumen diario y exportables' },
  { view: 'users', title: 'Usuarios', subtitle: 'Accesos, roles y seguridad' },
  { view: 'paymentMethods', title: 'Metodos de pago', subtitle: 'Gestion de medios de cobro' },
  { view: 'configuration', title: 'Configuracion', subtitle: 'Empresa, metodos y series' },
];

const MENU_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const SIDEBAR_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M8 6v12M4 18h16" />
  </svg>
);

const SEARCH_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m2.35-5.65a8 8 0 11-16 0 8 8 0 0116 0z" />
  </svg>
);

const BELL_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V10a6 6 0 10-12 0v4.2c0 .53-.2 1.04-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
  </svg>
);

const AppTopbar: React.FC<AppTopbarProps> = ({
  user,
  stores,
  activeStoreId,
  onChangeStore,
  currentView,
  onNavigate,
  onOpenMobileSidebar,
  isSidebarCollapsed,
  onToggleSidebarCollapse,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeWarehouseId, setActiveWarehouseIdState] = useState<string>(() => getActiveWarehouseId() || '');
  const [warehouseOptions, setWarehouseOptions] = useState<Warehouse[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [overdueAlerts, setOverdueAlerts] = useState<OverdueInstallmentAlert[]>([]);
  const alertsRef = useRef<HTMLDivElement>(null);

  const isSellerRole = user.role === 'seller';
  const canSwitchStore = !isSellerRole;
  const showWarehouseSelector = canSwitchStore && ['inventory', 'purchaseOrders'].includes(currentView);
  const isInventoryOnlyRole = user.role === 'inventory_manager' || user.role === 'warehouse';
  const canAccessAdminSection = user.role === 'admin' || user.role === 'store_admin';

  const allowedViews = useMemo(() => {
    if (isInventoryOnlyRole) return new Set<View>(['inventory', 'lifecycle']);

    const baseViews = new Set<View>(['sales', 'reports', 'inventory', 'lifecycle', 'purchaseOrders', 'products', 'credits', 'advances', 'dailyReport']);
    if (canAccessAdminSection) {
      baseViews.add('users');
      baseViews.add('brands');
      baseViews.add('models');
      baseViews.add('paymentMethods');
      baseViews.add('configuration');
    }
    return baseViews;
  }, [canAccessAdminSection, isInventoryOnlyRole]);

  const filteredViews = useMemo(() => {
    const allowedList = SEARCH_VIEWS.filter(item => allowedViews.has(item.view));
    if (!searchTerm.trim()) return allowedList;
    const query = searchTerm.trim().toLowerCase();
    return allowedList.filter(item =>
      item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query),
    );
  }, [allowedViews, searchTerm]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) {
      setSearchTerm('');
    }
  }, [paletteOpen]);

  useEffect(() => {
    persistActiveWarehouseId(activeWarehouseId || null);
  }, [activeWarehouseId]);

  useEffect(() => {
    let mounted = true;
    const loadWarehouses = async () => {
      if (!showWarehouseSelector) {
        if (mounted) {
          setWarehouseOptions([]);
          setActiveWarehouseIdState('');
        }
        return;
      }

      try {
        const data = await getWarehouses({ storeId: activeStoreId || null, activeOnly: true });
        if (!mounted) return;
        setWarehouseOptions(data);
        if (data.length === 0) {
          setActiveWarehouseIdState('');
          return;
        }
        if (activeWarehouseId && data.some(warehouse => warehouse.id === activeWarehouseId)) {
          return;
        }
        setActiveWarehouseIdState(data[0].id);
      } catch {
        if (!mounted) return;
        setWarehouseOptions([]);
        setActiveWarehouseIdState('');
      }
    };

    loadWarehouses();
    return () => { mounted = false; };
  }, [activeStoreId, showWarehouseSelector]);

  useEffect(() => {
    let mounted = true;
    const loadAlerts = async () => {
      setAlertsLoading(true);
      try {
        const data = await getOverdueInstallmentAlerts({
          storeId: activeStoreId || null,
          consolidated: false,
          limit: 20
        });
        if (mounted) {
          setOverdueAlerts(data);
        }
      } catch {
        if (mounted) {
          setOverdueAlerts([]);
        }
      } finally {
        if (mounted) {
          setAlertsLoading(false);
        }
      }
    };

    loadAlerts();
    const intervalId = window.setInterval(loadAlerts, 120000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeStoreId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!alertsRef.current) return;
      if (!alertsRef.current.contains(event.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const viewLabel = VIEW_LABELS[currentView] || 'Panel';
  const activeStoreName = stores.find(store => store.id === activeStoreId)?.name || 'Sin tienda';
  const alertsCount = overdueAlerts.length;
  const canOpenCreditsFromAlert = allowedViews.has('credits');
  const formatMoney = (amount: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(amount || 0));

  const openOverdueCredits = () => {
    if (!canOpenCreditsFromAlert) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('valni_credits_quick_filter', 'overdue');
      window.dispatchEvent(new CustomEvent('valni:credits-quick-filter', { detail: { filter: 'overdue' } }));
    }
    onNavigate('credits');
    setAlertsOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenMobileSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 lg:hidden"
              aria-label="Abrir menu"
            >
              {MENU_ICON}
            </button>
            <button
              onClick={onToggleSidebarCollapse}
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 lg:inline-flex"
              aria-label="Colapsar sidebar"
            >
              {SIDEBAR_ICON}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0ea5a0]">VALNI POS ERP</p>
              <p className="text-sm font-semibold text-slate-800">{viewLabel}</p>
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              className="ml-auto hidden min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-600 transition-colors hover:border-[#0ea5a0]/70 hover:text-slate-900 md:inline-flex"
            >
              {SEARCH_ICON}
              <span>Buscador global</span>
              <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">Ctrl + K</span>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 md:hidden"
              aria-label="Buscar"
            >
              {SEARCH_ICON}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canSwitchStore ? (
              <select
                value={activeStoreId || stores[0]?.id || ''}
                onChange={event => onChangeStore(event.target.value)}
                className="input-style !h-12 !w-full !max-w-[250px] !py-0 !text-sm"
              >
                {stores.length === 0 && <option value="">Sin tiendas disponibles</option>}
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} {store.type === 'warehouse' ? '· Almacen' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="inline-flex h-12 w-full max-w-[250px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                Tienda: {activeStoreName}
              </div>
            )}

            {showWarehouseSelector && (
              <select
                value={activeWarehouseId}
                onChange={event => setActiveWarehouseIdState(event.target.value)}
                className="input-style !h-12 !w-full !max-w-[250px] !py-0 !text-sm"
                disabled={warehouseOptions.length === 0}
              >
                <option value="">Seleccionar almacen</option>
                {warehouseOptions.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            )}

            <div ref={alertsRef} className="relative ml-auto">
              <button
                onClick={() => setAlertsOpen(prev => !prev)}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-700 transition-colors hover:border-[#0ea5a0]/70 hover:text-slate-900"
                title="Alertas de cuotas vencidas"
              >
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  {BELL_ICON}
                  <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ${alertsCount > 0 ? 'bg-red-500' : 'bg-[#3bc993]'}`} />
                </span>
                {alertsCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {alertsCount > 99 ? '99+' : alertsCount}
                  </span>
                )}
              </button>

              {alertsOpen && (
                <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Cuotas Vencidas</p>
                    <span className="text-[11px] font-semibold text-slate-500">{alertsCount} alerta(s)</span>
                  </div>
                  {canOpenCreditsFromAlert && (
                    <button
                      onClick={openOverdueCredits}
                      className="mb-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      Ir a Créditos Vencidos
                    </button>
                  )}
                  {alertsLoading ? (
                    <p className="py-4 text-center text-xs text-slate-500">Cargando alertas...</p>
                  ) : overdueAlerts.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500">Sin cuotas vencidas.</p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                      {overdueAlerts.map(alert => (
                        <div key={alert.installmentId} className="rounded-xl border border-red-100 bg-red-50/70 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-bold text-slate-900">{alert.customerName}</p>
                            <span className="text-[10px] font-bold uppercase text-red-700">
                              {alert.overdueDays}d vencida
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">
                            Vence: {alert.dueDate} · Pendiente: {formatMoney(alert.amountDue)}
                          </p>
                          {alert.saleNumber && (
                            <p className="text-[10px] text-slate-500">Comprobante: {alert.saleNumber}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs uppercase tracking-wide text-slate-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#3bc993]/20 font-bold text-[#7ad7b7]">
                {user.fullName.charAt(0)}
              </span>
              <span>{user.role}</span>
              <span className="hidden text-slate-500 xl:inline">{isSidebarCollapsed ? 'Sidebar compacto' : 'Sidebar expandido'}</span>
            </div>
          </div>
        </div>
      </header>

      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-24 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_30px_70px_rgba(15,23,42,0.18)]">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3">
              {SEARCH_ICON}
              <input
                autoFocus
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Ir a POS, Inventario, Reportes..."
                className="h-12 w-full bg-transparent text-sm text-slate-800 outline-none"
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {filteredViews.map(item => (
                <button
                  key={item.view}
                  onClick={() => {
                    onNavigate(item.view);
                    setPaletteOpen(false);
                  }}
                  className="w-full rounded-xl border border-transparent bg-slate-50 px-3 py-3 text-left transition-colors hover:border-[#0ea5a0]/40 hover:bg-[#0ea5a0]/8"
                >
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-400">{item.subtitle}</p>
                </button>
              ))}
              {filteredViews.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-sm text-slate-400">
                  Sin coincidencias
                </p>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setPaletteOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-wide text-slate-300 hover:border-white/30 hover:text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AppTopbar;
