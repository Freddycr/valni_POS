
import React from 'react';

const ConfigErrorScreen: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-red-50">
      <div className="w-full max-w-3xl p-8 space-y-6 bg-white rounded-lg shadow-xl border-t-8 border-red-600">
        <h1 className="text-3xl font-bold text-red-700">Error de Configuración</h1>
        <p className="text-lg text-slate-700">
          La aplicación no se puede iniciar porque las credenciales de Google no se han configurado correctamente.
          Revisa que los valores en el archivo <code>config.ts</code> sean correctos y no los de ejemplo.
        </p>
        <div className="bg-slate-100 p-4 rounded-md">
          <h2 className="text-xl font-semibold text-slate-800">Acción Requerida</h2>
          <p className="mt-2 text-slate-600">
            Por favor, abre el archivo <code className="bg-slate-200 text-red-600 font-mono p-1 rounded">config.ts</code> en tu editor de código y reemplaza los valores de ejemplo con tus credenciales reales de Google Cloud.
          </p>
        </div>
        
        <div className="space-y-4 text-sm text-slate-600">
            <h3 className="text-lg font-semibold text-slate-800">Instrucciones:</h3>
            <ol className="list-decimal list-inside space-y-2">
                <li>Ve a la consola de Google Cloud: <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.cloud.google.com</a></li>
                <li>Crea un nuevo proyecto o selecciona uno existente.</li>
                <li>Ve a "APIs y servicios" &gt; "Credenciales".</li>
                <li>Crea una <strong>Clave de API</strong> y pégala en <code className="font-mono bg-gray-200 p-1 rounded">GOOGLE_API_KEY</code>. <strong>Importante:</strong> Restringe la clave para que solo se use desde el dominio de tu aplicación.</li>
                <li>Crea un <strong>ID de cliente de OAuth 2.0</strong>:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                        <li>Selecciona "Aplicación web".</li>
                        <li>En "Orígenes de JavaScript autorizados", haz clic en "+ AÑADIR URI" y pega la URL donde se alojará tu app.</li>
                        <li>En "URIs de redireccionamiento autorizados", haz clic en "+ AÑADIR URI" y pega <strong>de nuevo</strong> la URL donde se alojará tu app. <strong>Ambas secciones deben contener la URL.</strong></li>
                        <li>Pega el "ID de cliente" generado en <code className="font-mono bg-gray-200 p-1 rounded">GOOGLE_CLIENT_ID</code>.</li>
                    </ul>
                </li>
                <li>Ve a "APIs y servicios" &gt; "Biblioteca" y habilita la <strong>API de Google Sheets</strong>.</li>
                <li>Abre tu Hoja de Cálculo de Google, haz clic en "Compartir" y asegúrate de que cualquier usuario que inicie sesión en la app tenga permisos de "Editor".</li>
                <li>Revisa el archivo <code className="font-mono bg-gray-200 p-1 rounded">config.ts</code> y asegúrate de que el <code className="font-mono bg-gray-200 p-1 rounded">SPREADSHEET_ID</code> sea correcto.</li>
            </ol>
             <p className="mt-4 pt-4 border-t border-slate-200 font-semibold text-slate-800">
                Después de guardar los cambios en <code className="font-mono bg-gray-200 p-1 rounded">config.ts</code>, por favor recarga esta página.
            </p>
        </div>
      </div>
    </div>
  );
};

export default ConfigErrorScreen;
