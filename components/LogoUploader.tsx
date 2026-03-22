import React, { useState, useRef } from 'react';

interface LogoUploaderProps {
  currentLogoUrl: string | null;
  onLogoUpdate: (logoBase64: string | null) => void;
  isUploading?: boolean;
}

const LogoUploader: React.FC<LogoUploaderProps> = ({ 
  currentLogoUrl, 
  onLogoUpdate,
  isUploading = false
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.match('image/jpeg') && !file.type.match('image/jpg') && !file.type.match('image/png')) {
      setError('Por favor selecciona un archivo JPG, JPEG o PNG.');
      return;
    }

    // Validar tamaño (máximo 500KB para mantener bajo el tamaño en base64)
    if (file.size > 500 * 1024) {
      setError('La imagen es demasiado grande. El tamaño máximo es 500KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      setPreviewUrl(base64String);
      onLogoUpdate(base64String);
    };
    
    reader.onerror = () => {
      setError('Error al leer el archivo. Por favor inténtalo de nuevo.');
    };
    
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setPreviewUrl(null);
    onLogoUpdate(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Logo de la Empresa
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Formatos aceptados: JPG, JPEG, PNG. Tamaño máximo: 500KB.
          </p>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png"
            className="hidden"
          />
          
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={isUploading}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isUploading ? 'Subiendo...' : 'Seleccionar Imagen'}
            </button>
            
            {previewUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={isUploading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Eliminar Logo
              </button>
            )}
          </div>
        </div>
        
        {previewUrl && (
          <div className="flex-shrink-0">
            <img 
              src={previewUrl} 
              alt="Vista previa del logo" 
              className="h-16 w-16 object-contain border rounded"
            />
          </div>
        )}
      </div>
      
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
      
      <div className="text-xs text-gray-500 mt-2">
        <p><strong>Nota:</strong> El logo se almacenará en tu hoja de Google Sheets. Por razones de rendimiento, se recomienda usar imágenes pequeñas y comprimidas.</p>
      </div>
    </div>
  );
};

export default LogoUploader;