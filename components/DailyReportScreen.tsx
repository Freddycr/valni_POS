import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '../utils/formatting';
import { Sale, Product, User, PaymentDetail, SaleDetail, Customer, AdvanceMovement, Store } from '../types';
import { getDailyReportData, getActiveCompanyId, setActiveCompanyId } from '../services/api';
import Receipt from './Receipt';

interface DailyReportData {
  sales: Sale[];
  products: Product[];
  users: User[];
  details: SaleDetail[];
  payments: PaymentDetail[];
  customers: Customer[];
  advanceMovements: AdvanceMovement[];
}

interface DailyReportScreenProps {
  activeStoreId?: string;
  stores?: Store[];
}

const DailyReportScreen: React.FC<DailyReportScreenProps> = ({ activeStoreId, stores = [] }) => {
  const normalizeMethod = (value?: string | null) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const isCreditMethod = (value?: string | null) => {
    const normalized = normalizeMethod(value);
    return normalized === 'credito' || normalized === 'credit_installment';
  };

  const isAdvanceMethod = (value?: string | null) => {
    const normalized = normalizeMethod(value);
    return normalized === 'adelanto' || normalized === 'advance';
  };

  const formatPaymentMethod = (method?: string) => {
    const normalized = normalizeMethod(method);
    const mapping: Record<string, string> = {
      cash: 'Efectivo',
      efectivo: 'Efectivo',
      credit_card: 'Tarjeta de Crédito',
      'tarjeta de credito': 'Tarjeta de Crédito',
      debit_card: 'Tarjeta de Débito',
      'tarjeta de debito': 'Tarjeta de Débito',
      bank_transfer: 'Transferencia Bancaria',
      transfer: 'Transferencia Bancaria',
      credit_installment: 'Crédito',
      credito: 'Crédito',
      advance: 'Adelanto',
      adelanto: 'Adelanto',
      yape: 'Yape',
      plin: 'Plin'
    };
    if (!method) return '--';
    return mapping[normalized] || method;
  };

  const getPeruDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Lima'
    };
    const parts = new Intl.DateTimeFormat('en-CA', options).format(now).split('-');
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const isValidReportDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime());
  };

  const [selectedDate, setSelectedDate] = useState<string>(getPeruDate());
  const [dateInputValue, setDateInputValue] = useState<string>(getPeruDate());
  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleToPrint, setSaleToPrint] = useState<Sale | null>(null);
  const [scope, setScope] = useState<'active' | 'store' | 'consolidated'>('consolidated');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const reportRef = useRef<HTMLDivElement>(null);
  const printIframeRef = useRef<HTMLIFrameElement>(null);
  
  const handlePrintDailyReport = () => {
    const reportElement = reportRef.current;
    if (!reportElement) return;

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Reporte Diario</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { font-size: 22px; margin: 0 0 6px 0; }
            .subtitle { color: #4b5563; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; }
            .text-right { text-align: right; }
            @media print {
              @page { size: auto; margin: 10mm; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Reporte Diario</h1>
          <div class="subtitle">Fecha: ${selectedDate}</div>
          ${reportElement.innerHTML}
        </body>
      </html>
    `;

    const fail = (err?: unknown) => {
      console.error('Error al imprimir reporte diario:', err);
      alert('Se produjo un error al imprimir el reporte diario.');
    };

    // Preferred path (mobile-friendly): print via hidden iframe, avoids popup blockers.
    try {
      const iframe = printIframeRef.current;
      if (iframe) {
        const handleLoad = () => {
          try {
            const win = iframe.contentWindow;
            if (!win) {
              fail('iframe has no contentWindow');
              return;
            }

            // Small delay helps Safari/iOS finish layout before printing.
            setTimeout(() => {
              try {
                win.focus();
                win.print();
              } catch (e) {
                fail(e);
              }
            }, 300);
          } catch (e) {
            fail(e);
          }
        };

        iframe.addEventListener('load', handleLoad, { once: true });
        iframe.srcdoc = printHtml;
        return;
      }
    } catch (e) {
      // If iframe path fails for any reason, fallback below.
      console.warn('Falling back to window.open printing:', e);
    }

    // Fallback: new window/tab printing.
    try {
      const printWindow = window.open('', '_blank', 'width=1200,height=800');
      if (!printWindow) {
        fail('window.open blocked');
        return;
      }

      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();

      // Delay helps some mobile browsers.
      setTimeout(() => {
        try {
          printWindow.print();
          printWindow.close();
        } catch (e) {
          fail(e);
        }
      }, 300);
    } catch (e) {
      fail(e);
    }
  };

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(activeStoreId || stores[0].id);
    }
  }, [stores, activeStoreId, selectedStoreId]);

  useEffect(() => {
    if (!stores || stores.length === 0) return;
    const preferredStoreId = activeStoreId || selectedStoreId || stores[0].id;
    const store = stores.find(s => s.id === preferredStoreId) || stores[0];
    const nextCompanyId = String(store?.companyId || '').trim();
    if (!nextCompanyId) return;

    const currentCompanyId = String(getActiveCompanyId() || '').trim();
    if (currentCompanyId !== nextCompanyId) {
      setActiveCompanyId(nextCompanyId);
      fetchReport(selectedDate);
    }
  }, [stores, activeStoreId, selectedStoreId, selectedDate]);

  const fetchReport = async (reportDate?: string) => {
    const effectiveDate = (typeof reportDate === 'string' && reportDate.trim().length > 0)
      ? reportDate
      : selectedDate;
    setLoading(true);
    setReportData(null);
    setError(null);
    try {
      const scopedStoreId = scope === 'active'
        ? (activeStoreId || null)
        : (scope === 'store' ? (selectedStoreId || null) : null);
      const data = await getDailyReportData(effectiveDate, {
        storeId: scopedStoreId,
        consolidated: scope === 'consolidated'
      });
      setReportData({
        sales: data.sales || [],
        products: data.products || [],
        users: data.users || [],
        details: data.details || [],
        payments: data.payments || [],
        customers: data.customers || [],
        advanceMovements: data.advanceMovements || [],
      });
    } catch (err) {
      console.error("Error fetching daily report:", err);
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  };

  const applyDateFilter = () => {
    const nextDate = String(dateInputValue || '').trim();
    if (!isValidReportDate(nextDate)) {
      setError('Fecha inválida. Use el formato YYYY-MM-DD.');
      return;
    }

    setSelectedDate(nextDate);
    fetchReport(nextDate);
  };

  useEffect(() => {
    fetchReport(selectedDate);
  }, [activeStoreId, selectedStoreId, scope]);

  const enrichedSales = React.useMemo(() => {
    if (!reportData) return [];
    const productsById = new Map(reportData.products.map(product => [product.id, product]));

    return reportData.sales.map(sale => {
      const groupedItems = new Map<string, any>();
      const saleDetails = reportData.details.filter(detail => detail.saleId === sale.id);

      saleDetails.forEach((detail) => {
          const product = productsById.get(detail.productId);
          const imei = String((detail as any).imei1 || '').trim();
          const serialNumber = String((detail as any).serialNumber || '').trim();
          const isSerialized = Boolean(imei || serialNumber);
          const quantity = Math.max(1, Number(detail.quantity || 0));
          const salePrice = Number(detail.salePrice || 0);

          // For generic/non-serialized lines, merge by product and unit price.
          // For serialized lines, keep each unique IMEI/serie as an independent row.
          const itemKey = isSerialized
            ? `serial|${detail.productId}|${salePrice}|${imei}|${serialNumber}`
            : `generic|${detail.productId}|${salePrice}`;

          const existing = groupedItems.get(itemKey);
          if (existing) {
            existing.quantity += quantity;
            return;
          }

          groupedItems.set(itemKey, {
            ...detail,
            quantity,
            salePrice,
            imei1: imei || undefined,
            serialNumber: serialNumber || undefined,
            name: product?.name || 'N/A',
            description: product?.description || 'N/A'
          });
        });

      const saleTotal = Number(sale.total || 0);
      const items = Array.from(groupedItems.values());

      if (saleDetails.length === 0) {
        items.push({
          id: `nodetail-${sale.id}`,
          saleId: sale.id,
          productId: `nodetail-${sale.id}`,
          quantity: 1,
          salePrice: saleTotal,
          name: 'Venta sin detalle',
          description: 'No se registró el detalle de productos para esta venta',
          isSyntheticNoDetail: true
        } as any);
      } else {
        const detailTotal = items.reduce((sum, item) => sum + (Number(item.salePrice || 0) * Number(item.quantity || 0)), 0);
        const detailGap = Math.round((saleTotal - detailTotal + Number.EPSILON) * 100) / 100;

        // Some migrated sales include total/payment that does not fully map to structured line-items.
        // Add an explicit adjustment line so report and printout reconcile totals.
        if (Math.abs(detailGap) >= 0.01) {
          items.push({
            id: `adj-${sale.id}`,
            saleId: sale.id,
            productId: `adj-${sale.id}`,
            quantity: 1,
            salePrice: detailGap,
            name: detailGap > 0 ? 'Concepto adicional (migración sin detalle)' : 'Ajuste de detalle (migración)',
            description: 'Ajuste automático por diferencia entre detalle y total',
            isSyntheticAdjustment: true
          } as any);
        }
      }

      const payments = reportData.payments.filter(p => p.saleId === sale.id);
      const customer = reportData.customers.find(c => c.id === sale.customerId);
      return { ...sale, items, payments, customer };
    });
  }, [reportData]);

  const salesBySeller = React.useMemo(() => {
    if (!reportData) return [];
    const sellerMap = new Map<string, { count: number; total: number; advanceNet: number }>();

    enrichedSales.forEach(sale => {
      const seller = reportData.users.find(u => u.id === sale.sellerId);
      const sellerName = seller ? seller.fullName : 'Vendedor Sistema';
      const current = sellerMap.get(sellerName) || { count: 0, total: 0, advanceNet: 0 };
      const unitsInSale = sale.items?.reduce((sum, item) => {
        if ((item as any).isSyntheticAdjustment) return sum;
        return sum + item.quantity;
      }, 0) || 0;

      sellerMap.set(sellerName, {
        count: current.count + unitsInSale,
        total: current.total + sale.total,
        advanceNet: current.advanceNet,
      });
    });

    reportData.advanceMovements
      .filter(m => m.movementType === 'payment' || m.movementType === 'refund')
      .forEach(m => {
        const sellerName = m.sellerName || 'Vendedor Sistema';
        const current = sellerMap.get(sellerName) || { count: 0, total: 0, advanceNet: 0 };
        const signed = m.movementType === 'refund' ? -m.amount : m.amount;
        sellerMap.set(sellerName, {
          count: current.count,
          total: current.total,
          advanceNet: current.advanceNet + signed
        });
      });

    return Array.from(sellerMap.entries()).map(([name, data]) => ({
      sellerName: name,
      unitsSold: data.count,
      totalSales: data.total,
      advanceNet: data.advanceNet,
      totalManaged: data.total + data.advanceNet
    }));
  }, [reportData, enrichedSales]);

  const salesByPaymentMethod = React.useMemo(() => {
    if (!reportData) return [];
    const paymentMap = new Map<string, number>();
    const advanceAppliedFromMovements = reportData.advanceMovements
      .filter(m => m.movementType === 'application')
      .reduce((sum, m) => sum + m.amount, 0);
    const explicitAdvanceInSalePayments = reportData.payments
      .filter(p => isAdvanceMethod(p.paymentMethod))
      .reduce((sum, p) => sum + p.amount, 0);
    const legacyAdvanceAsCash = Math.max(0, advanceAppliedFromMovements - explicitAdvanceInSalePayments);

    reportData.payments.forEach(payment => {
      // Excluir Crédito y Adelanto aplicado a venta (no ingresa efectivo nuevo a caja)
      if (!isCreditMethod(payment.paymentMethod) && !isAdvanceMethod(payment.paymentMethod)) {
        const method = formatPaymentMethod(payment.paymentMethod);
        paymentMap.set(method, (paymentMap.get(method) || 0) + payment.amount);
      }
    });

    if (legacyAdvanceAsCash > 0) {
      const currentCash = paymentMap.get('Efectivo') || 0;
      paymentMap.set('Efectivo', Math.max(0, currentCash - legacyAdvanceAsCash));
    }

    reportData.advanceMovements.forEach(movement => {
      if (movement.movementType !== 'payment' && movement.movementType !== 'refund') return;
      const method = formatPaymentMethod(movement.paymentMethod);
      const signedAmount = movement.movementType === 'refund' ? -movement.amount : movement.amount;
      paymentMap.set(method, (paymentMap.get(method) || 0) + signedAmount);
    });

    return Array.from(paymentMap.entries()).map(([method, total]) => ({
      method,
      total,
    }));
  }, [reportData]);

  const totalBilling = React.useMemo(() => {
    return enrichedSales.reduce((sum, sale) => sum + sale.total, 0);
  }, [enrichedSales]);

  const totalCollections = React.useMemo(() => {
    if (!reportData) return 0;
    const advanceAppliedFromMovements = reportData.advanceMovements
      .filter(m => m.movementType === 'application')
      .reduce((sum, m) => sum + m.amount, 0);
    const explicitAdvanceInSalePayments = reportData.payments
      .filter(p => isAdvanceMethod(p.paymentMethod))
      .reduce((sum, p) => sum + p.amount, 0);
    const legacyAdvanceAsCash = Math.max(0, advanceAppliedFromMovements - explicitAdvanceInSalePayments);

    const saleCollections = reportData.payments
      .filter(p => !isCreditMethod(p.paymentMethod) && !isAdvanceMethod(p.paymentMethod))
      .reduce((sum, p) => sum + p.amount, 0);
    const advanceIn = reportData.advanceMovements
      .filter(m => m.movementType === 'payment')
      .reduce((sum, m) => sum + m.amount, 0);
    const advanceOut = reportData.advanceMovements
      .filter(m => m.movementType === 'refund')
      .reduce((sum, m) => sum + m.amount, 0);
    return Math.max(0, saleCollections - legacyAdvanceAsCash) + advanceIn - advanceOut;
  }, [reportData]);

  const installmentCollections = React.useMemo(() => {
    if (!reportData) return [];
    return reportData.payments.filter(p => p.isInstallment);
  }, [reportData]);

  const creditOriginated = React.useMemo(() => {
    if (!reportData) return 0;
    return reportData.payments
      .filter(p => isCreditMethod(p.paymentMethod) && !p.isInstallment)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [reportData]);

  const advancePayments = React.useMemo(() => {
    if (!reportData) return 0;
    return reportData.advanceMovements
      .filter(m => m.movementType === 'payment')
      .reduce((sum, m) => sum + m.amount, 0);
  }, [reportData]);

  const advanceRefunds = React.useMemo(() => {
    if (!reportData) return 0;
    return reportData.advanceMovements
      .filter(m => m.movementType === 'refund')
      .reduce((sum, m) => sum + m.amount, 0);
  }, [reportData]);

  const dailyAdvanceMovements = React.useMemo(() => {
    if (!reportData) return [];
    return reportData.advanceMovements
      .filter(m => m.movementType === 'payment' || m.movementType === 'refund')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reportData]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 animate-pulse">
      <div className="w-12 h-12 border-4 border-[#11d483] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Generando Reporte Diario...</p>
    </div>
  );

  const fallbackUser: User = { id: '', fullName: 'N/A', email: '', role: 'seller', isActive: false };
  const fallbackCustomer: Customer = { id: '', fullName: 'Cliente Genérico', docType: 'DNI', docNumber: '00000000', dni: '00000000', address: '', phone: '' };

  return (
    <div className="animate-fade-in space-y-8">
      <iframe
        ref={printIframeRef}
        title="daily-report-print"
        aria-hidden="true"
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          border: 0,
          visibility: 'hidden',
        }}
      />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Reporte Diario</h2>
          <p className="text-slate-600 font-medium">Control de caja y actividades diarias</p>
          {scope !== 'consolidated' && (
            <p className="text-xs text-[#0ea5a0] font-bold uppercase tracking-wide mt-1">
              {scope === 'active'
                ? `Tienda activa: ${stores.find(store => store.id === activeStoreId)?.name || 'No definida'}`
                : `Tienda seleccionada: ${stores.find(store => store.id === selectedStoreId)?.name || 'No definida'}`}
            </p>
          )}
          {scope === 'consolidated' && (
            <p className="text-xs text-amber-300 font-bold uppercase tracking-wide mt-1">
              Vista consolidada (todas las tiendas)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-600 uppercase ml-2">Explorar Fecha</span>
            <input
              type="date"
              id="report-date"
              value={dateInputValue}
              onChange={(e) => {
                setDateInputValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyDateFilter();
                }
              }}
              className="input-style !h-10 !w-auto !min-h-0 !py-0 !px-3 !text-sm"
            />
            <button
              onClick={applyDateFilter}
              className="px-4 py-2 rounded-xl bg-[#0ea5a0] text-white text-sm font-bold hover:bg-[#0b8f8a] transition-colors"
              title="Aplicar fecha"
            >
              Aplicar
            </button>
          </div>
          <button
            onClick={() => fetchReport()}
            className="p-3 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 hover:text-[#0ea5a0] transition-all shadow-sm"
            title="Refrescar Datos"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </header>

      {error && <div className="p-4 text-center text-red-600 bg-red-100 rounded-md">{error}</div>}

      <div className="card !bg-[#161c2d]/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Alcance</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as 'active' | 'store' | 'consolidated')}
              className="input-style w-full"
            >
              <option value="active">Tienda activa</option>
              <option value="store">Tienda específica</option>
              <option value="consolidated">Consolidado</option>
            </select>
          </div>
          {scope === 'store' && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Tienda</label>
              <select
                value={selectedStoreId}
                onChange={e => setSelectedStoreId(e.target.value)}
                className="input-style w-full"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {reportData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6">
            <div className="card !bg-gradient-to-br from-[#11d483]/20 to-transparent border-[#11d483]/10">
              <h3 className="text-sm font-bold text-[#11d483] uppercase tracking-widest mb-2">Ingreso (Caja)</h3>
              <p className="text-3xl font-black text-white">{formatCurrency(totalCollections)}</p>
            </div>
            <div className="card !bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/10">
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-2">Facturado Hoy</h3>
              <p className="text-3xl font-black text-white">{formatCurrency(totalBilling)}</p>
            </div>
            <div className="card border-white/5">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Equipos Vendidos</h3>
              <p className="text-3xl font-black text-white">{salesBySeller.reduce((sum, d) => sum + d.unitsSold, 0)}</p>
            </div>
            <div className="card border-white/5">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Cobro de Cuotas</h3>
              <p className="text-3xl font-black text-white">{formatCurrency(installmentCollections.reduce((sum, c) => sum + c.amount, 0))}</p>
            </div>
            <div className="card border-white/5">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Crédito Originado</h3>
              <p className="text-3xl font-black text-white">{formatCurrency(creditOriginated)}</p>
            </div>
            <div className="card border-white/5">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Adelantos Netos</h3>
              <p className="text-3xl font-black text-white">{formatCurrency(advancePayments - advanceRefunds)}</p>
            </div>
          </div>

          <div ref={reportRef} className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-extrabold text-white">Detalle de Operaciones</h3>
              <div className="flex gap-2 items-center">
                <button
                  onClick={handlePrintDailyReport}
                  className="px-3 py-1.5 rounded-lg bg-[#11d483]/15 text-[#11d483] border border-[#11d483]/30 hover:bg-[#11d483]/25 transition-all text-xs font-bold uppercase tracking-wide"
                >
                  Imprimir Reporte Diario
                </button>
                <div className="text-[10px] font-black bg-[#11d483]/10 text-[#11d483] px-3 py-1 rounded-full uppercase">Caja Abierta (Simulado)</div>
                <div className="text-[10px] font-black bg-white/5 text-slate-500 px-3 py-1 rounded-full uppercase border border-white/5">Estado: Sesión de Usuario</div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th-style">Hora</th>
                    <th className="th-style">Cliente / Vendedor</th>
                    <th className="th-style">Productos Detalle</th>
                    <th className="th-style">Métodos de Pago</th>
                    <th className="th-style text-right">Total Venta</th>
                    <th className="th-style text-center">Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {enrichedSales
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((sale) => {
                      const seller = reportData.users.find(u => u.id === sale.sellerId);
                      return (
                        <tr key={sale.id} className="hover:bg-white/5 transition-colors align-top">
                          <td className="td-style text-xs font-mono text-slate-400 py-4">
                            {new Date(sale.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </td>
                          <td className="td-style py-4">
                            <div className="text-sm font-bold text-white mb-1">
                              {sale.customer?.fullName?.toUpperCase() || 'CLIENTE GENÉRICO'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                              <span className="px-1.5 py-0.5 bg-white/5 rounded">VENDIDO POR:</span>
                              <span className="text-indigo-400 font-bold">{seller?.fullName || 'SISTEMA'}</span>
                            </div>
                          </td>
                          <td className="td-style py-4">
                            <div className="space-y-2">
                              {sale.items?.map((item, iIdx) => (
                                <div key={iIdx} className="flex flex-col border-l border-slate-300 pl-3">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-sm text-slate-900 font-semibold leading-5">
                                      <span className="text-[#059669] font-bold mr-1">{item.quantity}x</span>
                                      {item.name}
                                    </span>
                                    <span className="text-sm text-slate-800 font-mono font-semibold">{formatCurrency(item.salePrice * item.quantity)}</span>
                                  </div>
                                  {((item as any).imei1 || (item as any).serialNumber) && (
                                    <div className="text-[11px] font-mono text-slate-700 mt-0.5">
                                      {(item as any).imei1 && <span>IMEI: {(item as any).imei1} </span>}
                                      {(item as any).serialNumber && <span>S/N: {(item as any).serialNumber}</span>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="td-style py-4">
                            <div className="flex flex-wrap gap-1">
                              {sale.payments?.map((p, pIdx) => {
                                const isCredit = isCreditMethod(p.paymentMethod);
                                const isAdvance = isAdvanceMethod(p.paymentMethod);
                                const chipClass = isCredit
                                  ? 'bg-slate-500/10 border border-slate-500/20'
                                  : isAdvance
                                    ? 'bg-amber-500/10 border border-amber-500/20'
                                    : 'bg-indigo-500/5 border border-indigo-500/10';
                                const labelClass = isCredit
                                  ? 'text-slate-500'
                                  : isAdvance
                                    ? 'text-amber-300'
                                    : 'text-indigo-400';
                                const valueClass = isCredit ? 'text-slate-400' : 'text-white';
                                return (
                                  <div key={pIdx} className={`flex flex-col rounded px-2 py-1 ${chipClass}`}>
                                    <span className={`text-[9px] font-black uppercase leading-tight ${labelClass}`}>{formatPaymentMethod(p.paymentMethod)}</span>
                                    <span className={`text-[10px] font-bold tracking-tighter ${valueClass}`}>{formatCurrency(p.amount)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="td-style text-right py-4">
                            <span className="text-md font-black text-[#11d483]">{formatCurrency(sale.total)}</span>
                          </td>
                          <td className="td-style text-center py-4">
                            <button
                              onClick={() => setSaleToPrint(sale)}
                              className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:bg-[#11d483]/20 hover:text-[#11d483] transition-all border border-white/5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {dailyAdvanceMovements.map((movement) => (
                    <tr key={`adv-${movement.id}`} className="hover:bg-white/5 transition-colors align-top bg-amber-500/5">
                      <td className="td-style text-xs font-mono text-slate-400 py-4">
                        {new Date(movement.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </td>
                      <td className="td-style py-4">
                        <div className="text-sm font-bold text-white mb-1">
                          {(movement.customerName || 'CLIENTE SIN REFERENCIA').toUpperCase()}
                        </div>
                        <div className="text-[10px] font-medium text-amber-300">
                          OPERACIÓN: {movement.movementType === 'payment' ? 'ABONO DE ADELANTO' : 'DEVOLUCIÓN DE ADELANTO'}
                        </div>
                      </td>
                      <td className="td-style py-4">
                        <div className="text-xs text-slate-300 font-medium">
                          {movement.notes || (movement.movementType === 'payment' ? 'Ingreso por preventa/pedido' : 'Salida por devolución')}
                        </div>
                      </td>
                      <td className="td-style py-4">
                        <div className="flex flex-wrap gap-1">
                          <div className="flex flex-col rounded px-2 py-1 bg-amber-500/10 border border-amber-500/20">
                            <span className="text-[9px] font-black uppercase leading-tight text-amber-300">{formatPaymentMethod(movement.paymentMethod)}</span>
                            <span className="text-[10px] font-bold tracking-tighter text-white">
                              {formatCurrency(movement.movementType === 'refund' ? -movement.amount : movement.amount)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="td-style text-right py-4">
                        <span className={`text-md font-black ${movement.movementType === 'refund' ? 'text-red-400' : 'text-[#11d483]'}`}>
                          {formatCurrency(movement.movementType === 'refund' ? -movement.amount : movement.amount)}
                        </span>
                      </td>
                      <td className="td-style text-center py-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Adelanto</span>
                      </td>
                    </tr>
                  ))}
                  {enrichedSales.length === 0 && dailyAdvanceMovements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="td-style text-center text-slate-500 py-4 italic">
                        No hay operaciones para esta fecha.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="card">
              <h3 className="text-lg font-bold text-white mb-6">Productividad por Vendedor</h3>
              <div className="overflow-hidden rounded-xl border border-white/5">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th-style">Vendedor</th>
                      <th className="th-style text-right">Cant.</th>
                      <th className="th-style text-right">Ventas</th>
                      <th className="th-style text-right">Adelantos</th>
                      <th className="th-style text-right">Total Gestión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {salesBySeller.map((data, index) => (
                      <tr key={index} className="hover:bg-white/5">
                        <td className="td-style text-sm font-medium text-slate-300">{data.sellerName}</td>
                        <td className="td-style text-right text-xs text-slate-500">{data.unitsSold}</td>
                        <td className="td-style text-right font-bold text-white">{formatCurrency(data.totalSales)}</td>
                        <td className={`td-style text-right font-bold ${data.advanceNet < 0 ? 'text-red-400' : 'text-amber-300'}`}>
                          {formatCurrency(data.advanceNet)}
                        </td>
                        <td className="td-style text-right font-bold text-[#11d483]">{formatCurrency(data.totalManaged)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/5">
                      <td className="td-style font-black text-white">TOTAL GESTIÓN</td>
                      <td className="td-style text-right font-black text-[#11d483]">
                        {salesBySeller.reduce((sum, data) => sum + data.unitsSold, 0)}
                      </td>
                      <td className="td-style text-right font-black text-[#11d483]">
                        {formatCurrency(totalBilling)}
                      </td>
                      <td className="td-style text-right font-black text-[#11d483]">
                        {formatCurrency(advancePayments - advanceRefunds)}
                      </td>
                      <td className="td-style text-right font-black text-[#11d483]">
                        {formatCurrency(totalBilling + (advancePayments - advanceRefunds))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-bold text-white mb-6">Detalle de Cobranza (Cuotas)</h3>
              <div className="overflow-hidden rounded-xl border border-white/5">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="th-style">Cliente</th>
                      <th className="th-style">Comprobante Original</th>
                      <th className="th-style text-right">Monto Cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {installmentCollections.length > 0 ? (
                      installmentCollections.map((pc, idx) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="td-style text-xs font-medium text-slate-300">{pc.customerName || 'N/A'}</td>
                          <td className="td-style text-xs text-indigo-400 font-mono">{pc.saleInvoice || 'N/A'}</td>
                          <td className="td-style text-right text-xs font-bold text-white">{formatCurrency(pc.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="td-style text-center text-slate-500 py-4 italic">No hay cobranzas registradas hoy</td>
                      </tr>
                    )}
                  </tbody>
                  {installmentCollections.length > 0 && (
                    <tfoot>
                      <tr className="bg-white/5">
                        <td colSpan={2} className="td-style font-black text-white text-right">TOTAL COBRANZAS</td>
                        <td className="td-style text-right font-black text-[#11d483]">
                          {formatCurrency(installmentCollections.reduce((sum, c) => sum + c.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-bold text-white mb-6">Consolidado Final por Medio de Pago</h3>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-indigo-500/5">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th-style">Método de Pago</th>
                      <th className="th-style text-right">Total en Caja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {salesByPaymentMethod.map((data, index) => (
                      <tr key={index} className="hover:bg-white/5">
                        <td className="td-style text-sm font-medium text-slate-300">{data.method}</td>
                        <td className="td-style text-right font-bold text-white font-mono">{formatCurrency(data.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-500/10 border-t-2 border-[#11d483]/20">
                      <td className="td-style font-black text-white uppercase tracking-tighter">LIQUIDACIÓN TOTAL EFECTIVA</td>
                      <td className="td-style text-right font-black text-[#11d483] text-lg">
                        {formatCurrency(totalCollections)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-4 text-[10px] text-slate-500 italic">Nota: La liquidación total incluye ventas cobradas, cobranzas de cuotas y adelantos netos (abonos menos devoluciones).</p>
            </div>

            <div className="card lg:col-span-2">
              <h3 className="text-lg font-bold text-white mb-6">Detalle de Adelantos del Día</h3>
              <div className="overflow-hidden rounded-xl border border-white/5">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th-style">Hora</th>
                      <th className="th-style">Cliente</th>
                      <th className="th-style">Tipo</th>
                      <th className="th-style">Método</th>
                      <th className="th-style text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dailyAdvanceMovements.length > 0 ? (
                      dailyAdvanceMovements.map((movement) => (
                        <tr key={movement.id} className="hover:bg-white/5">
                          <td className="td-style text-xs font-mono text-slate-400">
                            {new Date(movement.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </td>
                          <td className="td-style text-xs text-slate-300">
                            {movement.customerName || 'Cliente sin referencia'}
                          </td>
                          <td className="td-style text-xs">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${movement.movementType === 'payment' ? 'bg-[#11d483]/10 text-[#11d483]' : 'bg-red-500/10 text-red-400'}`}>
                              {movement.movementType === 'payment' ? 'ABONO ADELANTO' : 'DEVOLUCIÓN'}
                            </span>
                          </td>
                          <td className="td-style text-xs text-slate-300 uppercase">{formatPaymentMethod(movement.paymentMethod)}</td>
                          <td className="td-style text-right font-bold text-white">
                            {formatCurrency(movement.movementType === 'refund' ? -movement.amount : movement.amount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="td-style text-center text-slate-500 py-4 italic">
                          No hay movimientos de adelantos para esta fecha.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {saleToPrint && (
        <div className="fixed inset-0 bg-[#0b0f1a]/80 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className="bg-[#161c2d] p-6 rounded-3xl border border-white/10 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto custom-scrollbar relative">
            <button
              onClick={() => setSaleToPrint(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="mt-4 bg-white p-4 rounded-xl text-black">
              <Receipt
                sale={saleToPrint}
                customer={saleToPrint.customer || (reportData?.customers.find(c => c.id === saleToPrint.customerId)) || fallbackCustomer}
                seller={reportData?.users.find(u => u.id === saleToPrint.sellerId) || fallbackUser}
                items={saleToPrint.items?.map((item, idx) => ({
                  tempId: idx,
                  productId: (item as any).productId || '0',
                  name: item.name || 'Producto Desconocido',
                  quantity: item.quantity,
                  price: item.salePrice || 0,
                  stock: 0,
                  imei1: (item as any).imei1,
                  imei2: (item as any).imei2,
                  serialNumber: (item as any).serialNumber
                })) || []}
                payments={saleToPrint.payments?.map(p => ({
                  method: p.paymentMethod,
                  amount: p.amount,
                })) || []}
                total={saleToPrint.total}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReportScreen;
