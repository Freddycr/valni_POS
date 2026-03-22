import { formatCurrency, formatDate } from './formatting';
import { getReceiptHeader } from '../services/functionsApi';

interface SaleForReceipt {
  id: string;
  customer: {
    fullName: string;
    address: string;
    phone: string;
    dni: string;
    id: number;
  };
  items: Array<{
    tempId: number;
    productId: string;
    name: string;
    description?: string;
    brand: string;
    model: string;
    quantity: number;
    price: number;
    stock: number;
    imei1?: string;
    imei2?: string;
    serialNumber?: string;
    hasError: boolean;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  total: number;
  seller: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  sale: {
    id: string;
    date: string;
    sellerId: number;
    customerId: number;
    total: number;
  };
}

export const printReceipt = async (saleData: SaleForReceipt) => {
  if (!saleData) {
    console.error("No saleData available for printing");
    alert('Error: No hay datos de venta disponibles para imprimir.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Error: No se pudo abrir la ventana de impresión. Verifique que su navegador no esté bloqueando las ventanas emergentes.');
    return;
  }

  let headerInfo = { headerText: 'ENCABEZADO DEL RECIBO', logoBase64: null };
  try {
    headerInfo = await getReceiptHeader();
  } catch (error) {
    console.error("Error fetching receipt header:", error);
  }

  const receiptHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Recibo de Venta #${saleData.id}</title>
      <style>
        body { 
          font-family: 'monospace', sans-serif; 
          margin: 0; 
          padding: 20px; 
          background-color: #fff;
          color: #000;
        }
        .receipt-container { 
          max-width: 300px; 
          margin: 0 auto;
          padding: 10px;
          border: 1px solid #ddd;
        }
        .receipt-header {
          text-align: center;
          margin-bottom: 15px;
        }
        .receipt-header img {
          max-height: 60px;
          margin-bottom: 10px;
        }
        .receipt-header h2 {
          font-size: 16px;
          margin: 5px 0;
          text-transform: uppercase;
        }
        .receipt-header .order-number {
          font-size: 12px;
          font-weight: bold;
          margin-top: 6px;
          text-align: center;
          text-transform: uppercase;
        }
        .receipt-section {
          margin-bottom: 15px;
        }
        .section-title {
          font-weight: bold;
          text-align: center;
          margin-bottom: 8px;
          text-transform: uppercase;
          font-size: 14px;
        }
        .divider {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 3px;
          font-size: 12px;
        }
        .info-item {
          margin: 2px 0;
        }
        .info-label {
          font-weight: bold;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin: 10px 0;
        }
        th, td {
          border-bottom: 1px dashed #000;
          padding: 4px 2px;
          text-align: left;
        }
        th:nth-child(2), td:nth-child(2) { text-align: center; }
        th:nth-child(3), td:nth-child(3), 
        th:nth-child(4), td:nth-child(4) { text-align: right; }
        .total-row {
          font-weight: bold;
          border-top: 1px dashed #000;
        }
        .item-details {
          font-size: 10px;
          margin: 2px 0;
          text-transform: uppercase;
        }
        .item-details-large {
          font-size: 11px;
          font-weight: bold;
          margin: 2px 0;
          text-transform: uppercase;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          font-size: 11px;
        }
        .footer-warning {
          text-align: center;
          margin-top: 10px;
          font-size: 10px;
          font-style: italic;
        }
        @media print {
          body {
            padding: 0;
            margin: 0;
          }
          .receipt-container {
            border: none;
            padding: 10px;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <div class="receipt-header">
          ${headerInfo.logoBase64 ? `<img src="${headerInfo.logoBase64}" alt="Logo" />` : ''}
          <h2>${headerInfo.headerText.toUpperCase()}</h2>
          <p class="order-number">VENTA #${saleData.id.toUpperCase()}</p>
        </div>
        
        <div class="receipt-section">
          <div class="info-grid">
            <div class="info-item"><span class="info-label">FECHA:</span> ${formatDate(saleData.sale.date).toUpperCase()}</div>
            <div class="info-item"><span class="info-label">VENDEDOR:</span> ${(saleData.seller?.fullName || 'N/A').toUpperCase()}</div>
            <div class="info-item"><span class="info-label">CLIENTE:</span> ${(saleData.customer?.fullName || 'N/A').toUpperCase()}</div>
            <div class="info-item"><span class="info-label">DNI:</span> ${(saleData.customer?.dni || 'N/A').toUpperCase()}</div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="receipt-section">
          <div class="section-title">PRODUCTOS</div>
          <table>
            <thead>
              <tr>
                <th>PRODUCTO</th>
                <th>CANT.</th>
                <th>P.U.</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${saleData.items?.map((item: any) => `
                <tr>
                  <td>${(item.name || '').toUpperCase()}</td>
                  <td>${item.quantity}</td>
                  <td>${formatCurrency(item.price)}</td>
                  <td>${formatCurrency(item.price * item.quantity)}</td>
                </tr>
                ${(item.description || item.brand || item.model || item.imei1 || item.imei2 || item.serialNumber) ? `
                  <tr>
                    <td colspan="4">
                      ${item.description ? `<div class="item-details-large">${item.description.toUpperCase()}</div>` : ''}
                      
                      ${item.imei1 ? `<div class="item-details">IMEI1: ${item.imei1.toUpperCase()}</div>` : ''}
                      ${item.imei2 ? `<div class="item-details">IMEI2: ${item.imei2.toUpperCase()}</div>` : ''}
                      ${item.serialNumber ? `<div class="item-details">SN: ${item.serialNumber.toUpperCase()}</div>` : ''}
                    </td>
                  </tr>
                ` : ''}
              `).join('') || ''}
            </tbody>
          </table>
        </div>
        
        <div class="receipt-section">
          <div class="section-title">PAGOS</div>
          <table>
            <thead>
              <tr>
                <th>MÉTODO</th>
                <th></th>
                <th></th>
                <th>MONTO</th>
              </tr>
            </thead>
            <tbody>
              ${saleData.payments?.map((payment: any) => `
                <tr>
                  <td>${(payment.method || '').toUpperCase()}</td>
                  <td></td>
                  <td></td>
                  <td>${formatCurrency(payment.amount)}</td>
                </tr>
              `).join('') || ''}
              <tr class="total-row">
                <td><strong>TOTAL</strong></td>
                <td></td>
                <td></td>
                <td><strong>${formatCurrency(saleData.total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>GRACIAS POR SU COMPRA</p>
          <p>***</p>
        </div>
        
        <div class="footer-warning">
          <p>NO OLVIDE REGISTRAR SU EQUIPO EN SU OPERADORA Y EVITAR BLOQUEOS</p>
        </div>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(receiptHtml);
  printWindow.document.close();
  printWindow.focus();
};
