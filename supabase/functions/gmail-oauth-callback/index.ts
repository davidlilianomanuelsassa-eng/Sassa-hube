import { createClient } from "npm:@supabase/supabase-js@2";

const redirectPage = "https://davidlilianomanuelsassa-eng.github.io/Sassa-hube/gmail-connect.html";
const html = (message: string, ok = false) => new Response(
  `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sassa Hube — Gmail</title><body style="font:16px Arial,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#172033"><h1>SASSA HUBE</h1><h2>${ok ? "Gmail ligado" : "Não foi possível ligar o Gmail"}</h2><p>${message}</p><p>Podes fechar esta página e voltar ao painel Sassa Hube.</p></body></html>`,
  { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
);

function fromB64url(s: string) {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function toB64(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return html("Pedido inválido.");
  const incoming = new URL(req.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const googleError = incoming.searchParams.get("error");
  if (googleError) return html("A autorização foi cancelada ou recusada pelo Google.");
  if (!code || !state || state.length > 300) return html("Faltam dados de autorização.");

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")!;
  const encryptionSecret = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY")!;
  const redirectUri = Deno.env.get("GMAIL_REDIRECT_URI") ||
    "https://qcdgtglayifhgwbgsfyi.supabase.co/functions/v1/gmail-oauth-callback";

  if (!url || !serviceKey || !clientId || !clientSecret || !encryptionSecret) {
    return html("A configuração segura do servidor está incompleta.");
  }

  const stateHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(state),
  )), b => b.toString(16).padStart(2, "0")).join("");

  const stateResult = await fetch(
    `${url}/rest/v1/gmail_oauth_states?state_hash=eq.${stateHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const stateRows = await stateResult.json();
  if (!stateResult.ok || !Array.isArray(stateRows) || stateRows.length !== 1) {
    return html("A autorização expirou ou já foi utilizada. Inicia novamente no painel.");
  }
  const userId = stateRows[0].user_id;

  // Estado de utilização única: apagar antes da troca do código.
  await fetch(`${url}/rest/v1/gmail_oauth_states?state_hash=eq.${stateHash}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.refresh_token) {
    return html("O Google não devolveu um token de renovação. Remove a autorização antiga da conta Google e tenta novamente.");
  }

  let keyBytes: Uint8Array;
  try { keyBytes = fromB64url(encryptionSecret); }
  catch { return html("A chave de cifragem do servidor não está no formato correcto."); }
  if (keyBytes.length !== 32) return html("A chave de cifragem deve conter 32 bytes em Base64 URL-safe.");

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(tokenData.refresh_token),
  );
  const cipherText = toB64(new Uint8Array(encrypted));
  const ivText = toB64(iv);

  const save = await fetch(`${url}/rest/v1/gmail_oauth_credentials?id=eq.1`, {
    method: "POST",
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: 1, refresh_token_ciphertext: cipherText, refresh_token_iv: ivText,
      scope: tokenData.scope || "", connected_by: userId, updated_at: new Date().toISOString(),
    }),
  });
  if (!save.ok) return html("Não foi possível guardar a autorização. Confirma a migração SQL e as permissões.");
  return Response.redirect(redirectPage + "?status=connected", 302);
});
