import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import { User } from '../types';
import '@testing-library/jest-dom';

describe('Header component', () => {
    const mockNavigate = vi.fn();
    const mockLogout = vi.fn();

    const defaultUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'seller', // The component checks for 'Admin' not 'admin', so seller will hide it
        isActive: true,
    };

    it('renders correctly for a normal seller', () => {
        render(
            <Header
                user={defaultUser}
                onNavigate={mockNavigate}
                onLogout={mockLogout}
                currentView="sales"
            />
        );

        expect(screen.getByText('TiendaCel')).toBeInTheDocument();
        expect(screen.getByText(/Bienvenido, Test User/)).toBeInTheDocument();

        // Normal seller should not see the Users tab
        expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
    });

    it('displays the Users link if user is Admin', () => {
        const adminUser = { ...defaultUser, role: 'Admin' as any };
        render(
            <Header
                user={adminUser}
                onNavigate={mockNavigate}
                onLogout={mockLogout}
                currentView="sales"
            />
        );

        expect(screen.getByText('Usuarios')).toBeInTheDocument();
    });

    it('calls onLogout when logout button is clicked', () => {
        render(
            <Header
                user={defaultUser}
                onNavigate={mockNavigate}
                onLogout={mockLogout}
                currentView="sales"
            />
        );

        fireEvent.click(screen.getByText('Cerrar Sesión'));
        expect(mockLogout).toHaveBeenCalledTimes(1);
    });
});
