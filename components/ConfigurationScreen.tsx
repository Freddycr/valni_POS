import React, { useState, useEffect } from 'react';
import { getReceiptHeader, saveReceiptHeader } from '../services/api';
import LogoUploader from './LogoUploader';
import './Receipt.css';

const ConfigurationScreen: React.FC = () => {
  const [headerText, setHeaderText] = useState('ENCABEZADO DEL RECIBO');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [initialHeaderText, setInitialHeaderText] = useState('ENCABEZADO DEL RECIBO');
  const [initialLogoBase64, setInitialLogoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getReceiptHeader()
      .then(data => {
        // Handle both string (old format) and object (new format) responses
        if (typeof data === 'string') {
          setHeaderText(data);
          setInitialHeaderText(data);
          setLogoBase64(null);
          setInitialLogoBase64(null);
        } else {
          setHeaderText(data.headerText || 'ENCABEZADO DEL RECIBO');
          setInitialHeaderText(data.headerText || 'ENCABEZADO DEL RECIBO');
          setLogoBase64(data.logoBase64 || null);
          setInitialLogoBase64(data.logoBase64 || null);
        }
      })
      .catch(error => {
        console.error("Error loading receipt header:", error);
        setError("Error al cargar la configuración del encabezado.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveReceiptHeader(headerText, logoBase64);
      setInitialHeaderText(headerText);
      setInitialLogoBase64(logoBase64);
      alert('Configuración guardada con éxito!');
    } catch (error) {
      console.error("Error saving receipt header:", error);
      setError("Error al guardar la configuración. Por favor, inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpdate = (logoData: string | null) => {
    setLogoBase64(logoData);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Configuración</h1>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Encabezado de Recibos</h2>
        
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label htmlFor="headerText" className="block text-sm font-medium text-gray-700 mb-1">
                Texto del Encabezado
              </label>
              <textarea
                id="headerText"
                rows={4}
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                placeholder="Ingresa el texto que aparecerá en el encabezado de los recibos"
              />
            </div>
            
            <LogoUploader 
              currentLogoUrl={logoBase64}
              onLogoUpdate={handleLogoUpdate}
              isUploading={saving}
            />
            
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => {
                  setHeaderText(initialHeaderText);
                  setLogoBase64(initialLogoBase64);
                  setError(null);
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancelar
              </button>
              
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (headerText === initialHeaderText && logoBase64 === initialLogoBase64)}
                className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Guardando...
                  </>
                ) : (
                  'Guardar Configuración'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Vista Previa</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="receipt-container max-w-md mx-auto">
            <div className="receipt-header text-center mb-4">
              {logoBase64 && (
                <div className="mb-2 flex justify-center">
                  <img 
                    src={logoBase64} 
                    alt="Logo" 
                    className="h-16 object-contain"
                  />
                </div>
              )}
              <h2 className="text-lg font-bold">{headerText}</h2>
            </div>
            <div className="receipt-body">
              <p className="text-sm text-gray-600 text-center">Este es un ejemplo de cómo se verá el encabezado en los recibos.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationScreen;
