import React, { useState, useEffect } from 'react';
import { Credit, CreditInstallment, User, Store } from '../types';
import { getCredits, getCreditWithInstallments, payInstallment, getPaymentMethods } from '../services/api';
import { formatCurrency } from '../utils/formatting';
import InstallmentReceipt from './InstallmentReceipt';

interface CreditManagementScreenProps {
    activeStoreId?: string;
    stores?: Store[];
}

const CreditManagementScreen: React.FC<CreditManagementScreenProps> = ({ activeStoreId, stores = [] }) => {
    const [credits, setCredits] = useState<Credit[]>([]);
    const [selectedCredit, setSelectedCredit] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'overdue'>('all');
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [paymentModal, setPaymentModal] = useState<{
        show: boolean;
        installment: CreditInstallment | null;
        amount: number;
        method: string;
    }>({ show: false, installment: null, amount: 0, method: 'cash' });
    const [receiptData, setReceiptData] = useState<any>(null);

    useEffect(() => {
        fetchPaymentMethods();
    }, []);

    const fetchCredits = async () => {
        setIsLoading(true);
        try {
            const data = await getCredits({
                storeId: activeStoreId || null,
                status: statusFilter === 'overdue' ? 'overdue' : undefined
            });
            setCredits(data);
        } catch (err) {
            setError("Error al cargar créditos");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCredits();
    }, [activeStoreId, statusFilter]);

    useEffect(() => {
        const applyQuickFilter = (filter: string | null) => {
            if (filter === 'overdue') {
                setStatusFilter('overdue');
                setSelectedCredit(null);
            }
        };

        if (typeof window !== 'undefined') {
            const pendingFilter = window.localStorage.getItem('valni_credits_quick_filter');
            applyQuickFilter(pendingFilter);
            if (pendingFilter) {
                window.localStorage.removeItem('valni_credits_quick_filter');
            }
        }

        const onQuickFilter = (event: Event) => {
            const detail = (event as CustomEvent)?.detail || {};
            applyQuickFilter(detail.filter || null);
        };

        window.addEventListener('valni:credits-quick-filter', onQuickFilter as EventListener);
        return () => window.removeEventListener('valni:credits-quick-filter', onQuickFilter as EventListener);
    }, []);

    const fetchPaymentMethods = async () => {
        try {
            const methods = await getPaymentMethods();
            setPaymentMethods(methods);
        } catch (err) {
            console.error("Error al cargar métodos de pago", err);
        }
    };

    const handleViewDetails = async (credit: Credit) => {
        setIsLoading(true);
        try {
            const details = await getCreditWithInstallments(credit.id);
            setSelectedCredit(details);
        } catch (err) {
            setError("Error al cargar detalles del crédito");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenPayment = (inst: CreditInstallment) => {
        setPaymentModal({
            show: true,
            installment: inst,
            amount: inst.amount - inst.paidAmount,
            method: 'cash'
        });
    };

    const handleRegisterPayment = async () => {
        if (!paymentModal.installment || !selectedCredit) return;

        setIsLoading(true);
        try {
            await payInstallment(
                paymentModal.installment.id,
                paymentModal.amount,
                paymentModal.method,
                selectedCredit.sale_id,
                activeStoreId || null
            );

            // Preparar datos para el recibo antes de limpiar el modal
            const totalBalanceBefore = selectedCredit.balance;
            const totalBalanceAfter = totalBalanceBefore - paymentModal.amount;
            const installmentBalance = (paymentModal.installment.amount - paymentModal.installment.paidAmount) - paymentModal.amount;

            setReceiptData({
                customerName: selectedCredit.customerName,
                saleNumber: selectedCredit.saleNumber,
                installmentNumber: paymentModal.installment.installmentNumber,
                amountPaid: paymentModal.amount,
                installmentBalance: Math.max(0, installmentBalance),
                totalBalanceBefore: totalBalanceBefore,
                totalBalanceAfter: Math.max(0, totalBalanceAfter),
                paymentMethod: paymentModal.method,
                date: new Date().toISOString()
            });

            // Refrescar datos
            const details = await getCreditWithInstallments(selectedCredit.id);
            setSelectedCredit(details);
            setPaymentModal({ ...paymentModal, show: false });
            fetchCredits();
        } catch (err) {
            setError("Error al registrar el pago");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const sendWhatsAppAlert = (inst: CreditInstallment) => {
        if (!selectedCredit || !selectedCredit.customerPhone) return;

        const message = `Hola ${selectedCredit.customerName}, te recordamos que tienes una cuota pendiente del crédito #${selectedCredit.saleNumber} por un monto de ${formatCurrency(inst.amount)}. Fecha de vencimiento: ${inst.dueDate}.`;
        const url = `https://wa.me/51${selectedCredit.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleReprintReceipt = (inst: CreditInstallment) => {
        if (!selectedCredit) return;

        setReceiptData({
            customerName: selectedCredit.customerName,
            saleNumber: selectedCredit.saleNumber,
            installmentNumber: inst.installmentNumber,
            amountPaid: inst.paidAmount,
            installmentBalance: inst.amount - inst.paidAmount,
            totalBalanceBefore: selectedCredit.balance + inst.paidAmount, // Aproximación
            totalBalanceAfter: selectedCredit.balance,
            paymentMethod: 'cash', // No guardamos el método exacto por cuota en el objeto inst, pero se podría mejorar
            date: inst.paymentDate || new Date().toISOString()
        });
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Gestión de Créditos</h2>
                    <p className="text-slate-500 font-medium">Monitorea y cobra las ventas al crédito</p>
                    {activeStoreId && (
                        <p className="text-xs text-[#11d483] font-bold uppercase tracking-wide mt-1">
                            Tienda de cobranza activa: {stores.find(store => store.id === activeStoreId)?.name || 'No definida'}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchCredits} className="btn btn-secondary">Actualizar</button>
                    {selectedCredit && (
                        <button onClick={() => setSelectedCredit(null)} className="btn btn-secondary">Volver al Listado</button>
                    )}
                </div>
            </header>

            {!selectedCredit && (
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border ${statusFilter === 'all' ? 'bg-[#11d483]/15 text-[#11d483] border-[#11d483]/40' : 'bg-white/5 text-slate-300 border-white/10'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setStatusFilter('overdue')}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border ${statusFilter === 'overdue' ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'bg-white/5 text-slate-300 border-white/10'}`}
                    >
                        Solo Vencidos
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {!selectedCredit ? (
                <div className="card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/10">
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cliente</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Crédito Total</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Saldo</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Cuotas</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Vencimiento</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {credits.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-10 text-center text-slate-500 italic">
                                            {statusFilter === 'overdue' ? 'No hay créditos vencidos en este alcance' : 'No hay créditos registrados'}
                                        </td>
                                    </tr>
                                ) : (
                                    credits.map(credit => (
                                        <tr key={credit.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-white">{credit.customerName}</div>
                                                <div className="text-[10px] text-slate-500 uppercase">VENTA: {credit.saleNumber}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-bold text-white">{formatCurrency(credit.totalCredit)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className={`text-sm font-bold ${credit.balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                                                    {formatCurrency(credit.balance)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-sm text-slate-300 font-bold">{credit.numberOfInstallments}</div>
                                                <div className="text-[9px] text-slate-500 uppercase">{credit.periodicity}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${credit.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                                                    credit.status === 'overdue' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                                                    }`}>
                                                    {credit.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-sm font-mono text-slate-300">{credit.nextDueDate || '--'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleViewDetails(credit)}
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
                    {/* Resumen del crédito seleccionado */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="card !bg-[#161c2d]">
                            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-[#11d483] rounded-full"></span>
                                Resumen del Crédito
                            </h3>
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Saldo Pendiente</p>
                                    <p className="text-3xl font-black text-[#11d483]">{formatCurrency(selectedCredit.balance)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase">Total Crédito</p>
                                        <p className="text-sm font-bold text-white">{formatCurrency(selectedCredit.total_credit)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase">Interés</p>
                                        <p className="text-sm font-bold text-white">{selectedCredit.interest_rate}%</p>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Cliente</p>
                                        <p className="text-md font-bold text-white">{selectedCredit.customerName}</p>
                                        <p className="text-xs text-slate-400">{selectedCredit.customerPhone}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Factura/Venta</p>
                                        <p className="text-md font-bold text-white">#{selectedCredit.saleNumber}</p>
                                    </div>
                                    <div className="pt-4">
                                        <button
                                            onClick={() => window.open(`https://wa.me/51${selectedCredit.customerPhone?.replace(/\D/g, '')}`, '_blank')}
                                            className="w-full btn btn-primary !bg-[#25D366] hover:!bg-[#128C7E] flex items-center justify-center gap-2"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                                            Contactar WhatsApp
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de cuotas */}
                    <div className="lg:col-span-8">
                        <div className="card !p-0 overflow-hidden">
                            <div className="p-6 border-b border-white/10 bg-white/5">
                                <h3 className="text-lg font-bold">Plan de Pagos / Cuotas</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-white/2 border-b border-white/5">
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">#</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fecha Venc.</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Monto</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Pagado</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {selectedCredit.installments.map((inst: CreditInstallment) => (
                                            <tr key={inst.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4 text-center font-bold text-slate-500">{inst.installmentNumber}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-white">{inst.dueDate}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-white text-right">{formatCurrency(inst.amount)}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-[#11d483] text-right">{formatCurrency(inst.paidAmount)}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${inst.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                                                        inst.status === 'overdue' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'
                                                        }`}>
                                                        {inst.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                    {inst.status !== 'paid' ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenPayment(inst)}
                                                                className="btn btn-primary !py-1 !px-3 !text-[10px] !rounded-lg"
                                                            >
                                                                COBRAR
                                                            </button>
                                                            <button
                                                                onClick={() => sendWhatsAppAlert(inst)}
                                                                className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all tooltip"
                                                                title="Enviar Recordatorio"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                                </svg>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleReprintReceipt(inst)}
                                                            className="p-1.5 rounded-lg bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 transition-all tooltip"
                                                            title="Reimprimir Recibo"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de cobro */}
            {paymentModal.show && paymentModal.installment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="card w-full max-w-sm border-white/10 shadow-2xl animate-shake">
                        <h3 className="text-xl font-bold mb-4">Registrar Cobro</h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Cobro de cuota #{paymentModal.installment.installmentNumber} del cliente {selectedCredit?.customerName}
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Monto a Cobrar</label>
                                <input
                                    type="number"
                                    value={paymentModal.amount}
                                    onChange={e => setPaymentModal({ ...paymentModal, amount: parseFloat(e.target.value) || 0 })}
                                    className="input-style !text-lg !font-bold text-[#11d483]"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Sugerido: {formatCurrency(paymentModal.installment.amount - paymentModal.installment.paidAmount)}</p>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Método de Pago</label>
                                <select
                                    value={paymentModal.method}
                                    onChange={e => setPaymentModal({ ...paymentModal, method: e.target.value })}
                                    className="input-style"
                                >
                                    {paymentMethods.filter(m => m.name !== 'Cr\u00E9dito').map(m => {
                                        const dbValue = ({
                                            'Efectivo': 'cash',
                                            'Tarjeta de Cr\u00E9dito': 'credit_card',
                                            'Tarjeta de D\u00E9bito': 'debit_card',
                                            'Transferencia Bancaria': 'bank_transfer',
                                            'Yape': 'yape',
                                            'Plin': 'plin'
                                        } as Record<string, string>)[m.name] || 'cash';
                                        return (
                                            <option key={m.id} value={dbValue}>{m.name}</option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className="flex gap-2 pt-4">
                                <button
                                    onClick={handleRegisterPayment}
                                    className="btn btn-primary flex-1 !py-3"
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'REGISTRANDO...' : 'CONFIRMAR PAGO'}
                                </button>
                                <button
                                    onClick={() => setPaymentModal({ ...paymentModal, show: false })}
                                    className="btn btn-secondary !py-3"
                                >
                                    CANCELAR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Componente de Impresión (Invisible) */}
            {receiptData && (
                <InstallmentReceipt
                    {...receiptData}
                    onPrint={() => setReceiptData(null)}
                />
            )}
        </div>
    );
};

export default CreditManagementScreen;
