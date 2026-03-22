import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '../utils/formatting';
import { Sale, Product, User, PaymentDetail, SaleDetail } from '../types';
import { getDailyReportData } from '../services/functionsApi'; // This function will be created

interface DailyReportData {
  sales: Sale[];
  products: Product[]; // Full product details for lookup
  users: User[];
  details: SaleDetail[];
  payments: PaymentDetail[];
}

const DailyReportScreen: React.FC = () => {
  const getPeruDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Lima' // Explicitly set timezone
    };
    // en-CA locale ensures YYYY-MM-DD format
    const parts = new Intl.DateTimeFormat('en-CA', options).format(now).split('-');
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getPeruDate());
  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReport();
  }, [selectedDate]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDailyReportData(selectedDate);
      setReportData({
        sales: data.sales || [],
        products: data.products || [],
        users: data.users || [],
        details: data.details || [],
        payments: data.payments || [],
      });
    } catch (err) {
      console.error("Error fetching daily report:", err);
      if (err instanceof Error) {
        setError(`Error al cargar el reporte diario: ${err.message}`);
      } else {
        setError("Error desconocido al cargar el reporte diario.");
      }
    } finally {
      setLoading(false);
    }
  };

  const enrichedSales = React.useMemo(() => {
    if (!reportData) return [];
    const result = reportData.sales.map(sale => {
      const items = reportData.details.filter(detail => detail.saleId === sale.id);
      return { ...sale, items };
    });
    return result;
  }, [reportData]);

  const salesBySeller = React.useMemo(() => {
    if (!reportData) return [];
    const sellerMap = new Map<string, { count: number; total: number }>();
    enrichedSales.forEach(sale => {
      const seller = reportData.users.find(u => u.id === sale.sellerId);
      const sellerName = seller ? seller.fullName : 'Desconocido';
      const current = sellerMap.get(sellerName) || { count: 0, total: 0 };
      sellerMap.set(sellerName, {
        count: current.count + (sale.items?.length || 0), // Count items sold
        total: current.total + sale.total,
      });
    });
    const result = Array.from(sellerMap.entries()).map(([name, data]) => ({
      sellerName: name,
      unitsSold: data.count,
      totalSales: data.total,
    }));
    return result;
  }, [reportData, enrichedSales]);

  const salesByPaymentMethod = React.useMemo(() => {
    if (!reportData) return [];
    const paymentMap = new Map<string, number>();
    reportData.payments.forEach(payment => {
      paymentMap.set(payment.paymentMethod, (paymentMap.get(payment.paymentMethod) || 0) + payment.amount);
    });
    const result = Array.from(paymentMap.entries()).map(([method, total]) => ({
      method,
      total,
    }));
    return result;
  }, [reportData]);

  const printReport = () => {
    if (!reportRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reporte Diario</title>
            <style>
              @media print {
                @page {
                  size: 80mm auto;
                  margin: 0;
                }
                body {
                  margin: 0;
                  padding: 0;
                  font-family: Arial, sans-serif;
                  font-size: 12px;
                  line-height: 1.4;
                  color: #000;
                  width: 80mm;
                }
                
                .report-header {
                  text-align: center;
                  margin-bottom: 10px;
                  border-bottom: 1px solid #000;
                  padding-bottom: 5px;
                }
                
                .report-title {
                  font-size: 16px;
                  font-weight: bold;
                  margin-bottom: 5px;
                }
                
                .report-date {
                  font-size: 12px;
                  margin-bottom: 10px;
                }
                
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 10px;
                }
                
                th, td {
                  padding: 3px 2px;
                  text-align: left;
                  border-bottom: 1px solid #000;
                }
                
                th {
                  font-weight: bold;
                }
                
                .text-right {
                  text-align: right;
                }
                
                .text-center {
                  text-align: center;
                }
                
                .summary-table {
                  margin-top: 10px;
                }
                
                .total-row {
                  font-weight: bold;
                }
                
                .divider {
                  border-top: 1px dashed #000;
                  margin: 10px 0;
                }
                
                .text-bold {
                  font-weight: bold;
                }
              }
            </style>
          </head>
          <body>
            ${reportRef.current.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      // Wait a bit for content to load before printing
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  };

  if (loading) return <div className="text-center p-10 font-semibold">Cargando reporte diario...</div>;
  if (error) return <div className="text-center p-10 text-red-600 font-semibold">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800">Reporte Diario</h1>
        <button 
          onClick={printReport}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Imprimir Reporte
        </button>
      </div>

      <div className="card">
        <label htmlFor="report-date" className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Fecha:</label>
        <input
          type="date"
          id="report-date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="input-style"
        />
      </div>

      {reportData && (
        <>
          {/* Detailed Sales Table */}
          <div ref={reportRef} className="card">
            <div className="report-header">
              <div className="report-title">REPORTE DIARIO DE VENTAS</div>
              <div className="report-date">Fecha: {selectedDate}</div>
            </div>
            
            <h2 className="text-xl font-semibold mb-4">Ventas del Día</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th-style">Hora</th>
                    <th className="th-style">Vendedor</th>
                    <th className="th-style">Producto</th>
                    <th className="th-style">Descripción</th>
                    <th className="th-style">IMEI</th>
                    <th className="th-style">Cliente</th>
                    <th className="th-style text-right">Precio Venta</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {enrichedSales
                    .flatMap(sale => 
                      sale.items?.map(item => ({ sale, item })) || []
                    )
                    .sort((a, b) => new Date(a.sale.date).getTime() - new Date(b.sale.date).getTime())
                    .map(({ sale, item }) => {
                      const product = reportData.products.find(p => p.id === item.productId);
                      const seller = reportData.users.find(u => u.id === sale.sellerId);
                      // Crear una clave única para cada fila
                      const rowKey = `${sale.id}-${item.productId}-${sale.date}`;
                      return (
                        <tr key={rowKey}>
                          <td className="td-style">{new Date(sale.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</td>
                          <td className="td-style">{seller?.fullName || 'N/A'}</td>
                          <td className="td-style">{product?.name || 'N/A'}</td>
                          <td className="td-style">{product?.description || 'N/A'}</td>
                          <td className="td-style">{item.imei1 || item.serialNumber || 'N/A'}</td>
                          <td className="td-style">{sale.customer?.fullName?.toUpperCase() || 'N/A'}</td>
                          <td className="td-style text-right">{formatCurrency(item.salePrice)}</td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>

          {/* Sales by Seller Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">Resumen por Vendedor</h2>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th-style">Vendedor</th>
                    <th className="th-style text-right">Equipos Vendidos</th>
                    <th className="th-style text-right">Monto Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {salesBySeller.map((data, index) => (
                    <tr key={index}>
                      <td className="td-style">{data.sellerName}</td>
                      <td className="td-style text-right">{data.unitsSold}</td>
                      <td className="td-style text-right">{formatCurrency(data.totalSales)}</td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="font-bold bg-gray-100">
                    <td className="td-style">TOTAL</td>
                    <td className="td-style text-right">
                      {salesBySeller.reduce((sum, data) => sum + data.unitsSold, 0)}
                    </td>
                    <td className="td-style text-right">
                      {formatCurrency(salesBySeller.reduce((sum, data) => sum + data.totalSales, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Sales by Payment Method Summary */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">Resumen por Método de Pago</h2>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th-style">Método de Pago</th>
                    <th className="th-style text-right">Monto Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {salesByPaymentMethod.map((data, index) => (
                    <tr key={index}>
                      <td className="td-style">{data.method}</td>
                      <td className="td-style text-right">{formatCurrency(data.total)}</td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="font-bold bg-gray-100">
                    <td className="td-style">TOTAL</td>
                    <td className="td-style text-right">
                      {formatCurrency(salesByPaymentMethod.reduce((sum, data) => sum + data.total, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyReportScreen;
