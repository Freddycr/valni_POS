
import React, { useState, useEffect } from 'react';
import { User, Role, Store } from '../types';
import { getUsers, saveUser, updateUser, getStores, assignUserDefaultStore } from '../services/api';

const UserManagementScreen: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPasswordResetModalOpen, setIsPasswordResetModalOpen] = useState(false);
    const [isStoreAssignModalOpen, setIsStoreAssignModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({ fullName: '', email: '', role: 'seller' as Role, password: '', storeId: '' });
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedStoreUser, setSelectedStoreUser] = useState<User | null>(null);
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchUsers();
        fetchStores();
    }, []);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const fetchedUsers = await getUsers();
            setUsers(fetchedUsers);
        } catch (err) {
            setError("No se pudieron cargar los usuarios.");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStores = async () => {
        try {
            const fetchedStores = await getStores();
            setStores(fetchedStores.filter(store => store.type === 'store'));
        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewUser(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name === 'newPassword') {
            setNewPassword(value);
        } else if (name === 'confirmPassword') {
            setConfirmPassword(value);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!newUser.fullName || !newUser.email || !newUser.password) {
            setError('Todos los campos son requeridos.');
            setIsLoading(false);
            return;
        }

        if (newUser.password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            setIsLoading(false);
            return;
        }

        try {
            await saveUser(newUser);
            setIsModalOpen(false);
            setNewUser({ fullName: '', email: '', role: 'seller', password: '', storeId: '' });
            await fetchUsers();
        } catch (err: any) {
            setError(err?.message || "No se pudo guardar el usuario. Inténtelo de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!newPassword || !confirmPassword) {
            setError('Ambas contraseñas son requeridas.');
            setIsLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            setIsLoading(false);
            return;
        }

        if (newPassword.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            setIsLoading(false);
            return;
        }

        if (!selectedUser) {
            setError('No se ha seleccionado un usuario.');
            setIsLoading(false);
            return;
        }

        try {
            // Create updated user object with new password
            const updatedUser = {
                ...selectedUser,
                password: newPassword
            };

            await updateUser(updatedUser);
            setIsPasswordResetModalOpen(false);
            setNewPassword('');
            setConfirmPassword('');
            setSelectedUser(null);
            await fetchUsers();
        } catch (err: any) {
            setError(err?.message || "No se pudo restablecer la contraseña. Inténtelo de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    const openPasswordResetModal = (user: User) => {
        setSelectedUser(user);
        setIsPasswordResetModalOpen(true);
    };

    const closePasswordResetModal = () => {
        setIsPasswordResetModalOpen(false);
        setSelectedUser(null);
        setNewPassword('');
        setConfirmPassword('');
        setError('');
    };

    const openStoreAssignModal = (user: User) => {
        setSelectedStoreUser(user);
        setSelectedStoreId(user.activeStoreId || user.stores?.[0]?.id || stores[0]?.id || '');
        setError('');
        setIsStoreAssignModalOpen(true);
    };

    const closeStoreAssignModal = () => {
        setIsStoreAssignModalOpen(false);
        setSelectedStoreUser(null);
        setSelectedStoreId('');
    };

    const handleStoreAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedStoreUser?.id) {
            setError('No se ha seleccionado un usuario.');
            return;
        }
        if (!selectedStoreId) {
            setError('Seleccione una tienda.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            await assignUserDefaultStore(selectedStoreUser.id, selectedStoreId);
            closeStoreAssignModal();
            await fetchUsers();
        } catch (err: any) {
            setError(err?.message || 'No se pudo reasignar la tienda.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Agregar Usuario
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tienda Asignada</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.fullName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                            ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                user.role === 'agent' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-green-100 text-green-800'}`}>
                                            {user.role === 'admin' ? 'Administrador' :
                                                user.role === 'agent' ? 'Agente' :
                                                    'Vendedor'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {user.stores?.find(store => store.id === user.activeStoreId)?.name || user.stores?.[0]?.name || 'Sin asignar'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                            Activo
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <button
                                            onClick={() => openPasswordResetModal(user)}
                                            className="text-blue-600 hover:text-blue-900 mr-3"
                                        >
                                            Restablecer Contraseña
                                        </button>
                                        <button
                                            onClick={() => openStoreAssignModal(user)}
                                            className="text-indigo-600 hover:text-indigo-900"
                                        >
                                            Reasignar Tienda
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal para agregar usuario */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Agregar Nuevo Usuario</h2>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="px-6 py-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={newUser.fullName}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Nombre completo"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={newUser.email}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="correo@ejemplo.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                    <select
                                        name="role"
                                        value={newUser.role}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value as Role }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="seller">Vendedor</option>
                                        <option value="admin">Administrador</option>
                                        <option value="agent">Agente</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tienda Asignada</label>
                                    <select
                                        name="storeId"
                                        value={newUser.storeId}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Tienda activa del sistema</option>
                                        {stores.map(store => (
                                            <option key={store.id} value={store.id}>{store.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={newUser.password}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Contraseña"
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        setNewUser({ fullName: '', email: '', role: 'seller', password: '', storeId: '' });
                                        setError('');
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                                >
                                    {isLoading ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para restablecer contraseña */}
            {isPasswordResetModalOpen && selectedUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Restablecer Contraseña</h2>
                            <p className="text-sm text-gray-600 mt-1">Usuario: {selectedUser.fullName} ({selectedUser.email})</p>
                        </div>
                        <form onSubmit={handlePasswordResetSubmit}>
                            <div className="px-6 py-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={newPassword}
                                        onChange={handlePasswordChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Nueva contraseña"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={confirmPassword}
                                        onChange={handlePasswordChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Confirmar contraseña"
                                    />
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={closePasswordResetModal}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                                >
                                    {isLoading ? 'Guardando...' : 'Restablecer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isStoreAssignModalOpen && selectedStoreUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b">
                            <h2 className="text-xl font-semibold text-gray-800">Reasignar Tienda</h2>
                            <p className="text-sm text-gray-600 mt-1">Usuario: {selectedStoreUser.fullName}</p>
                        </div>
                        <form onSubmit={handleStoreAssignSubmit}>
                            <div className="px-6 py-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Tienda</label>
                                    <select
                                        value={selectedStoreId}
                                        onChange={(e) => setSelectedStoreId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Seleccione una tienda</option>
                                        {stores.map(store => (
                                            <option key={store.id} value={store.id}>{store.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={closeStoreAssignModal}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
                                >
                                    {isLoading ? 'Guardando...' : 'Guardar Tienda'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagementScreen;
