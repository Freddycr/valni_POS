import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDate } from '../utils/formatting';
import { getReceiptHeader } from '../services/api';

interface InstallmentReceiptProps {
    customerName: string;
    saleNumber: string;
    installmentNumber: number;
    amountPaid: number;
    installmentBalance: number;
    totalBalanceBefore: number;
    totalBalanceAfter: number;
    paymentMethod: string;
    date: string;
    onPrint?: () => void;
}

const InstallmentReceipt: React.FC<InstallmentReceiptProps> = ({
    customerName,
    saleNumber,
    installmentNumber,
    amountPaid,
    installmentBalance,
    totalBalanceBefore,
    totalBalanceAfter,
    paymentMethod,
    date,
    onPrint
}) => {
    const [headerInfo, setHeaderInfo] = useState<{ headerText: string; logoBase64: string | null }>({
        headerText: 'CARGANDO...',
        logoBase64: null
    });
    const receiptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchHeader = async () => {
            try {
                const headerData = await getReceiptHeader();
                setHeaderInfo(headerData);
            } catch (error) {
                console.error("Error fetching receipt header:", error);
                setHeaderInfo({
                    headerText: 'VALNI PERU - Supabase ERP',
                    logoBase64: null
                });
            }
        };

        fetchHeader();
    }, []);

    const handlePrint = () => {
        const receiptElement = receiptRef.current;
        if (!receiptElement) return;

        const printWindow = window.open('', '_blank', 'width=80mm');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Recibo de Cobranza</title>
                    <style>
                        @media print {
                            @page { size: 80mm auto; margin: 0; }
                            body { margin: 0; padding: 0; width: 80mm; }
                        }
                        .receipt {
                            font-family: 'Courier New', Courier, monospace;
                            width: 80mm;
                            padding: 10px;
                            font-size: 12px;
                            line-height: 1.4;
                            color: #000;
                        }
                        .text-center { text-align: center; }
                        .text-right { text-align: right; }
                        .text-bold { font-weight: bold; }
                        .divider { border-top: 1px dashed #000; margin: 10px 0; }
                        .section-title { text-align: center; font-weight: bold; margin: 10px 0; text-transform: uppercase; }
                        .mb-2 { margin-bottom: 8px; }
                        .mt-2 { margin-top: 8px; }
                        .table { width: 100%; }
                    </style>
                </head>
                <body>
                    ${receiptElement.innerHTML}
                    <script>
                        window.onload = function() {
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Auto-trigger if onPrint is provided
    useEffect(() => {
        if (onPrint) {
            handlePrint();
            onPrint();
        }
    }, [onPrint]);

    return (
        <div className="receipt hidden" ref={receiptRef}>
            <div className="receipt" style={{ width: '80mm', fontFamily: 'Courier New', padding: '10px' }}>
                <div className="text-center mb-2">
                    <div style={{ fontSize: '16px', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>{headerInfo.headerText}</div>
                    <div className="divider"></div>
                    <div className="section-title">RECIBO DE COBRANZA</div>
                    <div>CUOTA #{installmentNumber}</div>
                </div>

                <div className="mb-2">
                    <div>FECHA: {formatDate(date)}</div>
                    <div>VENTA: {saleNumber}</div>
                    <div>CLIENTE: {customerName.toUpperCase()}</div>
                </div>

                <div className="divider"></div>

                <table className="table">
                    <tbody>
                        <tr>
                            <td className="text-bold">MONTO PAGADO:</td>
                            <td className="text-right text-bold">{formatCurrency(amountPaid)}</td>
                        </tr>
                        <tr>
                            <td>MEDIO DE PAGO:</td>
                            <td className="text-right">{paymentMethod.toUpperCase()}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="divider"></div>

                <table className="table">
                    <tbody>
                        <tr>
                            <td>SALDO DE CUOTA:</td>
                            <td className="text-right">{formatCurrency(installmentBalance)}</td>
                        </tr>
                        <tr className="text-bold">
                            <td>SALDO TOTAL PENDIENTE:</td>
                            <td className="text-right">{formatCurrency(totalBalanceAfter)}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="divider"></div>

                <div className="text-center mt-2" style={{ fontSize: '10px' }}>
                    <p>¡GRACIAS POR SU PAGO!</p>
                    <p>Conserve este comprobante para su control personal.</p>
                </div>
            </div>
        </div>
    );
};

export default InstallmentReceipt;
