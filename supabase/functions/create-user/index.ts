import { createClient } from "npm:@supabase/supabase-js@2";

type CreateUserPayload = {
  email?: string;
  password?: string;
  fullName?: string;
  role?: string;
  companyId?: string | null;
  storeId?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const allowedRoles = new Set([
  "admin",
  "supervisor",
  "seller",
  "inventory_manager",
  "store_admin",
  "cashier",
  "warehouse",
  "auditor",
  "agent",
]);

const isMissingColumnIssue = (error: any, columnName?: string): boolean => {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const mentionsColumn = columnName ? message.includes(columnName.toLowerCase()) : message.includes("column");
  return (
    mentionsColumn &&
    (
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      code === "42703" ||
      code.startsWith("pgrst")
    )
  );
};

const isMissingTableIssue = (error: any): boolean => {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    code === "42p01" ||
    code.startsWith("pgrst")
  );
};

const resolveStoreIdForAssignment = async (
  adminClient: ReturnType<typeof createClient>,
  requestedStoreId: string | null,
): Promise<string | null> => {
  const cleanRequested = String(requestedStoreId || "").trim();
  if (cleanRequested) {
    const { data, error } = await adminClient
      .from("stores")
      .select("id")
      .eq("id", cleanRequested)
      .limit(1);

    if (!error && (data || []).length > 0) {
      return cleanRequested;
    }
  }

  const { data: storesData, error: storesError } = await adminClient
    .from("stores")
    .select("id")
    .order("name", { ascending: true })
    .limit(1);

  if (storesError) {
    if (isMissingTableIssue(storesError)) return null;
    return null;
  }

  return storesData?.[0]?.id ?? null;
};

const assignUserToStore = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  storeId: string | null,
  companyId: string | null,
): Promise<void> => {
  if (!storeId) return;

  const candidates: Record<string, unknown>[] = [
    {
      user_id: userId,
      store_id: storeId,
      company_id: companyId,
      is_default: true,
      can_sell: true,
      can_manage_inventory: false,
    },
    {
      user_id: userId,
      store_id: storeId,
      is_default: true,
      can_sell: true,
      can_manage_inventory: false,
    },
    {
      user_id: userId,
      store_id: storeId,
      is_default: true,
    },
    {
      user_id: userId,
      store_id: storeId,
    },
  ];

  let lastError: any = null;
  for (const payload of candidates) {
    let { error } = await adminClient
      .from("user_store_assignments")
      .upsert([payload], { onConflict: "user_id,store_id" });

    if (error && String(error?.message || "").toLowerCase().includes("on conflict")) {
      ({ error } = await adminClient
        .from("user_store_assignments")
        .insert([payload]));
    }

    if (!error) {
      return;
    }

    lastError = error;
    const recoverable = isMissingColumnIssue(error) || String(error?.message || "").toLowerCase().includes("on conflict");
    if (!recoverable) break;
  }

  if (lastError && !isMissingTableIssue(lastError)) {
    throw lastError;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing Supabase environment variables" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return json(401, { error: "Missing bearer token" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !callerData.user) {
      return json(401, { error: "Invalid token" });
    }

    const callerId = callerData.user.id;
    let callerProfile: any = null;
    let callerProfileError: any = null;
    let callerCompanyId: string | null = null;

    ({ data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role,is_active")
      .eq("id", callerId)
      .single());

    if (callerProfileError) {
      const missingIsActiveColumn = isMissingColumnIssue(callerProfileError, "is_active");

      if (missingIsActiveColumn) {
        ({ data: callerProfile, error: callerProfileError } = await adminClient
          .from("profiles")
          .select("role")
          .eq("id", callerId)
          .single());
      }
    }

    if (callerProfileError || !callerProfile) {
      return json(403, { error: callerProfileError?.message || "Profile not found" });
    }

    const callerIsActive = callerProfile.is_active ?? callerProfile.active ?? true;
    if (!callerIsActive) {
      return json(403, { error: "Inactive user" });
    }
    if (callerProfile.role !== "admin") {
      return json(403, { error: "Insufficient permissions" });
    }

    const body = (await req.json()) as CreateUserPayload;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const fullName = String(body.fullName ?? "").trim();
    const requestedRole = String(body.role ?? "seller").trim();
    const role = allowedRoles.has(requestedRole) ? requestedRole : "seller";
    const requestedStoreId = String(body.storeId ?? "").trim() || null;
    const { data: companyProbeData, error: companyProbeError } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", callerId)
      .single();

    if (!companyProbeError && companyProbeData && Object.prototype.hasOwnProperty.call(companyProbeData, "company_id")) {
      callerCompanyId = companyProbeData.company_id ?? null;
    }

    const companyId = body.companyId ?? callerCompanyId ?? null;

    if (!email) return json(400, { error: "email is required" });
    if (!fullName) return json(400, { error: "fullName is required" });
    if (password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters" });
    }

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        company_id: companyId,
      },
      app_metadata: {
        role,
        company_id: companyId,
      },
    });

    if (createAuthError || !createdAuth.user) {
      const message = String(createAuthError?.message || "Could not create auth user");
      return json(400, { error: message });
    }

    const newUserId = createdAuth.user.id;
    const profileCandidates: Record<string, unknown>[] = [
      {
        id: newUserId,
        email,
        full_name: fullName,
        role,
        is_active: true,
        company_id: companyId,
      },
      {
        id: newUserId,
        email,
        full_name: fullName,
        role,
        is_active: true,
      },
      {
        id: newUserId,
        email,
        full_name: fullName,
        role,
        active: true,
        company_id: companyId,
      },
      {
        id: newUserId,
        email,
        full_name: fullName,
        role,
        active: true,
      },
      {
        id: newUserId,
        email,
        full_name: fullName,
        role,
      },
      {
        id: newUserId,
        email,
        full_name: fullName,
      },
    ];

    let profileError: any = null;
    for (const candidate of profileCandidates) {
      const { error } = await adminClient
        .from("profiles")
        .upsert([candidate], { onConflict: "id" });

      if (!error) {
        profileError = null;
        break;
      }

      profileError = error;
      const recoverableColumnIssue = isMissingColumnIssue(error);
      if (!recoverableColumnIssue) {
        break;
      }
    }

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return json(400, { error: profileError.message || "Could not create profile" });
    }

    try {
      const targetStoreId = await resolveStoreIdForAssignment(adminClient, requestedStoreId);
      await assignUserToStore(adminClient, newUserId, targetStoreId, companyId);
    } catch (assignmentError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      const assignmentMessage = assignmentError instanceof Error ? assignmentError.message : "Could not assign user to store";
      return json(400, { error: assignmentMessage });
    }

    return json(200, {
      id: newUserId,
      email,
      fullName,
      role,
      isActive: true,
      companyId: companyId || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(500, { error: message });
  }
});
