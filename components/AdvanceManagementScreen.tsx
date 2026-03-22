import React, { useEffect, useMemo, useState } from 'react';
import { Advance, AdvanceMovement, Customer, PaymentMethodAdmin, Product, Store } from '../types';
import {
    addAdvancePayment,
    applyAdvanceAmount,
    cancelAdvance,
    getAdvanceWithMovements,
    getAdvances,
    getCustomers,
    getPaymentMethods,
    getProducts,
    refundAdvanceAmount,
    saveAdvance
} from '../services/api';
import { formatCurrency } from '../utils/formatting';

const mapPaymentMethodToDb = (name: string): string => {
    const mapping: Record<string, string> = {
        'Efectivo': 'cash',
        'Tarjeta de Crédito': 'credit_card',
        'Tarjeta de Débito': 'debit_card',
        'Transferencia Bancaria': 'bank_transfer',
        'Yape': 'yape',
        'Plin': 'plin'
    };
    return mapping[name] || 'cash';
};

const statusClass: Record<string, string> = {
    open: 'bg-blue-500/10 text-blue-400',
    applied: 'bg-green-500/10 text-green-400',
    refunded: 'bg-amber-500/10 text-amber-400',
    cancelled: 'bg-red-500/10 text-red-400'
};

interface AdvanceManagementScreenProps {
    activeStoreId?: string;
    stores?: Store[];
}

const AdvanceManagementScreen: React.FC<AdvanceManagementScreenProps> = ({ activeStoreId, stores = [] }) => {
    const [advances, setAdvances] = useState<Advance[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodAdmin[]>([]);
    const [selectedAdvance, setSelectedAdvance] = useState<Advance | null>(null);
    const [movements, setMovements] = useState<AdvanceMovement[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scope, setScope] = useState<'active' | 'store' | 'consolidated'>('active');
    const [selectedStoreId, setSelectedStoreId] = useState<string>('');

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        customerId: '',
        kind: 'a_cuenta' as 'reserva_stock' | 'pedido_especial' | 'a_cuenta',
        targetProductId: '',
        targetProductName: '',
        expectedDeliveryDate: '',
        notes: '',
        initialAmount: 0,
        paymentMethod: 'cash',
        referenceNumber: ''
    });

    const [movementForm, setMovementForm] = useState({
        type: 'payment' as 'payment' | 'application' | 'refund',
        amount: 0,
        paymentMethod: 'cash',
        notes: '',
        saleId: ''
    });

    const paymentMethodOptions = useMemo(
        () => paymentMethods.filter(method => method.name !== 'Crédito'),
        [paymentMethods]
    );

    useEffect(() => {
        if (!selectedStoreId && stores.length > 0) {
            setSelectedStoreId(activeStoreId || stores[0].id);
        }
    }, [stores, activeStoreId, selectedStoreId]);

    const distinctProducts = useMemo(() => {
        const seen = new Set<string>();
        const unique: Array<{ product: Product; label: string }> = [];

        products.forEach(product => {
            const brand = (product.brand || '').trim();
            const model = (product.model || '').trim();
            const name = (product.name || '').trim();
            const label = brand || model
                ? `${brand || 'Sin marca'} ${model || 'Sin modelo'}`.trim()
                : name || 'Producto sin nombre';
            const key = label.toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            unique.push({ product, label });
        });

        return unique;
    }, [products]);

    const loadAdvances = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const scopedStoreId = scope === 'active'
                ? (activeStoreId || null)
                : (scope === 'store' ? (selectedStoreId || null) : null);
            const data = await getAdvances({
                storeId: scopedStoreId,
                consolidated: scope === 'consolidated'
            });
            setAdvances(data);
        } catch (err: any) {
            setError(err.message || 'No se pudieron cargar los adelantos.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadMasterData = async () => {
        try {
            const [customersData, productsData, methodsData] = await Promise.all([
                getCustomers(),
                getProducts({ consolidated: true }),
                getPaymentMethods()
            ]);
            setCustomers(customersData);
            setProducts(productsData);
            setPaymentMethods(methodsData);
        } catch (err) {
            console.error(err);
        }
    };

    const loadAdvanceDetail = async (advanceId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const detail = await getAdvanceWithMovements(advanceId);
            setSelectedAdvance(detail.advance);
            setMovements(detail.movements);
        } catch (err: any) {
            setError(err.message || 'No se pudo cargar el detalle del adelanto.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadMasterData();
    }, []);

    useEffect(() => {
        loadAdvances();
    }, [activeStoreId, selectedStoreId, scope]);

    const handleCreateAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.customerId) {
            setError('Debes seleccionar un cliente.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const selectedProduct = products.find(product => product.id === createForm.targetProductId);
            const scopedStoreId = scope === 'active'
                ? (activeStoreId || null)
                : (scope === 'store' ? (selectedStoreId || null) : null);
            const created = await saveAdvance({
                customerId: createForm.customerId,
                storeId: scopedStoreId || undefined,
                kind: createForm.kind,
                targetProductId: createForm.targetProductId || undefined,
                targetProductName: selectedProduct?.name || createForm.targetProductName || undefined,
                expectedDeliveryDate: createForm.expectedDeliveryDate || undefined,
                notes: createForm.notes || undefined,
                initialAmount: createForm.initialAmount,
                paymentMethod: createForm.paymentMethod,
                movementStoreId: scopedStoreId || undefined,
                referenceNumber: createForm.referenceNumber || undefined
            });

            setShowCreateModal(false);
            setCreateForm({
                customerId: '',
                kind: 'a_cuenta',
                targetProductId: '',
                targetProductName: '',
                expectedDeliveryDate: '',
                notes: '',
                initialAmount: 0,
                paymentMethod: 'cash',
                referenceNumber: ''
            });
            await loadAdvances();
            await loadAdvanceDetail(created.id);
        } catch (err: any) {
            setError(err.message || 'No se pudo crear el adelanto.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAdvance) return;

        setIsLoading(true);
        setError(null);
        try {
            const scopedStoreId = scope === 'active'
                ? (activeStoreId || null)
                : (scope === 'store' ? (selectedStoreId || null) : null);
            if (movementForm.type === 'payment') {
                await addAdvancePayment(selectedAdvance.id, movementForm.amount, movementForm.paymentMethod, movementForm.notes, undefined, scopedStoreId);
            } else if (movementForm.type === 'application') {
                await applyAdvanceAmount(selectedAdvance.id, movementForm.amount, movementForm.saleId || undefined, movementForm.notes, scopedStoreId);
            } else {
                await refundAdvanceAmount(selectedAdvance.id, movementForm.amount, movementForm.paymentMethod, movementForm.notes, scopedStoreId);
            }

            setMovementForm({
                type: 'payment',
                amount: 0,
                paymentMethod: 'cash',
                notes: '',
                saleId: ''
            });
            await loadAdvances();
            await loadAdvanceDetail(selectedAdvance.id);
        } catch (err: any) {
            setError(err.message || 'No se pudo registrar el movimiento.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelAdvance = async () => {
        if (!selectedAdvance) return;
        setIsLoading(true);
        setError(null);
        try {
            await cancelAdvance(selectedAdvance.id, selectedAdvance.notes);
            await loadAdvances();
            await loadAdvanceDetail(selectedAdvance.id);
        } catch (err: any) {
            setError(err.message || 'No se pudo cancelar el adelanto.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Gestión de Adelantos</h2>
                    <p className="text-slate-500 font-medium">Controla preventas, pagos a cuenta y reservas de equipos</p>
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
                <div className="flex gap-2">
                    <button className="btn btn-secondary" onClick={loadAdvances}>Actualizar</button>
                    <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ Nuevo Adelanto</button>
                </div>
            </header>

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
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

            {!selectedAdvance ? (
                <div className="card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/10">
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cliente</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Adelantado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Aplicado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Saldo</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {advances.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-10 text-center text-slate-500 italic">
                                            No hay adelantos registrados.
                                        </td>
                                    </tr>
                                ) : (
                                    advances.map(advance => (
                                        <tr key={advance.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-white">{advance.customerName || 'N/A'}</div>
                                                <div className="text-[10px] text-slate-500 uppercase">{advance.targetProductName || 'SIN PRODUCTO DEFINIDO'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-300 uppercase">{advance.kind.replace('_', ' ')}</td>
                                            <td className="px-6 py-4 text-right font-bold text-white">{formatCurrency(advance.totalAmount)}</td>
                                            <td className="px-6 py-4 text-right font-bold text-amber-300">{formatCurrency(advance.appliedAmount)}</td>
                                            <td className="px-6 py-4 text-right font-bold text-[#11d483]">{formatCurrency(advance.balance)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${statusClass[advance.status] || statusClass.open}`}>
                                                    {advance.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => loadAdvanceDetail(advance.id)}
                                                    className="p-2 rounded-lg bg-[#11d483]/10 text-[#11d483] opacity-0 group-hover:opacity-100 transition-all font-bold text-xs"
                                                >
                                                    DETALLES
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-6">
                        <div className="card !bg-[#161c2d]">
                            <h3 className="text-lg font-bold mb-6">Resumen del Adelanto</h3>
                            <div className="space-y-3">
                                <div className="p-4 rounded-xl bg-white/5 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Saldo Disponible</p>
                                    <p className="text-3xl font-black text-[#11d483]">{formatCurrency(selectedAdvance.balance)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase">Adelantado</p>
                                        <p className="text-sm font-bold text-white">{formatCurrency(selectedAdvance.totalAmount)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase">Aplicado</p>
                                        <p className="text-sm font-bold text-amber-300">{formatCurrency(selectedAdvance.appliedAmount)}</p>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5">
                                    <p className="text-[9px] font-bold text-slate-500 uppercase">Cliente</p>
                                    <p className="text-sm font-bold text-white">{selectedAdvance.customerName}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5">
                                    <p className="text-[9px] font-bold text-slate-500 uppercase">Producto/Pedido</p>
                                    <p className="text-sm font-bold text-white">{selectedAdvance.targetProductName || 'Pendiente de definir'}</p>
                                </div>
                                <button className="btn btn-secondary w-full" onClick={() => setSelectedAdvance(null)}>Volver al Listado</button>
                                <button
                                    className="btn btn-danger w-full"
                                    onClick={handleCancelAdvance}
                                    disabled={selectedAdvance.status === 'cancelled' || isLoading}
                                >
                                    Cancelar Adelanto
                                </button>
                            </div>
                        </div>

                        <div className="card">
                            <h4 className="text-md font-bold mb-4">Registrar Movimiento</h4>
                            <form className="space-y-3" onSubmit={handleSubmitMovement}>
                                <select
                                    className="input-style"
                                    value={movementForm.type}
                                    onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value as any })}
                                >
                                    <option value="payment">Abono</option>
                                    <option value="application">Aplicar a Venta</option>
                                    <option value="refund">Devolución</option>
                                </select>
                                <input
                                    type="number"
                                    className="input-style"
                                    placeholder="Monto"
                                    value={movementForm.amount}
                                    onChange={(e) => setMovementForm({ ...movementForm, amount: parseFloat(e.target.value) || 0 })}
                                    required
                                />
                                {movementForm.type !== 'application' && (
                                    <select
                                        className="input-style"
                                        value={movementForm.paymentMethod}
                                        onChange={(e) => setMovementForm({ ...movementForm, paymentMethod: e.target.value })}
                                    >
                                        {paymentMethodOptions.map(method => (
                                            <option key={method.id} value={mapPaymentMethodToDb(method.name)}>{method.name}</option>
                                        ))}
                                    </select>
                                )}
                                {movementForm.type === 'application' && (
                                    <input
                                        type="text"
                                        className="input-style"
                                        placeholder="ID de venta (opcional)"
                                        value={movementForm.saleId}
                                        onChange={(e) => setMovementForm({ ...movementForm, saleId: e.target.value })}
                                    />
                                )}
                                <textarea
                                    className="input-style"
                                    placeholder="Notas (opcional)"
                                    value={movementForm.notes}
                                    onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                                />
                                <button className="btn btn-primary w-full" type="submit" disabled={isLoading || selectedAdvance.status === 'cancelled'}>
                                    {isLoading ? 'Procesando...' : 'Registrar Movimiento'}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="lg:col-span-8">
                        <div className="card !p-0 overflow-hidden">
                            <div className="p-6 border-b border-white/10 bg-white/5">
                                <h3 className="text-lg font-bold">Historial de Movimientos</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-white/2 border-b border-white/5">
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fecha</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Monto</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Método</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {movements.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-10 text-center text-slate-500 italic">
                                                    Sin movimientos registrados.
                                                </td>
                                            </tr>
                                        ) : (
                                            movements.map(movement => (
                                                <tr key={movement.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-6 py-4 text-sm text-slate-300">{new Date(movement.createdAt).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-sm font-bold uppercase text-white">{movement.movementType}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-[#11d483]">{formatCurrency(movement.amount)}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-300">{movement.paymentMethod || '--'}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-400">{movement.notes || '--'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="card w-full max-w-2xl">
                        <h3 className="text-xl font-bold mb-4">Registrar Nuevo Adelanto</h3>
                        <form className="space-y-3" onSubmit={handleCreateAdvance}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <select
                                    className="input-style"
                                    value={createForm.customerId}
                                    onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
                                    required
                                >
                                    <option value="">Selecciona un cliente</option>
                                    {customers.map(customer => (
                                        <option key={customer.id} value={customer.id}>{customer.fullName} ({customer.docNumber})</option>
                                    ))}
                                </select>
                                <select
                                    className="input-style"
                                    value={createForm.kind}
                                    onChange={(e) => setCreateForm({ ...createForm, kind: e.target.value as any })}
                                >
                                    <option value="a_cuenta">A cuenta</option>
                                    <option value="reserva_stock">Reserva de stock</option>
                                    <option value="pedido_especial">Pedido especial</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <select
                                    className="input-style"
                                    value={createForm.targetProductId}
                                    onChange={(e) => setCreateForm({ ...createForm, targetProductId: e.target.value })}
                                >
                                    <option value="">Producto (opcional)</option>
                                    {distinctProducts.map(({ product, label }) => (
                                        <option key={product.id} value={product.id}>{label}</option>
                                    ))}
                                </select>
                                <input
                                    type="date"
                                    className="input-style"
                                    value={createForm.expectedDeliveryDate}
                                    onChange={(e) => setCreateForm({ ...createForm, expectedDeliveryDate: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input
                                    type="number"
                                    className="input-style"
                                    placeholder="Monto inicial"
                                    value={createForm.initialAmount}
                                    onChange={(e) => setCreateForm({ ...createForm, initialAmount: parseFloat(e.target.value) || 0 })}
                                />
                                <select
                                    className="input-style"
                                    value={createForm.paymentMethod}
                                    onChange={(e) => setCreateForm({ ...createForm, paymentMethod: e.target.value })}
                                >
                                    {paymentMethodOptions.map(method => (
                                        <option key={method.id} value={mapPaymentMethodToDb(method.name)}>{method.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    className="input-style"
                                    placeholder="Referencia (opcional)"
                                    value={createForm.referenceNumber}
                                    onChange={(e) => setCreateForm({ ...createForm, referenceNumber: e.target.value })}
                                />
                            </div>
                            <textarea
                                className="input-style"
                                placeholder="Notas del pedido/preventa"
                                value={createForm.notes}
                                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                            />
                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                    {isLoading ? 'Guardando...' : 'Crear Adelanto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvanceManagementScreen;
