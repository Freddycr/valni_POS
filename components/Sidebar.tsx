import React from 'react';
import { User, View } from '../types';

interface SidebarProps {
  user: User;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  currentView: View;
}

const NavLink: React.FC<{
  label: string;
  view: View;
  currentView: View;
  onClick: (view: View) => void;
  icon: React.ReactNode;
}> = ({ label, view, currentView, onClick, icon }) => (
  <button
    onClick={() => onClick(view)}
    className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
      currentView === view
        ? 'bg-slate-900 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`}
  >
    <span className="mr-3">{icon}</span>
    {label}
  </button>
);

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

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ user, onNavigate, onLogout, currentView }) => {
  return (
    <aside className="w-64 flex-shrink-0 bg-slate-800 text-white flex flex-col p-4">
        <div className="flex items-center justify-center h-16 border-b border-slate-700">
            <h1 className="text-2xl font-bold text-white">Celular Pro</h1>
        </div>

        <nav className="flex-1 mt-6 space-y-2">
            <NavLink label="Nueva Venta" view="sales" currentView={currentView} onClick={onNavigate} icon={<SaleIcon />} />
            <NavLink label="Reportes" view="reports" currentView={currentView} onClick={onNavigate} icon={<ReportIcon />}/>
            <NavLink label="Inventario" view="inventory" currentView={currentView} onClick={onNavigate} icon={<InventoryIcon />}/>
            <NavLink label="Enviar WhatsApp" view="whatsapp" currentView={currentView} onClick={onNavigate} icon={<WhatsAppIcon />}/>
            {user.role === 'admin' && (
                <div className="pt-4 mt-4 border-t border-slate-700">
                  <h3 className="px-4 mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Administración</h3>
                  <div className="space-y-2">
                     <NavLink label="Usuarios" view="users" currentView={currentView} onClick={onNavigate} icon={<UserIcon />} />
                     <NavLink label="Métodos de Pago" view="paymentMethods" currentView={currentView} onClick={onNavigate} icon={<PaymentIcon />} />
                     <NavLink label="Productos" view="products" currentView={currentView} onClick={onNavigate} icon={<ProductIcon />} />
                     <NavLink label="Marcas" view="brands" currentView={currentView} onClick={onNavigate} icon={<BrandIcon />} />
                     <NavLink label="Modelos" view="models" currentView={currentView} onClick={onNavigate} icon={<ModelIcon />} />
                     <NavLink label="Configuración" view="configuration" currentView={currentView} onClick={onNavigate} icon={<ConfigIcon />} />
                  </div>
                </div>
            )}
        </nav>

        <div className="pt-4 border-t border-slate-700">
            <div className="p-2 rounded-lg bg-slate-700/50">
                <p className="text-sm font-semibold text-white">{user.fullName}</p>
                <p className="text-xs text-slate-400">{user.role}</p>
            </div>
             <button
              onClick={onLogout}
              className="flex items-center justify-center w-full mt-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors text-slate-300 hover:bg-red-600 hover:text-white"
            >
              <span className="mr-3"><LogoutIcon /></span>
              Cerrar Sesión
            </button>
        </div>
    </aside>
  );
};

export default Sidebar;
