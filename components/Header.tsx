
import React from 'react';
import { User, View } from '../types';

interface HeaderProps {
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
}> = ({ label, view, currentView, onClick }) => (
  <button
    onClick={() => onClick(view)}
    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      currentView === view
        ? 'bg-blue-600 text-white'
        : 'text-white hover:bg-blue-500 hover:bg-opacity-75'
    }`}
  >
    {label}
  </button>
);

const Header: React.FC<HeaderProps> = ({ user, onNavigate, onLogout, currentView }) => {
  return (
    <header className="bg-blue-700 shadow-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
             <div className="flex-shrink-0 text-white font-bold text-xl">
                TiendaCel
             </div>
            <nav className="hidden md:flex md:space-x-4">
                <NavLink label="Registrar Venta" view="sales" currentView={currentView} onClick={onNavigate} />
                <NavLink label="Reportes" view="reports" currentView={currentView} onClick={onNavigate} />
                {user.role === 'Admin' && (
                    <NavLink label="Usuarios" view="users" currentView={currentView} onClick={onNavigate} />
                )}
                 <NavLink label="WhatsApp" view="whatsapp" currentView={currentView} onClick={onNavigate} />
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-white text-sm hidden sm:block">
              Bienvenido, {user.fullName} ({user.role})
            </span>
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
