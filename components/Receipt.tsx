import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDate } from '../utils/formatting';
import { Customer, CartItem, PaymentMethod, Sale, User } from '../types';
import { getReceiptHeader } from '../services/api';
import './Receipt.css';

interface ReceiptProps {
  customer: Customer;
  items: CartItem[];
  payments: { method: PaymentMethod; amount: number }[];
  total: number;
  seller: User;
  onPrint?: () => void;
  sale?: Sale;
}

const Receipt: React.FC<ReceiptProps> = ({
  customer,
  items,
  payments,
  total,
  seller,
  onPrint,
  sale
}) => {
  const [headerInfo, setHeaderInfo] = useState<{ headerText: string; logoBase64: string | null }>({
    headerText: 'ENCABEZADO DEL RECIBO',
    logoBase64: null
  });
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchHeader = async () => {
      try {
        const headerData = await getReceiptHeader();
        setHeaderInfo(headerData);
      } catch (error) {
        console.error("Error fetching receipt header:", error);
        setHeaderInfo({
          headerText: 'ENCABEZADO DEL RECIBO',
          logoBase64: null
        });
      } finally {
        setLoading(false);
      }
    };

    fetchHeader();
  }, []);

  // Auto-trigger print when component is ready
  useEffect(() => {
    if (!loading && onPrint) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(() => {
        onPrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, onPrint]);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }

    const receiptElement = receiptRef.current;
    if (!receiptElement) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=80mm');
    if (!printWindow) {
      alert('No se pudo abrir la ventana de impresión. Por favor, verifique que su navegador no esté bloqueando las ventanas emergentes.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo</title>
          <style>
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                color: #000;
                background-color: #fff;
                width: 80mm; /* Set body width for thermal printer */
              }
            }
            .receipt-container {
              font-family: 'Courier New', Courier, monospace;
              width: 100%; /* Take up full width of body */
              padding: 10px;
              color: #000;
              background-color: #fff;
              font-size: 12px;
              line-height: 1.4;
            }
            .receipt-section {
              margin-bottom: 12px;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            .section-title {
              font-weight: bold;
              text-align: center;
              margin: 6px 0;
              text-transform: uppercase;
            }
            .receipt-header p {
              text-align: center;
              margin: 3px 0;
              font-size: 11px;
            }
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
            .customer-details p {
              margin: 3px 0;
              font-size: 12px;
            }
            .receipt-body table {
              width: 100%;
              border-collapse: collapse;
              margin: 8px 0;
            }
            .receipt-body th,
            .receipt-body td {
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
            .receipt-body th:nth-child(2),
            .receipt-body td:nth-child(2) {
              text-align: center;
            }
            .receipt-body th:nth-child(3),
            .receipt-body td:nth-child(3),
            .receipt-body th:nth-child(4),
            .receipt-body td:nth-child(4) {
              text-align: right;
            }
            .receipt-footer .total {
              font-weight: bold;
              font-size: 14px;
              text-align: right;
              margin: 8px 0;
              padding-top: 4px;
              border-top: 1px dashed #000;
            }
            .receipt-footer p {
              margin: 3px 0;
              font-size: 11px;
            }
            .receipt-footer .thank-you-message {
              text-align: center;
              margin-top: 12px;
              font-style: italic;
              font-size: 11px;
            }
            .text-bold {
              font-weight: bold;
            }
            .text-center {
              text-align: center;
            }
            .text-xs {
              font-size: 10px;
            }
            .receipt-actions {
              display: none;
            }
          </style>
        </head>
        <body>
          ${receiptElement.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    printWindow.onload = function () {
      printWindow.print();
      printWindow.close();
    };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="receipt-container" ref={receiptRef}>
      {/* Header Section */}
      <div className="receipt-section receipt-header">
        {headerInfo.logoBase64 && (
          <div className="mb-2 flex justify-center">
            <img
              src={headerInfo.logoBase64}
              alt="Logo"
              className="h-16 object-contain"
            />
          </div>
        )}
        <div className="company-details" style={{ whiteSpace: 'pre-wrap' }}>
          {headerInfo.headerText}
        </div>
        <div className="divider"></div>
        <p>FECHA: {formatDate(sale?.date || new Date().toISOString())}</p>
        {sale && <p className="order-number">NÚMERO DE ORDEN: <strong>{sale.id}</strong></p>}
        <p className="order-number">VENDEDOR: <strong>{seller?.fullName?.toUpperCase() || 'N/A'}</strong></p>
      </div>

      {/* Customer Details Section */}
      <div className="receipt-section customer-details">
        <p className="section-title">DATOS DEL CLIENTE</p>
        <p>CLIENTE: {customer?.fullName?.toUpperCase() || 'N/A'}</p>
        <p>DIRECCIÓN: {customer?.address?.toUpperCase() || 'N/A'}</p>
        <p>TELÉFONO: {customer.phone}</p>
        <p>DNI: {customer.dni}</p>
      </div>

      {/* Items Section */}
      <div className="receipt-section receipt-body">
        <p className="section-title">DETALLE DE PRODUCTOS</p>
        <table>
          <thead>
            <tr>
              <th>PRODUCTO</th>
              <th>CANT.</th>
              <th>PRECIO</th>
              <th>SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <React.Fragment key={index}>
                <tr>
                  <td>{item.name?.toUpperCase() || 'N/A'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.price)}</td>
                  <td>{formatCurrency(item.quantity * item.price)}</td>
                </tr>
                <tr className="item-details-row">
                  <td colSpan={4}>
                    {item.description && <p className="item-detail">DESCRIPCIÓN: {item.description.toUpperCase()}</p>}
                    {item.brand && <p className="item-detail">MARCA: {item.brand.toUpperCase()}</p>}
                    {item.model && <p className="item-detail">MODELO: {item.model.toUpperCase()}</p>}
                    {item.imei1 && <p className="item-imei">IMEI 1: {item.imei1}</p>}
                    {item.imei2 && <p className="item-imei">IMEI 2: {item.imei2}</p>}
                    {item.serialNumber && <p className="item-imei">N/S: {item.serialNumber}</p>}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment and Footer Section */}
      <div className="receipt-section receipt-footer">
        <p className="total">TOTAL: {formatCurrency(total)}</p>
        <p className="section-title">MÉTODO DE PAGO</p>
        <table className="w-full text-xs">
          <tbody>
            {payments.map((payment, index) => {
              const methodName =
                typeof payment.method === 'string'
                  ? payment.method
                  : (payment.method as any)?.name;
              return (
                <tr key={index}>
                  <td className="py-1">{methodName ? methodName.toUpperCase() : 'N/A'}</td>
                  <td className="text-right py-1">{formatCurrency(payment.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="divider"></div>
        <p className="text-center text-xs">VÁLIDO SOLO PARA ENTREGA DE PRODUCTOS, PEDIR SU BOLETA Y/O FACTURA</p>
        {sale?.hasUnregisteredProduct && (
          <p className="text-center text-xs text-bold mt-1">NO OLVIDAR REGISTRAR EL EQUIPO EN SU OPERADOR MÓVIL</p>
        )}
        <p className="thank-you-message">¡GRACIAS POR SU COMPRA!</p>
      </div>

      <div className="receipt-actions mt-4 flex justify-center print:hidden">
        <button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          IMPRIMIR RECIBO
        </button>
      </div>
    </div>
  );
};

export default Receipt;
