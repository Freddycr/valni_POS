-- Add separate registration status for products
-- Date: 2026-03-31
-- Purpose: Keep products.status for availability (available/sold/...) and store "Registrado/No registrado" separately.

DO $$
BEGIN
  -- Add column if missing
  ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS registration_status TEXT;

  -- If legacy data mis-used products.status for registration, migrate it.
  UPDATE public.products
  SET registration_status = status
  WHERE registration_status IS NULL
    AND status IN ('No registrado', 'Registrado', 'Homologado');

  -- Normalize nulls to default
  UPDATE public.products
  SET registration_status = 'No registrado'
  WHERE registration_status IS NULL;

  -- Guardrail constraint (safe to add; ignore if already exists)
  BEGIN
    ALTER TABLE public.products
      ADD CONSTRAINT products_registration_status_check
      CHECK (registration_status IN ('No registrado', 'Registrado', 'Homologado'));
  EXCEPTION WHEN duplicate_object THEN
    -- ignore
  END;

  -- Default and not-null
  ALTER TABLE public.products
    ALTER COLUMN registration_status SET DEFAULT 'No registrado';

  ALTER TABLE public.products
    ALTER COLUMN registration_status SET NOT NULL;
END $$;
