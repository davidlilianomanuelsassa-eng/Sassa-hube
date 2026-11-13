const cors = {
  "Access-Control-Allow-Origin": "https://davidlilianomanuelsassa-eng.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("GMAIL_REDIRECT_URI") ||
    "https://qcdgtglayifhgwbgsfyi.supabase.co/functions/v1/gmail-oauth-callback";

  if (!url || !serviceKey || !anonKey || !clientId || !clientSecret) {
    return json({ error: "Faltam configurações secretas no Supabase." }, 500);
  }

  const bearer = req.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return json({ error: "Sessão administrativa necessária." }, 401);

  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: bearer },
  });
  if (!authResponse.ok) return json({ error: "Sessão inválida. Entra novamente no painel." }, 401);
  const user = await authResponse.json();

  const adminCheck = await fetch(
    `${url}/rest/v1/site_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const admins = await adminCheck.json();
  if (!adminCheck.ok || !Array.isArray(admins) || admins.length === 0) {
    return json({ error: "Esta conta não está autorizada como administradora." }, 403);
  }

  const random = crypto.getRandomValues(new Uint8Array(32));
  const state = b64url(random);
  const stateHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(state),
  )), b => b.toString(16).padStart(2, "0")).join("");

  const saveState = await fetch(`${url}/rest/v1/gmail_oauth_states`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ state_hash: stateHash, user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
  });
  if (!saveState.ok) return json({ error: "Não foi possível iniciar a autorização. Confirma a migração SQL." }, 500);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
});
