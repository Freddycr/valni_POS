-- Cutover Schema Hardening
-- Date: 2026-02-28
-- Purpose: normalize companies/company_id with additive/idempotent changes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.companies (name)
SELECT 'VALNI'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE upper(name) = 'VALNI'
);

DO $$
DECLARE
    v_default_company UUID;
    v_table TEXT;
    v_constraint TEXT;
    v_tables TEXT[] := ARRAY[
        'profiles',
        'stores',
        'user_store_assignments',
        'warehouses',
        'inventory_balances',
        'products',
        'customers',
        'sales',
        'sale_items',
        'sale_payments',
        'advances',
        'advance_movements',
        'credits',
        'credit_installments',
        'pos_shifts'
    ];
BEGIN
    SELECT id
    INTO v_default_company
    FROM public.companies
    WHERE upper(name) = 'VALNI'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_default_company IS NULL THEN
        SELECT id
        INTO v_default_company
        FROM public.companies
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_default_company IS NULL THEN
        RAISE EXCEPTION 'No existe company base para backfill.';
    END IF;

    FOREACH v_table IN ARRAY v_tables
    LOOP
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID', v_table);
        EXECUTE format('UPDATE public.%I SET company_id = $1 WHERE company_id IS NULL', v_table) USING v_default_company;

        v_constraint := format('%s_company_id_fkey', v_table);
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t
                ON t.oid = c.conrelid
            JOIN pg_namespace n
                ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = v_table
              AND c.contype = 'f'
              AND EXISTS (
                  SELECT 1
                  FROM unnest(c.conkey) AS k(attnum)
                  JOIN pg_attribute a
                      ON a.attrelid = t.oid
                     AND a.attnum = k.attnum
                  WHERE a.attname = 'company_id'
              )
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT NOT VALID',
                v_table,
                v_constraint
            );
        END IF;
    END LOOP;

    IF to_regclass('public.stores') IS NOT NULL
       AND to_regclass('public.profiles') IS NOT NULL
       AND to_regclass('public.user_store_assignments') IS NOT NULL THEN
        EXECUTE '
            UPDATE public.profiles p
            SET company_id = s.company_id
            FROM public.stores s
            WHERE p.company_id IS NULL
              AND s.company_id IS NOT NULL
              AND EXISTS (
                  SELECT 1
                  FROM public.user_store_assignments usa
                  WHERE usa.user_id = p.id
                    AND usa.store_id = s.id
              )
        ';
    END IF;

    IF to_regclass('public.profiles') IS NOT NULL THEN
        EXECUTE 'UPDATE public.profiles SET company_id = $1 WHERE company_id IS NULL' USING v_default_company;
    END IF;

    IF to_regclass('public.sales') IS NOT NULL THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.sales ALTER COLUMN id SET DEFAULT gen_random_uuid()';
        EXCEPTION
            WHEN undefined_function THEN
                CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
                EXECUTE 'ALTER TABLE public.sales ALTER COLUMN id SET DEFAULT uuid_generate_v4()';
        END;
    END IF;
END $$;
