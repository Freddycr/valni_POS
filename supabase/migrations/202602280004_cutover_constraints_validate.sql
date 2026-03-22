-- Cutover Constraint Validation
-- Date: 2026-02-28
-- Purpose: lock-in company_id integrity with low-risk staged validation.
-- Tip: run during low traffic. Re-run if lock timeout occurs.

SET lock_timeout = '5s';
SET statement_timeout = '0';

DO $$
DECLARE
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
    FOREACH v_table IN ARRAY v_tables
    LOOP
        IF to_regclass(format('public.%I', v_table)) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = 'company_id'
        ) THEN
            CONTINUE;
        END IF;

        v_constraint := format('%s_company_id_nn', v_table);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t
                ON t.oid = c.conrelid
            JOIN pg_namespace n
                ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = v_table
              AND c.conname = v_constraint
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (company_id IS NOT NULL) NOT VALID',
                v_table,
                v_constraint
            );
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    v_record RECORD;
BEGIN
    FOR v_record IN
        SELECT
            t.relname AS table_name,
            c.conname AS constraint_name
        FROM pg_constraint c
        JOIN pg_class t
            ON t.oid = c.conrelid
        JOIN pg_namespace n
            ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND c.convalidated = false
          AND (
              c.conname LIKE '%\_company_id\_fkey' ESCAPE '\'
              OR c.conname LIKE '%\_company_id\_nn' ESCAPE '\'
              OR c.conname IN ('pos_shifts_store_id_fkey')
          )
        ORDER BY t.relname, c.conname
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
            v_record.table_name,
            v_record.constraint_name
        );
    END LOOP;
END $$;

RESET lock_timeout;
