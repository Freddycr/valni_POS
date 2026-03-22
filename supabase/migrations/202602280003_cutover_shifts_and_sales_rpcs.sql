-- Cutover Shifts + Sales RPC Normalization
-- Date: 2026-02-28
-- Purpose: standardize on pos_shifts + canonical rpc_create_sale.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pos_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ NULL,
    closing_cash NUMERIC(12,2) NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pos_shifts_status_check CHECK (status IN ('open', 'closed'))
);

ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS opened_by UUID;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(12,2);
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS closed_by UUID;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(12,2);
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.pos_shifts ALTER COLUMN opened_at SET DEFAULT now();
ALTER TABLE public.pos_shifts ALTER COLUMN opening_cash SET DEFAULT 0;
ALTER TABLE public.pos_shifts ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE public.pos_shifts ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.pos_shifts ALTER COLUMN updated_at SET DEFAULT now();

DO $$
DECLARE
    v_default_company UUID;
    v_shifts_relkind "char";
BEGIN
    SELECT id
    INTO v_default_company
    FROM public.companies
    ORDER BY CASE WHEN upper(name) = 'VALNI' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1;

    IF v_default_company IS NOT NULL THEN
        UPDATE public.pos_shifts ps
        SET company_id = COALESCE(ps.company_id, s.company_id, v_default_company)
        FROM public.stores s
        WHERE ps.store_id = s.id
          AND ps.company_id IS NULL;

        UPDATE public.pos_shifts
        SET company_id = v_default_company
        WHERE company_id IS NULL;
    END IF;

    UPDATE public.pos_shifts SET status = 'open' WHERE status IS NULL;
    UPDATE public.pos_shifts SET opened_at = now() WHERE opened_at IS NULL;
    UPDATE public.pos_shifts SET opening_cash = 0 WHERE opening_cash IS NULL;
    UPDATE public.pos_shifts SET created_at = now() WHERE created_at IS NULL;
    UPDATE public.pos_shifts SET updated_at = now() WHERE updated_at IS NULL;

    SELECT c.relkind
    INTO v_shifts_relkind
    FROM pg_class c
    JOIN pg_namespace n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'shifts'
    LIMIT 1;

    IF v_shifts_relkind IS NULL THEN
        EXECUTE '
            CREATE VIEW public.shifts AS
            SELECT
                id,
                company_id,
                store_id,
                opened_by,
                opened_at,
                opening_cash,
                closed_by,
                closed_at,
                closing_cash,
                status,
                created_at,
                updated_at
            FROM public.pos_shifts
        ';
    ELSIF v_shifts_relkind = 'v' THEN
        EXECUTE '
            CREATE OR REPLACE VIEW public.shifts AS
            SELECT
                id,
                company_id,
                store_id,
                opened_by,
                opened_at,
                opening_cash,
                closed_by,
                closed_at,
                closing_cash,
                status,
                created_at,
                updated_at
            FROM public.pos_shifts
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t
            ON t.oid = c.conrelid
        JOIN pg_namespace n
            ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'pos_shifts'
          AND c.conname = 'pos_shifts_company_id_fkey'
    ) THEN
        EXECUTE 'ALTER TABLE public.pos_shifts ADD CONSTRAINT pos_shifts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT NOT VALID';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t
            ON t.oid = c.conrelid
        JOIN pg_namespace n
            ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'pos_shifts'
          AND c.conname = 'pos_shifts_store_id_fkey'
    ) THEN
        EXECUTE 'ALTER TABLE public.pos_shifts ADD CONSTRAINT pos_shifts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT NOT VALID';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_shifts_company_store_status ON public.pos_shifts(company_id, store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_opened_at ON public.pos_shifts(opened_at DESC);

DO $$
DECLARE
    v_rpc_exists BOOLEAN;
    v_rpc_bridge_created BOOLEAN := FALSE;
    v_signature TEXT;
BEGIN
    v_rpc_exists := to_regprocedure('public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text)') IS NOT NULL;

    IF NOT v_rpc_exists THEN
        IF to_regprocedure('public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text)') IS NOT NULL THEN
            EXECUTE $fn$
                CREATE OR REPLACE FUNCTION public.rpc_create_sale(
                    p_company_id UUID DEFAULT NULL,
                    p_store_id UUID DEFAULT NULL,
                    p_warehouse_id UUID DEFAULT NULL,
                    p_shift_id UUID DEFAULT NULL,
                    p_customer_id UUID DEFAULT NULL,
                    p_seller_id UUID DEFAULT NULL,
                    p_total_amount NUMERIC DEFAULT 0,
                    p_items JSONB DEFAULT '[]'::jsonb,
                    p_payments JSONB DEFAULT '[]'::jsonb,
                    p_document_type TEXT DEFAULT 'Recibo de Venta',
                    p_document_series TEXT DEFAULT NULL
                )
                RETURNS UUID
                LANGUAGE plpgsql
                AS $body$
                BEGIN
                    RETURN public.process_sale_atomic(
                        p_customer_id,
                        p_seller_id,
                        p_total_amount,
                        p_items,
                        p_payments,
                        p_store_id,
                        p_document_type,
                        p_document_series
                    );
                END;
                $body$
            $fn$;
            v_rpc_bridge_created := TRUE;
        ELSIF to_regprocedure('public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb)') IS NOT NULL THEN
            EXECUTE $fn$
                CREATE OR REPLACE FUNCTION public.rpc_create_sale(
                    p_company_id UUID DEFAULT NULL,
                    p_store_id UUID DEFAULT NULL,
                    p_warehouse_id UUID DEFAULT NULL,
                    p_shift_id UUID DEFAULT NULL,
                    p_customer_id UUID DEFAULT NULL,
                    p_seller_id UUID DEFAULT NULL,
                    p_total_amount NUMERIC DEFAULT 0,
                    p_items JSONB DEFAULT '[]'::jsonb,
                    p_payments JSONB DEFAULT '[]'::jsonb,
                    p_document_type TEXT DEFAULT 'Recibo de Venta',
                    p_document_series TEXT DEFAULT NULL
                )
                RETURNS UUID
                LANGUAGE plpgsql
                AS $body$
                BEGIN
                    RETURN public.process_sale_atomic(
                        p_customer_id,
                        p_seller_id,
                        p_total_amount,
                        p_items,
                        p_payments
                    );
                END;
                $body$
            $fn$;
            v_rpc_bridge_created := TRUE;
        END IF;
    END IF;

    IF to_regprocedure('public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text)') IS NULL THEN
        RAISE EXCEPTION 'No existe rpc_create_sale canónica ni bridge legacy disponible.';
    END IF;

    IF NOT v_rpc_bridge_created THEN
        FOR v_signature IN
            SELECT p.oid::regprocedure::text
            FROM pg_proc p
            JOIN pg_namespace n
                ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'process_sale_atomic'
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s', v_signature);
        END LOOP;

        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.process_sale_atomic(
                p_customer_id UUID,
                p_seller_id UUID,
                p_total_amount NUMERIC,
                p_items JSONB,
                p_payments JSONB,
                p_store_id UUID DEFAULT NULL,
                p_document_type TEXT DEFAULT 'Recibo de Venta',
                p_document_series TEXT DEFAULT NULL
            )
            RETURNS UUID
            LANGUAGE plpgsql
            AS $body$
            BEGIN
                RETURN public.rpc_create_sale(
                    NULL,
                    p_store_id,
                    NULL,
                    NULL,
                    p_customer_id,
                    p_seller_id,
                    p_total_amount,
                    p_items,
                    p_payments,
                    p_document_type,
                    p_document_series
                );
            END;
            $body$
        $fn$;
    ELSE
        RAISE NOTICE 'rpc_create_sale bridge creado desde process_sale_atomic; overloads legacy se mantienen temporalmente.';
    END IF;

    EXECUTE 'ALTER FUNCTION public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) SECURITY DEFINER SET search_path = public';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) TO authenticated';

    IF to_regprocedure('public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) TO authenticated';
    END IF;
END $$;
