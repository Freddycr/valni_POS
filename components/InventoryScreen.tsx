import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getProducts, getLocations } from '../services/api';
import { Product, InventoryLocation, Store } from '../types';
import { formatCurrency } from '../utils/formatting';

const LOCATION_FALLBACKS = ['TIENDA PRINCIPAL', 'ALMACEN PRINCIPAL'];

interface InventoryScreenProps {
    activeStoreId?: string;
    stores?: Store[];
}

const InventoryScreen: React.FC<InventoryScreenProps> = ({ activeStoreId, stores = [] }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [locations, setLocations] = useState<InventoryLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // Filters
    const [locationFilter, setLocationFilter] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [hideZeroStock, setHideZeroStock] = useState<boolean>(true);

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            try {
                const [fetchedProducts, fetchedLocations] = await Promise.all([
                    getProducts({ consolidated: true }),
                    getLocations()
                ]);
                setProducts(fetchedProducts);
                setLocations(fetchedLocations);

                const activeStoreName = stores.find(store => store.id === activeStoreId)?.name || '';
                const availableLocations = fetchedLocations.length > 0
                    ? fetchedLocations.map(location => location.name)
                    : [...LOCATION_FALLBACKS];
                fetchedProducts.forEach(product => {
                    if (product.location && !availableLocations.includes(product.location)) {
                        availableLocations.push(product.location);
                    }
                });

                setLocationFilter(prev => {
                    if (prev && availableLocations.includes(prev)) {
                        return prev;
                    }
                    if (activeStoreName && availableLocations.includes(activeStoreName)) {
                        return activeStoreName;
                    }
                    return '';
                });
            } catch (err) {
                setError('No se pudo cargar el inventario.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, [activeStoreId, stores]);

    const locationOptions = useMemo(() => {
        const names = locations.length > 0 ? locations.map(location => location.name) : [...LOCATION_FALLBACKS];
        products.forEach(product => {
            if (product.location && !names.includes(product.location)) {
                names.push(product.location);
            }
        });
        return names;
    }, [locations, products]);

    const primaryLocation = locationOptions[0] || '';

    const filteredProducts = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return products.filter(product => {
            const locationMatch = !locationFilter || product.location === locationFilter;
            const searchMatch = !query ||
                product.name?.toLowerCase().includes(query) ||
                product.brand?.toLowerCase().includes(query) ||
                product.model?.toLowerCase().includes(query) ||
                product.imei1?.toLowerCase().includes(query) ||
                product.imei2?.toLowerCase().includes(query) ||
                product.serialNumber?.toLowerCase().includes(query);

            const stockMatch = !hideZeroStock || product.stockQuantity > 0;

            return locationMatch && searchMatch && stockMatch;
        });
    }, [products, locationFilter, searchQuery, hideZeroStock]);

    const handlePrint = () => {
        const printContent = printRef.current;
        if (printContent) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Reporte de Inventario</title>
                            <style>
                                body { font-family: Arial, sans-serif; }
                                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                th { background-color: #f2f2f2; }
                                h1 { text-align: center; }
                            </style>
                        </head>
                        <body>
                            <h1>Reporte de Inventario - ${new Date().toLocaleDateString()}</h1>
                            ${printContent.innerHTML}
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            }
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="ml-4">Cargando inventario...</p>
            </div>
        );
    }

    if (error) {
        return <div className="p-4 text-center text-red-600 bg-red-100 rounded-md">{error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Inventario de Productos</h1>
                    <p className="text-slate-500 font-medium">Consulta el stock por ubicacion</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePrint}
                        className="btn btn-secondary !py-2"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Imprimir Reporte
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="card !bg-[#161c2d]/50 p-6 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Buscador</label>
                    <input
                        type="text"
                        placeholder="Buscar por nombre, IMEI, S/N..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-style w-full"
                    />
                </div>
                <div className="w-full md:w-48">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Ubicación</label>
                    <select
                        value={locationFilter}
                        onChange={e => setLocationFilter(e.target.value)}
                        className="input-style w-full"
                    >
                        <option value="">Todas</option>
                        {locationOptions.map(location => (
                            <option key={location} value={location}>{location}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center h-12">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={hideZeroStock}
                            onChange={e => setHideZeroStock(e.target.checked)}
                            className="accent-[#11d483] w-4 h-4"
                        />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Ocultar sin stock</span>
                    </label>
                </div>
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto rounded-xl border border-white/5" ref={printRef}>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th className="th-style">Producto</th>
                            <th className="th-style">IMEI 1</th>
                            <th className="th-style">IMEI 2 / S/N</th>
                            <th className="th-style text-center">Cant.</th>
                            <th className="th-style">Ubicación</th>
                            <th className="th-style text-right">Precio</th>
                            <th className="th-style">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredProducts.map(product => (
                            <tr key={product.id} className="hover:bg-white/5 transition-colors">
                                <td className="td-style">
                                    <div className="text-sm font-bold text-white">
                                        {product.name?.trim() || [product.brand, product.model].filter(value => value && value !== 'Genérico' && value !== 'N/A').join(' ') || 'Producto sin nombre'}
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                                        {[product.brand, product.model].filter(value => value && value !== 'Genérico' && value !== 'N/A').join(' ') || product.description || '-'}
                                    </div>
                                </td>
                                <td className="td-style font-mono text-xs text-slate-300">{product.imei1 || '-'}</td>
                                <td className="td-style font-mono text-xs text-slate-300">
                                    {product.imei2 || product.serialNumber || '-'}
                                    {product.imei2 && product.serialNumber && <div className="text-[9px] text-slate-500">SN: {product.serialNumber}</div>}
                                </td>
                                <td className="td-style text-white text-center font-bold">{product.stockQuantity}</td>
                                <td className="td-style">
                                    <span className={`px-2 py-0.5 text-[10px] leading-5 font-bold rounded-full ${product.location === primaryLocation ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                                        }`}>
                                        {product.location?.toUpperCase() || 'N/A'}
                                    </span>
                                </td>
                                <td className="td-style text-[#11d483] font-bold text-right">{formatCurrency(product.sellPrice || 0)}</td>
                                <td className="td-style">
                                    {(() => {
                                        const reg = String((product as any).registrationStatus || '').trim();
                                        const legacy = String((product as any).status || '').trim();
                                        const value = reg || (['No registrado', 'Registrado', 'Homologado'].includes(legacy) ? legacy : 'No registrado');
                                        const isRegistered = value === 'Registrado';
                                        return (
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isRegistered ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                {value.toUpperCase()}
                                            </span>
                                        );
                                    })()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryScreen;
