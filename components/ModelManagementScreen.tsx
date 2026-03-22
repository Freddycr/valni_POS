import React, { useState, useEffect } from 'react';
import { Model, Brand } from '../types';
import { getModels, saveModel, deleteModel, getBrands } from '../services/api';

interface ModelManagementScreenProps {
  userRole?: string;
}

const ModelManagementScreen: React.FC<ModelManagementScreenProps> = ({ userRole }) => {
  const canEdit = userRole === 'admin' || userRole === 'store_admin' || userRole === 'inventory_manager';
  const [models, setModels] = useState<Model[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelBrandId, setNewModelBrandId] = useState<string>('');
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  const fetchModelsAndBrands = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const modelsData = await getModels();
      setModels(modelsData);
      const brandsData = await getBrands();
      setBrands(brandsData);
    } catch (err) {
      setError("Error al cargar modelos o marcas.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModelsAndBrands();
  }, []);

  const handleAddModel = async () => {
    if (!newModelName.trim() || !newModelBrandId) {
      setError("El nombre del modelo y la marca no pueden estar vacíos.");
      return;
    }
    if (models.some(m => m.name.toLowerCase() === newModelName.toLowerCase() && m.brandId === newModelBrandId)) {
      setError("Ya existe un modelo con ese nombre para la marca seleccionada.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await saveModel({ name: newModelName, brandId: newModelBrandId });
      setNewModelName('');
      setNewModelBrandId('');
      await fetchModelsAndBrands();
    } catch (err) {
      setError("Error al agregar el modelo.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (model: Model) => {
    setEditingModel({ ...model });
  };

  const handleSaveEdit = async () => {
    if (!editingModel) return;
    if (!editingModel.name.trim() || !editingModel.brandId) {
      setError("El nombre del modelo y la marca no pueden estar vacíos.");
      return;
    }
    if (models.some(m => m.id !== editingModel.id && m.name.toLowerCase() === editingModel.name.toLowerCase() && m.brandId === editingModel.brandId)) {
      setError("Ya existe otro modelo con ese nombre para la marca seleccionada.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await saveModel(editingModel);
      setEditingModel(null);
      await fetchModelsAndBrands();
    } catch (err) {
      setError("Error al guardar el modelo.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Está seguro de eliminar este modelo?")) return;
    setIsLoading(true);
    setError(null);
    try {
      await deleteModel(id);
      await fetchModelsAndBrands();
    } catch (err) {
      setError("Error al eliminar el modelo.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
  };

  const getBrandName = (brandId: string) => {
    const brand = brands.find(b => b.id === brandId);
    return brand ? brand.name : 'Desconocida';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Gestión de Modelos</h1>

      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded" role="alert"><p>{error}</p></div>}

      {canEdit && <div className="card">
        <h2 className="text-xl font-bold text-slate-800 mb-6">
          Agregar Nuevo Modelo
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Nombre del modelo (ej: iPhone 13, S21...)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            className="input-style"
          />
          <select
            value={newModelBrandId}
            onChange={(e) => setNewModelBrandId(e.target.value)}
            className="input-style"
          >
            <option value="">Seleccione una marca</option>
            {brands.map(brand => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </select>
          <button onClick={handleAddModel} className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Agregando...' : '+ AGREGAR MODELO'}
          </button>
        </div>
      </div>}

      <div className="card !p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">Modelos Registrados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="th-style">ID</th>
                <th className="th-style">Marca</th>
                <th className="th-style">Nombre</th>
                {canEdit && <th className="th-style text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="hover:bg-slate-50 transition-colors">
                  <td className="td-style text-xs font-mono text-slate-500">{model.id.substring(0, 8)}...</td>
                  <td className="td-style">
                    {canEdit && editingModel && editingModel.id === model.id ? (
                      <select
                        value={editingModel.brandId}
                        onChange={(e) => setEditingModel({ ...editingModel, brandId: e.target.value })}
                        className="input-style !py-1"
                      >
                        {brands.map(brand => (
                          <option key={brand.id} value={brand.id}>{brand.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold uppercase border border-blue-200">
                        {getBrandName(model.brandId)}
                      </span>
                    )}
                  </td>
                  <td className="td-style">
                    {canEdit && editingModel && editingModel.id === model.id ? (
                      <input
                        type="text"
                        value={editingModel.name}
                        onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                        className="input-style !py-1"
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold text-slate-900">{model.name}</span>
                    )}
                  </td>
                  {canEdit && <td className="td-style text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingModel && editingModel.id === model.id ? (
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
                          <button onClick={() => handleEdit(model)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(model.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-colors">
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
              {models.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    No se encontraron modelos registrados.
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

export default ModelManagementScreen;
