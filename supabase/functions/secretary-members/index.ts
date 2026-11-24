import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowed = new Set([
  "catalog:read","catalog:create","catalog:update","catalog:publish",
  "publications:read","publications:create","publications:update","publications:publish",
  "orders:read",
  "questions:read",
  "tasks:read","tasks:create","tasks:update",
  "notifications:read",
  "messages:read","messages:send",
  "reports:read",
]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function fromB64(s: string) {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function toB64Url(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}
function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "Sessão necessária." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID");
  const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const encryptionSecret = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
  const fromEmail = Deno.env.get("GMAIL_FROM_EMAIL") || "davidlilianomanuelsassa@gmail.com";
  if (!url || !anon || !service) return response({ error: "Serviço de autenticação não configurado." }, 503);
  if (!gmailClientId || !gmailClientSecret || !encryptionSecret) {
    return response({ error: "O envio de convites pelo Gmail ainda não está configurado no Supabase." }, 503);
  }

  const auth = createClient(url, anon);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) return response({ error: "Sessão inválida." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner, error: ownerError } = await admin
    .from("site_members").select("role,status").eq("user_id", user.id).maybeSingle();
  if (ownerError || owner?.role !== "owner" || owner?.status !== "active") {
    return response({ error: "Apenas o proprietário pode gerir o acesso da secretaria." }, 403);
  }

  let body: {
    action?: string;
    email?: string;
    user_id?: string;
    permissions?: string[];
  };
  try { body = await req.json(); } catch { return response({ error: "Pedido inválido." }, 400); }

  if (body.action === "invite_assistant") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response({ error: "Endereço de e-mail inválido." }, 400);
    }
    if (email === String(user.email || "").toLowerCase()) {
      return response({ error: "Não podes convidar a tua própria conta como secretária." }, 400);
    }

    const siteUrl = (Deno.env.get("SECRETARIA_SITE_URL") || "https://sassa-hube.vercel.app").replace(/\/$/, "");
    let redirectOrigin: string;
    try {
      const parsed = new URL(siteUrl);
      if (parsed.protocol !== "https:" || parsed.hostname !== "sassa-hube.vercel.app") {
        return response({ error: "O endereço oficial do site não é válido." }, 503);
      }
      redirectOrigin = parsed.origin;
    } catch {
      return response({ error: "O endereço oficial do site não é válido." }, 503);
    }
    const redirectTo = redirectOrigin + "/redefinir-senha.html?next=secretaria-painel.html";

    let target: any = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return response({ error: "Não foi possível validar o e-mail indicado." }, 502);
      target = data.users.find(candidate => (candidate.email || "").toLowerCase() === email) || null;
      if (target || data.users.length < 1000) break;
    }

    const existingMemberResult = target
      ? await admin.from("site_members").select("role,status").eq("user_id", target.id).maybeSingle()
      : { data: null, error: null };
    if (existingMemberResult.error) return response({ error: "Não foi possível validar o perfil existente." }, 500);
    if (existingMemberResult.data?.role === "owner") {
      return response({ error: "Uma conta de proprietário não pode ser convertida em secretária." }, 409);
    }

    const linkType = target ? "magiclink" : "invite";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo },
    });
    if (linkError || !linkData?.user || !linkData?.properties?.action_link) {
      return response({ error: "Não foi possível gerar o link seguro. Confirma as configurações de Auth do Supabase." }, 502);
    }
    const targetId = linkData.user.id;
    const previousMember = existingMemberResult.data;
    const rollbackInvite = async () => {
      if (!previousMember) {
        await admin.from("site_member_permissions").delete().eq("user_id", targetId);
        await admin.from("site_members").delete().eq("user_id", targetId);
        if (!target) await admin.auth.admin.deleteUser(targetId);
      } else {
        await admin.from("site_members").update({ status: previousMember.status }).eq("user_id", targetId);
      }
    };
    const { error: memberError } = await admin.from("site_members").upsert({
      user_id: targetId, role: "assistant", status: "active", created_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (memberError) return response({ error: "Não foi possível activar o perfil da secretária." }, 500);

    const requested = Array.isArray(body.permissions) ? body.permissions : [];
    const permissions = [...new Set(requested.filter(p => typeof p === "string" && allowed.has(p)))];
    const { error: clearError } = await admin.from("site_member_permissions").delete().eq("user_id", targetId);
    if (clearError) {
      if (!previousMember) await admin.from("site_members").delete().eq("user_id", targetId);
      else await admin.from("site_members").update({ status: previousMember.status }).eq("user_id", targetId);
      return response({ error: "Não foi possível preparar as permissões da secretária." }, 500);
    }
    if (permissions.length) {
      const rows = permissions.map(value => {
        const [module, action] = value.split(":");
        return { user_id: targetId, module, action, granted_by: user.id };
      });
      const { error } = await admin.from("site_member_permissions").insert(rows);
      if (error) {
        if (!previousMember) await admin.from("site_members").delete().eq("user_id", targetId);
        else await admin.from("site_members").update({ status: previousMember.status }).eq("user_id", targetId);
        return response({ error: "Não foi possível guardar as permissões." }, 500);
      }
    }

    const safeEmail = email.replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));
    const safeActionLink = String(linkData.properties.action_link).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));
    const html = `<!doctype html><html lang="pt"><body style="font-family:Arial,sans-serif;color:#173b2d;line-height:1.6">
      <div style="max-width:560px;margin:24px auto;padding:28px;border:1px solid #e2e9e3;border-radius:16px">
      <h2 style="color:#19583f">Convite para a Secretaria — SASSA HUBE</h2>
      <p>O proprietário convidou este endereço para aceder ao painel individual da secretária:</p>
      <p><strong>${safeEmail}</strong></p>
      <p>Este convite já foi autorizado pelo proprietário. Não é necessária outra aprovação.</p>
      <p><a href="${safeActionLink}" style="display:inline-block;padding:13px 20px;background:#19583f;color:#fff;text-decoration:none;border-radius:8px">Aceitar convite e definir palavra-passe</a></p>
      <p>Depois de abrir o link, confirma o e-mail e define uma nova palavra-passe. A página irá encaminhar-te para o painel da secretária.</p>
      <p style="font-size:12px;color:#66786d">Se não esperavas este convite, ignora esta mensagem.</p>
      </div></body></html>`;
    const credentialResult = await admin.from("gmail_oauth_credentials")
      .select("refresh_token_ciphertext,refresh_token_iv").eq("id", 1).maybeSingle();
    if (credentialResult.error || !credentialResult.data) {
      await rollbackInvite();
      return response({ error: "A conta Gmail do administrador ainda não está ligada. Liga o Gmail no painel e tenta novamente." }, 503);
    }
    let keyBytes: Uint8Array;
    let refreshToken: string;
    try {
      keyBytes = fromB64(encryptionSecret);
      if (keyBytes.length !== 32) throw new Error("bad encryption key");
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64(credentialResult.data.refresh_token_iv) },
        key, fromB64(credentialResult.data.refresh_token_ciphertext),
      );
      refreshToken = new TextDecoder().decode(plain);
    } catch {
      await rollbackInvite();
      return response({ error: "Não foi possível ler a autorização Gmail guardada. Liga novamente a conta Gmail." }, 503);
    }
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: gmailClientId, client_secret: gmailClientSecret,
        refresh_token: refreshToken, grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      await rollbackInvite();
      return response({ error: "A autorização Gmail expirou ou foi revogada. Liga novamente o Gmail no painel." }, 503);
    }
    const subject = "Convite autorizado — Secretaria SASSA HUBE";
    const textBody = `Convite para a Secretaria — SASSA HUBE\\n\\nO proprietário convidou ${email} para aceder ao painel individual da secretária.\\nEste convite já foi autorizado pelo proprietário. Não é necessária outra aprovação.\\n\\nAceitar convite e definir palavra-passe: ${String(linkData.properties.action_link)}\\n\\nSe não esperavas este convite, ignora esta mensagem.`;
    const mime = [
      `From: Sassa Hube <${fromEmail}>`,
      `To: ${email}`,
      `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset=UTF-8',
      "Content-Transfer-Encoding: base64",
      "",
      base64Utf8(html),
    ].join("\\r\\n");
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: toB64Url(new TextEncoder().encode(mime)) }),
    });
    if (!gmailResponse.ok) {
      const detail = (await gmailResponse.text()).slice(0, 350);
      await rollbackInvite();
      console.error("Gmail secretary invitation failed:", detail);
      return response({ error: "O Gmail não conseguiu enviar o convite. O perfil não foi autorizado por este envio; verifica a ligação Gmail e tenta novamente." }, 502);
    }

    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: target ? "assistant_invite_resent" : "assistant_invited",
      target_type: "site_member", target_id: targetId,
      details: { email, permissions, auth_flow: linkType, email_provider: "gmail" },
    });
    return response({ success: true, user_id: targetId, status: "active", existing_account: Boolean(target) }, 201);
  }

  if (body.action === "set_permissions") {
    const id = String(body.user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Array.isArray(body.permissions)) {
      return response({ error: "Utilizador ou permissões inválidas." }, 400);
    }
    const { data: member } = await admin.from("site_members").select("role").eq("user_id", id).maybeSingle();
    if (!member || member.role !== "assistant") return response({ error: "Assistente não encontrada." }, 404);
    const values = [...new Set(body.permissions.filter(p => typeof p === "string"))];
    if (values.some(p => !allowed.has(p))) return response({ error: "A lista contém permissões não autorizadas." }, 400);
    const { error: deleteError } = await admin.from("site_member_permissions").delete().eq("user_id", id);
    if (deleteError) return response({ error: "Não foi possível actualizar as permissões." }, 500);
    if (values.length) {
      const rows = values.map(value => {
        const [module, action] = value.split(":");
        return { user_id: id, module, action, granted_by: user.id };
      });
      const { error } = await admin.from("site_member_permissions").insert(rows);
      if (error) return response({ error: "Não foi possível guardar as permissões." }, 500);
    }
    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: "assistant_permissions_updated",
      target_type: "site_member", target_id: id,
      details: { permissions: values },
    });
    return response({ success: true });
  }

  if (body.action === "suspend_assistant" || body.action === "reactivate_assistant") {
    const id = String(body.user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response({ error: "Utilizador inválido." }, 400);
    const { data: member } = await admin.from("site_members").select("role").eq("user_id", id).maybeSingle();
    if (!member || member.role !== "assistant") return response({ error: "Assistente não encontrada." }, 404);
    const status = body.action === "suspend_assistant" ? "suspended" : "active";
    const { error } = await admin.from("site_members").update({ status, updated_at: new Date().toISOString() }).eq("user_id", id);
    if (error) return response({ error: "Não foi possível alterar o estado." }, 500);
    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: status === "active" ? "assistant_reactivated" : "assistant_suspended",
      target_type: "site_member", target_id: id, details: {},
    });
    return response({ success: true, status });
  }

  return response({ error: "Acção não reconhecida." }, 400);
});
