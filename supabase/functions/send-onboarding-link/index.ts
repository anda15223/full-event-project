import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function randomToken(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { employee_profile_id, app_url } = await req.json();
    if (!employee_profile_id) {
      return new Response(JSON.stringify({ error: "employee_profile_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: profile, error: updErr } = await supabase
      .from("fep_employee_profile")
      .update({ magic_token: token, magic_token_expires_at: expiresAt })
      .eq("id", employee_profile_id)
      .select("id, email, festival_staff_id")
      .maybeSingle();

    if (updErr || !profile) {
      return new Response(JSON.stringify({ error: updErr?.message || "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = app_url || req.headers.get("origin") || "https://my-gh-key-door.lovable.app";
    const link = `${base.replace(/\/$/, "")}/onboard/${token}`;

    // Email sending: FEP doesn't have a transactional email service configured.
    // Return the link so admin can copy-paste. Future: wire to Resend/Lovable Emails.
    const emailed = false;

    return new Response(
      JSON.stringify({ token, link, emailed, email: profile.email ?? null,
        note: emailed ? null : "No email service configured — copy link manually." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
