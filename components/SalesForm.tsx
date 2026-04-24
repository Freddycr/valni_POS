import { formatCurrency } from '../utils/formatting';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Receipt from './Receipt';
import { User, Product, Customer, CartItem, PaymentMethodAdmin, Brand, Model, InventoryLocation, Store } from '../types';
import { getProducts, getCustomers, saveCustomer, saveSale, getPaymentMethods, getBrands, getModels, getReceiptHeader, getLocations, getCustomerAdvanceBalance, applyCustomerAdvancesToSale } from '../services/api';

const LOCATION_FALLBACKS = ['TIENDA PRINCIPAL', 'ALMACEN PRINCIPAL'];

const getRegistrationStatus = (product: any): string => {
  const reg = String(product?.registrationStatus || '').trim();
  if (reg) return reg;
  const legacy = String(product?.status || '').trim();
  if (legacy === 'Registrado' || legacy === 'No registrado' || legacy === 'Homologado') return legacy;
  return 'No registrado';
};

interface SalesFormProps {
  currentUser: User;
  activeStoreId?: string;
  stores?: Store[];
}

const SalesForm: React.FC<SalesFormProps> = ({ currentUser, activeStoreId, stores = [] }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentMethodAdmin[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [payments, setPayments] = useState<{ method: PaymentMethodAdmin; amount: number }[]>([]);
  const [customerAdvanceBalance, setCustomerAdvanceBalance] = useState<number>(0);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ fullName: '', address: '', phone: '', dni: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dniSearch, setDniSearch] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<'Registrado' | 'No registrado' | ''>('');
  const [selectedLocation, setSelectedLocation] = useState<string>(''); // New state for location filter
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set<string>());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [creditConfig, setCreditConfig] = useState<{
    interestRate: number;
    numberOfInstallments: number;
    periodicity: 'weekly' | 'biweekly' | 'monthly' | 'manual';
    installments: { number: number; dueDate: string; amount: number }[];
  }>({
    interestRate: 0,
    numberOfInstallments: 1,
    periodicity: 'monthly',
    installments: []
  });
  const [showCreditConfig, setShowCreditConfig] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'RECEIPT_IFRAME_LOADED') {
        // Trigger print after a short delay to ensure content is rendered
        setTimeout(() => {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
              iframeRef.current.contentWindow.focus();
              iframeRef.current.contentWindow.print();
            } catch (error) {
              console.error('Error al imprimir:', error);
              alert('Error al intentar imprimir el recibo.');
            }
          }
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [productsData, customersData, paymentMethodsData, brandsData, modelsData, locationsData] = await Promise.all([
        getProducts({ consolidated: true }),
        getCustomers(),
        getPaymentMethods(),
        getBrands(),
        getModels(),
        getLocations()
      ]);

      const productsWithStock = productsData.filter(p => p.stockQuantity >= 1);

      // Show all products with stock_quantity >= 1 (we'll filter in the UI which ones can be selected)
      setProducts(productsWithStock);
      setCustomers(customersData);
      setPaymentOptions(paymentMethodsData);
      setBrands(brandsData);
      setModels(modelsData);
      setLocations(locationsData);

      const activeStoreName = stores.find(store => store.id === activeStoreId)?.name
        || locationsData.find(loc => loc.id === activeStoreId)?.name;
      const defaultLocationName = locationsData.find(loc => loc.isDefault)?.name;
      const availableLocations = (locationsData.length > 0 ? locationsData.map(loc => loc.name) : LOCATION_FALLBACKS);
      setSelectedLocation(prev => {
        const hasProductsIn = (locationName: string) => productsWithStock.some(p => p.location === locationName);
        if (activeStoreName && availableLocations.includes(activeStoreName) && hasProductsIn(activeStoreName)) return activeStoreName;
        if (defaultLocationName && availableLocations.includes(defaultLocationName) && hasProductsIn(defaultLocationName)) return defaultLocationName;
        if (prev && availableLocations.includes(prev) && hasProductsIn(prev)) return prev;
        const firstWithProducts = availableLocations.find(hasProductsIn);
        return firstWithProducts || availableLocations[0] || '';
      });

      if (paymentMethodsData.length > 0 && payments.length === 0) {
        setPayments([{ method: paymentMethodsData[0], amount: 0 }]);
      }
    } catch (err) {
      setError("Error al cargar datos iniciales. Verifique la conexión y permisos.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [activeStoreId]);

  const handleAddCartRow = (product: Product) => {
    setCart(prev => [...prev, {
      tempId: Date.now() + Math.random(),
      productId: product.id,
      name: product.name,
      brand: (product as any).brand || '',
      model: (product as any).model || '',
      quantity: 1,
      price: product.sellPrice || (product as any).price || 0,
      stock: product.stockQuantity || (product as any).stock || 0,
      imei1: product.imei1,
      imei2: product.imei2,
      serialNumber: product.serialNumber
    }]);
  };

  const handleRemoveCartRow = (tempId: number) => {
    setCart(prev => prev.filter(item => item.tempId !== tempId));
  };

  const handleCartChange = (tempId: number, field: keyof CartItem, value: any) => {
    setError(null);
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        if (field === 'price') {
          const newPrice = parseFloat(value);
          const price = isNaN(newPrice) ? item.price : newPrice;

          const product = products.find(p => p.id === item.productId);
          let hasError = false;
          if (product && (product.minSellPrice != null || (product as any).minPrice != null)) {
            const minPrice = parseFloat((product.minSellPrice || (product as any).minPrice) as any);
            if (!isNaN(minPrice) && price < minPrice) {
              hasError = true;
            }
          }
          return { ...item, price, hasError };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handlePaymentChange = (index: number, field: 'method' | 'amount', value: string | number) => {
    setPayments((prev: { method: PaymentMethodAdmin; amount: number }[]) => {
      const newPayments = prev.map((p, i) => {
        if (i === index) {
          if (field === 'method') {
            const newMethod = availablePaymentOptions.find(opt => opt.name === value);
            return { ...p, method: newMethod || p.method };
          }
          const numValue = typeof value === 'string' ? parseFloat(value) : (value as number);
          return { ...p, amount: isNaN(numValue) ? 0 : numValue };
        }
        return p;
      });

      const hasCredit = newPayments.some(p => isCreditPaymentName(p.method.name));
      setShowCreditConfig(hasCredit);

      return newPayments;
    });
  };

  const addPayment = () => {
    if (availablePaymentOptions.length === 0) return;
    setPayments(prev => [...prev, { method: availablePaymentOptions[0], amount: 0 }]);
  };

  const removePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const totalSale = useMemo(() => cart.reduce((total, item) => {
    if (item.hasError || isNaN(item.price) || isNaN(item.quantity)) {
      return total;
    }
    return total + item.price * item.quantity;
  }, 0), [cart]);
  const totalPayments = useMemo(() => payments.reduce((acc, p) => acc + p.amount, 0), [payments]);

  const availablePaymentOptions = useMemo(() => {
    const baseOptions = [...paymentOptions];
    if (customerAdvanceBalance > 0 && !baseOptions.some(option => option.name === 'Adelanto')) {
      baseOptions.push({ id: 9999, name: 'Adelanto' });
    }
    return baseOptions;
  }, [paymentOptions, customerAdvanceBalance]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    const loadAdvanceBalance = async () => {
      if (!selectedCustomerId) {
        setCustomerAdvanceBalance(0);
        return;
      }
      try {
        const result = await getCustomerAdvanceBalance(selectedCustomerId, { consolidated: true });
        setCustomerAdvanceBalance(result.balance);
      } catch (err) {
        console.error('Error al cargar saldo de adelantos:', err);
        setCustomerAdvanceBalance(0);
      }
    };

    loadAdvanceBalance();
  }, [selectedCustomerId]);

  useEffect(() => {
    const hasAdvanceOption = availablePaymentOptions.some(option => isAdvancePaymentName(option.name));
    if (hasAdvanceOption) return;

    const fallbackMethod = availablePaymentOptions[0];
    if (!fallbackMethod) return;

    setPayments(prev => prev.map(payment => (
      isAdvancePaymentName(payment.method.name)
        ? { ...payment, method: fallbackMethod, amount: 0 }
        : payment
    )));
  }, [availablePaymentOptions]);

  // Efecto para buscar clientes y sugerir registro si no existen
  const customerSearchResults = useMemo(() => {
    if (!dniSearch.trim()) return [];
    const results = customers.filter(c =>
      c.docNumber.includes(dniSearch) ||
      c.fullName.toLowerCase().includes(dniSearch.toLowerCase())
    );
    return results;
  }, [customers, dniSearch]);

  useEffect(() => {
    // Si el usuario escribió algo pero no hay resultados despues de 2 caracteres, sugerir registro
    if (dniSearch.length >= 8 && customerSearchResults.length === 0 && !selectedCustomerId && !isNewCustomer) {
      const timer = setTimeout(() => {
        setIsNewCustomer(true);
        setNewCustomer(prev => ({ ...prev, dni: dniSearch }));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dniSearch, customerSearchResults, selectedCustomerId, isNewCustomer]);

  // Manejo de cuotas automáticas
  useEffect(() => {
    if (showCreditConfig) {
      const creditPayment = payments.find(p => isCreditPaymentName(p.method.name));
      const creditAmount = creditPayment ? creditPayment.amount : 0;

      if (creditAmount > 0) {
        const installmentAmount = (creditAmount * (1 + creditConfig.interestRate / 100)) / creditConfig.numberOfInstallments;
        const newInstallments = Array.from({ length: creditConfig.numberOfInstallments }, (_, i) => {
          const dueDate = new Date();
          if (creditConfig.periodicity === 'monthly') dueDate.setMonth(dueDate.getMonth() + i + 1);
          if (creditConfig.periodicity === 'weekly') dueDate.setDate(dueDate.getDate() + (i + 1) * 7);
          if (creditConfig.periodicity === 'biweekly') dueDate.setDate(dueDate.getDate() + (i + 1) * 15);

          return {
            number: i + 1,
            dueDate: dueDate.toISOString().split('T')[0],
            amount: Number(installmentAmount.toFixed(2))
          };
        });
        setCreditConfig(prev => ({ ...prev, installments: newInstallments }));
      }
    }
  }, [showCreditConfig, creditConfig.numberOfInstallments, creditConfig.periodicity, creditConfig.interestRate, payments]);

  const handleFinalizeSale = async () => {
    setIsLoading(true);
    setError(null);

    if (cart.some(item => item.hasError)) {
      setError('Revise los precios de los productos marcados en rojo. No pueden ser menores al precio mínimo.');
      setIsLoading(false);
      return;
    }

    let customerIdToSave: string | null = selectedCustomerId || null;

    if (isNewCustomer) {
      if (!newCustomer.fullName || !newCustomer.phone || !newCustomer.dni) {
        setError('Nombre, DNI y teléfono del nuevo cliente son requeridos.');
        setIsLoading(false);
        return;
      }
      try {
        const savedCustomer = await saveCustomer(newCustomer);
        setCustomers(prev => [...prev, savedCustomer]);
        customerIdToSave = savedCustomer.id;
        setIsNewCustomer(false);
        setNewCustomer({ fullName: '', address: '', phone: '', dni: '' });
      } catch (err: any) {
        const backendMessage = typeof err?.message === 'string' ? err.message : '';
        setError(backendMessage || 'Error al guardar el nuevo cliente.');
        console.error(err);
        setIsLoading(false);
        return;
      }
    }

    if (!customerIdToSave) {
      setError('Por favor, seleccione un cliente o cree uno nuevo.');
      setIsLoading(false);
      return;
    }

    if (cart.length === 0) {
      setError('El carrito está vacío.');
      setIsLoading(false);
      return;
    }

    const advancePaymentTotal = payments
      .filter(payment => isAdvancePaymentName(payment.method.name))
      .reduce((sum, payment) => sum + payment.amount, 0);

    if (advancePaymentTotal > customerAdvanceBalance) {
      setError(`El monto de "Adelanto" excede el saldo disponible (${formatCurrency(customerAdvanceBalance)}).`);
      setIsLoading(false);
      return;
    }

    if (totalPayments !== totalSale) {
      setError('El total de los pagos no coincide con el total de la venta.');
      setIsLoading(false);
      return;
    }

    const finalSelectedCustomer = customers.find(c => c.id === customerIdToSave) || (isNewCustomer ? { ...newCustomer, id: customerIdToSave } : null);

    if (!finalSelectedCustomer) {
      setError('Cliente no encontrado.');
      setIsLoading(false);
      return;
    }


    try {
      const selectedLocationStoreId =
        stores.find(store => normalizeText(store.name) === normalizeText(activeSaleLocation))?.id || activeStoreId || undefined;

      const salePayload = {
        sellerId: currentUser.id,
        storeId: selectedLocationStoreId,
        documentType: 'Recibo de Venta',
        customerId: customerIdToSave,
        total: totalSale,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          imei1: item.imei1 || '',
          imei2: item.imei2 || '',
          serialNumber: item.serialNumber || '',
        })),
        payments: payments.map(p => ({ paymentMethod: p.method.name, amount: p.amount })),
        creditDetails: showCreditConfig ? creditConfig : null
      };
      const result = await saveSale(salePayload);

      if (advancePaymentTotal > 0) {
        await applyCustomerAdvancesToSale(customerIdToSave as string, result.saleId, advancePaymentTotal);
      }

      const saleForReceipt = {
        id: result.saleId,
        customer: {
          fullName: finalSelectedCustomer.fullName,
          address: finalSelectedCustomer.address,
          phone: finalSelectedCustomer.phone,
          dni: (finalSelectedCustomer as any).docNumber || (finalSelectedCustomer as any).dni,
        },
        items: cart.map(item => {
          const productDetails = products.find(p => p.id === item.productId);
          return {
            name: item.name,
            description: productDetails?.description || '',
            brand: (productDetails as any)?.brand || '', // Brand es nombre en el objeto mapeado
            model: (productDetails as any)?.model || '',
            quantity: item.quantity,
            price: item.price,
            salePrice: item.price,
            imei1: item.imei1,
            imei2: item.imei2,
            serialNumber: item.serialNumber,
            status: productDetails ? getRegistrationStatus(productDetails) : 'N/A'
          };
        }),
        payments: payments,
        total: totalSale,
        paymentMethod: payments.map(p => p.method.name).join(', '),
        date: new Date(),
        hasUnregisteredProduct: cart.some(item => {
          const productDetails = products.find(p => p.id === item.productId);
          return productDetails ? getRegistrationStatus(productDetails) === 'No registrado' : false;
        })
      };
      setLastSaleData(saleForReceipt);
      setSaleSuccess(`Venta ${result.saleId} registrada con éxito!`);
      setCart([]);
      setPayments([{ method: paymentOptions[0], amount: 0 }]);
      setSelectedCustomerId('');
      setCustomerAdvanceBalance(0);
      await fetchInitialData();
    } catch (error: any) {
      console.error("Error al registrar la venta:", error);
      const backendMessage = typeof error?.message === 'string' ? error.message : '';
      setError(backendMessage || "Hubo un error al registrar la venta.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNewCustomer = async () => {
    setIsLoading(true);
    setError(null);
    if (!newCustomer.fullName || !newCustomer.phone || !newCustomer.dni) {
      setError('Nombre, DNI y teléfono del nuevo cliente son requeridos.');
      setIsLoading(false);
      return;
    }
    try {
      const savedCustomer = await saveCustomer(newCustomer);
      setCustomers([...customers, savedCustomer]);
      setSelectedCustomerId(savedCustomer.id.toString());
      setIsNewCustomer(false);
      setNewCustomer({ fullName: '', address: '', phone: '', dni: '' });
    } catch (err: any) {
      const backendMessage = typeof err?.message === 'string' ? err.message : '';
      setError(backendMessage || 'Error al guardar el nuevo cliente.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!lastSaleData || !iframeRef.current) {
      return;
    }

    const iframe = iframeRef.current;
    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument;

    if (!iframeWindow || !iframeDocument) {
      alert('Error: No se pudo acceder al contenido del iframe para imprimir.');
      return;
    }

    // Write the iframe content with proper styling
    iframeDocument.open();
    iframeDocument.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Venta #${lastSaleData.id}</title>
        <style>
          body { 
            font-family: 'Courier New', Courier, monospace; 
            margin: 0; 
            padding: 0; 
            color: #000; 
            background-color: #fff; 
            font-size: 12px; 
            line-height: 1.4; 
          }
          .receipt-container { 
            font-family: 'Courier New', Courier, monospace; 
            width: 280px; 
            padding: 10px; 
            color: #000; 
            background-color: #fff; 
            font-size: 12px; 
            line-height: 1.4; 
          }
          .receipt-section { margin-bottom: 12px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .section-title { 
            font-weight: bold; 
            text-align: center; 
            margin: 6px 0; 
            text-transform: uppercase; 
          }
          .receipt-header p { text-align: center; margin: 3px 0; font-size: 11px; }
          .receipt-header .company-details { 
            text-align: center; 
            margin-bottom: 8px; 
            font-size: 15px; 
            white-space: pre-wrap; 
          }
          .receipt-header .order-number { 
            font-size: 12px; 
            font-weight: bold; 
            margin-top: 6px; 
            text-align: center; 
          }
          .customer-details p { margin: 3px 0; font-size: 12px; }
          .receipt-body table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 8px 0; 
          }
          .receipt-body th, .receipt-body td { 
            border-bottom: 1px dashed #000; 
            padding: 4px 0; 
            font-size: 12px; 
            text-align: left; 
          }
          .receipt-body .item-detail { 
            font-size: 12px; 
            margin: 2px 0; 
          }
          .receipt-body .item-details-row td { 
            padding-top: 2px; 
            border-top: none; 
            font-size: 12px; 
            color: #000; 
          }
          .receipt-body th:nth-child(2), .receipt-body td:nth-child(2) { text-align: center; }
          .receipt-body th:nth-child(3), .receipt-body td:nth-child(3), 
          .receipt-body th:nth-child(4), .receipt-body td:nth-child(4) { text-align: right; }
          .receipt-footer .total { 
            font-weight: bold; 
            font-size: 14px; 
            text-align: right; 
            margin: 8px 0; 
            padding-top: 4px; 
            border-top: 1px dashed #000; 
          }
          .receipt-footer p { margin: 3px 0; font-size: 11px; }
          .receipt-footer .thank-you-message { 
            text-align: center; 
            margin-top: 12px; 
            font-style: italic; 
            font-size: 11px; 
          }
          .text-bold { font-weight: bold; }
          .text-center { text-align: center; }
          .text-xs { font-size: 10px; }
          @media print { 
            body, html { 
              width: 280px; 
              margin: 0; 
              padding: 0; 
              background: #fff; 
            } 
            .receipt-container { 
              box-shadow: none; 
              border: none; 
              padding: 0; 
            }
          }
        </style>
      </head>
      <body>
        <div id="receipt-root"></div>
        <script>
          window.addEventListener('load', function() {
            // Notify parent that iframe is loaded
            window.parent.postMessage({ type: 'RECEIPT_IFRAME_LOADED' }, '*');
          });
        </script>
      </body>
      </html>
    `);
    iframeDocument.close();

    // Handle iframe load event
    iframe.onload = () => {
      try {
        const receiptRootDiv = iframeDocument.getElementById('receipt-root');
        if (receiptRootDiv) {
          const root = createRoot(receiptRootDiv);
          flushSync(() => {
            root.render(
              React.createElement(Receipt, {
                customer: lastSaleData.customer,
                items: lastSaleData.items,
                payments: lastSaleData.payments || [{ method: lastSaleData.paymentMethod, amount: lastSaleData.total }],
                total: lastSaleData.total,
                seller: currentUser,
                sale: lastSaleData,
                onPrint: () => {
                  setTimeout(() => {
                    try {
                      iframeWindow.focus();
                      iframeWindow.print();
                    } catch (error) {
                      console.error('Error al imprimir:', error);
                      alert('Error al intentar imprimir el recibo.');
                    }
                  }, 500);
                }
              })
            );
          });
        } else {
          alert('Error: No se encontró el elemento raíz para el recibo en el iframe.');
        }
      } catch (error) {
        console.error('Error al renderizar el recibo:', error);
        alert('Error al renderizar el recibo para impresión.');
      }
    };
  };

  const locationOptions = useMemo(() => {
    const names = locations.length > 0 ? locations.map(location => location.name) : [...LOCATION_FALLBACKS];
    products.forEach(product => {
      if (product.location && !names.includes(product.location)) {
        names.push(product.location);
      }
    });
    return names;
  }, [locations, products]);

  const activeSaleLocation = selectedLocation || locationOptions[0] || '';

  const normalizeText = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

  const normalizePaymentName = (value: string | null | undefined): string =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const isCreditPaymentName = (value: string | null | undefined): boolean => {
    const normalized = normalizePaymentName(value);
    return normalized === 'credito' || normalized === 'credit_installment';
  };

  const isAdvancePaymentName = (value: string | null | undefined): boolean => {
    const normalized = normalizePaymentName(value);
    return normalized === 'adelanto' || normalized === 'advance';
  };

  const modelById = useMemo(() => {
    const map = new Map<string, Model>();
    models.forEach((model) => map.set(String(model.id), model));
    return map;
  }, [models]);

  const filteredProducts = useMemo(() => {
    const selectedBrand = brands.find(b => String(b.id) === selectedBrandId);
    const selectedModel = models.find(m => String(m.id) === selectedModelId);
    const term = productSearchTerm.toLowerCase().trim();

    const filtered = products.filter((p: Product) => {
      const productModelId = String((p as any).model_id || '');
      const productModel = productModelId ? modelById.get(productModelId) : undefined;
      const productBrandId = productModel ? String(productModel.brandId) : '';

      const brandMatch = !selectedBrandId || (
        productBrandId
          ? productBrandId === selectedBrandId
          : (!!selectedBrand && normalizeText(p.brand) === normalizeText(selectedBrand.name))
      );

      const modelMatch = !selectedModelId || (
        productModelId
          ? productModelId === selectedModelId
          : (!!selectedModel && normalizeText(p.model) === normalizeText(selectedModel.name))
      );
      const statusMatch = !selectedStatus || p.status === selectedStatus;
      const locationMatch = !selectedLocation || p.location === selectedLocation;

      const searchMatch = !term ||
        p.name?.toLowerCase().includes(term) ||
        p.brand?.toLowerCase().includes(term) ||
        p.model?.toLowerCase().includes(term) ||
        p.imei1?.toLowerCase().includes(term) ||
        p.imei2?.toLowerCase().includes(term) ||
        p.serialNumber?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term);

      return brandMatch && modelMatch && statusMatch && locationMatch && searchMatch;
    });

    return filtered;
  }, [products, selectedBrandId, selectedModelId, selectedStatus, selectedLocation, productSearchTerm, brands, models, modelById]);

  // Calcular productos paginados
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when search changes
  }, [productSearchTerm, selectedBrandId, selectedModelId, selectedStatus, selectedLocation]);

  const filteredModels = useMemo(() => {
    const inStockModelIds = new Set(
      products
        .filter(p => (p.stockQuantity || 0) >= 1)
        .map(p => String((p as any).model_id || ''))
        .filter(Boolean)
    );

    let availableModels = models.filter((m: Model) => inStockModelIds.has(String(m.id)));

    if (selectedBrandId) {
      availableModels = availableModels.filter((m: Model) => String(m.brandId) === selectedBrandId);
    }

    if (availableModels.length === 0) {
      const inStockModelNames = new Set(
        products.filter(p => (p.stockQuantity || 0) >= 1).map(p => normalizeText(p.model))
      );
      availableModels = models.filter((m: Model) => inStockModelNames.has(normalizeText(m.name)));
      if (selectedBrandId) {
        availableModels = availableModels.filter((m: Model) => String(m.brandId) === selectedBrandId);
      }
    }

    return availableModels;
  }, [selectedBrandId, models, products]);

  useEffect(() => {
    setSelectedModelId('');
  }, [selectedBrandId]);

  const handleSelectProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product && activeSaleLocation && product.location !== activeSaleLocation) {
      return;
    }

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

  const handleSelectAllProducts = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const selectable = filteredProducts.filter(p => !activeSaleLocation || p.location === activeSaleLocation);
      setSelectedProductIds(new Set(selectable.map(p => p.id)));
    } else {
      setSelectedProductIds(new Set());
    }
  };

  const addSelectedProductsToCart = () => {
    const productsToAdd = products.filter(p => selectedProductIds.has(p.id) && (!activeSaleLocation || p.location === activeSaleLocation));
    productsToAdd.forEach(p => handleAddCartRow(p));
    setSelectedProductIds(new Set());
    // Optionally, navigate back to a product listing page or similar
    // For this example, we just reset the state.
  };

  return (
    <>
      <iframe ref={iframeRef} style={{ display: 'none' }} title="print-receipt"></iframe>
      <div className="animate-fade-in">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-indigo-400 bg-clip-text text-transparent">Punto de Venta</h1>
            <p className="text-slate-500 text-sm font-medium tracking-wide">Registro de ventas y emisión de recibos</p>
            {activeStoreId && (
              <p className="text-xs text-[#11d483] font-bold uppercase tracking-wide mt-1">
                Tienda activa: {stores.find(store => store.id === activeStoreId)?.name || 'No definida'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-slate-200 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#11d483] animate-pulse"></div>
              <span className="text-xs font-bold text-slate-300">SISTEMA ONLINE</span>
            </div>
            <button
              onClick={fetchInitialData}
              className="btn btn-secondary !py-2"
              disabled={isLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Actualizar Datos
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Columna de Selección y Productos (8 cols) */}
          <div className="xl:col-span-8 space-y-6">

            {/* Sección de Cliente */}
            <div className="card backdrop-blur-md !overflow-visible z-30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#11d483]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Información del Cliente
                </h3>
                {!selectedCustomerId && !isNewCustomer && (
                  <button onClick={() => setIsNewCustomer(true)} className="text-xs font-bold text-[#11d483] hover:underline">+ REGISTRAR NUEVO</button>
                )}
              </div>

              {selectedCustomer ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente</p>
                    <p className="text-sm font-bold text-white">{selectedCustomer.fullName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">DNI / Documento</p>
                    <p className="text-sm font-bold text-white">{selectedCustomer.dni}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono</p>
                      <p className="text-sm font-bold text-white">{selectedCustomer.phone || '--'}</p>
                    </div>
                    <button onClick={() => setSelectedCustomerId('')} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : isNewCustomer ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" placeholder="Nombre completo" value={newCustomer.fullName} onChange={e => setNewCustomer({ ...newCustomer, fullName: e.target.value })} className="input-style !bg-white !text-slate-900 !border-slate-300" style={{ colorScheme: 'light' }} />
                    <input type="text" placeholder="DNI / RUC" value={newCustomer.dni} onChange={e => setNewCustomer({ ...newCustomer, dni: e.target.value })} className="input-style !bg-white !text-slate-900 !border-slate-300" style={{ colorScheme: 'light' }} />
                    <input type="text" placeholder="Teléfono" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="input-style !bg-white !text-slate-900 !border-slate-300" style={{ colorScheme: 'light' }} />
                    <input type="text" placeholder="Dirección (Opcional)" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} className="input-style !bg-white !text-slate-900 !border-slate-300" style={{ colorScheme: 'light' }} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleSaveNewCustomer} className="btn btn-primary flex-1">Guardar Cliente</button>
                    <button onClick={() => { setIsNewCustomer(false); setDniSearch(''); }} className="btn btn-secondary">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar por DNI o Nombre..."
                      value={dniSearch}
                      onChange={e => setDniSearch(e.target.value)}
                      className="input-style !pl-10"
                    />
                  </div>
                  {dniSearch.trim() !== '' && (
                    <div className="absolute z-[100] w-full mt-14 bg-white border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {(() => {
                        const filtered = customers
                          .filter(c => (String(c?.docNumber || c?.dni || "").includes(dniSearch.trim()) || String(c?.fullName || "").toLowerCase().includes(dniSearch.trim().toLowerCase())))
                          .slice(0, 15);

                        if (filtered.length === 0) {
                          return (
                            <div className="p-5 text-center">
                              <p className="text-sm font-medium text-slate-500 mb-3">No se encontraron clientes.</p>
                              <button onClick={() => setIsNewCustomer(true)} className="btn btn-primary !py-2 !text-xs font-bold w-auto inline-block">
                                + REGISTRAR NUEVO CLIENTE
                              </button>
                            </div>
                          );
                        }

                        return filtered.map(c => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setDniSearch('');
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between transition-colors group cursor-pointer"
                          >
                            <div>
                              <p className="text-sm font-bold text-slate-800 group-hover:text-[#11d483] transition-colors">{c.fullName}</p>
                              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Doc: {c.docNumber}</p>
                            </div>
                            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-3 py-1 rounded-full group-hover:bg-[#11d483]/20 group-hover:text-[#11d483] transition-colors">
                              Seleccionar
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selector de Productos */}
            <div className="card">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#11d483]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Catálogo de Productos
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase">Ver:</span>
                    <select
                      value={itemsPerPage}
                      onChange={e => setItemsPerPage(Number(e.target.value))}
                      className="border border-slate-300 bg-white text-slate-900 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#0ea5a0]/40"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                    </select>
                  </div>
                  {selectedProductIds.size > 0 && (
                    <button onClick={addSelectedProductsToCart} className="btn btn-primary !py-2 !text-xs">
                      AÑADIR ({selectedProductIds.size})
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="col-span-full">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar por nombre, modelo, IMEI o S/N..."
                      value={productSearchTerm}
                      onChange={e => setProductSearchTerm(e.target.value)}
                      className="input-style !pl-10"
                    />
                  </div>
                </div>
                <select value={selectedBrandId} onChange={e => setSelectedBrandId(e.target.value || '')} className="input-style">
                  <option value="">Marcas</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value || '')} className="input-style">
                  <option value="">Modelos</option>
                  {filteredModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="input-style">
                  <option value="">Ubicación</option>
                  {locationOptions.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as any)} className="input-style">
                  <option value="">Estado</option>
                  <option value="Registrado">Registrado</option>
                  <option value="No registrado">No registrado</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th-style w-10 text-center">
                        <input type="checkbox" onChange={handleSelectAllProducts} className="accent-[#11d483]" />
                      </th>
                      <th className="th-style">Producto</th>
                      <th className="th-style">IMEI / S/N</th>
                      <th className="th-style">Estado</th>
                      <th className="th-style text-right">Precio</th>
                      <th className="th-style text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedProducts.map((p: Product) => {
                      const isInStore = !activeSaleLocation || p.location === activeSaleLocation;
                      const canBeSelected = isInStore;
                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-white/5 transition-colors ${!isInStore ? 'opacity-50' : ''} ${selectedProductIds.has(p.id) ? 'bg-[#11d483]/5' : ''}`}
                        >
                          <td className="td-style text-center">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.has(p.id)}
                              onChange={() => canBeSelected && handleSelectProduct(p.id)}
                              disabled={!canBeSelected}
                              className="accent-[#11d483] w-4 h-4"
                            />
                          </td>
                          <td className="td-style">
                            <div className="font-bold text-white flex items-center gap-2">
                              {p.name}
                              {!isInStore && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded uppercase">{p.location}</span>}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium truncate max-w-[250px]">{p.description}</div>
                          </td>
                          <td className="td-style">
                            <div className="text-sm font-mono font-bold text-slate-300">
                              {p.imei1 || p.serialNumber || <span className="text-slate-600 italic">SIN IMEI/SN</span>}
                            </div>
                            {p.imei1 && p.serialNumber && <div className="text-[10px] text-slate-500">SN: {p.serialNumber}</div>}
                          </td>
                          <td className="td-style">
                            {(() => {
                              const value = getRegistrationStatus(p);
                              const isRegistered = value === 'Registrado';
                              return (
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isRegistered ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                  }`}>
                                  {value.toUpperCase()}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="td-style text-right font-bold text-[#11d483]">{formatCurrency(p.sellPrice || 0)}</td>
                          <td className="td-style text-right">
                            <div className="text-sm font-bold text-white">{p.stockQuantity || 0}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 px-2">
                  <p className="text-xs text-slate-500 font-medium tracking-wide">
                    PÁGINA <span className="text-white font-bold">{currentPage}</span> DE <span className="text-white font-bold">{totalPages}</span>
                    <span className="mx-2 opacity-30">|</span>
                    TOTAL <span className="text-[#11d483] font-bold">{filteredProducts.length}</span> RESULTADOS
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna de Resumen (4 cols) */}
          <div className="xl:col-span-4 space-y-6">

            {/* Carrito de Compras */}
            <div className="card !p-0 overflow-hidden flex flex-col h-full max-h-[85vh] min-h-0">
              <div className="p-6 border-b border-white/5 bg-white/5">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#11d483]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Carrito de Ventas
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <p className="text-sm font-medium">El carrito está vacío</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.tempId} className={`p-4 rounded-2xl border transition-all ${item.hasError ? 'bg-red-500/10 border-red-500/50' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white mb-1">
                            {item.name?.trim() || [item.brand, item.model].filter(value => value && value !== 'Genérico' && value !== 'N/A').join(' ') || 'Producto sin nombre'}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[220px]">
                            {[item.brand, item.model].filter(value => value && value !== 'Genérico' && value !== 'N/A').join(' ') || '-'}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">IMEI: {item.imei1 || 'N/A'}</p>
                        </div>
                        <button onClick={() => handleRemoveCartRow(item.tempId)} className="text-slate-500 hover:text-red-400 p-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1">
                          <span className="text-[10px] font-bold text-slate-500">CANT.</span>
                          <input
                            type="number"
                            min="1"
                            max={item.stock}
                            value={item.quantity}
                            onChange={e => handleCartChange(item.tempId, 'quantity', parseInt(e.target.value))}
                            className="bg-transparent w-8 text-center text-sm font-bold focus:outline-none"
                          />
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-xs font-bold text-slate-500 uppercase">P. UNIT</div>
                          <input
                            type="number"
                            value={item.price}
                            onChange={e => handleCartChange(item.tempId, 'price', e.target.value)}
                            className={`bg-transparent w-full text-right text-base font-bold focus:shadow-none border-none p-0 focus:outline-none ${item.hasError ? 'text-red-400' : 'text-[#11d483]'}`}
                          />
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                        <span className="text-sm text-slate-500 font-medium">Subtotal</span>
                        <span className="text-sm font-bold text-white">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-4 max-h-[45vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-sm font-bold text-slate-800 uppercase tracking-widest">Total a Pagar</span>
                  <span className="text-3xl font-extrabold text-slate-900">{formatCurrency(totalSale)}</span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">Pagos Recibidos</h4>
                  {customerAdvanceBalance > 0 && (
                    <div className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      Saldo a favor disponible: {formatCurrency(customerAdvanceBalance)}
                    </div>
                  )}
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={p.method.name}
                        onChange={e => handlePaymentChange(i, 'method', e.target.value)}
                        className="input-style !py-2 !text-xs flex-1 !bg-white !text-slate-900 !border-slate-300"
                        style={{ colorScheme: 'light' }}
                      >
                        {availablePaymentOptions.map(opt => <option key={opt.id} value={opt.name} className="bg-white text-slate-900">{opt.name}</option>)}
                      </select>
                      <input
                        type="number"
                        value={p.amount}
                        onChange={e => handlePaymentChange(i, 'amount', parseFloat(e.target.value) || 0)}
                        className="input-style !py-2 !text-xs w-28 text-right !bg-white !text-slate-900 !border-slate-300"
                        style={{ colorScheme: 'light' }}
                        placeholder="0.00"
                      />
                      <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-300 p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addPayment}
                    className="inline-flex items-center rounded-lg border border-yellow-300 bg-yellow-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 hover:bg-yellow-200"
                  >
                    + AÑADIR OTRO MÉTODO
                  </button>
                </div>

                {showCreditConfig && (
                  <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Configuración del Crédito</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Cuotas</label>
                        <input
                          type="number"
                          value={creditConfig.numberOfInstallments}
                          onChange={e => setCreditConfig({ ...creditConfig, numberOfInstallments: parseInt(e.target.value) || 1 })}
                          className="input-style !py-1 !text-xs !bg-white !text-slate-900 !border-slate-300"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Interés (%)</label>
                        <input
                          type="number"
                          value={creditConfig.interestRate}
                          onChange={e => setCreditConfig({ ...creditConfig, interestRate: parseFloat(e.target.value) || 0 })}
                          className="input-style !py-1 !text-xs !bg-white !text-slate-900 !border-slate-300"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold">Periodicidad</label>
                      <select
                        value={creditConfig.periodicity}
                        onChange={e => setCreditConfig({ ...creditConfig, periodicity: e.target.value as any })}
                        className="input-style !py-1 !text-xs !bg-white !text-slate-900 !border-slate-300"
                        style={{ colorScheme: 'light' }}
                      >
                        <option value="monthly">Mensual</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="weekly">Semanal</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                    <div className="pt-2">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Resumen de Cuotas</p>
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {creditConfig.installments.map((inst, idx) => (
                          <div key={idx} className="flex justify-between text-[10px] bg-white border border-slate-200 p-2 rounded-lg">
                            <span className="text-slate-700">Cuota {inst.number} ({inst.dueDate})</span>
                            <span className="text-slate-900 font-bold">{formatCurrency(inst.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400 text-xs font-medium animate-shake">
                    {error}
                  </div>
                )}

                <div className="sticky bottom-0 bg-slate-50 pt-3">
                  {saleSuccess ? (
                    <div className="space-y-3 animate-fade-in">
                      <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/50 text-green-400 text-center font-bold">
                        {saleSuccess}
                      </div>
                      <button onClick={handlePrintReceipt} className="btn btn-primary w-full !text-md !py-4 font-black">
                        IMPRIMIR RECIBO
                      </button>
                      <button onClick={() => setSaleSuccess(null)} className="w-full text-center text-xs font-bold text-slate-500 hover:text-white transition-colors py-2 uppercase tracking-widest">
                        Nueva Venta
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={handleFinalizeSale}
                        disabled={isLoading || (!selectedCustomerId && !isNewCustomer) || cart.length === 0 || totalPayments !== totalSale}
                        className="btn btn-primary w-full !text-lg !py-4 !font-extrabold !text-white !bg-emerald-600 hover:!bg-emerald-700 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group"
                      >
                        {isLoading ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SalesForm;
