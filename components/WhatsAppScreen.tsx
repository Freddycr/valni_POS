import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Sale, Product, SaleDetail } from '../types';
import { getCustomers, getSalesData, getProducts } from '../services/api';

const WhatsAppScreen: React.FC = () => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [saleDetails, setSaleDetails] = useState<SaleDetail[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
    const [message, setMessage] = useState('¡Hola {CLIENT_NAME}! 👋\n\nTenemos nuevas ofertas y accesorios que te encantarán. ¡No te los pierdas! 📱✨\n\nVisítanos en nuestra tienda para descubrir lo último en tecnología móvil.\n\n¡Te esperamos!\nEl equipo de TechStore');
    const [isLoading, setIsLoading] = useState(true);
    const [productStatusFilter, setProductStatusFilter] = useState<'Todos' | 'Registrado' | 'No registrado'>('Todos');

    // Calculate default dates (15 and 20 days ago)
    const defaultEndDate = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - 15);
        return date.toISOString().split('T')[0];
    }, []);

    const defaultStartDate = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - 20);
        return date.toISOString().split('T')[0];
    }, []);

    const [startDateFilter, setStartDateFilter] = useState(defaultStartDate);
    const [endDateFilter, setEndDateFilter] = useState(defaultEndDate);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const [customersData, salesData, productsData] = await Promise.all([
                getCustomers(),
                getSalesData(),
                getProducts()
            ]);
            setCustomers(customersData);
            setSales(salesData.sales);
            setSaleDetails(salesData.details);
            setProducts(productsData);
            setIsLoading(false);
        };
        fetchData();
    }, []);

    const filteredCustomers = useMemo(() => {
        const start = startDateFilter ? new Date(startDateFilter) : null;
        const end = endDateFilter ? new Date(endDateFilter) : null;

        // Normalize dates to start of day for comparison
        if (start) start.setUTCHours(0, 0, 0, 0);
        if (end) end.setUTCHours(23, 59, 59, 999);

        const salesInDateRange = sales.filter(sale => {
            const saleDate = new Date(sale.date);
            return (!start || saleDate >= start) && (!end || saleDate <= end);
        });

        const customerIdsWithMatchingProduct = new Set<string>();

        salesInDateRange.forEach(sale => {
            const detailsForSale = saleDetails.filter(d => d.saleId === sale.id);
            const hasMatchingProduct = detailsForSale.some(detail => {
                const product = products.find(p => p.id === detail.productId);
                if (!product) return false;

                if (productStatusFilter === 'Todos') return true;

                // Consider 'No registrado' for products that might not have the status field
                const productStatus = product.status || 'No registrado';
                return productStatus === productStatusFilter;
            });

            if (hasMatchingProduct) {
                customerIdsWithMatchingProduct.add(sale.customerId);
            }
        });

        return customers.filter(customer => customerIdsWithMatchingProduct.has(customer.id));
    }, [customers, sales, saleDetails, products, startDateFilter, endDateFilter, productStatusFilter]);


    const handleSelectCustomer = (customerId: string, isSelected: boolean) => {
        const newSelection = new Set(selectedCustomers);
        if (isSelected) {
            newSelection.add(customerId);
        } else {
            newSelection.delete(customerId);
        }
        setSelectedCustomers(newSelection);
    };

    const handleSelectAll = (select: boolean) => {
        if (select) {
            const allIds = new Set(filteredCustomers.map(c => c.id));
            setSelectedCustomers(allIds);
        } else {
            setSelectedCustomers(new Set());
        }
    };

    const handleSendMessages = () => {
        selectedCustomers.forEach(customerId => {
            const customer = customers.find(c => c.id === customerId);
            if (customer && customer.phone) {
                const personalizedMessage = message.replace(/{CLIENT_NAME}/g, customer.fullName.split(' ')[0]);
                const encodedMessage = encodeURIComponent(personalizedMessage);
                const phone = customer.phone.replace(/\D/g, '');
                const url = `https://wa.me/${phone}?text=${encodedMessage}`;
                window.open(url, '_blank');
            }
        });
    };

    if (isLoading) {
        return <div className="text-center p-10 font-semibold">Cargando datos...</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800">Envío Masivo WhatsApp</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <h2 className="text-xl font-semibold mb-4">1. Seleccionar Clientes</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label htmlFor="start-date-whatsapp" className="block text-sm font-medium text-gray-700">Ventas desde</label>
                            <input type="date" id="start-date-whatsapp" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} className="input-style" />
                        </div>
                        <div>
                            <label htmlFor="end-date-whatsapp" className="block text-sm font-medium text-gray-700">Ventas hasta</label>
                            <input type="date" id="end-date-whatsapp" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} className="input-style" />
                        </div>
                    </div>
                    <div className="mb-4">
                        <label htmlFor="product-status-filter" className="block text-sm font-medium text-gray-700">Filtrar por estado de producto</label>
                        <select
                            id="product-status-filter"
                            value={productStatusFilter}
                            onChange={e => setProductStatusFilter(e.target.value as any)}
                            className="input-style"
                        >
                            <option value="Todos">Todos</option>
                            <option value="Registrado">Registrado</option>
                            <option value="No registrado">No registrado</option>
                        </select>
                    </div>
                    <div className="flex justify-between items-center mb-2 pb-2 border-b">
                        <button onClick={() => handleSelectAll(true)} className="text-sm font-medium text-blue-600 hover:underline">Seleccionar Todos</button>
                        <button onClick={() => handleSelectAll(false)} className="text-sm font-medium text-blue-600 hover:underline">Deseleccionar Todos</button>
                    </div>
                    <p className="text-sm text-slate-500 mb-2">{selectedCustomers.size} de {filteredCustomers.length} seleccionados</p>
                    <div className="max-h-80 overflow-y-auto border rounded-md p-2 space-y-1">
                        {filteredCustomers.map(customer => (
                            <div key={customer.id} className="flex items-center p-2 hover:bg-gray-100 rounded">
                                <input
                                    type="checkbox"
                                    id={`customer-${customer.id}`}
                                    checked={selectedCustomers.has(customer.id)}
                                    onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor={`customer-${customer.id}`} className="ml-3 block text-sm font-medium text-gray-700">
                                    {customer.fullName} <span className="text-slate-500">({customer.phone})</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <h2 className="text-xl font-semibold mb-4">2. Preparar Mensaje</h2>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={12}
                        className="input-style w-full"
                        placeholder="Escribe tu mensaje aquí..."
                    />
                    <p className="text-xs text-slate-500 mt-2">
                        Usa <code className="bg-slate-200 text-red-600 font-mono p-0.5 rounded">{'{CLIENT_NAME}'}</code> para personalizar el nombre.
                    </p>
                </div>
            </div>

            <div className="text-center pt-4">
                <button
                    onClick={handleSendMessages}
                    disabled={selectedCustomers.size === 0 || isLoading}
                    className="btn btn-success py-3 px-8 text-lg font-bold"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Generar Enlaces de WhatsApp ({selectedCustomers.size})
                </button>
                <p className="text-sm text-gray-500 mt-4">
                    Se abrirá una pestaña de WhatsApp por cada cliente seleccionado.
                </p>
            </div>
        </div>
    );
};

export default WhatsAppScreen;