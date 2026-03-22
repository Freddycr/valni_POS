-- 1) Align profile roles with frontend expectations.
DO $$
DECLARE
    role_value TEXT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'user_role'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        FOREACH role_value IN ARRAY ARRAY[
            'admin',
            'supervisor',
            'seller',
            'inventory_manager',
            'store_admin',
            'cashier',
            'warehouse',
            'auditor',
            'agent'
        ]
        LOOP
            EXECUTE format(
                'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS %L',
                role_value
            );
        END LOOP;
    END IF;
END $$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'active'
    ) THEN
        UPDATE public.profiles
        SET is_active = COALESCE(is_active, active)
        WHERE is_active IS DISTINCT FROM COALESCE(is_active, active);
    END IF;
END $$;

UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.profiles
    ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.profiles
    ALTER COLUMN is_active SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'companies'
    ) THEN
        ALTER TABLE public.profiles
            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
    END IF;
END $$;

DO $$
DECLARE
    role_udt TEXT;
    constraint_row RECORD;
BEGIN
    SELECT c.udt_name
    INTO role_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profiles'
      AND c.column_name = 'role'
    LIMIT 1;

    -- If role is not enum user_role, enforce allowed values with a CHECK constraint.
    IF role_udt IS NOT NULL AND role_udt <> 'user_role' THEN
        UPDATE public.profiles
        SET role = 'seller'
        WHERE role IS NULL
           OR role NOT IN (
                'admin',
                'supervisor',
                'seller',
                'inventory_manager',
                'store_admin',
                'cashier',
                'warehouse',
                'auditor',
                'agent'
           );

        FOR constraint_row IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'public.profiles'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%'
        LOOP
            EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', constraint_row.conname);
        END LOOP;

        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check
            CHECK (
                role IN (
                    'admin',
                    'supervisor',
                    'seller',
                    'inventory_manager',
                    'store_admin',
                    'cashier',
                    'warehouse',
                    'auditor',
                    'agent'
                )
            );
    END IF;
END $$;

-- 2) Persistent payment methods catalog.
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_name_lower_uidx
    ON public.payment_methods ((lower(name)));

CREATE OR REPLACE FUNCTION public.set_payment_methods_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.set_payment_methods_updated_at();

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_read_authenticated ON public.payment_methods;
CREATE POLICY payment_methods_read_authenticated
ON public.payment_methods
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS payment_methods_write_admin ON public.payment_methods;
CREATE POLICY payment_methods_write_admin
ON public.payment_methods
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('admin', 'inventory_manager', 'store_admin')
          AND p.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('admin', 'inventory_manager', 'store_admin')
          AND p.is_active = true
    )
);

INSERT INTO public.payment_methods (name, is_active, sort_order)
VALUES
    ('Efectivo', true, 10),
    ('Tarjeta de Crédito', true, 20),
    ('Tarjeta de Débito', true, 30),
    ('Transferencia Bancaria', true, 40),
    ('Yape', true, 50),
    ('Plin', true, 60),
    ('Crédito', true, 70)
ON CONFLICT ((lower(name))) DO UPDATE
SET is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

-- 3) Ensure enum supports all payment methods currently used in app.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'payment_method_type'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        ALTER TYPE public.payment_method_type ADD VALUE IF NOT EXISTS 'yape';
        ALTER TYPE public.payment_method_type ADD VALUE IF NOT EXISTS 'plin';
    END IF;
END $$;
