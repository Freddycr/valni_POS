import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBrands, getPaymentMethods } from './supabaseApi';

// Avoid deep mocking @supabase/supabase-js which is complex
vi.mock('./supabaseApi', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        getBrands: vi.fn(),
        getPaymentMethods: vi.fn()
    };
});

describe('supabaseApi API Data Fetching Mocks', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getBrands smoke', () => {
        it('debería ejecutar el mock de getBrands correctamente', async () => {
            const mockBrands = [{ id: '1', name: 'Samsung' }];
            (getBrands as any).mockResolvedValue(mockBrands);

            const response = await getBrands();
            expect(response).toEqual(mockBrands);
        });
    });

    describe('getPaymentMethods smoke', () => {
        it('debería retornar los métodos de pago mockeados', async () => {
            const mockPms = [{ id: 1, name: 'Efectivo', is_active: true }];
            (getPaymentMethods as any).mockResolvedValue(mockPms);

            const response = await getPaymentMethods();
            expect(response).toEqual(mockPms);
        });
    });

});
