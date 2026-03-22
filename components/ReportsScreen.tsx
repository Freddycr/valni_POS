import { formatCurrency } from '../utils/formatting';
import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { getSalesData, getPaymentMethods } from '../services/api';
import { Sale, Customer, Product, User, SaleDetail, PaymentMethodAdmin, PaymentDetail, AdvanceMovement, Store } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color?: string }> = ({ title, value, icon }) => (
    <div className="card relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
        <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
            {React.isValidElement(icon) ? icon : null}
        </div>
        <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[#11d483]">
                {icon}
            </div>
            <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
                <p className="text-3xl font-black text-white mt-1">{value}</p>
            </div>
        </div>
    </div>
);

interface ReportsScreenProps {
    activeStoreId?: string;
    stores?: Store[];
}

const ReportsScreen: React.FC<ReportsScreenProps> = ({ activeStoreId, stores = [] }) => {
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

    const formatPaymentMethod = (method?: string | null) => {
        const normalized = normalizeMethod(method);
        const mapping: Record<string, string> = {
            cash: 'Efectivo',
            efectivo: 'Efectivo',
            credit_card: 'Tarjeta de Crédito',
            'tarjeta de credito': 'Tarjeta de Crédito',
            debit_card: 'Tarjeta de Débito',
            'tarjeta de debito': 'Tarjeta de Débito',
            transfer: 'Transferencia Bancaria',
            bank_transfer: 'Transferencia Bancaria',
            transferencia: 'Transferencia Bancaria',
            'transferencia bancaria': 'Transferencia Bancaria',
            credit_installment: 'Crédito',
            credito: 'Crédito',
            advance: 'Adelanto',
            adelanto: 'Adelanto',
            yape: 'Yape',
            plin: 'Plin'
        };
        return mapping[normalized] || String(method || '');
    };

    const [sales, setSales] = useState<Sale[]>([]);
    const [saleDetails, setSaleDetails] = useState<SaleDetail[]>([]);
    const [payments, setPayments] = useState<PaymentDetail[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [advanceMovements, setAdvanceMovements] = useState<AdvanceMovement[]>([]);
    const [paymentOptions, setPaymentOptions] = useState<PaymentMethodAdmin[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [sellerFilter, setSellerFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [dniFilter, setDniFilter] = useState('');
    const [imei1Filter, setImei1Filter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
    const [scope, setScope] = useState<'active' | 'store' | 'consolidated'>('consolidated');
    const [selectedStoreId, setSelectedStoreId] = useState<string>('');

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedStoreId && stores.length > 0) {
            setSelectedStoreId(activeStoreId || stores[0].id);
        }
    }, [stores, activeStoreId, selectedStoreId]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const scopedStoreId = scope === 'active'
                    ? (activeStoreId || null)
                    : (scope === 'store' ? (selectedStoreId || null) : null);
                setError(null);
                const salesData = await getSalesData({
                    storeId: scopedStoreId,
                    consolidated: scope === 'consolidated'
                });
                setSales(salesData.sales || []);
                setSaleDetails(salesData.details || []);
                setPayments(salesData.payments || []);
                setProducts(salesData.products || []);
                setUsers(salesData.users || []);
                setCustomers(salesData.customers || []);
                setAdvanceMovements(salesData.advanceMovements || []);

                const paymentMethodsData = await getPaymentMethods();
                setPaymentOptions(paymentMethodsData);

            } catch (err) {
                console.error("Error fetching data for reports:", err);
                setError(err instanceof Error ? err.message : "Error desconocido al cargar los reportes.");
            } finally {
                setLoading(false);
            };
        };
        fetchData();
    }, [activeStoreId, selectedStoreId, scope]);

    const enrichedSales = useMemo(() => {
        const productsById = new Map(products.map(product => [product.id, product]));

        return sales.map(sale => {
            const items = saleDetails
                .filter(d => d.saleId === sale.id)
                .map(detail => {
                    const product = productsById.get(detail.productId);
                    return {
                        ...detail,
                        name: product ? product.name : 'Producto Desconocido',
                        description: product ? product.description : '',
                        brand: product ? product.brand : '',
                        model: product ? product.model : '',
                        status: product ? product.status : 'N/A',
                        imei1: detail.imei1 || ''
                    };
                });

            const detailTotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.salePrice || 0)), 0);
            const saleTotal = Number(sale.total || 0);
            const detailGap = Math.round((saleTotal - detailTotal + Number.EPSILON) * 100) / 100;

            if (Math.abs(detailGap) >= 0.01) {
                items.push({
                    id: `adj-${sale.id}`,
                    saleId: sale.id,
                    productId: `adj-${sale.id}`,
                    quantity: 1,
                    salePrice: detailGap,
                    name: detailGap > 0 ? 'Concepto adicional (migración sin detalle)' : 'Ajuste de detalle (migración)',
                    description: 'Ajuste automático por diferencia entre detalle y total',
                    brand: 'Ajuste',
                    model: 'Migración',
                    status: 'N/A',
                    imei1: '',
                    serialNumber: '',
                    isSyntheticAdjustment: true
                } as any);
            }

            const salePayments = payments.filter(p => p.saleId === sale.id);
            const customer = sale.customer || customers.find(c => c.id === sale.customerId);
            return {
                ...sale,
                items,
                payments: salePayments,
                customer
            };
        });
    }, [sales, saleDetails, payments, customers, products]);

    const distinctProductNames = useMemo(() => {
        const names = new Set<string>();
        products.forEach(p => names.add(p.name));
        return Array.from(names).sort();
    }, [products]);

    const paymentFilterOptions = useMemo(() => {
        const options = [...paymentOptions];
        const hasAdvance = advanceMovements.some(m => m.movementType === 'payment');
        if (hasAdvance && !options.some(o => o.name === 'Adelanto')) {
            options.push({ id: 9999, name: 'Adelanto' });
        }
        return options;
    }, [paymentOptions, advanceMovements]);

    const filteredSales = useMemo(() => {
        const result = enrichedSales.filter(sale => {
            const sellerMatch = !sellerFilter || sale.sellerId === sellerFilter;
            const productMatch = !productFilter || sale.items?.some(item => item.name === productFilter);
            const paymentMatch = !paymentFilter || sale.payments?.some(p =>
                normalizeMethod(formatPaymentMethod(p.paymentMethod)) === normalizeMethod(paymentFilter)
            );
            const dniMatch = !dniFilter || sale.customer?.docNumber.toLowerCase().includes(dniFilter.toLowerCase());
            const imei1Match = !imei1Filter || sale.items?.some(item =>
                (item as any).imei1?.toLowerCase().includes(imei1Filter.toLowerCase()) ||
                (item as any).serialNumber?.toLowerCase().includes(imei1Filter.toLowerCase())
            );

            // Ajustar fechas para comparar solo días o incluir el día completo
            const saleDate = new Date(sale.date);
            const startStr = startDate ? new Date(startDate + 'T00:00:00') : null;
            const endStr = endDate ? new Date(endDate + 'T23:59:59') : null;

            const startDateMatch = !startStr || saleDate >= startStr;
            const endDateMatch = !endStr || saleDate <= endStr;

            return sellerMatch && productMatch && paymentMatch && dniMatch && imei1Match && startDateMatch && endDateMatch;
        });

        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [enrichedSales, sellerFilter, productFilter, paymentFilter, dniFilter, imei1Filter, startDate, endDate]);

    const filteredAdvanceMovements = useMemo(() => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;

        return advanceMovements.filter(movement => {
            const movementDate = new Date(movement.createdAt);
            const startMatch = !start || movementDate >= start;
            const endMatch = !end || movementDate <= end;
            const paymentMatch = !paymentFilter ||
                normalizeMethod(formatPaymentMethod(movement.paymentMethod)) === normalizeMethod(paymentFilter) ||
                (normalizeMethod(paymentFilter) === 'adelanto' && movement.movementType === 'payment');
            return startMatch && endMatch && paymentMatch;
        });
    }, [advanceMovements, startDate, endDate, paymentFilter]);

    const totalRevenue = useMemo(() => {
        let sum = 0;
        if (paymentFilter) {
            filteredSales.forEach(sale => {
                sale.payments?.filter(p =>
                    normalizeMethod(formatPaymentMethod(p.paymentMethod)) === normalizeMethod(paymentFilter)
                )
                    .forEach(p => {
                        sum += p.amount;
                    });
            });
        } else {
            sum = filteredSales.reduce((acc, sale) => acc + sale.total, 0);
        }
        return sum;
    }, [filteredSales, paymentFilter]);

    const creditOriginated = useMemo(() => (
        filteredSales.reduce((sum, sale) => (
            sum + (sale.payments || [])
                .filter(payment => isCreditMethod(payment.paymentMethod) && !payment.isInstallment)
                .reduce((acc, payment) => acc + payment.amount, 0)
        ), 0)
    ), [filteredSales]);

    const advanceIncome = useMemo(() => (
        filteredAdvanceMovements
            .filter(movement => movement.movementType === 'payment')
            .reduce((sum, movement) => sum + movement.amount, 0)
    ), [filteredAdvanceMovements]);

    const advanceRefunds = useMemo(() => (
        filteredAdvanceMovements
            .filter(movement => movement.movementType === 'refund')
            .reduce((sum, movement) => sum + movement.amount, 0)
    ), [filteredAdvanceMovements]);

    const effectiveCash = useMemo(() => {
        const saleCash = filteredSales.reduce((sum, sale) => (
            sum + (sale.payments || [])
                .filter(payment => !isCreditMethod(payment.paymentMethod) && !isAdvanceMethod(payment.paymentMethod))
                .reduce((acc, payment) => acc + payment.amount, 0)
        ), 0);

        return saleCash + advanceIncome - advanceRefunds;
    }, [filteredSales, advanceIncome, advanceRefunds]);

    const averageTicket = useMemo(() => filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0, [totalRevenue, filteredSales]);

    const incomeByProduct = useMemo(() => {
        const productMap = new Map<string, number>();
        filteredSales.forEach(sale => {
            sale.items?.forEach(detail => {
                if ((detail as any).isSyntheticAdjustment) return;
                const productName = detail.name || 'Desconocido';
                productMap.set(productName, (productMap.get(productName) || 0) + (detail.quantity * detail.salePrice));
            });
        });
        return Array.from(productMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredSales]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 animate-pulse">
            <div className="w-12 h-12 border-4 border-[#11d483] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando Inteligencia de Negocio...</p>
        </div>
    );

    return (
        <div className="animate-fade-in space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Panel Comercial (Reportes)</h2>
                    <p className="text-slate-500 font-medium">Visualiza el rendimiento de tu negocio</p>
                    {scope !== 'consolidated' && (
                        <p className="text-xs text-[#11d483] font-bold uppercase tracking-wide mt-1">
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
            </header>

            {error && (
                <div className="card !bg-red-500/10 border border-red-500/25 text-red-200">
                    {error}
                </div>
            )}

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

            {/* Estadísticas Rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Caja Efectiva"
                    value={formatCurrency(effectiveCash)}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                    title="Facturación"
                    value={formatCurrency(totalRevenue)}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
                />
                <StatCard
                    title="Crédito Originado"
                    value={formatCurrency(creditOriginated)}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
                <StatCard
                    title="Adelantos Netos"
                    value={formatCurrency(advanceIncome - advanceRefunds)}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                />
                <StatCard
                    title="Ticket Promedio"
                    value={formatCurrency(averageTicket)}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
                <StatCard
                    title="Clientes Atendidos"
                    value={new Set(filteredSales.map(s => s.customerId)).size.toString()}
                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                />
            </div>

            {/* Filtros Avanzados */}
            <div className="card !bg-[#161c2d]/50">
                <div className="flex items-center gap-2 mb-6">
                    <svg className="w-5 h-5 text-[#11d483]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    <h3 className="text-lg font-bold text-white">Filtros Avanzados</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} className="input-style">
                        <option value="">Vendedores</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                    </select>
                    <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="input-style">
                        <option value="">Productos</option>
                        {distinctProductNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="input-style">
                        <option value="">Método de Pago</option>
                        {paymentFilterOptions.map(opt => <option key={opt.id} value={opt.name}>{opt.name}</option>)}
                    </select>
                    <input type="text" value={dniFilter} onChange={e => setDniFilter(e.target.value)} className="input-style" placeholder="DNI Cliente" />
                    <input type="text" value={imei1Filter} onChange={e => setImei1Filter(e.target.value)} className="input-style" placeholder="IMEI / S/N" />
                    <div className="flex gap-2 lg:col-span-1 xl:col-span-1">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-style !py-1 text-xs" />
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-style !py-1 text-xs" />
                    </div>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <h3 className="text-lg font-bold text-white mb-6">Top 10 Productos por Ingresos</h3>
                    <div className="h-[400px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={incomeByProduct}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `S/ ${v}`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                                    itemStyle={{ color: '#11d483' }}
                                />
                                <Bar dataKey="value" name="Ingresos" fill="#11d483" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card">
                    <h3 className="text-lg font-bold text-white mb-6">Transacciones Recientes</h3>
                    <div className="overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        <div className="space-y-4">
                            {filteredSales.slice(0, 10).map(sale => (
                                <div key={sale.id} className="flex flex-col rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors overflow-hidden">
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer"
                                        onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                                                {sale.customer?.fullName?.charAt(0) || 'C'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">{sale.customer?.fullName || 'Consumidor Final'}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {new Date(sale.date).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} • {users.find(u => u.id === sale.sellerId)?.fullName || 'Vendedor Sistema'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-sm font-black text-[#11d483]">{formatCurrency(sale.total)}</p>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">
                                                    {sale.payments?.map(p => formatPaymentMethod(p.paymentMethod)).join(' / ') || 'CONTADO'}
                                                </p>
                                            </div>
                                            <svg className={`w-4 h-4 text-slate-500 transition-transform ${expandedSaleId === sale.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>

                                    {expandedSaleId === sale.id && (
                                        <div className="px-3 pb-3 pt-1 border-t border-white/5 bg-black/20 animate-fade-in">
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Productos:</p>
                                                {sale.items?.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-start text-xs border-b border-white/5 pb-1">
                                                        <div>
                                                            <span className="text-white font-bold">{item.quantity}x</span> {[item.brand, item.model].filter(Boolean).join(' ').trim() || item.name || 'Producto Desconocido'}
                                                            {item.imei1 && <p className="text-[9px] text-slate-500 font-mono">IMEI: {item.imei1}</p>}
                                                        </div>
                                                        <span className="text-slate-300 font-medium">{formatCurrency(item.salePrice * item.quantity)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabla Detallada */}
            <div className="card">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-extrabold text-white">Historial de Ventas</h3>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{filteredSales.length} OPERACIONES</div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th className="th-style">Fecha</th>
                                <th className="th-style">Cliente</th>
                                <th className="th-style">Vendedor</th>
                                <th className="th-style">Productos / Detalle</th>
                                <th className="th-style">Método</th>
                                <th className="th-style text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredSales.map(sale => {
                                return (
                                    <tr key={sale.id} className="hover:bg-white/5 transition-colors">
                                        <td className="td-style">
                                            <div className="text-xs text-white font-bold">{new Date(sale.date).toLocaleDateString()}</div>
                                            <div className="text-[9px] text-slate-500">{new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td className="td-style">
                                            <div className="text-sm font-bold text-white">{sale.customer?.fullName || 'Consumidor Final'}</div>
                                            <div className="text-[10px] text-slate-500">{sale.customer?.docNumber || 'SD'}</div>
                                        </td>
                                        <td className="td-style text-xs font-medium text-slate-300">
                                            {users.find(u => u.id === sale.sellerId)?.fullName || 'Sistema'}
                                        </td>
                                        <td className="td-style">
                                            {sale.items?.map((item, idx) => (
                                                <div key={idx} className="mb-1 last:mb-0">
                                                    <div className="text-[11px] text-slate-200 font-bold truncate max-w-[250px]">
                                                        {item.quantity}x {[item.brand, item.model].filter(Boolean).join(' ').trim() || item.name || 'Producto Desconocido'}
                                                    </div>
                                                    {item.imei1 && (
                                                        <div className="text-[9px] font-mono text-slate-500">IMEI: {item.imei1}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </td>
                                        <td className="td-style">
                                            <div className="flex flex-wrap gap-1">
                                                {sale.payments?.map((p, idx) => (
                                                    <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-slate-400">
                                                        {formatPaymentMethod(p.paymentMethod)}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="td-style text-right">
                                            <span className="text-sm font-black text-[#11d483]">{formatCurrency(sale.total)}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReportsScreen;
