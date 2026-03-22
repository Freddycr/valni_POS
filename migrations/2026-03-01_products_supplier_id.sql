-- Proveedor único por producto (regla de negocio local).
-- Cada registro en products referencia un único proveedor.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

CREATE INDEX IF NOT EXISTS idx_products_supplier_id
ON public.products(supplier_id);
