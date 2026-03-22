-- Reporting schema + semantic agent query logs
-- Date: 2026-03-04
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS reporting;

-- 1) Sales fact view
CREATE OR REPLACE VIEW reporting.v_sales_fact AS
SELECT
    s.id AS sale_id,
    COALESCE(s.company_id, st.company_id, c.company_id, pr.company_id) AS company_id,
    s.store_id,
    st.code AS store_code,
    st.name AS store_name,
    s.customer_id,
    c.doc_type AS customer_doc_type,
    c.doc_number AS customer_doc_number,
    c.full_name AS customer_name,
    s.seller_id,
    pr.full_name AS seller_name,
    s.invoice_number,
    s.document_type,
    s.document_series,
    s.document_number,
    s.status,
    s.subtotal,
    s.tax_amount,
    s.discount_amount,
    s.total_amount,
    s.created_at AS created_at_utc,
    timezone('America/Lima', s.created_at) AS created_at_peru,
    (timezone('America/Lima', s.created_at))::date AS created_date_peru,
    to_char(timezone('America/Lima', s.created_at), 'HH24:MI:SS') AS created_time_peru
FROM public.sales s
LEFT JOIN public.stores st ON st.id = s.store_id
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.profiles pr ON pr.id = s.seller_id
WHERE COALESCE(s.company_id, st.company_id, c.company_id, pr.company_id) IS NOT NULL;

-- 2) Sale items fact view
CREATE OR REPLACE VIEW reporting.v_sale_items_fact AS
SELECT
    si.id AS sale_item_id,
    si.sale_id,
    COALESCE(si.company_id, s.company_id, p.company_id, st.company_id) AS company_id,
    s.store_id,
    st.name AS store_name,
    s.customer_id,
    c.full_name AS customer_name,
    s.seller_id,
    pr.full_name AS seller_name,
    si.product_id,
    p.name AS product_name,
    p.type AS product_type,
    p.location_bin,
    si.quantity,
    si.unit_price,
    si.total_price,
    si.captured_imei,
    si.captured_serial,
    s.created_at AS sale_created_at_utc,
    timezone('America/Lima', s.created_at) AS sale_created_at_peru,
    (timezone('America/Lima', s.created_at))::date AS sale_created_date_peru
FROM public.sale_items si
LEFT JOIN public.sales s ON s.id = si.sale_id
LEFT JOIN public.products p ON p.id = si.product_id
LEFT JOIN public.stores st ON st.id = s.store_id
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.profiles pr ON pr.id = s.seller_id
WHERE COALESCE(si.company_id, s.company_id, p.company_id, st.company_id) IS NOT NULL;

-- 3) Payments fact view
CREATE OR REPLACE VIEW reporting.v_payments_fact AS
SELECT
    sp.id AS payment_id,
    sp.sale_id,
    COALESCE(sp.company_id, s.company_id, st.company_id, pst.company_id) AS company_id,
    s.store_id AS sale_store_id,
    sp.payment_store_id,
    st.name AS sale_store_name,
    pst.name AS payment_store_name,
    s.customer_id,
    c.full_name AS customer_name,
    s.seller_id,
    pr.full_name AS seller_name,
    sp.payment_method,
    sp.payment_method_label,
    sp.amount,
    sp.reference_number,
    sp.payment_date AS payment_date_utc,
    timezone('America/Lima', sp.payment_date) AS payment_date_peru,
    (timezone('America/Lima', sp.payment_date))::date AS payment_date_peru_date,
    s.created_at AS sale_created_at_utc,
    (timezone('America/Lima', s.created_at))::date AS sale_created_date_peru
FROM public.sale_payments sp
LEFT JOIN public.sales s ON s.id = sp.sale_id
LEFT JOIN public.stores st ON st.id = s.store_id
LEFT JOIN public.stores pst ON pst.id = sp.payment_store_id
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.profiles pr ON pr.id = s.seller_id
WHERE COALESCE(sp.company_id, s.company_id, st.company_id, pst.company_id) IS NOT NULL;

-- 4) Inventory snapshot view
CREATE OR REPLACE VIEW reporting.v_inventory_snapshot AS
SELECT
    ib.id AS inventory_balance_id,
    COALESCE(ib.company_id, p.company_id, st.company_id) AS company_id,
    ib.store_id,
    st.code AS store_code,
    st.name AS store_name,
    st.type AS store_type,
    ib.product_id,
    p.name AS product_name,
    p.type AS product_type,
    p.location_bin,
    p.status AS product_status,
    ib.on_hand,
    ib.reserved,
    GREATEST(ib.on_hand - ib.reserved, 0) AS available_qty,
    p.sell_price AS unit_sell_price,
    (GREATEST(ib.on_hand - ib.reserved, 0) * COALESCE(p.sell_price, 0))::numeric(14,2) AS available_stock_value,
    ib.created_at AS balance_created_at_utc,
    ib.updated_at AS balance_updated_at_utc,
    timezone('America/Lima', ib.updated_at) AS balance_updated_at_peru
FROM public.inventory_balances ib
LEFT JOIN public.products p ON p.id = ib.product_id
LEFT JOIN public.stores st ON st.id = ib.store_id
WHERE COALESCE(ib.company_id, p.company_id, st.company_id) IS NOT NULL;

GRANT USAGE ON SCHEMA reporting TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO authenticated, service_role;

-- Semantic-agent observability table
CREATE TABLE IF NOT EXISTS public.agent_query_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    session_id TEXT,
    question TEXT NOT NULL,
    dsl_plan JSONB,
    compiled_sql TEXT,
    execution_params JSONB,
    response_summary TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'blocked')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibility helpers for environments that don't yet have phase4 RLS functions
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT p.role::TEXT
    INTO v_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    RETURN COALESCE(v_role, 'anonymous');
END;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_company_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT p.company_id
    INTO v_company_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_row_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_company_id IS NULL THEN true
        WHEN public.current_profile_company_id() IS NULL THEN false
        ELSE p_company_id = public.current_profile_company_id()
    END;
$$;

CREATE INDEX IF NOT EXISTS idx_agent_query_logs_company_created
    ON public.agent_query_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_query_logs_user_created
    ON public.agent_query_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_query_logs_status_created
    ON public.agent_query_logs(status, created_at DESC);

ALTER TABLE public.agent_query_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_query_logs_select_policy ON public.agent_query_logs;
CREATE POLICY agent_query_logs_select_policy ON public.agent_query_logs
FOR SELECT TO authenticated
USING (
    company_row_access(company_id)
    AND current_profile_role() IN ('admin', 'supervisor', 'store_admin', 'auditor')
);

DROP POLICY IF EXISTS agent_query_logs_insert_block_policy ON public.agent_query_logs;
CREATE POLICY agent_query_logs_insert_block_policy ON public.agent_query_logs
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS agent_query_logs_update_block_policy ON public.agent_query_logs;
CREATE POLICY agent_query_logs_update_block_policy ON public.agent_query_logs
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS agent_query_logs_delete_block_policy ON public.agent_query_logs;
CREATE POLICY agent_query_logs_delete_block_policy ON public.agent_query_logs
FOR DELETE TO authenticated
USING (false);

GRANT SELECT ON public.agent_query_logs TO authenticated;
GRANT ALL ON public.agent_query_logs TO service_role;
