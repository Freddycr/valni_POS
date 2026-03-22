-- Advances + Inventory company_id guards
-- Date: 2026-02-28
-- Fixes NOT NULL/CHECK errors when legacy inserts omit company_id.

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

CREATE OR REPLACE FUNCTION public.ensure_advances_company_id()
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
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_advance_movements_company_id()
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

    IF NEW.advance_id IS NOT NULL THEN
        SELECT a.company_id
        INTO v_company_id
        FROM public.advances a
        WHERE a.id = NEW.advance_id
        LIMIT 1;
    END IF;

    NEW.company_id := COALESCE(v_company_id, public.resolve_default_company_id());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_inventory_balances_company_id()
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
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.advances') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.advances ADD COLUMN IF NOT EXISTS company_id UUID';
        EXECUTE '
            UPDATE public.advances a
            SET company_id = COALESCE(a.company_id, s.company_id, public.resolve_default_company_id())
            FROM public.stores s
            WHERE a.store_id = s.id
              AND a.company_id IS NULL
        ';
        EXECUTE 'UPDATE public.advances SET company_id = public.resolve_default_company_id() WHERE company_id IS NULL';
        EXECUTE 'DROP TRIGGER IF EXISTS trg_advances_ensure_company_id ON public.advances';
        EXECUTE '
            CREATE TRIGGER trg_advances_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.advances
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_advances_company_id()
        ';
    END IF;

    IF to_regclass('public.advance_movements') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.advance_movements ADD COLUMN IF NOT EXISTS company_id UUID';
        EXECUTE '
            UPDATE public.advance_movements am
            SET company_id = COALESCE(am.company_id, a.company_id, public.resolve_default_company_id())
            FROM public.advances a
            WHERE am.advance_id = a.id
              AND am.company_id IS NULL
        ';
        EXECUTE 'UPDATE public.advance_movements SET company_id = public.resolve_default_company_id() WHERE company_id IS NULL';
        EXECUTE 'DROP TRIGGER IF EXISTS trg_advance_movements_ensure_company_id ON public.advance_movements';
        EXECUTE '
            CREATE TRIGGER trg_advance_movements_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.advance_movements
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_advance_movements_company_id()
        ';
    END IF;

    IF to_regclass('public.inventory_balances') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS company_id UUID';
        EXECUTE '
            UPDATE public.inventory_balances ib
            SET company_id = COALESCE(ib.company_id, s.company_id, public.resolve_default_company_id())
            FROM public.stores s
            WHERE ib.store_id = s.id
              AND ib.company_id IS NULL
        ';
        EXECUTE 'UPDATE public.inventory_balances SET company_id = public.resolve_default_company_id() WHERE company_id IS NULL';
        EXECUTE 'DROP TRIGGER IF EXISTS trg_inventory_balances_ensure_company_id ON public.inventory_balances';
        EXECUTE '
            CREATE TRIGGER trg_inventory_balances_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.inventory_balances
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_inventory_balances_company_id()
        ';
    END IF;
END $$;
