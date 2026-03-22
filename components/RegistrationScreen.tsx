
import React, { useState } from 'react';

interface RegistrationScreenProps {
  onRegisterClick: (fullName: string, email: string, password: string) => void;
  onBackToLoginClick: () => void;
  error: string | null;
  isLoading: boolean;
}

const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ onRegisterClick, onBackToLoginClick, error, isLoading }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegisterClick(fullName, email, password);
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-xl text-center">
        <h1 className="text-3xl font-bold text-gray-900">Crear una cuenta</h1>
        <p className="mt-2 text-sm text-gray-600">Completa el formulario para registrarte</p>
        
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 text-left">
              Nombre Completo
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 text-left">
              Correo Electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 text-left">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-3 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Registrando...' : 'Registrarse'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mt-6 text-left" role="alert">
            <p className="font-bold">Error de Registro</p>
            <p>{error}</p>
          </div>
        )}

        <div className="mt-4 text-sm">
          <button onClick={onBackToLoginClick} className="font-medium text-blue-600 hover:text-blue-500">
            Volver a Iniciar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistrationScreen;
