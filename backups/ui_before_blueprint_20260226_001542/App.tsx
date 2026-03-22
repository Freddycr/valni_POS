import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import { User, View, Store } from './types';
import LoginScreen from './components/SimpleLoginScreen';
import SalesForm from './components/SalesForm';
import ReportsScreen from './components/ReportsScreen';
import DailyReportScreen from './components/DailyReportScreen';
import UserManagementScreen from './components/UserManagementScreen';
import WhatsAppScreen from './components/WhatsAppScreen';
import ResponsiveSidebar from './components/ResponsiveSidebar';
import ConfigErrorScreen from './components/ConfigErrorScreen';
import PaymentMethodsScreen from './components/PaymentMethodsScreen';
import ProductManagementScreen from './components/ProductManagementScreen';
import BrandManagementScreen from './components/BrandManagementScreen';
import ModelManagementScreen from './components/ModelManagementScreen';
import ConfigurationScreen from './components/ConfigurationScreen';
import InventoryScreen from './components/InventoryScreen';
import PurchaseOrderManagementScreen from './components/PurchaseOrderManagementScreen';
import CreditManagementScreen from './components/CreditManagementScreen';
import AdvanceManagementScreen from './components/AdvanceManagementScreen';

// Error Boundary simple para capturar errores de renderizado
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-red-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">¡Ups! Algo salió mal</h1>
            <p className="text-slate-600 mb-4">La aplicación ha encontrado un error inesperado al renderizar el contenido.</p>
            <pre className="bg-slate-100 p-4 rounded text-xs text-red-500 overflow-auto max-h-40 mb-4">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-slate-800 text-white font-bold py-2 px-4 rounded hover:bg-slate-700"
            >
              Reiniciar Aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('sales');
  const [userStores, setUserStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isConfigValid] = useState(true);
  const isInventoryOnlyRole = (role?: string) => role === 'inventory_manager' || role === 'warehouse';

  // Intentar cargar sesión guardada si existe (opcional, pero ayuda)

  const handleLogin = async (email: string, password: string) => {
    setError(null);
    setIsAuthenticating(true);
    try {
      const module = await import('./services/api');
      const authenticateUser = module.authenticateUser;

      // Intentar autenticación real con Supabase
      const user = await authenticateUser(email, password).catch(() => null);

      if (user) {
        const stores = user.stores || [];
        const resolvedActiveStoreId = user.activeStoreId || stores[0]?.id || '';
        if (module.setActiveStoreId) {
          module.setActiveStoreId(resolvedActiveStoreId || null);
        }
        setUserStores(stores);
        setActiveStoreIdState(resolvedActiveStoreId);
        setCurrentUser({ ...user, activeStoreId: resolvedActiveStoreId || undefined });
        setCurrentView(isInventoryOnlyRole(user.role) ? 'inventory' : 'sales');
        setError(null);
      } else {
        setError('Credenciales inválidas. Verifica tu correo y contraseña.');
      }
    } catch (err: any) {
      console.error("Login error fatal:", err);
      setError(`Error al iniciar sesión: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      const module = await import('./services/api');
      if (module.supabase?.auth?.signOut) {
        await module.supabase.auth.signOut();
      }
      if (module.setActiveStoreId) {
        module.setActiveStoreId(null);
      }
      if (module.setActiveCompanyId) {
        module.setActiveCompanyId(null);
      }
    } catch (err) {
      console.error('No se pudo cerrar sesión en Supabase:', err);
    } finally {
      setCurrentUser(null);
      setUserStores([]);
      setActiveStoreIdState('');
      setCurrentView('sales');
      setError(null);
    }
  };

  const handleStoreChange = async (storeId: string) => {
    setActiveStoreIdState(storeId);
    setCurrentUser(prev => prev ? { ...prev, activeStoreId: storeId } : prev);
    try {
      const module = await import('./services/api');
      if (module.setActiveStoreId) {
        module.setActiveStoreId(storeId || null);
      }
    } catch (err) {
      console.error('No se pudo persistir la tienda activa:', err);
    }
  };

  const renderContent = () => {
    if (isInventoryOnlyRole(currentUser?.role)) {
      return <InventoryScreen activeStoreId={activeStoreId} stores={userStores} />;
    }

    switch (currentView) {
      case 'sales':
        return <SalesForm currentUser={currentUser!} activeStoreId={activeStoreId} stores={userStores} />;
      case 'reports':
        return <ReportsScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'dailyReport':
        return <DailyReportScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'inventory':
        return <InventoryScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'users':
        return <UserManagementScreen />;
      case 'whatsapp':
        return <WhatsAppScreen />;
      case 'paymentMethods':
        return <PaymentMethodsScreen />;
      case 'products':
        return <ProductManagementScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'brands':
        return <BrandManagementScreen />;
      case 'models':
        return <ModelManagementScreen />;
      case 'configuration':
        return <ConfigurationScreen />;
      case 'purchaseOrders':
        return <PurchaseOrderManagementScreen currentUser={currentUser!} activeStoreId={activeStoreId} stores={userStores} />;
      case 'credits':
        return <CreditManagementScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'advances':
        return <AdvanceManagementScreen activeStoreId={activeStoreId} stores={userStores} />;
      default:
        return <SalesForm currentUser={currentUser!} activeStoreId={activeStoreId} stores={userStores} />;
    }
  };

  return (
    <ErrorBoundary>
      {!isConfigValid ? (
        <ConfigErrorScreen />
      ) : isAuthenticating ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-50">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-indigo-900 font-medium font-outfit">Iniciando sesión en VALNI...</p>
        </div>
      ) : !currentUser ? (
        <LoginScreen onLogin={handleLogin} error={error} />
      ) : (
        <div className="flex h-screen text-slate-200">
          <ResponsiveSidebar
            user={currentUser}
            stores={userStores}
            activeStoreId={activeStoreId}
            onChangeStore={handleStoreChange}
            currentView={currentView}
            onNavigate={(view: View) => setCurrentView(view)}
            onLogout={handleLogout}
          />
          <main className="flex-1 overflow-y-auto p-4 lg:p-8 mt-16 lg:mt-0">
            <div className="max-w-[1600px] mx-auto w-full">
              {renderContent()}
            </div>
          </main>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
