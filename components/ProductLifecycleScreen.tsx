import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ProductLifecycleEvent, Store } from '../types';
import { getProductLifecycleEvents } from '../services/api';
import { formatCurrency } from '../utils/formatting';

interface ProductLifecycleScreenProps {
  activeStoreId?: string;
  stores?: Store[];
}

const ProductLifecycleScreen: React.FC<ProductLifecycleScreenProps> = ({ activeStoreId, stores = [] }) => {
  const [events, setEvents] = useState<ProductLifecycleEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (forcedQuery?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProductLifecycleEvents({
        query: typeof forcedQuery === 'string' ? forcedQuery : searchQuery,
        storeId: scope === 'active' ? (activeStoreId || null) : null,
        consolidated: scope === 'all',
        limit: 500
      });
      setEvents(data);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la trazabilidad.');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeStoreId, scope, searchQuery]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const storedQuery = window.localStorage.getItem('valni_lifecycle_query');
    if (storedQuery) {
      setSearchQuery(storedQuery);
      fetchEvents(storedQuery);
      window.localStorage.removeItem('valni_lifecycle_query');
    }
  }, [fetchEvents]);

  const movementSummary = useMemo(() => {
    const totals = new Map<string, number>();
    events.forEach((event) => {
      totals.set(event.movementLabel, (totals.get(event.movementLabel) || 0) + 1);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [events]);

  const activeStoreName = stores.find(store => store.id === activeStoreId)?.name || 'No definida';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Trazabilidad de Productos</h1>
        <p className="text-sm text-slate-600 mt-1">
          Ciclo de vida por producto/serie: proveedor, costos, movimientos y venta final.
        </p>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchEvents();
            }}
            className="input-style"
            placeholder="Buscar por IMEI, serie, producto, proveedor o cliente..."
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'active' | 'all')}
            className="input-style lg:w-56"
          >
            <option value="all">Todas las tiendas</option>
            <option value="active">Solo tienda activa</option>
          </select>
          <button onClick={() => fetchEvents()} className="btn btn-primary lg:w-40" disabled={isLoading}>
            {isLoading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        {scope === 'active' && (
          <p className="text-xs text-slate-600 mt-3">
            Alcance actual: <span className="font-bold text-slate-800">{activeStoreName}</span>
          </p>
        )}
      </div>

      {movementSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {movementSummary.map(([label, count]) => (
            <div key={label} className="card !p-4">
              <p className="text-xs uppercase tracking-wide text-slate-600">{label}</p>
              <p className="text-2xl font-bold text-slate-900">{count}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th-style">Fecha</th>
                <th className="th-style">Movimiento</th>
                <th className="th-style">Producto / Serie</th>
                <th className="th-style">Origen / Destino</th>
                <th className="th-style">Proveedor / Cliente</th>
                <th className="th-style text-right">Cant.</th>
                <th className="th-style text-right">Costo / Monto</th>
                <th className="th-style">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!isLoading && events.length === 0 && (
                <tr>
                  <td className="td-style text-slate-600" colSpan={8}>
                    No hay eventos para el filtro actual.
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.eventId} className="hover:bg-slate-50">
                  <td className="td-style text-slate-900 text-xs">
                    {new Date(event.occurredAt).toLocaleString('es-PE')}
                  </td>
                  <td className="td-style text-slate-900 text-xs font-semibold">{event.movementLabel}</td>
                  <td className="td-style text-slate-900 text-xs">
                    <div className="font-semibold">{event.productName || '-'}</div>
                    <div className="text-slate-600">
                      {event.serializedSerial || event.serialNumber || event.imei1 || event.imei2 || '-'}
                    </div>
                  </td>
                  <td className="td-style text-slate-900 text-xs">
                    <div>{event.warehouseName || '-'}</div>
                    <div className="text-slate-600">{event.storeName || '-'}</div>
                  </td>
                  <td className="td-style text-slate-900 text-xs">
                    <div>{event.supplierName || '-'}</div>
                    <div className="text-slate-600">{event.customerName || '-'}</div>
                  </td>
                  <td className="td-style text-right text-slate-900 text-xs font-semibold">{event.qty}</td>
                  <td className="td-style text-right text-slate-900 text-xs">
                    <div>{formatCurrency(event.unitCost || 0)}</div>
                    <div className="text-slate-600">{formatCurrency(event.lineAmount || 0)}</div>
                  </td>
                  <td className="td-style text-slate-700 text-xs max-w-[260px]">
                    <div>{event.notes || '-'}</div>
                    {event.paymentSummary && (
                      <div className="mt-1 text-[11px] text-slate-600">{event.paymentSummary}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductLifecycleScreen;
