import * as React from 'react';
import { useState } from 'react';
import { User, View, Store } from '../types';



const NavLink = ({ label, view, currentView, onClick, icon }: {
  label: string,
  view: View,
  currentView: View,
  onClick: (view: View) => void,
  icon: React.ReactNode
}) => {
  const isActive = currentView === view;
  return (
    <button
      onClick={() => onClick(view)}
      className={`group flex items-center w-full px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive
        ? 'bg-[#11d483] text-[#0b0f1a] shadow-[0_4px_12px_rgba(17,212,131,0.3)]'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
    >
      <span className={`mr-3 transition-colors ${isActive ? 'text-[#0b0f1a]' : 'text-[#11d483]'}`}>{icon}</span>
      {label}
    </button>
  );
};

const SaleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const ReportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const InventoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 016-6h6a6 6 0 016 6v1h-3" />
  </svg>
);
const PaymentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);
const ProductIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);
const BrandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5 5 0 002.78 4.61l5.44 2.72a5 5 0 004.44 0l5.44-2.72A5 5 0 0021 15l-3-9m-3 9a5 5 0 00-4.44 0l-5.44 2.72A5 5 0 003 15l3-9m0 0l-3-9a5 5 0 012.78-4.61l5.44-2.72a5 5 0 014.44 0l5.44 2.72A5 5 0 0121 9l-3 9" />
  </svg>
);
const ModelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H7a2 2 0 00-2 2v2m7-7h.01" />
  </svg>
);

const ConfigIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const CreditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AdvanceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2m-2 0h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2zm7 5h.01M12 13a2 2 0 00-2 2v1a2 2 0 104 0v-1a2 2 0 00-2-2z" />
  </svg>
);

const PurchaseOrderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ResponsiveSidebar = ({ user, stores, activeStoreId, onChangeStore, onNavigate, onLogout, currentView }: {
  user: User,
  stores: Store[],
  activeStoreId: string,
  onChangeStore: (storeId: string) => void,
  onNavigate: (view: View) => void,
  onLogout: () => void,
  currentView: View
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isInventoryOnlyRole = user.role === 'inventory_manager' || user.role === 'warehouse';
  const canAccessAdminSection = user.role.toLowerCase() === 'admin' || user.role === 'store_admin';

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-xl bg-[#161c2d] border border-white/10 text-white lg:hidden shadow-lg"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 flex-shrink-0 bg-[#0b0f1a] border-r border-white/5 text-white flex flex-col p-6 transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex items-center space-x-3 mb-10 px-2">
          <div className="w-10 h-10 bg-[#11d483] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(17,212,131,0.4)]">
            <span className="text-[#0b0f1a] font-bold text-xl">V</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">VALNI ERP</h1>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
          {isInventoryOnlyRole ? (
            <NavLink label="Inventario" view="inventory" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<InventoryIcon />} />
          ) : (
            <>
              <div className="mb-4">
                <h3 className="px-4 mb-3 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">Principal</h3>
                <div className="space-y-1">
                  <NavLink label="Nueva Venta" view="sales" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<SaleIcon />} />
                  <NavLink label="Dashboard" view="reports" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<ReportIcon />} />
                  <NavLink label="Inventario" view="inventory" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<InventoryIcon />} />
                </div>
              </div>

              <div className="mb-4">
                <h3 className="px-4 mb-3 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">Operaciones</h3>
                <div className="space-y-1">
                  <NavLink label="Reporte Diario" view="dailyReport" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<ReportIcon />} />
                  <NavLink label="Créditos" view="credits" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<CreditIcon />} />
                  <NavLink label="Adelantos" view="advances" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<AdvanceIcon />} />
                  <NavLink label="Pedidos" view="purchaseOrders" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<PurchaseOrderIcon />} />
                  <NavLink label="WhatsApp Shop" view="whatsapp" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<WhatsAppIcon />} />
                </div>
              </div>

              {canAccessAdminSection && (
                <div className="pt-4 mt-6 border-t border-white/5">
                  <h3 className="px-4 mb-3 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">Sistema y Maestros</h3>
                  <div className="space-y-1">
                    <NavLink label="Usuarios" view="users" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<UserIcon />} />
                    <NavLink label="Catálogo" view="products" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<ProductIcon />} />
                    <NavLink label="Marcas" view="brands" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<BrandIcon />} />
                    <NavLink label="Modelos" view="models" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<ModelIcon />} />
                    <NavLink label="Métodos Pago" view="paymentMethods" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<PaymentIcon />} />
                    <NavLink label="Ajustes" view="configuration" currentView={currentView} onClick={(view) => { onNavigate(view); setIsOpen(false); }} icon={<ConfigIcon />} />
                  </div>
                </div>
              )}
            </>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          {stores.length > 0 && (
            <div className="mb-4 p-3 rounded-2xl bg-[#161c2d] border border-white/5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tienda Activa</label>
              <select
                value={activeStoreId || stores[0]?.id || ''}
                onChange={(e) => onChangeStore(e.target.value)}
                className="w-full bg-[#0b0f1a] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#11d483]/60"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} {store.type === 'warehouse' ? '· Almacén' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-3 p-3 rounded-2xl bg-[#161c2d] border border-white/5 mb-4">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
              {user.fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate text-white">{user.fullName}</p>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => { onLogout(); setIsOpen(false); }}
            className="flex items-center justify-center w-full px-4 py-3 text-sm font-bold rounded-xl transition-all duration-200 text-red-400 hover:bg-red-500/10 hover:text-red-300 group"
          >
            <span className="mr-3 transition-transform group-hover:scale-110"><LogoutIcon /></span>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Overlay para cerrar sidebar en móviles */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={toggleSidebar}
        ></div>
      )}
    </>
  );
};

export default ResponsiveSidebar;
