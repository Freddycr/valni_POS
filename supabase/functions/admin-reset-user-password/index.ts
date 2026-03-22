import { createClient } from "npm:@supabase/supabase-js@2";

type ResetPayload = {
  userId?: string;
  password?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

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
    let profile: any = null;
    let profileError: any = null;

    ({ data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role,is_active")
      .eq("id", callerId)
      .single());

    if (profileError) {
      const profileErrorMessage = String(profileError?.message || "").toLowerCase();
      const missingIsActiveColumn = profileErrorMessage.includes("is_active") && profileErrorMessage.includes("does not exist");
      if (missingIsActiveColumn) {
        ({ data: profile, error: profileError } = await adminClient
          .from("profiles")
          .select("role,active")
          .eq("id", callerId)
          .single());
      }
    }

    if (profileError || !profile) {
      return json(403, { error: profileError?.message || "Profile not found" });
    }
    const profileIsActive = profile.is_active ?? profile.active ?? true;
    if (!profileIsActive) {
      return json(403, { error: "Inactive user" });
    }
    if (profile.role !== "admin") {
      return json(403, { error: "Insufficient permissions" });
    }

    const body = (await req.json()) as ResetPayload;
    const userId = String(body.userId ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!userId) {
      return json(400, { error: "userId is required" });
    }
    if (password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters" });
    }

    const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) {
      return json(400, { error: error.message });
    }

    return json(200, {
      success: true,
      userId: data.user?.id ?? userId,
      message: "Password reset successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(500, { error: message });
  }
});
