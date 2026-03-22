-- Preserve custom payment method labels for reporting (e.g. BBVA, Interbank)
-- Date: 2026-02-28

DO $$
BEGIN
    IF to_regclass('public.sale_payments') IS NULL THEN
        RAISE NOTICE 'sale_payments table not found, skipping migration';
        RETURN;
    END IF;

    ALTER TABLE public.sale_payments
        ADD COLUMN IF NOT EXISTS payment_method_label TEXT;
END $$;

UPDATE public.sale_payments
SET payment_method_label = CASE lower(payment_method::text)
    WHEN 'cash' THEN 'Efectivo'
    WHEN 'credit_card' THEN 'Tarjeta de Crédito'
    WHEN 'debit_card' THEN 'Tarjeta de Débito'
    WHEN 'bank_transfer' THEN 'Transferencia Bancaria'
    WHEN 'yape' THEN 'Yape'
    WHEN 'plin' THEN 'Plin'
    WHEN 'credit_installment' THEN 'Crédito'
    ELSE payment_method::text
END
WHERE payment_method_label IS NULL
   OR btrim(payment_method_label) = '';

CREATE INDEX IF NOT EXISTS idx_sale_payments_method_label
    ON public.sale_payments (payment_method_label);
