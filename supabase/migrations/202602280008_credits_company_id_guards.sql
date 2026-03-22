-- Credits company_id guards
-- Date: 2026-02-28
-- Fix: ensure credits/credit_installments keep company_id populated.

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

CREATE OR REPLACE FUNCTION public.ensure_credits_company_id()
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

    IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'No default company available for credits.company_id';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_credit_installments_company_id()
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

    IF NEW.credit_id IS NOT NULL THEN
        SELECT c.company_id
        INTO v_company_id
        FROM public.credits c
        WHERE c.id = NEW.credit_id
        LIMIT 1;
    END IF;

    NEW.company_id := COALESCE(v_company_id, public.resolve_default_company_id());

    IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'No default company available for credit_installments.company_id';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.credits') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.credits ADD COLUMN IF NOT EXISTS company_id UUID';
        EXECUTE '
            UPDATE public.credits c
            SET company_id = COALESCE(c.company_id, s.company_id, public.resolve_default_company_id())
            FROM public.sales s
            WHERE c.sale_id = s.id
              AND c.company_id IS NULL
        ';
        EXECUTE 'UPDATE public.credits SET company_id = public.resolve_default_company_id() WHERE company_id IS NULL';

        EXECUTE 'DROP TRIGGER IF EXISTS trg_credits_ensure_company_id ON public.credits';
        EXECUTE '
            CREATE TRIGGER trg_credits_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.credits
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_credits_company_id()
        ';
    END IF;

    IF to_regclass('public.credit_installments') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.credit_installments ADD COLUMN IF NOT EXISTS company_id UUID';
        EXECUTE '
            UPDATE public.credit_installments ci
            SET company_id = COALESCE(ci.company_id, c.company_id, public.resolve_default_company_id())
            FROM public.credits c
            WHERE ci.credit_id = c.id
              AND ci.company_id IS NULL
        ';
        EXECUTE 'UPDATE public.credit_installments SET company_id = public.resolve_default_company_id() WHERE company_id IS NULL';

        EXECUTE 'DROP TRIGGER IF EXISTS trg_credit_installments_ensure_company_id ON public.credit_installments';
        EXECUTE '
            CREATE TRIGGER trg_credit_installments_ensure_company_id
            BEFORE INSERT OR UPDATE ON public.credit_installments
            FOR EACH ROW
            WHEN (NEW.company_id IS NULL)
            EXECUTE FUNCTION public.ensure_credit_installments_company_id()
        ';
    END IF;
END $$;
