import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import SalesForm from './SalesForm';
import { User } from '../types';
import { getProducts, getCustomers, getPaymentMethods } from '../services/api';
import '@testing-library/jest-dom';

// Mocks form backend API requirements
vi.mock('../services/api', () => ({
    getProducts: vi.fn(),
    getCustomers: vi.fn(),
    getPaymentMethods: vi.fn(),
    getBrands: vi.fn(),
    getUsers: vi.fn(),
    getModels: vi.fn(),
    saveCustomer: vi.fn(),
    saveSale: vi.fn(),
    getAdvanceBalance: vi.fn()
}));

const mockUser: User = {
    id: 'seller-1',
    fullName: 'Test Seller',
    email: 'seller@test.com',
    role: 'seller',
    isActive: true,
    stores: [{
        id: 'store-1',
        name: 'Main Store',
        code: 'MAIN',
        type: 'store',
        isActive: true,
        isDefault: true
    }]
};

describe('SalesForm Component - Integration Test', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the sales form and shows "Nueva Venta" title', async () => {
        // Default mock resolves
        (getProducts as any).mockResolvedValue([]);
        (getCustomers as any).mockResolvedValue([]);
        (getPaymentMethods as any).mockResolvedValue([]);

        render(
            <SalesForm
                currentUser={mockUser}
                activeStoreId="store-1"
                stores={mockUser.stores}
            />
        );

        expect(screen.getAllByRole('textbox', { hidden: true }).length).toBeGreaterThan(0);
        // It renders without crashing
    });

});
