-- Create User Guard: profiles.company_id auto-fill
-- Date: 2026-02-28
-- Fixes "Database error creating new user" when auth trigger inserts profile without company_id.

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

DO $$
DECLARE
    v_company_id UUID;
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE NOTICE 'profiles table does not exist; skipping profile company guard.';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN company_id UUID;
    END IF;

    SELECT public.resolve_default_company_id()
    INTO v_company_id;

    IF v_company_id IS NOT NULL THEN
        UPDATE public.profiles
        SET company_id = v_company_id
        WHERE company_id IS NULL;
    END IF;

    ALTER TABLE public.profiles
        ALTER COLUMN company_id SET DEFAULT public.resolve_default_company_id();
END $$;

CREATE OR REPLACE FUNCTION public.ensure_profile_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        NEW.company_id := public.resolve_default_company_id();
    END IF;

    IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'No default company available for profiles.company_id';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_company_id ON public.profiles;

CREATE TRIGGER trg_profiles_ensure_company_id
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
WHEN (NEW.company_id IS NULL)
EXECUTE FUNCTION public.ensure_profile_company_id();
