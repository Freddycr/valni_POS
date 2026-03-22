-- Company-level receipt branding settings (header + logo)
-- Date: 2026-03-03

CREATE TABLE IF NOT EXISTS public.company_receipt_settings (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    header_text TEXT NOT NULL DEFAULT 'ENCABEZADO DEL RECIBO',
    logo_base64 TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.company_receipt_settings (company_id, header_text)
SELECT c.id, c.name
FROM public.companies c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.company_receipt_settings s
    WHERE s.company_id = c.id
);

CREATE OR REPLACE FUNCTION public.set_company_receipt_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_receipt_settings_updated_at
ON public.company_receipt_settings;

CREATE TRIGGER trg_company_receipt_settings_updated_at
BEFORE UPDATE ON public.company_receipt_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_company_receipt_settings_updated_at();
