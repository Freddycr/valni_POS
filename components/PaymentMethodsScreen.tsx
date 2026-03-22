
import React, { useState, useEffect } from 'react';
import { PaymentMethodAdmin } from '../types';
import { getPaymentMethods, savePaymentMethod } from '../services/api';

interface PaymentMethodsScreenProps {
    userRole?: string;
}

const PaymentMethodsScreen: React.FC<PaymentMethodsScreenProps> = ({ userRole }) => {
    const canEdit = userRole === 'admin' || userRole === 'store_admin';
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodAdmin[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newMethod, setNewMethod] = useState({ name: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchPaymentMethods();
    }, []);

    const fetchPaymentMethods = async () => {
        setIsLoading(true);
        setError('');
        try {
            const fetchedMethods = await getPaymentMethods();
            setPaymentMethods(fetchedMethods);
        } catch (err) {
            setError("No se pudieron cargar los métodos de pago. Verifique permisos y la tabla 'payment_methods' en Supabase.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewMethod(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveMethod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMethod.name) {
            setError("El nombre del método no puede estar vacío.");
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            await savePaymentMethod(newMethod);
            setIsModalOpen(false);
            setNewMethod({ name: '' });
            await fetchPaymentMethods();
        } catch (error) {
            console.error("Failed to save payment method", error);
            setError(error instanceof Error ? error.message : "Error al guardar el método de pago.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Métodos de Pago</h1>
                    <p className="text-slate-600 text-sm mt-1">Configure las opciones de cobro para sus ventas</p>
                </div>
                {canEdit && <button onClick={() => setIsModalOpen(true)} className="btn btn-primary flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    CREAR MÉTODO
                </button>}
            </div>

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded" role="alert"><p>{error}</p></div>}

            <div className="card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="th-style">ID</th>
                                <th className="th-style">Nombre del Método</th>
                                <th className="th-style text-right">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {paymentMethods.map(method => (
                                <tr key={`${method.id}-${method.name}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="td-style text-slate-500 font-mono text-xs">{method.id}</td>
                                    <td className="td-style">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
                                                {method.name.charAt(0)}
                                            </div>
                                            <span className="font-semibold text-slate-900">{method.name}</span>
                                        </div>
                                    </td>
                                    <td className="td-style text-right">
                                        <span className="px-2 py-1 bg-[#11d483]/10 text-[#11d483] rounded-full text-[10px] font-bold uppercase border border-[#11d483]/20">
                                            Activo
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {isLoading && (
                                <tr><td colSpan={3} className="text-center p-10 text-slate-700">Cargando métodos...</td></tr>
                            )}
                            {!isLoading && paymentMethods.length === 0 && (
                                <tr><td colSpan={3} className="text-center p-10 text-slate-700 italic font-light">No se encontraron métodos de pago configurados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex justify-center items-center z-[110] p-4">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-slate-800">Nuevo Método</h2>
                            <p className="text-slate-600 text-sm">Añada una nueva forma de recibir pagos</p>
                        </div>
                        <form onSubmit={handleSaveMethod} className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wider">Nombre del Método</label>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Ej: Transferencia Interbank, Mercado Pago..."
                                    value={newMethod.name}
                                    onChange={handleInputChange}
                                    className="input-style"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary !px-6">CANCELAR</button>
                                <button type="submit" disabled={isLoading} className="btn btn-primary !px-8">
                                    {isLoading ? 'GUARDANDO...' : 'GUARDAR MÉTODO'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentMethodsScreen;
