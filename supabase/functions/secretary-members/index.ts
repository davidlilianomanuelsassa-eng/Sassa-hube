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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "Sessão necessária." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return response({ error: "Serviço não configurado." }, 503);

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
    const siteUrl = Deno.env.get("SECRETARIA_SITE_URL");
    if (!siteUrl || !/^https:\/\//.test(siteUrl)) {
      return response({ error: "Endereço oficial do site ainda não configurado." }, 503);
    }
    if (email === String(user.email || "").toLowerCase()) return response({ error: "Não podes convidar a tua própria conta como assistente." }, 400);
    const { data: existingUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return response({ error: "Não foi possível validar a conta indicada." }, 502);
    const existingUser = existingUsers.users.find(candidate => (candidate.email || "").toLowerCase() === email);
    if (existingUser) {
      const { data: existingMember } = await admin.from("site_members").select("role").eq("user_id", existingUser.id).maybeSingle();
      if (existingMember?.role === "owner") return response({ error: "Uma conta de proprietário não pode ser convertida em assistente." }, 409);
      return response({ error: "Este e-mail já está registado. Usa o processo de aprovação de uma conta existente." }, 409);
    }
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: siteUrl.replace(/\/$/, "") + "/secretaria.html",
    });
    if (inviteError || !invitation.user) {
      return response({ error: "Não foi possível enviar o convite. Verifica a configuração de e-mail do Supabase Auth." }, 502);
    }
    const { error: memberError } = await admin.from("site_members").upsert({
      user_id: invitation.user.id,
      role: "assistant",
      status: "active",
      created_by: user.id,
    });
    if (memberError) return response({ error: "Convite criado, mas não foi possível activar o perfil. Contacta o suporte técnico." }, 500);

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const valid = [...new Set(permissions.filter(p => typeof p === "string" && allowed.has(p)))];
    if (valid.length) {
      const rows = valid.map(value => {
        const [module, action] = value.split(":");
        return { user_id: invitation.user.id, module, action, granted_by: user.id };
      });
      const { error } = await admin.from("site_member_permissions").upsert(rows, { onConflict: "user_id,module,action" });
      if (error) return response({ error: "Perfil criado, mas não foi possível aplicar todas as permissões. Revê o painel de membros." }, 500);
    }
    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: "assistant_invited",
      target_type: "site_member", target_id: invitation.user.id,
      details: { permissions: valid },
    });
    return response({ success: true, user_id: invitation.user.id, status: "active" }, 201);
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
