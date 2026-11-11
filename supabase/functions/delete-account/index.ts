
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: object, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Server configuration incomplete");
      return jsonResponse({ error: "Server configuration incomplete" }, 500);
    }

    // Verify the user's session.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    // Create admin client securely on the server.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // List the user's receipt files.
    const { data: receiptFiles, error: listError } =
      await adminClient.storage
        .from("receipts")
        .list(user.id, { limit: 1000 });

    if (listError) {
      console.error("Receipt listing failed:", listError.message);
      return jsonResponse({
        error: "Could not list private receipts",
      }, 500);
    }

    // Remove the user's receipt files.
    if (receiptFiles?.length) {
      const paths = receiptFiles
        .filter((file) => file.id && file.name)
        .map((file) => `${user.id}/${file.name}`);

      if (paths.length > 0) {
        const { error: removeError } = await adminClient.storage
          .from("receipts")
          .remove(paths);

        if (removeError) {
          console.error("Receipt removal failed:", removeError.message);
          return jsonResponse({
            error: "Could not remove private receipts",
          }, 500);
        }
      }
    }

    // Delete the user's authentication account.
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);
      return jsonResponse({
        error: "Account deletion failed",
      }, 400);
    }

    return jsonResponse({
      success: true,
      message: "Account deleted successfully",
    });

  } catch (error) {
    console.error("Unexpected error:", error);

    return jsonResponse({
      error: "Internal server error",
    }, 500);
  }
});
