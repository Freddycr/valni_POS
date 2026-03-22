import { formatCurrency } from '../utils/formatting';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, Brand, Model, InventoryLocation, Store } from '../types';
import { getProducts, saveProduct, getBrands, getModels, updateProduct, updateProductsBulk, getLocations, saveLocation, deleteLocation, replaceProductLocation, getSuppliers, saveSupplier } from '../services/api';

const LOCATION_FALLBACKS = ['Tienda', 'Almacen'];

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getErrorMessage = (err: any): string => {
  if (!err) return 'Error desconocido.';
  if (typeof err === 'string') return err;

  const message = String(err.message || '').trim();
  const details = String(err.details || '').trim();
  const hint = String(err.hint || '').trim();

  const parts = [message, details, hint].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Error desconocido.';
};

const toLocalDateInput = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateTime = (value?: string): string => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('es-PE');
};

const ProductForm = ({
  product,
  onSave,
  onCancel,
  onCreateSupplier,
  brands,
  models,
  suppliers,
  locations,
  isLoading,
  error,
  minPriceOffset,
}: {
  product: Partial<Product>;
  onSave: (product: Partial<Product>) => void;
  onCancel: () => void;
  onCreateSupplier: (supplierName: string) => Promise<{ id: string; name: string }>;
  brands: Brand[];
  models: Model[];
  suppliers: Array<{ id: string | number; name: string }>;
  locations: string[];
  isLoading: boolean;
  error: string | null;
  minPriceOffset: number;
}) => {
  const [formData, setFormData] = useState(product);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [isSupplierSaving, setIsSupplierSaving] = useState(false);

  useEffect(() => {
    setFormData(product);
  }, [product]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    let newFormData: Partial<Product> = { ...formData };

    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      newFormData = { ...newFormData, [name]: checked };
    } else if (type === 'number') {
      newFormData = { ...newFormData, [name]: value === '' ? undefined : parseFloat(value) };
    } else {
      newFormData = { ...newFormData, [name]: value };
    }

    if (name === 'type' && value === 'individual') {
      newFormData.stock = 1;
    }

    if (newFormData.type === 'individual') {
      if (name === 'brand' || name === 'model' || (name === 'type' && value === 'individual')) {
        const brand = name === 'brand' ? value : newFormData.brand;
        const model = name === 'model' ? value : newFormData.model;
        newFormData.name = `${brand || ''} ${model || ''}`.trim();
      }
      if (name === 'price') {
        const price = parseFloat(value);
        if (!isNaN(price)) {
          // Si el precio mínimo no se ha tocado o es el calculado por defecto, lo actualizamos
          const prevPrice = parseFloat(formData.price?.toString() || '0');
          const prevMinPrice = parseFloat(formData.minPrice?.toString() || '0');
          const defaultMinPrice = prevPrice - minPriceOffset;

          if (!formData.minPrice || prevMinPrice === defaultMinPrice || prevMinPrice === 0) {
            newFormData.minPrice = price - minPriceOffset;
          }
        } else {
          // Si se limpia el precio, limpiamos el precio mínimo si era el calculado por defecto
          const prevPrice = parseFloat(formData.price?.toString() || '0');
          const prevMinPrice = parseFloat(formData.minPrice?.toString() || '0');
          const defaultMinPrice = prevPrice - minPriceOffset;
          if (!formData.minPrice || prevMinPrice === defaultMinPrice) {
            newFormData.minPrice = undefined;
          }
        }
      }

      // Si el usuario cambia manualmente el precio mínimo, lo respetamos
      if (name === 'minPrice') {
        const minPrice = value === '' ? undefined : parseFloat(value);
        newFormData.minPrice = minPrice;
      }
    }

    setFormData(newFormData);
  };

  const handleSave = () => {
    onSave(formData);
  };

  const handleCreateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSupplierName.trim();
    if (!trimmed) {
      setSupplierError('El nombre del proveedor es obligatorio.');
      return;
    }

    setSupplierError(null);
    setIsSupplierSaving(true);
    try {
      const createdSupplier = await onCreateSupplier(trimmed);
      setFormData(prev => ({ ...prev, supplierId: createdSupplier.id }));
      setNewSupplierName('');
      setIsSupplierModalOpen(false);
    } catch (err: any) {
      setSupplierError(err?.message || 'No se pudo crear el proveedor.');
    } finally {
      setIsSupplierSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm overflow-y-auto h-full w-full flex items-start justify-center py-10 px-4 z-[100]">
      <div className="relative mx-auto p-8 border border-slate-200 w-full max-w-4xl shadow-2xl rounded-2xl bg-white text-slate-900">
        <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
          <h3 className="text-2xl font-bold text-slate-900">
            {formData.id ? 'Editar Producto' : 'Nuevo Producto'}
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm font-medium">{error}</p>
        </div>}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Columna 1 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tipo de Producto</label>
              <select name="type" value={formData.type || 'individual'} onChange={handleChange} className="input-style w-full mt-1">
                <option value="generic">Genérico</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
              <input type="text" name="name" placeholder="Nombre del producto" value={formData.name || ''} onChange={handleChange} className="input-style w-full mt-1" disabled={formData.type === 'individual'} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción</label>
              <textarea name="description" placeholder="Descripción del producto" value={formData.description || ''} onChange={handleChange} className="input-style w-full mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Color</label>
                <input type="text" name="color" placeholder="Color" value={formData.color || ''} onChange={handleChange} className="input-style w-full mt-1" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">RAM</label>
                <input type="text" name="ram" placeholder="RAM" value={formData.ram || ''} onChange={handleChange} className="input-style w-full mt-1" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ROM</label>
                <input type="text" name="rom" placeholder="ROM" value={formData.rom || ''} onChange={handleChange} className="input-style w-full mt-1" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Precio de Compra</label>
              <input type="number" min="0" step="0.01" name="buyPrice" placeholder="Costo" value={formData.buyPrice ?? ''} onChange={handleChange} className="input-style w-full mt-1" />
            </div>
            {formData.type === 'generic' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Precio</label>
                  <input type="number" min="0" step="0.01" name="price" placeholder="Precio" value={formData.price ?? ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Stock</label>
                  <input type="number" min="0" name="stock" placeholder="Stock" value={formData.stock ?? 0} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
              </div>
            )}
          </div>

          {/* Columna 2 - Campos para productos individuales */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Proveedor</label>
                <button
                  type="button"
                  onClick={() => {
                    setSupplierError(null);
                    setIsSupplierModalOpen(true);
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  + Agregar proveedor
                </button>
              </div>
              <select name="supplierId" value={String(formData.supplierId || '')} onChange={handleChange} className="input-style w-full mt-1">
                <option value="">Seleccione proveedor</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={String(supplier.id)}>{supplier.name}</option>
                ))}
              </select>
            </div>
            {formData.type === 'individual' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Marca</label>
                    <select name="brand" value={formData.brand || ''} onChange={handleChange} className="input-style w-full mt-1">
                      <option value="">Seleccione una marca</option>
                      {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Modelo</label>
                    <select name="model" value={formData.model || ''} onChange={handleChange} className="input-style w-full mt-1" disabled={!formData.brand}>
                      <option value="">Seleccione un modelo</option>
                      {models.filter(m => {
                        const selectedBrand = brands.find(b => b.name === formData.brand);
                        return selectedBrand && m.brandId === selectedBrand.id;
                      }).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">IMEI 1</label>
                  <input type="text" name="imei1" placeholder="IMEI 1" value={formData.imei1 || ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">IMEI 2</label>
                  <input type="text" name="imei2" placeholder="IMEI 2" value={formData.imei2 || ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Número de Serie</label>
                  <input type="text" name="serialNumber" placeholder="Número de Serie" value={formData.serialNumber || ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Precio</label>
                  <input type="number" min="0" step="0.01" name="price" placeholder="Precio" value={formData.price ?? ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Precio Mínimo</label>
                  <input type="number" min="0" step="0.01" name="minPrice" placeholder="Precio Mínimo" value={formData.minPrice ?? ''} onChange={handleChange} className="input-style w-full mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Stock</label>
                  <input type="number" min="1" name="stock" placeholder="Stock" value={formData.stock ?? 1} onChange={handleChange} className="input-style w-full mt-1" readOnly={formData.type === 'individual'} />
                  {formData.type === 'individual' && (
                    <p className="text-xs text-slate-500 mt-1">Los productos individuales siempre tienen stock de 1</p>
                  )}
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Ubicación</label>
              <select name="location" value={formData.location || ''} onChange={handleChange} className="input-style w-full mt-1">
                <option value="">Seleccione ubicación</option>
                {locations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Estado</label>
              <select name="status" value={formData.status || 'No registrado'} onChange={handleChange} className="input-style w-full mt-1">
                <option value="Registrado">Registrado</option>
                <option value="No registrado">No registrado</option>
                <option value="Homologado">Homologado</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-2 mt-6">
          <button onClick={onCancel} className="btn btn-secondary">Cancelar</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {isSupplierModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4 z-[220]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-bold text-slate-900">Nuevo proveedor</h4>
            <p className="text-sm text-slate-600 mt-1">Registra el proveedor y selecciónalo para este producto.</p>
            <form onSubmit={handleCreateSupplierSubmit} className="mt-4 space-y-4">
              <input
                type="text"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="input-style w-full"
                autoFocus
              />
              {supplierError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {supplierError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsSupplierModalOpen(false);
                    setSupplierError(null);
                    setNewSupplierName('');
                  }}
                  disabled={isSupplierSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSupplierSaving}>
                  {isSupplierSaving ? 'Guardando...' : 'Guardar proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


interface ProductManagementScreenProps {
  activeStoreId?: string;
  stores?: Store[];
  userRole?: string;
}

const ProductManagementScreen: React.FC<ProductManagementScreenProps> = ({ activeStoreId, stores = [], userRole }) => {
  const canEditCatalog = userRole === 'admin' || userRole === 'store_admin' || userRole === 'inventory_manager';
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Product> | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [minPriceOffset, setMinPriceOffset] = useState<number>(59); // New state variable
  const [locationNameInput, setLocationNameInput] = useState('');
  const [editingLocation, setEditingLocation] = useState<InventoryLocation | null>(null);
  const [locationActionLoading, setLocationActionLoading] = useState(false);
  const [isLocationPanelOpen, setIsLocationPanelOpen] = useState(false);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [bulkMoveFilters, setBulkMoveFilters] = useState({
    fromLocation: '',
    toLocation: '',
    minStock: 1
  });
  const [productFilters, setProductFilters] = useState({
    purchaseDate: '',
    name: '',
    imei: '',
    minStock: '1',
    location: '',
    brand: '',
    description: '',
    status: ''
  });
  const canSaveLocation = locationNameInput.trim().length > 0;

  const locationOptions = useMemo(() => {
    const names = locations.length > 0 ? locations.map(loc => loc.name) : [...LOCATION_FALLBACKS];

    products.forEach(product => {
      if (product.location && !names.includes(product.location)) {
        names.push(product.location);
      }
    });

    if (formData?.location && !names.includes(formData.location)) {
      names.push(formData.location);
    }

    return names;
  }, [locations, products, formData?.location]);

  const fetchProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const productsData = await getProducts({ consolidated: true });
      setProducts(productsData);
    } catch (err) {
      setError("Error al cargar los productos.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [productsData, fetchedBrands, fetchedModels, fetchedLocations, fetchedSuppliers] = await Promise.all([
          getProducts({ consolidated: true }),
          getBrands(),
          getModels(),
          getLocations(),
          getSuppliers().catch(() => [])
        ]);
        setProducts(productsData);
        setBrands(fetchedBrands);
        setModels(fetchedModels);
        setLocations(fetchedLocations);
        setSuppliers((fetchedSuppliers || []).map((supplier: any) => ({
          id: String(supplier.id),
          name: String(supplier.name || '').trim()
        })).filter((supplier: any) => supplier.id && supplier.name));
      } catch (err) {
        setError("Error al cargar datos iniciales.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [activeStoreId]);

  useEffect(() => {
    if (locationOptions.length === 0) return;

    setBulkMoveFilters(prev => {
      let fromLocation = locationOptions.includes(prev.fromLocation) ? prev.fromLocation : (locationOptions[1] || locationOptions[0] || '');
      let toLocation = locationOptions.includes(prev.toLocation) ? prev.toLocation : (locationOptions[0] || '');

      if (fromLocation === toLocation && locationOptions.length > 1) {
        const alternative = locationOptions.find(loc => loc !== toLocation) || '';
        fromLocation = alternative;
      }

      return {
        ...prev,
        fromLocation,
        toLocation
      };
    });
  }, [locationOptions]);

  const handleEdit = (product: Product) => {
    setError(null);
    setLocationError(null);
    setFormData({ ...product });
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setError(null);
    setLocationError(null);
    setFormData({ type: 'individual', name: '', description: '', price: undefined, stock: 1, status: 'No registrado', minPrice: undefined, supplierId: '', location: locationOptions[0] || '' });
    setIsFormOpen(true);
  };

  const refreshLocations = async () => {
    try {
      const fetchedLocations = await getLocations();
      setLocations(fetchedLocations);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSupplier = async (supplierName: string): Promise<{ id: string; name: string }> => {
    const created = await saveSupplier({ name: supplierName.trim() });
    const normalized = {
      id: String(created.id),
      name: String(created.name || '').trim()
    };

    setSuppliers(prev => {
      const next = [...prev.filter(item => item.id !== normalized.id), normalized];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });

    return normalized;
  };

  const handleLocationSave = async () => {
    const nextName = locationNameInput.trim();
    if (!nextName) {
      setLocationError('El nombre de ubicación no puede estar vacío.');
      return;
    }

    setLocationActionLoading(true);
    setLocationError(null);
    try {
      const previousName = editingLocation?.name || '';
      await saveLocation({ id: editingLocation?.id, name: nextName });

      if (previousName && previousName !== nextName) {
        await replaceProductLocation(previousName, nextName);
        await fetchProducts();
      }

      await refreshLocations();
      setLocationNameInput('');
      setEditingLocation(null);
    } catch (err: any) {
      setLocationError(err.message || 'Error al guardar la ubicación.');
    } finally {
      setLocationActionLoading(false);
    }
  };

  const handleLocationEdit = (location: InventoryLocation) => {
    setEditingLocation(location);
    setLocationNameInput(location.name);
    setLocationError(null);
  };

  const handleLocationDelete = async (location: InventoryLocation) => {
    const inUse = products.some(product => product.location === location.name);
    if (inUse) {
      setLocationError(`No se puede eliminar "${location.name}" porque está asignada a productos.`);
      return;
    }

    setLocationActionLoading(true);
    setLocationError(null);
    try {
      await deleteLocation(location.id);
      await refreshLocations();
      if (editingLocation?.id === location.id) {
        setEditingLocation(null);
        setLocationNameInput('');
      }
    } catch (err: any) {
      setLocationError(err.message || 'Error al eliminar la ubicación.');
    } finally {
      setLocationActionLoading(false);
    }
  };

  const handleSave = async (productToSave: Partial<Product>) => {
    setIsLoading(true);
    setError(null);

    const activeStoreName = stores.find(store => store.id === activeStoreId)?.name;
    const fallbackLocation = activeStoreName || locationOptions[0] || LOCATION_FALLBACKS[0];
    const normalizedPrice = toOptionalNumber(productToSave.price ?? productToSave.sellPrice);
    const normalizedMinPrice = toOptionalNumber(productToSave.minPrice ?? productToSave.minSellPrice);
    const normalizedStock = toOptionalNumber(productToSave.stock ?? productToSave.stockQuantity);
    const normalizedBuyPrice = toOptionalNumber(productToSave.buyPrice);
    const normalizedProduct: Partial<Product> = {
      ...productToSave,
      name: String(productToSave.name || '').trim(),
      type: (productToSave.type || 'individual') as Product['type'],
      supplierId: String(productToSave.supplierId || '').trim() || undefined,
      color: String(productToSave.color || '').trim() || undefined,
      ram: String(productToSave.ram || '').trim() || undefined,
      rom: String(productToSave.rom || '').trim() || undefined,
      buyPrice: normalizedBuyPrice,
      price: normalizedPrice,
      minPrice: normalizedMinPrice,
      stock: normalizedStock,
      storeId: productToSave.storeId || activeStoreId || undefined,
      location: String(productToSave.location || fallbackLocation).trim(),
      status: productToSave.status || 'No registrado'
    };

    if (!normalizedProduct.name) {
      setError('El nombre del producto es obligatorio.');
      setIsLoading(false);
      return;
    }

    if (!normalizedProduct.supplierId) {
      setError('Debe seleccionar un proveedor para el producto.');
      setIsLoading(false);
      return;
    }

    if (normalizedProduct.price === undefined || normalizedProduct.price <= 0) {
      setError('El precio de venta es obligatorio y debe ser mayor a 0.');
      setIsLoading(false);
      return;
    }

    if ((normalizedProduct.buyPrice ?? 0) < 0) {
      setError('El precio de compra no puede ser negativo.');
      setIsLoading(false);
      return;
    }

    if (normalizedProduct.type === 'individual') {
      if (!String(normalizedProduct.brand || '').trim() || !String(normalizedProduct.model || '').trim()) {
        setError('Para productos individuales, la marca y el modelo son obligatorios.');
        setIsLoading(false);
        return;
      }
      normalizedProduct.stock = 1;
      if (normalizedProduct.minPrice === undefined) {
        normalizedProduct.minPrice = Math.max(normalizedProduct.price - minPriceOffset, 0);
      }
    } else {
      normalizedProduct.stock = Math.max(normalizedStock ?? 0, 0);
    }

    // Validation for minPrice not being greater than price
    if (normalizedProduct.minPrice !== undefined && normalizedProduct.minPrice > normalizedProduct.price) {
      setError("El precio mínimo no puede ser mayor que el precio de venta.");
      setIsLoading(false);
      return;
    }

    const isDuplicate = products.some(p => {
      // When editing a product, exclude the current product from duplicate check
      if (p.id === normalizedProduct.id) return false;
      if (normalizedProduct.type === 'individual' && p.type === 'individual') {
        const imei1Match = normalizedProduct.imei1 && p.imei1 && normalizedProduct.imei1 === p.imei1;
        const serialMatch = normalizedProduct.serialNumber && p.serialNumber && normalizedProduct.serialNumber === p.serialNumber;
        return imei1Match || serialMatch;
      }
      if (normalizedProduct.type === 'generic' && p.type === 'generic') {
        return p.name.toLowerCase() === normalizedProduct.name?.toLowerCase() && p.description?.toLowerCase() === normalizedProduct.description?.toLowerCase();
      }
      return false;
    });

    if (isDuplicate) {
      setError("Error: Ya existe un producto con el mismo IMEI o Número de Serie.");
      setIsLoading(false);
      return;
    }

    try {
      // Use updateProduct if we have an ID (editing), otherwise use saveProduct (creating)
      if (normalizedProduct.id) {
        // For update, we need to ensure we pass the full product object
        await updateProduct(normalizedProduct as Product);
      } else {
        await saveProduct(normalizedProduct);
      }
      setIsFormOpen(false);
      setFormData(null);
      await fetchProducts();
    } catch (err: any) {
      setError(`Error al guardar el producto: ${getErrorMessage(err)}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setFormData(null);
    setError(null);
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleSelectAllProducts = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleBulkMove = () => {
    setShowBulkMoveModal(true);
  };

  const handleBulkMoveConfirm = async () => {
    if (!bulkMoveFilters.fromLocation || !bulkMoveFilters.toLocation) {
      setError("Debe seleccionar ubicaciones de origen y destino");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Filter products based on criteria
      const productsToMove = filteredProducts.filter(p => {
        // Must be from the specified location
        const isFromLocation = p.location === bulkMoveFilters.fromLocation;
        // Must have stock >= minStock
        const hasMinStock = (p.stock || 0) >= bulkMoveFilters.minStock;
        // Must not have been sold (stock > 0)
        const notSold = (p.stock || 0) > 0;
        // If specific products are selected, must be one of them
        const isSelected = selectedProductIds.size === 0 || selectedProductIds.has(p.id);

        return isFromLocation && hasMinStock && notSold && isSelected;
      });

      if (productsToMove.length === 0) {
        setError("No se encontraron productos que cumplan con los criterios");
        setIsLoading(false);
        return;
      }

      // Update location for all products
      const updatedProducts = productsToMove.map(p => ({
        ...p,
        location: bulkMoveFilters.toLocation
      }));

      // Save all updated products
      await updateProductsBulk(updatedProducts);

      // Refresh the product list
      await fetchProducts();

      // Clear selection
      setSelectedProductIds(new Set());
      setShowBulkMoveModal(false);

      // Show success message
      setError(`Se movieron ${productsToMove.length} productos de ${bulkMoveFilters.fromLocation} a ${bulkMoveFilters.toLocation}`);
    } catch (err: any) {
      setError("Error al mover productos en bloque: " + (err.message || err.toString()));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkMoveCancel = () => {
    setShowBulkMoveModal(false);
    setBulkMoveFilters({
      fromLocation: locationOptions[1] || locationOptions[0] || '',
      toLocation: locationOptions[0] || '',
      minStock: 1
    });
  };

  const handleOpenLifecycle = (product: Product) => {
    const query = String(product.imei1 || product.serialNumber || product.name || '').trim();
    if (typeof window !== 'undefined') {
      if (query) {
        window.localStorage.setItem('valni_lifecycle_query', query);
      }
      window.dispatchEvent(new CustomEvent('valni:navigate', { detail: { view: 'lifecycle' } }));
    }
  };

  // Filter products based on the filter criteria
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Filter by name
      if (productFilters.name && !product.name.toLowerCase().includes(productFilters.name.toLowerCase())) {
        return false;
      }

      // Filter by purchase date (created_at)
      if (productFilters.purchaseDate) {
        const productPurchaseDate = toLocalDateInput(product.createdAt || (product as any).created_at);
        if (productPurchaseDate !== productFilters.purchaseDate) {
          return false;
        }
      }

      // Filter by brand
      if (productFilters.brand && product.brand !== productFilters.brand) {
        return false;
      }

      // Filter by description
      if (productFilters.description && !product.description?.toLowerCase().includes(productFilters.description.toLowerCase())) {
        return false;
      }

      // Filter by status
      if (productFilters.status && product.status !== productFilters.status) {
        return false;
      }

      // Filter by IMEI
      if (productFilters.imei) {
        const imeiFilter = productFilters.imei.toLowerCase();
        if (!(product.imei1 && product.imei1.toLowerCase().includes(imeiFilter)) &&
          !(product.imei2 && product.imei2.toLowerCase().includes(imeiFilter))) {
          return false;
        }
      }

      // Filter by minimum stock (interpreted as products having at least this stock)
      if (productFilters.minStock && (product.stock || 0) < parseInt(productFilters.minStock)) {
        return false;
      }

      // Filter by location
      if (productFilters.location && product.location !== productFilters.location) {
        return false;
      }

      return true;
    });
  }, [products, productFilters]);

  const activeFiltersCount = useMemo(() => (
    Object.values(productFilters).filter(value => String(value || '').trim() !== '').length
  ), [productFilters]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Gestión de Productos</h1>
      {activeStoreId && (
        <p className="text-xs text-[#11d483] font-bold uppercase tracking-wide">
          Tienda activa: {stores.find(store => store.id === activeStoreId)?.name || 'No definida'}
        </p>
      )}

      {error && !isFormOpen && !showBulkMoveModal && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded" role="alert"><p>{error}</p></div>}

      {canEditCatalog && <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Ubicaciones de Inventario</h3>
            <p className="text-sm text-slate-600">Total: {locationOptions.length} ubicaciones</p>
          </div>
          <button
            type="button"
            onClick={() => setIsLocationPanelOpen(prev => !prev)}
            className="btn btn-secondary !py-2 !px-4 text-sm"
          >
            {isLocationPanelOpen ? 'Plegar' : 'Desplegar'}
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isLocationPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {isLocationPanelOpen && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <input
                type="text"
                placeholder="Nueva ubicación"
                value={locationNameInput}
                onChange={e => {
                  setLocationNameInput(e.target.value);
                  if (locationError) setLocationError(null);
                }}
                className="input-style md:flex-1"
              />
              <button onClick={handleLocationSave} className="btn btn-primary" disabled={locationActionLoading || !canSaveLocation}>
                {locationActionLoading ? 'Guardando...' : (editingLocation ? 'Actualizar' : 'Agregar')}
              </button>
              {editingLocation && (
                <button
                  onClick={() => {
                    setEditingLocation(null);
                    setLocationNameInput('');
                    setLocationError(null);
                  }}
                  className="btn btn-secondary"
                  disabled={locationActionLoading}
                >
                  Cancelar
                </button>
              )}
            </div>

            {locationError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {locationError}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full leading-normal">
                <thead>
                  <tr>
                    <th className="th-style">Ubicación</th>
                    <th className="th-style">Productos (Stock {'>'} 0)</th>
                    <th className="th-style text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {locationOptions.map(locationName => {
                    const location = locations.find(loc => loc.name === locationName);
                    const productsInLocation = products.filter(product => product.location === locationName);
                    const totalProducts = productsInLocation.length;
                    const productsWithStock = new Set(
                      productsInLocation
                        .filter(product => Number(product.stock ?? product.stockQuantity ?? 0) > 0)
                        .map(product => product.id)
                    ).size;
                    const isFallback = !location;
                    return (
                      <tr key={locationName} className="hover:bg-slate-50 transition-colors">
                        <td className="td-style text-slate-900">{locationName}</td>
                        <td className="td-style text-slate-900">{productsWithStock}</td>
                        <td className="td-style text-right">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => location && handleLocationEdit(location)}
                              className="btn btn-secondary text-xs"
                              disabled={!location || locationActionLoading}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => location && handleLocationDelete(location)}
                              className="btn btn-secondary text-xs"
                              disabled={!location || totalProducts > 0 || locationActionLoading}
                              title={isFallback ? 'Ubicación de respaldo mientras no exista tabla de ubicaciones' : undefined}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>}

      {showBulkMoveModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-semibold mb-4">Mover Productos en Bloque</h3>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Ubicación de Origen</label>
                  <select
                    value={bulkMoveFilters.fromLocation}
                    onChange={e => setBulkMoveFilters({ ...bulkMoveFilters, fromLocation: e.target.value })}
                    className="input-style w-full mt-1"
                  >
                    {locationOptions.map(location => (
                      <option key={`from-${location}`} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setBulkMoveFilters({
                      ...bulkMoveFilters,
                      fromLocation: bulkMoveFilters.toLocation,
                      toLocation: bulkMoveFilters.fromLocation
                    })}
                    className="btn btn-secondary h-10"
                    title="Intercambiar ubicaciones"
                  >
                    ↻
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Ubicación de Destino</label>
                  <select
                    value={bulkMoveFilters.toLocation}
                    onChange={e => setBulkMoveFilters({ ...bulkMoveFilters, toLocation: e.target.value })}
                    className="input-style w-full mt-1"
                  >
                    {locationOptions.map(location => (
                      <option key={`to-${location}`} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Stock Mínimo</label>
                <input
                  type="number"
                  min="1"
                  value={bulkMoveFilters.minStock}
                  onChange={e => setBulkMoveFilters({ ...bulkMoveFilters, minStock: parseInt(e.target.value) || 1 })}
                  className="input-style w-full mt-1"
                />
              </div>
              <div className="text-sm text-gray-500">
                {selectedProductIds.size > 0 ?
                  `Se moverán ${selectedProductIds.size} productos seleccionados de ${bulkMoveFilters.fromLocation} a ${bulkMoveFilters.toLocation}` :
                  `Se moverán todos los productos de ${bulkMoveFilters.fromLocation} a ${bulkMoveFilters.toLocation}`}
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <button onClick={handleBulkMoveCancel} className="btn btn-secondary" disabled={isLoading}>
                Cancelar
              </button>
              <button onClick={handleBulkMoveConfirm} className="btn btn-primary" disabled={isLoading}>
                {isLoading ? 'Moviendo...' : 'Mover Productos'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Filtros de Búsqueda</h3>
            <p className="text-sm text-slate-600">Activos: {activeFiltersCount}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsFiltersPanelOpen(prev => !prev)}
            className="btn btn-secondary !py-2 !px-4 text-sm"
          >
            {isFiltersPanelOpen ? 'Plegar' : 'Desplegar'}
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isFiltersPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {isFiltersPanelOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Compra</label>
              <input
                type="date"
                value={productFilters.purchaseDate}
                onChange={e => setProductFilters({ ...productFilters, purchaseDate: e.target.value })}
                className="input-style w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Modelo</label>
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={productFilters.name}
                onChange={e => setProductFilters({ ...productFilters, name: e.target.value })}
                className="input-style w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
              <select
                value={productFilters.brand}
                onChange={e => setProductFilters({ ...productFilters, brand: e.target.value })}
                className="input-style w-full"
              >
                <option value="">Todas las marcas</option>
                {brands.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IMEI / Serie</label>
              <input
                type="text"
                placeholder="IMEI o Serie..."
                value={productFilters.imei}
                onChange={e => setProductFilters({ ...productFilters, imei: e.target.value })}
                className="input-style w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select
                value={productFilters.status}
                onChange={e => setProductFilters({ ...productFilters, status: e.target.value })}
                className="input-style w-full"
              >
                <option value="">Todos los estados</option>
                <option value="available">Disponible</option>
                <option value="No registrado">No registrado</option>
                <option value="Registrado">Registrado</option>
                <option value="Homologado">Homologado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <input
                type="text"
                placeholder="Buscar en descripción..."
                value={productFilters.description}
                onChange={e => setProductFilters({ ...productFilters, description: e.target.value })}
                className="input-style w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock Mínimo</label>
              <input
                type="number"
                placeholder="0"
                value={productFilters.minStock}
                onChange={e => setProductFilters({ ...productFilters, minStock: e.target.value })}
                className="input-style w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación</label>
              <select
                value={productFilters.location}
                onChange={e => setProductFilters({ ...productFilters, location: e.target.value })}
                className="input-style w-full"
              >
                <option value="">Todas las ubicaciones</option>
                {locationOptions.map(location => (
                  <option key={`filter-${location}`} value={location}>{location}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setProductFilters({ purchaseDate: '', name: '', imei: '', minStock: '1', location: '', brand: '', description: '', status: '' })}
                className="btn btn-secondary w-full"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Lista de Productos</h2>
          {canEditCatalog && <div className="flex items-center space-x-2">
            <label htmlFor="min-price-offset" className="text-sm font-medium text-gray-700">Offset P. Mínimo:</label>
            <input
              type="number"
              id="min-price-offset"
              value={minPriceOffset}
              onChange={(e) => setMinPriceOffset(parseFloat(e.target.value) || 0)}
              className="input-style w-20 text-right"
            />
          </div>}
          {canEditCatalog && <div className="flex space-x-2">
            <button onClick={handleBulkMove} className="btn btn-secondary" disabled={isLoading}>
              Mover en Bloque
            </button>
            <button onClick={handleAddNew} className="btn btn-primary">+ Agregar Producto</button>
          </div>}
        </div>

        {isFormOpen && formData && (
          <ProductForm
            product={formData}
            onSave={handleSave}
            onCancel={handleCancel}
            onCreateSupplier={handleCreateSupplier}
            brands={brands}
            models={models}
            suppliers={suppliers}
            locations={locationOptions}
            isLoading={isLoading}
            error={error}
            minPriceOffset={minPriceOffset}
          />
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="th-style">
                  <input
                    type="checkbox"
                    onChange={handleSelectAllProducts}
                    checked={selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0}
                  />
                </th>
                <th className="th-style">Fecha Compra</th>
                <th className="th-style">Nombre</th>
                <th className="th-style">Descripción</th>
                <th className="th-style">IMEI 1</th>
                <th className="th-style">Proveedor</th>
                {canEditCatalog && <th className="th-style">P. Compra</th>}
                <th className="th-style">P. Venta</th>
                {canEditCatalog && <th className="th-style">P. Mínimo</th>}
                <th className="th-style">Stock</th>
                <th className="th-style">Ubicación</th>
                <th className="th-style"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="td-style">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => handleSelectProduct(product.id)}
                    />
                  </td>
                  <td className="td-style text-slate-900 text-xs">{formatDateTime(product.createdAt || (product as any).created_at)}</td>
                  <td className="td-style text-slate-900">{product.name}</td>
                  <td className="td-style text-slate-900">{product.description || 'N/A'}</td>
                  <td className="td-style text-slate-900">{product.imei1 || 'N/A'}</td>
                  <td className="td-style text-slate-900">
                    {suppliers.find(s => String(s.id) === String(product.supplierId || ''))?.name || 'N/A'}
                  </td>
                  {canEditCatalog && <td className="td-style text-slate-900">{formatCurrency(product.buyPrice ?? 0)}</td>}
                  <td className="td-style text-slate-900">{formatCurrency(product.price)}</td>
                  {canEditCatalog && <td className="td-style text-slate-900">{product.type === 'individual' && product.minPrice ? formatCurrency(product.minPrice) : 'N/A'}</td>}
                  <td className="td-style text-slate-900">{product.stock}</td>
                  <td className="td-style text-slate-900">{product.location || 'N/A'}</td>
                  <td className="td-style text-right">
                    <div className="inline-flex gap-2">
                      {canEditCatalog && <button onClick={() => handleEdit(product)} className="btn btn-primary text-xs">Editar</button>}
                      <button onClick={() => handleOpenLifecycle(product)} className="btn btn-secondary text-xs">Trazabilidad</button>
                    </div>
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

export default ProductManagementScreen;
