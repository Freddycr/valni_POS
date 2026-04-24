import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
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
import ProductLifecycleScreen from './components/ProductLifecycleScreen';
import PurchaseOrderManagementScreen from './components/PurchaseOrderManagementScreen';
import CreditManagementScreen from './components/CreditManagementScreen';
import AdvanceManagementScreen from './components/AdvanceManagementScreen';
import AppTopbar from './components/AppTopbar';
import SemanticAssistantWidget from './components/SemanticAssistantWidget';
import { getSemanticWidgetEligibility } from './services/featureFlags';

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isInventoryOnlyRole = (role?: string) => role === 'inventory_manager' || role === 'warehouse';
  const widgetEligibility = getSemanticWidgetEligibility(currentUser);

  const refreshStoresForCurrentUser = useCallback(async (preferredStoreId?: string) => {
    if (!currentUser) return;
    try {
      const module = await import('./services/api');
      let refreshedStores: Store[] = [];

      if (module.getUserStoreAssignments) {
        const assignments = await module.getUserStoreAssignments(currentUser.id);
        refreshedStores = assignments
          .map((assignment: any) => assignment.store)
          .filter((store: Store | undefined): store is Store => !!store);
      }

      if (refreshedStores.length === 0 && module.getStores) {
        refreshedStores = await module.getStores();
      }

      if (refreshedStores.length === 0) return;

      const nextStoreId =
        (preferredStoreId && refreshedStores.some(store => store.id === preferredStoreId) && preferredStoreId) ||
        (activeStoreId && refreshedStores.some(store => store.id === activeStoreId) && activeStoreId) ||
        refreshedStores.find(store => store.isDefault)?.id ||
        refreshedStores[0]?.id ||
        '';

      setUserStores(refreshedStores);
      setActiveStoreIdState(nextStoreId);
      setCurrentUser(prev => prev ? { ...prev, stores: refreshedStores, activeStoreId: nextStoreId || undefined } : prev);
      if (module.setActiveStoreId) {
        module.setActiveStoreId(nextStoreId || null);
      }
      if (module.setActiveCompanyId) {
        const nextStore = refreshedStores.find(store => store.id === nextStoreId);
        const nextCompanyId = String(nextStore?.companyId || '').trim();
        if (nextCompanyId) {
          module.setActiveCompanyId(nextCompanyId);
        }
      }
    } catch (err) {
      console.error('No se pudo refrescar la lista de tiendas:', err);
    }
  }, [activeStoreId, currentUser]);

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
        if (module.setActiveCompanyId) {
          const nextStore = stores.find(store => store.id === resolvedActiveStoreId) || stores[0];
          const nextCompanyId = String(nextStore?.companyId || '').trim();
          if (nextCompanyId) {
            module.setActiveCompanyId(nextCompanyId);
          }
        }
        setUserStores(stores);
        setActiveStoreIdState(resolvedActiveStoreId);
        setCurrentUser({ ...user, activeStoreId: resolvedActiveStoreId || undefined });
        setCurrentView(isInventoryOnlyRole(user.role) ? 'inventory' : 'sales');
        setIsMobileSidebarOpen(false);
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
      if (module.setActiveWarehouseId) {
        module.setActiveWarehouseId(null);
      }
    } catch (err) {
      console.error('No se pudo cerrar sesión en Supabase:', err);
    } finally {
      setCurrentUser(null);
      setUserStores([]);
      setActiveStoreIdState('');
      setCurrentView('sales');
      setIsMobileSidebarOpen(false);
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
      if (module.setActiveCompanyId) {
        const nextStore = userStores.find(store => store.id === storeId);
        const nextCompanyId = String(nextStore?.companyId || '').trim();
        if (nextCompanyId) {
          module.setActiveCompanyId(nextCompanyId);
        }
      }
      if (module.setActiveWarehouseId) {
        module.setActiveWarehouseId(null);
      }
    } catch (err) {
      console.error('No se pudo persistir la tienda activa:', err);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const handleStoresUpdated = () => {
      refreshStoresForCurrentUser(activeStoreId);
    };
    window.addEventListener('valni:stores-updated', handleStoresUpdated);
    return () => window.removeEventListener('valni:stores-updated', handleStoresUpdated);
  }, [activeStoreId, currentUser, refreshStoresForCurrentUser]);

  useEffect(() => {
    const handleNavigateEvent = (event: Event) => {
      const custom = event as CustomEvent<{ view?: View }>;
      const nextView = custom?.detail?.view;
      if (!nextView) return;
      setCurrentView(nextView);
      setIsMobileSidebarOpen(false);
    };
    window.addEventListener('valni:navigate', handleNavigateEvent as EventListener);
    return () => window.removeEventListener('valni:navigate', handleNavigateEvent as EventListener);
  }, []);

  const renderContent = () => {
    if (isInventoryOnlyRole(currentUser?.role)) {
      if (currentView === 'lifecycle') {
        return <ProductLifecycleScreen activeStoreId={activeStoreId} stores={userStores} />;
      }
      return <InventoryScreen activeStoreId={activeStoreId} stores={userStores} />;
    }

    switch (currentView) {
      case 'sales':
        return <SalesForm currentUser={currentUser!} activeStoreId={activeStoreId} stores={userStores} />;
      case 'reports':
        return <ReportsScreen activeStoreId={activeStoreId} stores={userStores} userRole={currentUser?.role} />;
      case 'dailyReport':
        return <DailyReportScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'inventory':
        return <InventoryScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'lifecycle':
        return <ProductLifecycleScreen activeStoreId={activeStoreId} stores={userStores} />;
      case 'users':
        return <UserManagementScreen />;
      case 'whatsapp':
        return <WhatsAppScreen />;
      case 'paymentMethods':
        return <PaymentMethodsScreen userRole={currentUser?.role} />;
      case 'products':
        return <ProductManagementScreen activeStoreId={activeStoreId} stores={userStores} userRole={currentUser?.role} />;
      case 'brands':
        return <BrandManagementScreen userRole={currentUser?.role} />;
      case 'models':
        return <ModelManagementScreen userRole={currentUser?.role} />;
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

  const handleNavigate = (view: View) => {
    setCurrentView(view);
    setIsMobileSidebarOpen(false);
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
        <div className="light-theme relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_right,#f8fbff_0%,#eef4fb_55%,#e6eff9_100%)] text-slate-900">
          <div className="pointer-events-none absolute -left-40 top-24 h-80 w-80 rounded-full bg-[#8db7ff]/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[#6cd2b9]/16 blur-3xl" />
          <ResponsiveSidebar
            user={currentUser}
            stores={userStores}
            activeStoreId={activeStoreId}
            onChangeStore={handleStoreChange}
            currentView={currentView}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            isCollapsed={isSidebarCollapsed}
            isMobileOpen={isMobileSidebarOpen}
            onMobileClose={() => setIsMobileSidebarOpen(false)}
          />
          <div className={`relative flex min-h-screen flex-1 flex-col transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-24' : 'lg:ml-72'}`}>
            <AppTopbar
              user={currentUser}
              stores={userStores}
              activeStoreId={activeStoreId}
              onChangeStore={handleStoreChange}
              currentView={currentView}
              onNavigate={handleNavigate}
              onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebarCollapse={() => setIsSidebarCollapsed(prev => !prev)}
            />
            <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-[1600px]">
                {renderContent()}
              </div>
            </main>
          </div>
          {widgetEligibility.enabled && (
            <SemanticAssistantWidget currentUser={currentUser} activeStoreId={activeStoreId} />
          )}
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
