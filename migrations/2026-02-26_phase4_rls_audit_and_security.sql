-- Blueprint Phase 4
-- Date: 2026-02-26
-- Scope: RLS hardening, audit log, RPC security definer, key indexes
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'store_admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cashier';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'warehouse';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auditor';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION current_profile_role()
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
    FROM profiles p
    WHERE p.id = auth.uid();

    RETURN COALESCE(v_role, 'anonymous');
END;
$$;

CREATE OR REPLACE FUNCTION current_profile_company_id()
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
    FROM profiles p
    WHERE p.id = auth.uid();

    RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION in_company_scope(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_company_id IS NULL THEN true
        WHEN current_profile_company_id() IS NULL THEN current_profile_role() = 'admin'
        ELSE p_company_id = current_profile_company_id()
    END;
$$;

CREATE OR REPLACE FUNCTION company_row_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT in_company_scope(p_company_id);
$$;

CREATE OR REPLACE FUNCTION can_manage_catalog()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT current_profile_role() IN ('admin', 'supervisor', 'inventory_manager', 'store_admin');
$$;

CREATE OR REPLACE FUNCTION can_manage_stock()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT current_profile_role() IN ('admin', 'supervisor', 'inventory_manager', 'warehouse', 'store_admin');
$$;

CREATE OR REPLACE FUNCTION can_operate_pos()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT current_profile_role() IN ('admin', 'supervisor', 'seller', 'cashier', 'store_admin', 'inventory_manager');
$$;

CREATE OR REPLACE FUNCTION is_store_assigned(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_store_id IS NULL THEN
        RETURN true;
    END IF;

    IF current_profile_role() IN ('admin', 'supervisor', 'store_admin') THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM user_store_assignments usa
        WHERE usa.user_id = auth.uid()
          AND usa.store_id = p_store_id
    );
END;
$$;

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    "before" JSONB,
    "after" JSONB,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_occurred ON audit_log(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

CREATE OR REPLACE FUNCTION write_audit_log(
    p_company_id UUID,
    p_action TEXT,
    p_entity TEXT,
    p_entity_id UUID,
    p_before JSONB DEFAULT NULL,
    p_after JSONB DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO audit_log (
        company_id,
        occurred_at,
        user_id,
        action,
        entity,
        entity_id,
        "before",
        "after",
        notes
    )
    VALUES (
        p_company_id,
        now(),
        auth.uid(),
        p_action,
        p_entity,
        p_entity_id,
        p_before,
        p_after,
        p_notes
    );
END;
$$;

CREATE OR REPLACE FUNCTION trg_audit_entity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_entity_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_company_id := COALESCE(OLD.company_id, current_profile_company_id());
        v_entity_id := OLD.id;
        PERFORM write_audit_log(v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), NULL, NULL);
        RETURN OLD;
    END IF;

    v_company_id := COALESCE(NEW.company_id, current_profile_company_id());
    v_entity_id := NEW.id;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_audit_log(v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id, NULL, to_jsonb(NEW), NULL);
        RETURN NEW;
    END IF;

    PERFORM write_audit_log(v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_sales ON public.sales';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;

    IF to_regclass('public.inventory_movements') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_inventory_movements ON public.inventory_movements';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_inventory_movements AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;

    IF to_regclass('public.pos_shifts') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_pos_shifts ON public.pos_shifts';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_pos_shifts AFTER INSERT OR UPDATE OR DELETE ON public.pos_shifts FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;

    IF to_regclass('public.purchase_orders') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_purchase_orders ON public.purchase_orders';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;

    IF to_regclass('public.advances') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_advances ON public.advances';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_advances AFTER INSERT OR UPDATE OR DELETE ON public.advances FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;

    IF to_regclass('public.credits') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_blueprint_credits ON public.credits';
        EXECUTE 'CREATE TRIGGER trg_audit_blueprint_credits AFTER INSERT OR UPDATE OR DELETE ON public.credits FOR EACH ROW EXECUTE FUNCTION trg_audit_entity_changes()';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_company_store_created_at ON sales(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_warehouse_occurred_at ON inventory_movements(company_id, warehouse_id, occurred_at DESC);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE serialized_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_blueprint ON companies;
CREATE POLICY companies_select_blueprint ON companies
FOR SELECT TO authenticated
USING (company_row_access(id));

DROP POLICY IF EXISTS companies_write_blueprint ON companies;
CREATE POLICY companies_write_blueprint ON companies
FOR ALL TO authenticated
USING (current_profile_role() = 'admin' AND company_row_access(id))
WITH CHECK (current_profile_role() = 'admin' AND company_row_access(id));

DROP POLICY IF EXISTS warehouses_select_blueprint ON warehouses;
CREATE POLICY warehouses_select_blueprint ON warehouses
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS warehouses_write_blueprint ON warehouses;
CREATE POLICY warehouses_write_blueprint ON warehouses
FOR ALL TO authenticated
USING (can_manage_stock() AND company_row_access(company_id))
WITH CHECK (can_manage_stock() AND company_row_access(company_id));

DROP POLICY IF EXISTS product_variants_select_blueprint ON product_variants;
CREATE POLICY product_variants_select_blueprint ON product_variants
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS product_variants_write_blueprint ON product_variants;
CREATE POLICY product_variants_write_blueprint ON product_variants
FOR ALL TO authenticated
USING (can_manage_catalog() AND company_row_access(company_id))
WITH CHECK (can_manage_catalog() AND company_row_access(company_id));

DROP POLICY IF EXISTS stock_balances_select_blueprint ON stock_balances;
CREATE POLICY stock_balances_select_blueprint ON stock_balances
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS stock_balances_insert_block_blueprint ON stock_balances;
CREATE POLICY stock_balances_insert_block_blueprint ON stock_balances
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS stock_balances_update_block_blueprint ON stock_balances;
CREATE POLICY stock_balances_update_block_blueprint ON stock_balances
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS stock_balances_delete_block_blueprint ON stock_balances;
CREATE POLICY stock_balances_delete_block_blueprint ON stock_balances
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS serialized_items_select_blueprint ON serialized_items;
CREATE POLICY serialized_items_select_blueprint ON serialized_items
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS serialized_items_insert_block_blueprint ON serialized_items;
CREATE POLICY serialized_items_insert_block_blueprint ON serialized_items
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS serialized_items_update_block_blueprint ON serialized_items;
CREATE POLICY serialized_items_update_block_blueprint ON serialized_items
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS serialized_items_delete_block_blueprint ON serialized_items;
CREATE POLICY serialized_items_delete_block_blueprint ON serialized_items
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS inventory_movements_select_blueprint ON inventory_movements;
CREATE POLICY inventory_movements_select_blueprint ON inventory_movements
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS inventory_movements_insert_block_blueprint ON inventory_movements;
CREATE POLICY inventory_movements_insert_block_blueprint ON inventory_movements
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_movements_update_block_blueprint ON inventory_movements;
CREATE POLICY inventory_movements_update_block_blueprint ON inventory_movements
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_movements_delete_block_blueprint ON inventory_movements;
CREATE POLICY inventory_movements_delete_block_blueprint ON inventory_movements
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS inventory_movement_items_select_blueprint ON inventory_movement_items;
CREATE POLICY inventory_movement_items_select_blueprint ON inventory_movement_items
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS inventory_movement_items_insert_block_blueprint ON inventory_movement_items;
CREATE POLICY inventory_movement_items_insert_block_blueprint ON inventory_movement_items
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_movement_items_update_block_blueprint ON inventory_movement_items;
CREATE POLICY inventory_movement_items_update_block_blueprint ON inventory_movement_items
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_movement_items_delete_block_blueprint ON inventory_movement_items;
CREATE POLICY inventory_movement_items_delete_block_blueprint ON inventory_movement_items
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS pos_shifts_select_blueprint ON pos_shifts;
CREATE POLICY pos_shifts_select_blueprint ON pos_shifts
FOR SELECT TO authenticated
USING (company_row_access(company_id) AND (is_store_assigned(store_id) OR can_manage_catalog()));

DROP POLICY IF EXISTS pos_shifts_write_blueprint ON pos_shifts;
CREATE POLICY pos_shifts_write_blueprint ON pos_shifts
FOR ALL TO authenticated
USING (company_row_access(company_id) AND can_operate_pos() AND (is_store_assigned(store_id) OR can_manage_catalog()))
WITH CHECK (company_row_access(company_id) AND can_operate_pos() AND (is_store_assigned(store_id) OR can_manage_catalog()));

DROP POLICY IF EXISTS purchase_receipts_select_blueprint ON purchase_receipts;
CREATE POLICY purchase_receipts_select_blueprint ON purchase_receipts
FOR SELECT TO authenticated
USING (company_row_access(company_id));

DROP POLICY IF EXISTS purchase_receipts_insert_block_blueprint ON purchase_receipts;
CREATE POLICY purchase_receipts_insert_block_blueprint ON purchase_receipts
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS purchase_receipts_update_block_blueprint ON purchase_receipts;
CREATE POLICY purchase_receipts_update_block_blueprint ON purchase_receipts
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS purchase_receipts_delete_block_blueprint ON purchase_receipts;
CREATE POLICY purchase_receipts_delete_block_blueprint ON purchase_receipts
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS sale_items_select_blueprint ON sale_items;
CREATE POLICY sale_items_select_blueprint ON sale_items
FOR SELECT TO authenticated
USING (
    company_row_access(company_id)
    AND EXISTS (
        SELECT 1
        FROM sales s
        WHERE s.id = sale_items.sale_id
          AND (
              s.seller_id = auth.uid()
              OR is_store_assigned(s.store_id)
              OR can_manage_catalog()
          )
    )
);

DROP POLICY IF EXISTS sale_items_insert_block_blueprint ON sale_items;
CREATE POLICY sale_items_insert_block_blueprint ON sale_items
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS sale_items_update_block_blueprint ON sale_items;
CREATE POLICY sale_items_update_block_blueprint ON sale_items
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS sale_items_delete_block_blueprint ON sale_items;
CREATE POLICY sale_items_delete_block_blueprint ON sale_items
FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS sale_payments_select_blueprint ON sale_payments;
CREATE POLICY sale_payments_select_blueprint ON sale_payments
FOR SELECT TO authenticated
USING (company_row_access(company_id) AND (is_store_assigned(payment_store_id) OR can_manage_catalog()));

DROP POLICY IF EXISTS sale_payments_write_blueprint ON sale_payments;
CREATE POLICY sale_payments_write_blueprint ON sale_payments
FOR ALL TO authenticated
USING (company_row_access(company_id) AND can_operate_pos() AND (is_store_assigned(payment_store_id) OR can_manage_catalog()))
WITH CHECK (company_row_access(company_id) AND can_operate_pos() AND (is_store_assigned(payment_store_id) OR can_manage_catalog()));

DROP POLICY IF EXISTS audit_log_select_blueprint ON audit_log;
CREATE POLICY audit_log_select_blueprint ON audit_log
FOR SELECT TO authenticated
USING (
    company_row_access(company_id)
    AND current_profile_role() IN ('admin', 'supervisor', 'store_admin', 'auditor')
);

DROP POLICY IF EXISTS audit_log_insert_block_blueprint ON audit_log;
CREATE POLICY audit_log_insert_block_blueprint ON audit_log
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS audit_log_update_block_blueprint ON audit_log;
CREATE POLICY audit_log_update_block_blueprint ON audit_log
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS audit_log_delete_block_blueprint ON audit_log;
CREATE POLICY audit_log_delete_block_blueprint ON audit_log
FOR DELETE TO authenticated
USING (false);

DO $$
BEGIN
    IF to_regprocedure('rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text) TO authenticated';
    END IF;

    IF to_regprocedure('rpc_void_sale(uuid,text,uuid)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION rpc_void_sale(uuid,text,uuid) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION rpc_void_sale(uuid,text,uuid) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION rpc_void_sale(uuid,text,uuid) TO authenticated';
    END IF;

    IF to_regprocedure('rpc_transfer_stock(uuid,uuid,uuid,jsonb,uuid,text)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION rpc_transfer_stock(uuid,uuid,uuid,jsonb,uuid,text) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION rpc_transfer_stock(uuid,uuid,uuid,jsonb,uuid,text) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION rpc_transfer_stock(uuid,uuid,uuid,jsonb,uuid,text) TO authenticated';
    END IF;

    IF to_regprocedure('rpc_adjust_stock(uuid,uuid,uuid,integer,text,uuid,uuid)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION rpc_adjust_stock(uuid,uuid,uuid,integer,text,uuid,uuid) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION rpc_adjust_stock(uuid,uuid,uuid,integer,text,uuid,uuid) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION rpc_adjust_stock(uuid,uuid,uuid,integer,text,uuid,uuid) TO authenticated';
    END IF;

    IF to_regprocedure('rpc_receive_purchase(uuid,uuid,uuid,jsonb,uuid,text)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION rpc_receive_purchase(uuid,uuid,uuid,jsonb,uuid,text) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION rpc_receive_purchase(uuid,uuid,uuid,jsonb,uuid,text) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION rpc_receive_purchase(uuid,uuid,uuid,jsonb,uuid,text) TO authenticated';
    END IF;

    IF to_regprocedure('process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb,uuid,text,text) TO authenticated';
    END IF;

    IF to_regprocedure('process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb)') IS NOT NULL THEN
        EXECUTE 'ALTER FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb) SECURITY DEFINER SET search_path = public';
        EXECUTE 'REVOKE ALL ON FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION process_sale_atomic(uuid,uuid,numeric,jsonb,jsonb) TO authenticated';
    END IF;
END $$;
