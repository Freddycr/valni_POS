import React, { useState, useEffect } from 'react';
import { PurchaseOrder, Product, Brand, Model, PurchaseOrderItem, Store } from '../types';
import { getPurchaseOrders, savePurchaseOrder, getProducts, getBrands, getModels, getPurchaseOrderItems, updatePurchaseOrder, getSuppliers, receivePurchaseOrder } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatting';
import { User as UserType } from '../types';

const OrderGeneration: React.FC<{
  onOrderCreated: () => void,
  currentUser: UserType,
  activeStoreId?: string,
  purchaseOrders: PurchaseOrder[],
  isOrdersLoading: boolean,
  onSelectOrder: (order: PurchaseOrder) => void
}> = ({ onOrderCreated, currentUser, activeStoreId, purchaseOrders, isOrdersLoading, onSelectOrder }) => {
  // States
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  // Generation parameters
  const [minStockThreshold, setMinStockThreshold] = useState<number>(5);
  const [salesAnalysisPeriod, setSalesAnalysisPeriod] = useState<number>(30); // days
  const [suggestedOrderMultiplier, setSuggestedOrderMultiplier] = useState<number>(2); // 2x average sales

  // Filters
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out'>('low');

  // Results
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddItem, setShowAddItem] = useState<boolean>(false);
  const [newItem, setNewItem] = useState<Partial<PurchaseOrderItem>>({});

  const uniqueProducts = React.useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => {
      // Agrupamos por nombre, marca y modelo para evitar duplicados (IMEIs distintos)
      const key = `${p.name}-${p.brand || ''}-${p.model || ''}`.toLowerCase();
      if (!map.has(key)) {
        map.set(key, p);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // Effects
  useEffect(() => {
    loadData();
  }, [activeStoreId]);

  // Main functions
  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [productsData, brandsData, modelsData] = await Promise.all([
        getProducts({ storeId: activeStoreId || null }),
        getBrands(),
        getModels()
      ]);

      setProducts(productsData);
      setBrands(brandsData);
      setModels(modelsData);
    } catch (err) {
      setError("Error loading data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateOrderSuggestions = () => {
    setIsGenerating(true);

    const productMap = new Map<string, Product>();

    products.forEach(product => {
      if (!product.brand || !product.model) return;

      const key = `${product.name}-${product.brand}-${product.model}`.toLowerCase();

      if (productMap.has(key)) {
        const existingProduct = productMap.get(key)!;
        existingProduct.stock = (existingProduct.stock || 0) + (product.stock || 0);
      } else {
        productMap.set(key, { ...product });
      }
    });

    const aggregatedProducts = Array.from(productMap.values());

    const filteredProducts = aggregatedProducts.filter(product => {
      if (brandFilter && product.brand !== brandFilter) return false;
      if (modelFilter && product.model !== modelFilter) return false;

      const stock = product.stock || 0;
      switch (stockStatusFilter) {
        case 'low':
          return stock <= minStockThreshold && stock > 0;
        case 'out':
          return stock === 0;
        case 'all':
        default:
          return stock <= minStockThreshold;
      }
    });

    const suggestions = filteredProducts.map(product => {
      const suggestedQuantity = calculateSuggestedOrder(
        product,
        salesAnalysisPeriod,
        suggestedOrderMultiplier
      );

      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand || '',
        model: product.model || '',
        currentStock: product.stock || 0,
        minStock: 0,
        suggestedOrder: suggestedQuantity,
        unitPrice: 0,
        totalPrice: 0,
        specifications: extractSpecifications(product.description || ''),
        notes: ''
      };
    });

    setOrderItems(suggestions);
    setIsGenerating(false);
  };

  const calculateSuggestedOrder = (
    product: Product,
    _periodDays: number,
    multiplier: number
  ): number => {
    const stock = product.stock || 0;
    const baseQuantity = Math.max(minStockThreshold - stock, 0);
    const suggested = Math.ceil(baseQuantity * multiplier);
    return Math.max(suggested, 1);
  };

  const extractSpecifications = (description: string): string => {
    const specs = [];
    const colorMatch = description.match(/color: (\w+)/i);
    const ramMatch = description.match(/ram: (\w+)/i);
    const romMatch = description.match(/rom: (\w+)/i);

    if (colorMatch) specs.push(`Color: ${colorMatch[1]}`);
    if (ramMatch) specs.push(`RAM: ${ramMatch[1]}`);
    if (romMatch) specs.push(`ROM: ${romMatch[1]}`);

    return specs.join(', ');
  };

  const updateOrderItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const newItems = [...orderItems];
    (newItems[index] as any)[field] = value;

    if (field === 'suggestedOrder') {
      newItems[index].totalPrice = 0;
    }

    setOrderItems(newItems);
  };

  const handleAddItem = () => {
    if (newItem.productId && newItem.suggestedOrder) {
      const newOrderItem: PurchaseOrderItem = {
        productId: newItem.productId,
        productName: newItem.productName || '',
        brand: newItem.brand || '',
        model: newItem.model || '',
        currentStock: 0, // Manually added items have no current stock info
        minStock: 0,
        suggestedOrder: newItem.suggestedOrder,
        unitPrice: 0,
        totalPrice: 0,
        specifications: newItem.specifications || '',
        notes: newItem.notes || '',
      };
      setOrderItems([...orderItems, newOrderItem]);
      setNewItem({});
      setShowAddItem(false);
    }
  };

  const handleCreateOrder = async () => {
    if (orderItems.length === 0) return;

    const newOrder: Partial<PurchaseOrder> = {
      date: new Date().toISOString(),
      status: 'pending',
      items: orderItems,
      totalAmount: 0,
      createdBy: currentUser.id,
      storeId: activeStoreId || undefined,
    };

    try {
      await savePurchaseOrder(newOrder);
      alert('Pedido creado con éxito');
      setOrderItems([]);
      onOrderCreated();
    } catch (error) {
      alert('Error al crear el pedido');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Generación de Pedidos</h1>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Pedidos ya efectuados</h2>
        {isOrdersLoading ? (
          <p className="text-slate-500">Cargando pedidos...</p>
        ) : purchaseOrders.length === 0 ? (
          <p className="text-slate-500">No hay pedidos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-md overflow-hidden">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b text-left">ID</th>
                  <th className="py-2 px-4 border-b text-left">Fecha</th>
                  <th className="py-2 px-4 border-b text-left">Proveedor</th>
                  <th className="py-2 px-4 border-b text-left">Estado</th>
                  <th className="py-2 px-4 border-b text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchaseOrders.slice(0, 15).map((order) => {
                  const isClosed = order.status === 'received' || order.status === 'cancelled';
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="py-2 px-4 text-xs font-mono">{order.id.split('-')[0]}...</td>
                      <td className="py-2 px-4 text-sm">{formatDate(order.date)}</td>
                      <td className="py-2 px-4 text-sm">{order.supplierName || 'Sin proveedor'}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${isClosed ? 'bg-slate-100 text-slate-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center">
                        <button
                          className="bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold py-1 px-3 rounded uppercase transition-colors"
                          onClick={() => onSelectOrder(order)}
                        >
                          {isClosed ? 'Ver' : 'Seleccionar / Editar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Configuración de Generación</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Stock Mínimo</label>
            <input
              type="number"
              value={minStockThreshold}
              onChange={(e) => setMinStockThreshold(parseInt(e.target.value) || 0)}
              className="input-style w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Período de Análisis (días)</label>
            <input
              type="number"
              value={salesAnalysisPeriod}
              onChange={(e) => setSalesAnalysisPeriod(parseInt(e.target.value) || 30)}
              className="input-style w-full"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Funcionalidad futura</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Multiplicador de Pedido</label>
            <input
              type="number"
              step="0.5"
              value={suggestedOrderMultiplier}
              onChange={(e) => setSuggestedOrderMultiplier(parseFloat(e.target.value) || 1)}
              className="input-style w-full"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Marca</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="input-style w-full"
            >
              <option value="">Todas las marcas</option>
              {brands.map(brand => (
                <option key={brand.id} value={brand.name}>{brand.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Modelo</label>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="input-style w-full"
              disabled={!brandFilter}
            >
              <option value="">Todos los modelos</option>
              {models
                .filter(model => !brandFilter ||
                  brands.find(b => b.name === brandFilter)?.id === model.brandId)
                .map(model => (
                  <option key={model.id} value={model.name}>{model.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Estado de Stock</label>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="input-style w-full"
            >
              <option value="all">Todos</option>
              <option value="low">Bajo Stock</option>
              <option value="out">Agotados</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={generateOrderSuggestions}
              disabled={isGenerating || isLoading}
              className="btn btn-primary w-full"
            >
              {isGenerating ? 'Generando...' : 'Generar Sugerencias'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Sugerencias de Pedido</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th-style">Producto</th>
                <th className="th-style">Marca</th>
                <th className="th-style">Modelo</th>
                <th className="th-style">Especificaciones</th>
                <th className="th-style text-right">Stock Actual</th>
                <th className="th-style text-right">Sugerido</th>
                <th className="th-style">Notas</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr key={index}>
                  <td className="td-style">{item.productName}</td>
                  <td className="td-style">{item.brand}</td>
                  <td className="td-style">{item.model}</td>
                  <td className="td-style text-sm">{item.specifications}</td>
                  <td className="td-style text-right">{item.currentStock}</td>
                  <td className="td-style text-right">
                    <input
                      type="number"
                      value={item.suggestedOrder}
                      onChange={(e) => updateOrderItem(index, 'suggestedOrder', parseInt(e.target.value) || 0)}
                      className="input-style w-20 text-right"
                    />
                  </td>
                  <td className="td-style">
                    <input
                      type="text"
                      value={item.notes || ''}
                      onChange={(e) => updateOrderItem(index, 'notes', e.target.value)}
                      className="input-style w-full"
                      placeholder="Notas..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAddItem && (
          <div className="card mt-6">
            <h2 className="text-xl font-semibold mb-4">Agregar Nuevo Artículo</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Producto</label>
                <select
                  className="input-style w-full"
                  onChange={(e) => {
                    const selectedProduct = products.find(p => p.id === e.target.value);
                    if (selectedProduct) {
                      setNewItem({
                        ...newItem,
                        productId: selectedProduct.id,
                        productName: selectedProduct.name,
                        brand: selectedProduct.brand,
                        model: selectedProduct.model,
                      });
                    }
                  }}
                >
                  <option value="">Seleccione un producto</option>
                  {uniqueProducts.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} {product.brand ? `(${product.brand} ${product.model})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cantidad</label>
                <input
                  type="number"
                  className="input-style w-full"
                  value={newItem.suggestedOrder || ''}
                  onChange={(e) => setNewItem({ ...newItem, suggestedOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Especificaciones</label>
                <input
                  type="text"
                  className="input-style w-full"
                  value={newItem.specifications || ''}
                  onChange={(e) => setNewItem({ ...newItem, specifications: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Notas</label>
                <input
                  type="text"
                  className="input-style w-full"
                  value={newItem.notes || ''}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  className="btn btn-primary w-full"
                  onClick={handleAddItem}
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between items-center">
          <div>
            <p className="text-lg font-semibold">
              Total Items: {orderItems.reduce((sum, item) => sum + item.suggestedOrder, 0)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              className="btn btn-secondary w-full sm:w-auto"
              onClick={() => { setShowAddItem(!showAddItem) }}
            >
              Agregar Artículo
            </button>
            <button
              className="btn btn-primary w-full sm:w-auto"
              disabled={orderItems.length === 0}
              onClick={handleCreateOrder}
            >
              Crear Pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PurchaseOrderManagementScreen: React.FC<{ currentUser: UserType; activeStoreId?: string; stores?: Store[] }> = ({ currentUser, activeStoreId, stores = [] }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('create');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // States for viewing/editing
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newModalProductId, setNewModalProductId] = useState<string>('');
  const [modalSource, setModalSource] = useState<'list' | 'create'>('list');

  const canManageOrders = ['admin', 'inventory_manager', 'store_admin', 'warehouse', 'supervisor'].includes(currentUser.role);
  const isOrderClosed = (status: string) => status === 'approved' || status === 'received' || status === 'cancelled';
  const canViewFinancials = canManageOrders && modalSource === 'list';

  const calculateOrderTotal = (items: any[] = []) =>
    items.reduce((sum, item) => sum + ((Number(item.suggestedOrder) || 0) * (Number(item.unitPrice) || 0)), 0);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  useEffect(() => {
    if (activeTab === 'list' || activeTab === 'create') {
      loadPurchaseOrders();
    }
  }, [activeTab, activeStoreId]);

  useEffect(() => {
    getProducts({ storeId: activeStoreId || null })
      .then(setCatalogProducts)
      .catch((err) => console.error('No se pudo cargar catálogo de productos para pedidos', err));

    getSuppliers()
      .then(setSuppliers)
      .catch((err) => console.error('No se pudo cargar proveedores para pedidos', err));
  }, [activeStoreId]);

  const loadPurchaseOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const orders = await getPurchaseOrders({ storeId: activeStoreId || null });
      setPurchaseOrders(orders);
    } catch (err) {
      setError("Error al cargar los pedidos");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewOrder = async (order: any, source: 'list' | 'create' = 'list') => {
    setIsLoading(true);
    try {
      const items = await getPurchaseOrderItems(order.id);
      setSelectedOrder({ ...order, items, totalAmount: calculateOrderTotal(items) || order.totalAmount });
      setModalSource(source);
      setIsModalOpen(true);
    } catch (err) {
      alert("Error al cargar los detalles del pedido");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    if (!canManageOrders) {
      alert("No tienes permisos para realizar esta acción");
      return;
    }

    setIsUpdating(true);
    try {
      if (newStatus === 'received') {
        const receiptNotes = window.prompt('Notas de recepción (opcional):', '') || undefined;
        await receivePurchaseOrder(orderId, {
          notes: receiptNotes,
          userId: currentUser?.id || null
        });
      } else {
        await updatePurchaseOrder(orderId, { status: newStatus });
      }
      setSelectedOrder((prev: any) => prev ? { ...prev, status: newStatus } : prev);
      await loadPurchaseOrders();
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Error al actualizar el pedido";
      alert(errMessage);
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const updateSelectedItem = (index: number, field: string, value: any) => {
    setSelectedOrder((prev: any) => {
      if (!prev) return prev;
      if (isOrderClosed(prev.status)) return prev;
      const updatedItems = [...(prev.items || [])];
      const current = { ...updatedItems[index], [field]: value };
      const quantity = Number(current.suggestedOrder) || 0;
      const unitPrice = Number(current.unitPrice) || 0;
      current.totalPrice = quantity * unitPrice;
      updatedItems[index] = current;
      return { ...prev, items: updatedItems, totalAmount: calculateOrderTotal(updatedItems) };
    });
  };

  const removeSelectedItem = (index: number) => {
    setSelectedOrder((prev: any) => {
      if (!prev) return prev;
      if (isOrderClosed(prev.status)) return prev;
      const updatedItems = (prev.items || []).filter((_: any, itemIndex: number) => itemIndex !== index);
      return { ...prev, items: updatedItems, totalAmount: calculateOrderTotal(updatedItems) };
    });
  };

  const addProductToSelectedOrder = () => {
    if (selectedOrder && isOrderClosed(selectedOrder.status)) return;
    if (!newModalProductId) return;
    const product = catalogProducts.find((p) => p.id === newModalProductId);
    if (!product) return;

    setSelectedOrder((prev: any) => {
      if (!prev) return prev;
      const newItem = {
        productId: product.id,
        productName: product.name,
        brand: product.brand || '',
        model: product.model || '',
        currentStock: product.stock || 0,
        minStock: product.minStockAlert || 0,
        suggestedOrder: 1,
        unitPrice: product.price || 0,
        totalPrice: product.price || 0,
        specifications: product.description || '',
        notes: ''
      };
      const updatedItems = [...(prev.items || []), newItem];
      return { ...prev, items: updatedItems, totalAmount: calculateOrderTotal(updatedItems) };
    });

    setNewModalProductId('');
  };

  const handleSaveOrderChanges = async () => {
    if (!selectedOrder || !canManageOrders || isOrderClosed(selectedOrder.status)) return;
    setIsUpdating(true);
    try {
      const normalizedItems = (selectedOrder.items || []).map((item: any) => ({
        ...item,
        suggestedOrder: Number(item.suggestedOrder) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        totalPrice: (Number(item.suggestedOrder) || 0) * (Number(item.unitPrice) || 0),
      }));

      const totalAmount = calculateOrderTotal(normalizedItems);

      await updatePurchaseOrder(selectedOrder.id, {
        status: selectedOrder.status,
        supplierId: selectedOrder.supplierId || null,
        storeId: activeStoreId || null,
        items: normalizedItems,
        totalAmount,
      });

      alert('Pedido actualizado con éxito');
      setIsModalOpen(false);
      await loadPurchaseOrders();
    } catch (err) {
      alert("Error al guardar cambios del pedido");
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const buildOrderCsvRows = (order: any, items: any[]) => {
    if (!items.length) {
      return `${escapeCsv(order.id)},${escapeCsv(formatDate(order.date))},${escapeCsv(order.supplierName || 'N/A')},${escapeCsv(order.totalAmount)},${escapeCsv(order.status)},${escapeCsv(order.createdBy)},${escapeCsv('N/A')},${escapeCsv('N/A')},${escapeCsv('N/A')},${escapeCsv('')},${escapeCsv('')},${escapeCsv(0)},${escapeCsv(0)},${escapeCsv(0)}`;
    }
    return items.map((item) =>
      `${escapeCsv(order.id)},${escapeCsv(formatDate(order.date))},${escapeCsv(order.supplierName || 'N/A')},${escapeCsv(order.totalAmount)},${escapeCsv(order.status)},${escapeCsv(order.createdBy)},${escapeCsv(item.productName)},${escapeCsv(item.brand)},${escapeCsv(item.model)},${escapeCsv(item.specifications || '')},${escapeCsv(item.notes || '')},${escapeCsv(item.suggestedOrder)},${escapeCsv(item.unitPrice)},${escapeCsv(item.totalPrice)}`
    ).join('\n');
  };

  const exportPurchaseOrdersToXlsx = async () => {
    try {
      setIsLoading(true);
      let csvContent = "ID Pedido,Fecha,Proveedor,Total,Estado,Generado por,Producto,Marca,Modelo,Especificaciones,Notas,Cantidad,Precio Unit,Precio Total\n";

      for (const order of purchaseOrders) {
        const items = await getPurchaseOrderItems(order.id);
        csvContent += `${buildOrderCsvRows(order, items)}\n`;
      }

      downloadFile(
        csvContent,
        `pedidos_compra_${new Date().toISOString().split('T')[0]}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;'
      );
    } catch (err) {
      alert("Error al exportar los pedidos");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const exportSingleOrderToXlsx = async (order: any) => {
    try {
      const items = selectedOrder?.id === order.id ? (selectedOrder.items || []) : await getPurchaseOrderItems(order.id);
      const header = "ID Pedido,Fecha,Proveedor,Total,Estado,Generado por,Producto,Marca,Modelo,Especificaciones,Notas,Cantidad,Precio Unit,Precio Total\n";
      const content = `${header}${buildOrderCsvRows(order, items)}\n`;
      downloadFile(content, `pedido_${order.id}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;');
    } catch (err) {
      alert("Error al exportar pedido");
      console.error(err);
    }
  };

  const exportSingleOrderToPdf = async (order: any) => {
    try {
      const items = selectedOrder?.id === order.id ? (selectedOrder.items || []) : await getPurchaseOrderItems(order.id);
      const popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        alert('No se pudo abrir la ventana de impresión. Habilita los popups.');
        return;
      }

      const rowsHtml = items.map((item: any) => `
        <tr>
          <td>${item.productName || ''}</td>
          <td>${item.brand || ''} ${item.model || ''}</td>
          <td>${item.specifications || ''}</td>
          <td>${item.notes || ''}</td>
          <td style="text-align:right;">${item.suggestedOrder || 0}</td>
          <td style="text-align:right;">${Number(item.unitPrice || 0).toFixed(2)}</td>
          <td style="text-align:right;">${Number(item.totalPrice || 0).toFixed(2)}</td>
        </tr>
      `).join('');

      const total = calculateOrderTotal(items);
      popup.document.write(`
        <html>
        <head>
          <title>Pedido ${order.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { margin: 0 0 8px; }
            .meta { margin-bottom: 12px; color: #444; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
            th { background: #f4f4f4; text-transform: uppercase; font-size: 11px; }
            .total { margin-top: 16px; font-weight: bold; text-align: right; }
          </style>
        </head>
        <body>
          <h1>Pedido de Compra</h1>
          <div class="meta">ID: ${order.id}</div>
          <div class="meta">Fecha: ${formatDate(order.date)}</div>
          <div class="meta">Estado: ${order.status}</div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca / Modelo</th>
                <th>Especificaciones</th>
                <th>Notas</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="total">Total: ${formatCurrency(total)}</div>
        </body>
        </html>
      `);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (err) {
      alert("Error al exportar PDF");
      console.error(err);
    }
  };

  const handleOrderCreated = () => {
    setActiveTab('create');
    loadPurchaseOrders();
  };



  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Gestión de Pedidos</h1>
      {activeStoreId && (
        <p className="text-xs text-[#11d483] font-bold uppercase tracking-wide">
          Tienda activa: {stores.find(store => store.id === activeStoreId)?.name || 'No definida'}
        </p>
      )}

      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {canManageOrders && (
              <button
                onClick={() => setActiveTab('list')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'list'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Lista de Pedidos
              </button>
            )}
            <button
              onClick={() => setActiveTab('create')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'create'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Generar Nuevo Pedido
            </button>
          </nav>
        </div>

        <div className="mt-6">
          {activeTab === 'list' && canManageOrders ? (
            <div>
              {isLoading && <p>Cargando pedidos...</p>}
              {error && <p className="text-red-500">{error}</p>}
              {!isLoading && !error && (
                <>
                  <div className="flex justify-end mb-4">
                    <button
                      className="btn btn-secondary"
                      onClick={exportPurchaseOrdersToXlsx}
                      disabled={purchaseOrders.length === 0}
                    >
                      Exportar XLSX
                    </button>
                  </div>
                  <table className="min-w-full bg-white">                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">ID</th>
                      <th className="py-2 px-4 border-b">Fecha</th>
                      <th className="py-2 px-4 border-b">Proveedor</th>
                      <th className="py-2 px-4 border-b text-right">Total</th>
                      <th className="py-2 px-4 border-b">Estado</th>
                      <th className="py-2 px-4 border-b text-center">Generado por</th>
                      <th className="py-2 px-4 border-b text-center">Acciones</th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-gray-100">
                      {purchaseOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="py-2 px-4 border-b text-xs font-mono">{order.id.split('-')[0]}...</td>
                          <td className="py-2 px-4 border-b text-sm">{formatDate(order.date)}</td>
                          <td className="py-2 px-4 border-b text-sm">{order.supplierName || 'Varios'}</td>
                          <td className="py-2 px-4 border-b text-right font-bold">{formatCurrency(order.totalAmount)}</td>
                          <td className="py-2 px-4 border-b">
                            <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              order.status === 'received' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="py-2 px-4 border-b text-center text-xs text-gray-500">{order.createdBy}</td>
                          <td className="py-2 px-4 border-b text-center space-x-1">
                            <button
                              className="bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold py-1 px-3 rounded uppercase transition-colors"
                              onClick={() => handleViewOrder(order)}
                            >
                              Ver / Editar
                            </button>
                            <button
                              className="bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold py-1 px-3 rounded uppercase transition-colors"
                              onClick={() => exportSingleOrderToPdf(order)}
                            >
                              PDF
                            </button>
                            <button
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-3 rounded uppercase transition-colors"
                              onClick={() => exportSingleOrderToXlsx(order)}
                            >
                              XLSX
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ) : (
            <OrderGeneration
              onOrderCreated={handleOrderCreated}
              currentUser={currentUser}
              activeStoreId={activeStoreId}
              purchaseOrders={purchaseOrders}
              isOrdersLoading={isLoading}
              onSelectOrder={(order) => handleViewOrder(order, 'create')}
            />
          )}
        </div>
      </div>

      {/* Modal Detalle/Edición */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-wider">Detalle del Pedido</h2>
                <p className="text-sm text-slate-400 font-mono">ID: {selectedOrder.id}</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-black block mb-1">Fecha</span>
                  <p className="text-sm font-bold text-slate-200">{formatDate(selectedOrder.date)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-black block mb-1">Estado</span>
                  <span className={`inline-block px-2 py-1 rounded text-[10px] uppercase font-black ${selectedOrder.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                    selectedOrder.status === 'received' ? 'bg-green-500/10 text-green-500' :
                      'bg-slate-500/10 text-slate-500'
                    }`}>
                    {selectedOrder.status}
                  </span>
                </div>
                {canViewFinancials && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-black block mb-1">Total</span>
                    <p className="text-lg font-black text-indigo-400">{formatCurrency(calculateOrderTotal(selectedOrder.items || []))}</p>
                  </div>
                )}
              </div>

              {isOrderClosed(selectedOrder.status) && (
                <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-900 rounded-md px-3 py-2 text-sm font-semibold">
                  Pedido cerrado: no se pueden editar productos, proveedor, cantidades ni precios.
                </div>
              )}

              {canManageOrders && (
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-1 uppercase">Proveedor asignado</label>
                  <select
                    className="input-style w-full"
                    value={selectedOrder.supplierId || ''}
                    disabled={isOrderClosed(selectedOrder.status)}
                    onChange={(e) => {
                      const supplierId = e.target.value || null;
                      const supplier = suppliers.find((s: any) => String(s.id) === String(supplierId));
                      setSelectedOrder((prev: any) => ({
                        ...prev,
                        supplierId,
                        supplierName: supplier?.name || undefined,
                      }));
                    }}
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier: any) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {canManageOrders && !isOrderClosed(selectedOrder.status) && (
                <div className="mb-4 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1 uppercase">Agregar producto</label>
                    <select
                      className="input-style w-full"
                      value={newModalProductId}
                      onChange={(e) => setNewModalProductId(e.target.value)}
                    >
                      <option value="">Selecciona un producto</option>
                      {catalogProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.brand ? `(${product.brand} ${product.model || ''})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-secondary" onClick={addProductToSelectedOrder}>Agregar</button>
                </div>
              )}

              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Artículos del Pedido</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase">Producto</th>
                      <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase">Marca/Modelo</th>
                      <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase text-center">Cant.</th>
                      {canViewFinancials && <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase text-right">Unit.</th>}
                      <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase">Especificaciones</th>
                      <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase">Notas</th>
                      {canViewFinancials && <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase text-right">Subtotal</th>}
                      {canManageOrders && !isOrderClosed(selectedOrder.status) && <th className="py-2 px-2 text-[10px] font-black text-slate-400 uppercase text-center">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="py-3 px-2 text-sm text-white font-medium">{item.productName}</td>
                        <td className="py-3 px-2 text-xs text-slate-400">{item.brand} {item.model}</td>
                        <td className="py-3 px-2 text-sm text-white text-center font-bold font-mono">
                          {canManageOrders && !isOrderClosed(selectedOrder.status) ? (
                            <input
                              type="number"
                              className="input-style w-20 text-right mx-auto"
                              value={item.suggestedOrder}
                              onChange={(e) => updateSelectedItem(idx, 'suggestedOrder', Number(e.target.value) || 0)}
                            />
                          ) : item.suggestedOrder}
                        </td>
                        {canViewFinancials && (
                          <td className="py-3 px-2 text-sm text-slate-300 text-right font-mono">
                            {canManageOrders && !isOrderClosed(selectedOrder.status) ? (
                              <input
                                type="number"
                                step="0.01"
                                className="input-style w-24 text-right ml-auto"
                                value={item.unitPrice}
                                onChange={(e) => updateSelectedItem(idx, 'unitPrice', Number(e.target.value) || 0)}
                              />
                            ) : formatCurrency(item.unitPrice)}
                          </td>
                        )}
                        <td className="py-3 px-2 text-xs text-slate-300">
                          {canManageOrders && !isOrderClosed(selectedOrder.status) ? (
                            <input
                              type="text"
                              className="input-style w-full"
                              value={item.specifications || ''}
                              onChange={(e) => updateSelectedItem(idx, 'specifications', e.target.value)}
                            />
                          ) : (item.specifications || '')}
                        </td>
                        <td className="py-3 px-2 text-xs text-slate-300">
                          {canManageOrders && !isOrderClosed(selectedOrder.status) ? (
                            <input
                              type="text"
                              className="input-style w-full"
                              value={item.notes || ''}
                              onChange={(e) => updateSelectedItem(idx, 'notes', e.target.value)}
                            />
                          ) : (item.notes || '')}
                        </td>
                        {canViewFinancials && (
                          <td className="py-3 px-2 text-sm text-indigo-300 text-right font-black font-mono">{formatCurrency(item.totalPrice)}</td>
                        )}
                        {canManageOrders && !isOrderClosed(selectedOrder.status) && (
                          <td className="py-3 px-2 text-center">
                            <button
                              className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-900/50 text-[10px] font-bold py-1 px-2 rounded uppercase"
                              onClick={() => removeSelectedItem(idx)}
                            >
                              Quitar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 bg-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex gap-2 flex-wrap">
                {selectedOrder.status === 'pending' && canManageOrders && (
                  <>
                    <button
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded uppercase transition-all disabled:opacity-50"
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'approved')}
                      disabled={isUpdating}
                    >
                      Cerrar Pedido
                    </button>
                    <button
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-4 rounded uppercase transition-all shadow-lg shadow-green-900/20 disabled:opacity-50"
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'received')}
                      disabled={isUpdating}
                    >
                      Registrar Recepción
                    </button>
                    <button
                      className="bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-900/50 text-xs font-bold py-2 px-4 rounded uppercase transition-all disabled:opacity-50"
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                      disabled={isUpdating}
                    >
                      Cancelar Pedido
                    </button>
                  </>
                )}
                {canViewFinancials && (
                  <button
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold py-2 px-4 rounded uppercase transition-all"
                    onClick={() => exportSingleOrderToPdf(selectedOrder)}
                  >
                    Exportar PDF
                  </button>
                )}
                {canViewFinancials && (
                  <button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded uppercase transition-all"
                    onClick={() => exportSingleOrderToXlsx(selectedOrder)}
                  >
                    Exportar XLSX
                  </button>
                )}
                {canManageOrders && !isOrderClosed(selectedOrder.status) && (
                  <button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded uppercase transition-all disabled:opacity-50"
                    onClick={handleSaveOrderChanges}
                    disabled={isUpdating}
                  >
                    Guardar Cambios
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold py-2 px-6 rounded uppercase transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderManagementScreen;
