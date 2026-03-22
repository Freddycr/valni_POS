-- Carga inicial de marcas y modelos inferidos desde products.name
-- Seguro para re-ejecutar (idempotente).

DO $$
DECLARE
    v_company_id UUID;
    v_brand_has_company_id BOOLEAN;
    v_model_has_company_id BOOLEAN;
    v_brands_inserted INTEGER := 0;
    v_models_inserted INTEGER := 0;
    v_products_linked INTEGER := 0;
BEGIN
    IF to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'La tabla public.products no existe.';
    END IF;
    IF to_regclass('public.brands') IS NULL THEN
        RAISE EXCEPTION 'La tabla public.brands no existe.';
    END IF;
    IF to_regclass('public.models') IS NULL THEN
        RAISE EXCEPTION 'La tabla public.models no existe.';
    END IF;

    IF to_regclass('public.companies') IS NOT NULL THEN
        SELECT id
        INTO v_company_id
        FROM public.companies
        WHERE upper(name) = 'VALNI'
        LIMIT 1;

        IF v_company_id IS NULL THEN
            SELECT id
            INTO v_company_id
            FROM public.companies
            ORDER BY created_at ASC NULLS LAST, id
            LIMIT 1;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'brands'
          AND column_name = 'company_id'
    )
    INTO v_brand_has_company_id;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'models'
          AND column_name = 'company_id'
    )
    INTO v_model_has_company_id;

    CREATE TEMP TABLE tmp_product_brand_model ON COMMIT DROP AS
    WITH normalized AS (
        SELECT
            p.id AS product_id,
            p.type::text AS product_type,
            trim(regexp_replace(COALESCE(p.name, ''), '\s+', ' ', 'g')) AS clean_name
        FROM public.products p
        WHERE COALESCE(trim(p.name), '') <> ''
    ),
    parsed AS (
        SELECT
            n.product_id,
            n.clean_name,
            CASE
                WHEN n.clean_name ~* '^(apple|iphone|ipad)($|[[:space:]])' THEN 'Apple'
                WHEN n.clean_name ~* '^(samsung|galaxy)($|[[:space:]])' THEN 'Samsung'
                WHEN n.clean_name ~* '^xiaomi($|[[:space:]])' THEN 'Xiaomi'
                WHEN n.clean_name ~* '^redmi($|[[:space:]])' THEN 'Redmi'
                WHEN n.clean_name ~* '^poco($|[[:space:]])' THEN 'Poco'
                WHEN n.clean_name ~* '^honor($|[[:space:]])' THEN 'Honor'
                WHEN n.clean_name ~* '^infinix($|[[:space:]])' THEN 'Infinix'
                WHEN n.clean_name ~* '^lenovo($|[[:space:]])' THEN 'Lenovo'
                WHEN n.clean_name ~* '^huawei($|[[:space:]])' THEN 'Huawei'
                WHEN n.clean_name ~* '^(motorola|moto)($|[[:space:]])' THEN 'Motorola'
                WHEN n.clean_name ~* '^oppo($|[[:space:]])' THEN 'Oppo'
                WHEN n.clean_name ~* '^vivo($|[[:space:]])' THEN 'Vivo'
                WHEN n.clean_name ~* '^realme($|[[:space:]])' THEN 'Realme'
                WHEN n.clean_name ~* '^tecno($|[[:space:]])' THEN 'Tecno'
                WHEN n.clean_name ~* '^nokia($|[[:space:]])' THEN 'Nokia'
                WHEN n.clean_name ~* '^(google|pixel)($|[[:space:]])' THEN 'Google'
                WHEN n.clean_name ~* '^zte($|[[:space:]])' THEN 'ZTE'
                WHEN split_part(n.clean_name, ' ', 1) ~ '^[0-9]+$' THEN 'Generico'
                ELSE initcap(split_part(n.clean_name, ' ', 1))
            END AS brand_name,
            nullif(trim(regexp_replace(n.clean_name, '^\S+\s*', '')), '') AS model_name_tail
        FROM normalized n
    )
    SELECT
        p.product_id,
        p.brand_name,
        COALESCE(p.model_name_tail, p.clean_name, 'Modelo Base') AS model_name
    FROM parsed p;

    IF v_brand_has_company_id THEN
        INSERT INTO public.brands (name, company_id)
        SELECT DISTINCT
            x.brand_name,
            v_company_id
        FROM tmp_product_brand_model x
        WHERE x.brand_name IS NOT NULL
          AND x.brand_name <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM public.brands b
              WHERE lower(trim(b.name)) = lower(trim(x.brand_name))
          );
        GET DIAGNOSTICS v_brands_inserted = ROW_COUNT;
    ELSE
        INSERT INTO public.brands (name)
        SELECT DISTINCT x.brand_name
        FROM tmp_product_brand_model x
        WHERE x.brand_name IS NOT NULL
          AND x.brand_name <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM public.brands b
              WHERE lower(trim(b.name)) = lower(trim(x.brand_name))
          );
        GET DIAGNOSTICS v_brands_inserted = ROW_COUNT;
    END IF;

    IF v_model_has_company_id THEN
        INSERT INTO public.models (brand_id, name, company_id)
        SELECT DISTINCT
            b.id AS brand_id,
            x.model_name,
            v_company_id
        FROM tmp_product_brand_model x
        JOIN public.brands b
          ON lower(trim(b.name)) = lower(trim(x.brand_name))
        WHERE x.model_name IS NOT NULL
          AND x.model_name <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM public.models m
              WHERE m.brand_id = b.id
                AND lower(trim(m.name)) = lower(trim(x.model_name))
          );
        GET DIAGNOSTICS v_models_inserted = ROW_COUNT;
    ELSE
        INSERT INTO public.models (brand_id, name)
        SELECT DISTINCT
            b.id AS brand_id,
            x.model_name
        FROM tmp_product_brand_model x
        JOIN public.brands b
          ON lower(trim(b.name)) = lower(trim(x.brand_name))
        WHERE x.model_name IS NOT NULL
          AND x.model_name <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM public.models m
              WHERE m.brand_id = b.id
                AND lower(trim(m.name)) = lower(trim(x.model_name))
          );
        GET DIAGNOSTICS v_models_inserted = ROW_COUNT;
    END IF;

    UPDATE public.products p
    SET model_id = m.id
    FROM tmp_product_brand_model x
    JOIN public.brands b
      ON lower(trim(b.name)) = lower(trim(x.brand_name))
    JOIN public.models m
      ON m.brand_id = b.id
     AND lower(trim(m.name)) = lower(trim(x.model_name))
    WHERE p.id = x.product_id
      AND p.model_id IS NULL;
    GET DIAGNOSTICS v_products_linked = ROW_COUNT;

    RAISE NOTICE 'Carga inicial completada. brands_inserted=%, models_inserted=%, products_linked=%',
        v_brands_inserted, v_models_inserted, v_products_linked;
END $$;

SELECT
    (SELECT COUNT(*) FROM public.brands) AS total_brands,
    (SELECT COUNT(*) FROM public.models) AS total_models,
    (SELECT COUNT(*) FROM public.products WHERE model_id IS NOT NULL) AS products_with_model,
    (SELECT COUNT(*) FROM public.products) AS total_products;
