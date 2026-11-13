const cors = {
  "Access-Control-Allow-Origin": "https://davidlilianomanuelsassa-eng.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function fromB64(s: string) {
  const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function toB64Url(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")!;
  const encryptionSecret = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY")!;
  const fromEmail = Deno.env.get("GMAIL_FROM_EMAIL") || "davidlilianomanuelsassa@gmail.com";
  if (!url || !serviceKey || !clientId || !clientSecret || !encryptionSecret) {
    return json({ error: "O serviço de e-mail ainda não está configurado." }, 503);
  }

  let body: { order_id?: string; access_code?: string };
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
  if (!body.order_id || !body.access_code || body.access_code.length > 200) {
    return json({ error: "Dados da encomenda incompletos." }, 400);
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const orderResponse = await fetch(
    `${url}/rest/v1/store_orders?id=eq.${encodeURIComponent(body.order_id)}&select=id,product_title,format,price,currency,buyer_name,buyer_email,status,access_code_hash,email_sent_at&limit=1`,
    { headers },
  );
  const orders = await orderResponse.json();
  if (!orderResponse.ok || !Array.isArray(orders) || orders.length !== 1) {
    return json({ error: "Encomenda não encontrada." }, 404);
  }
  const order = orders[0];
  const submittedHash = hex(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(body.access_code),
  )));
  if (!order.access_code_hash || submittedHash !== order.access_code_hash) {
    return json({ error: "Código de acesso inválido." }, 403);
  }
  if (!order.buyer_email) return json({ error: "A encomenda não tem e-mail de destinatário." }, 400);
  if (order.email_sent_at) return json({ sent: true, already_sent: true });
  if (!["pending", "confirmed", "free_delivered", "delivered"].includes(order.status)) {
    return json({ error: "O estado actual da encomenda não permite enviar o recibo." }, 409);
  }

  const credentialResponse = await fetch(
    `${url}/rest/v1/gmail_oauth_credentials?id=eq.1&select=refresh_token_ciphertext,refresh_token_iv&limit=1`,
    { headers },
  );
  const credentials = await credentialResponse.json();
  if (!credentialResponse.ok || !Array.isArray(credentials) || credentials.length !== 1) {
    return json({ error: "A conta Gmail ainda não foi ligada pelo administrador." }, 503);
  }

  let keyBytes: Uint8Array;
  try {
    const normalized = encryptionSecret.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    keyBytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  } catch { return json({ error: "Chave de cifragem inválida." }, 500); }
  if (keyBytes.length !== 32) return json({ error: "Chave de cifragem inválida." }, 500);

  let refreshToken: string;
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(credentials[0].refresh_token_iv) },
      key, fromB64(credentials[0].refresh_token_ciphertext),
    );
    refreshToken = new TextDecoder().decode(plain);
  } catch { return json({ error: "Não foi possível descifrar a autorização Gmail." }, 500); }

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const refreshed = await refreshResponse.json();
  if (!refreshResponse.ok || !refreshed.access_token) {
    return json({ error: "A autorização Gmail expirou. Liga novamente a conta no painel." }, 503);
  }

  const paid = Number(order.price) > 0;
  const digital = order.format === "Digital";
  const subject = `Sassa Hube — recibo da encomenda ${order.id}`;
  const statusText = paid
    ? "O pagamento está pendente de verificação. A encomenda só será disponibilizada após confirmação."
    : "Recebemos o teu pedido gratuito. A equipa Sassa Hube irá confirmar a disponibilização.";
  const codeHtml = digital
    ? `<p><b>Código de acesso:</b> ${escapeHtml(body.access_code)}</p><p>Guarda a referência e o código. O descarregamento só fica disponível depois da confirmação da encomenda.</p>`
    : "";
  const htmlBody = `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>SASSA HUBE</h2><p>Olá ${escapeHtml(order.buyer_name)}, recebemos a tua encomenda.</p><p><b>Livro:</b> ${escapeHtml(order.product_title)}</p><p><b>Referência:</b> ${escapeHtml(order.id)}</p>${codeHtml}<p>${statusText}</p><p>Aprender para Transformar.</p></div>`;
  const textBody = `SASSA HUBE\nOlá ${order.buyer_name}, recebemos a tua encomenda.\nLivro: ${order.product_title}\nReferência: ${order.id}\n${digital ? "Código de acesso: " + body.access_code + "\nGuarda os dados. O descarregamento só fica disponível depois da confirmação.\n" : ""}${statusText}\nAprender para Transformar.`;

  const mime = [
    `From: Sassa Hube <${fromEmail}>`,
    `To: ${order.buyer_email}`,
    `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="sassa_hube_boundary"',
    "",
    "--sassa_hube_boundary",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    base64Utf8(textBody),
    "--sassa_hube_boundary",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    base64Utf8(htmlBody),
    "--sassa_hube_boundary--",
    "",
  ].join("\r\n");

  const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${refreshed.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: toB64Url(new TextEncoder().encode(mime)) }),
  });
  if (!gmailResponse.ok) {
    return json({ error: "O Gmail não conseguiu enviar o recibo. A encomenda continua registada." }, 502);
  }

  await fetch(`${url}/rest/v1/store_orders?id=eq.${encodeURIComponent(order.id)}&email_sent_at=is.null`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ email_sent_at: new Date().toISOString() }),
  });
  return json({ sent: true });
});
