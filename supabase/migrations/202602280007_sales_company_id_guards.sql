-- Sales company_id guards
-- Date: 2026-02-28
-- Fix: avoids constraint failures when legacy RPC paths insert rows without company_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.resolve_default_company_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id
    INTO v_company_id
    FROM public.companies
    ORDER BY CASE WHEN upper(name) = 'VALNI' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1;

    RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_sales_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.store_id IS NOT NULL THEN
        SELECT s.company_id
        INTO v_company_id
        FROM public.stores s
        WHERE s.id = NEW.store_id
        LIMIT 1;
    END IF;

    NEW.company_id := COALESCE(v_company_id, public.resolve_default_company_id());

    IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'No default company available for sales.company_id';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_sale_items_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.sale_id IS NOT NULL THEN
        SELECT s.company_id
        INTO v_company_id
        FROM public.sales s
        WHERE s.id = NEW.sale_id
        LIMIT 1;
    END IF;

    NEW.company_id := COALESCE(v_company_id, public.resolve_default_company_id());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_sale_payments_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.sale_id IS NOT NULL THEN
        SELECT s.company_id
        INTO v_company_id
        FROM public.sales s
        WHERE s.id = NEW.sale_id
        LIMIT 1;
    END IF;

    NEW.company_id := COALESCE(v_company_id, public.resolve_default_company_id());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_ensure_company_id ON public.sales;
CREATE TRIGGER trg_sales_ensure_company_id
BEFORE INSERT OR UPDATE ON public.sales
FOR EACH ROW
WHEN (NEW.company_id IS NULL)
EXECUTE FUNCTION public.ensure_sales_company_id();

DO $$
BEGIN
    IF to_regclass('public.sale_items') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_sale_items_ensure_company_id ON public.sale_items';
        EXECUTE '
            CREATE TRIGGER trg_sale_items_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.sale_items
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_sale_items_company_id()
        ';
    END IF;

    IF to_regclass('public.sale_payments') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_sale_payments_ensure_company_id ON public.sale_payments';
        EXECUTE '
            CREATE TRIGGER trg_sale_payments_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.sale_payments
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_sale_payments_company_id()
        ';
    END IF;
END $$;
