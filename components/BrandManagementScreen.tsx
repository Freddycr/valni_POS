import React, { useState, useEffect } from 'react';
import { Brand } from '../types';
import { getBrands, saveBrand, deleteBrand } from '../services/api';

interface BrandManagementScreenProps {
  userRole?: string;
}

const BrandManagementScreen: React.FC<BrandManagementScreenProps> = ({ userRole }) => {
  const canEdit = userRole === 'admin' || userRole === 'store_admin' || userRole === 'inventory_manager';
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  const fetchBrands = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const brandsData = await getBrands();
      setBrands(brandsData);
    } catch (err) {
      setError("Error al cargar las marcas.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) {
      setError("El nombre de la marca no puede estar vacío.");
      return;
    }
    if (brands.some(b => b.name.toLowerCase() === newBrandName.toLowerCase())) {
      setError("Ya existe una marca con ese nombre.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await saveBrand({ name: newBrandName });
      setNewBrandName('');
      await fetchBrands();
    } catch (err) {
      setError("Error al agregar la marca.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand({ ...brand });
  };

  const handleSaveEdit = async () => {
    if (!editingBrand) return;
    if (!editingBrand.name.trim()) {
      setError("El nombre de la marca no puede estar vacío.");
      return;
    }
    if (brands.some(b => b.id !== editingBrand.id && b.name.toLowerCase() === editingBrand.name.toLowerCase())) {
      setError("Ya existe otra marca con ese nombre.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await saveBrand(editingBrand);
      setEditingBrand(null);
      await fetchBrands();
    } catch (err) {
      setError("Error al guardar la marca.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Está seguro de eliminar esta marca?")) return;
    setIsLoading(true);
    setError(null);
    try {
      await deleteBrand(id);
      await fetchBrands();
    } catch (err) {
      setError("Error al eliminar la marca.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingBrand(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Gestión de Marcas</h1>

      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded" role="alert"><p>{error}</p></div>}

      {canEdit && <div className="card">
        <h2 className="text-xl font-bold text-slate-800 mb-6">
          Agregar Nueva Marca
        </h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Nombre de la marca (ej: Samsung, Apple...)"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            className="input-style flex-grow"
          />
          <button onClick={handleAddBrand} className="btn btn-primary whitespace-nowrap" disabled={isLoading}>
            {isLoading ? 'Agregando...' : '+ AGREGAR MARCA'}
          </button>
        </div>
      </div>}

      <div className="card !p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Marcas Registradas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="th-style">ID</th>
                <th className="th-style">Nombre</th>
                {canEdit && <th className="th-style text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id} className="hover:bg-slate-50 transition-colors">
                  <td className="td-style text-xs font-mono text-slate-500">{brand.id.substring(0, 8)}...</td>
                  <td className="td-style">
                    {canEdit && editingBrand && editingBrand.id === brand.id ? (
                      <input
                        type="text"
                        value={editingBrand.name}
                        onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                        className="input-style !py-1"
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold text-slate-900">{brand.name}</span>
                    )}
                  </td>
                  {canEdit && <td className="td-style text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingBrand && editingBrand.id === brand.id ? (
                        <>
                          <button onClick={handleSaveEdit} className="text-[#11d483] hover:underline text-xs font-bold uppercase" disabled={isLoading}>
                            {isLoading ? '...' : 'Guardar'}
                          </button>
                          <button onClick={handleCancelEdit} className="text-slate-600 hover:underline text-xs font-bold uppercase">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(brand)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(brand.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>}
                </tr>
              ))}
              {brands.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-slate-500">
                    No se encontraron marcas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BrandManagementScreen;
