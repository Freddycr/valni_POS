import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import InventoryScreen from './InventoryScreen';
import { getProducts, getLocations } from '../services/api';
import '@testing-library/jest-dom';

// Mocks
vi.mock('../services/api', () => ({
    getProducts: vi.fn(),
    getLocations: vi.fn()
}));

describe('InventoryScreen Component', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders loading state initially', () => {
        (getProducts as any).mockImplementation(() => new Promise(() => { })); // Never resolves
        (getLocations as any).mockResolvedValue([]);

        // It should smoke test mount without crashing
        render(<InventoryScreen />);

        // Asume que hay algún texto de carga o spin
        expect(screen.getByText(/Cargando inventario/i)).toBeInTheDocument();
    });

    it('renders correctly with empty data', async () => {
        (getProducts as any).mockResolvedValue([]);
        (getLocations as any).mockResolvedValue([]);

        render(<InventoryScreen />);

        // Just verify the basic title/search bars are present eventually
        const searchInputs = await screen.findAllByRole('textbox');
        expect(searchInputs.length).toBeGreaterThan(0);
    });
});
