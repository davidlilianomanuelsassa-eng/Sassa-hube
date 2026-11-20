import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PERMISSIONS = [
  ["library","view"],["library","create"],["library","edit"],["library","publish"],
  ["store","view"],["store","create"],["store","edit"],["store","publish"],
  ["orders","view"],["orders","update_status"],
  ["works","view"],["works","create"],["works","edit"],["works","publish"],
  ["questions","view"],["questions","answer"],
  ["tasks","view"],["tasks","create"],["tasks","update"],
  ["messages","view"],["messages","send"],
  ["notifications","view"],["reports","view"],
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return respond(405, { error: "Método não permitido." });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return respond(401, { error: "Sessão necessária." });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return respond(503, { error: "Serviço não configurado." });

  const auth = createClient(url, anon);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) return respond(401, { error: "Sessão inválida." });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner, error: ownerError } = await admin
    .from("site_members").select("role,status").eq("user_id", user.id).maybeSingle();
  if (ownerError || owner?.role !== "owner" || owner.status !== "active") {
    return respond(403, { error: "Apenas o proprietário pode gerir o acesso da secretaria." });
  }

  let body: { action?: string; user_id?: string; permissions?: string[][] };
  try { body = await req.json(); } catch { return respond(400, { error: "Pedido inválido." }); }

  if (body.action === "approve_assistant") {
    const targetId = body.user_id || "";
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(targetId) || targetId === user.id) return respond(400, { error: "Conta de assistente inválida." });

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetId);
    if (targetError || !target?.user || !target.user.email_confirmed_at) {
      return respond(400, { error: "A conta precisa existir e ter o e-mail confirmado antes da aprovação." });
    }
    const { data: existing, error: existingError } = await admin.from("site_members").select("role").eq("user_id", targetId).maybeSingle();
    if (existingError || existing?.role === "owner") return respond(409, { error: "Esta conta não pode ser aprovada como assistente." });

    const { error: memberError } = await admin.from("site_members").upsert({
      user_id: targetId, role: "assistant", status: "active", created_by: user.id, updated_at: new Date().toISOString(),
    });
    if (memberError) return respond(409, { error: "Não foi possível aprovar. Verifica se já existe uma assistente activa." });

    const { error: permissionError } = await admin.from("site_member_permissions").upsert(
      DEFAULT_PERMISSIONS.map(([module, action]) => ({ user_id: targetId, module, action, granted_by: user.id })),
      { onConflict: "user_id,module,action" },
    );
    if (permissionError) {
      await admin.from("site_members").update({ status: "suspended" }).eq("user_id", targetId);
      return respond(500, { error: "Não foi possível configurar as permissões; o acesso foi suspenso por segurança." });
    }
    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: "assistant_approved", target_type: "site_member", target_id: targetId,
      details: { permission_count: DEFAULT_PERMISSIONS.length },
    });
    await admin.from("secretary_notifications").insert({
      recipient_id: targetId, notification_type: "access_approved", title: "Acesso aprovado",
      body: "O proprietário aprovou o teu acesso ao Campo da Secretaria.", href: "secretaria.html",
    });
    return respond(200, { success: true, permission_count: DEFAULT_PERMISSIONS.length });
  }

  if (body.action === "suspend_assistant") {
    const targetId = body.user_id || "";
    const { data: target, error } = await admin.from("site_members").select("role").eq("user_id", targetId).maybeSingle();
    if (error || target?.role !== "assistant") return respond(404, { error: "Assistente não encontrada." });
    const { error: updateError } = await admin.from("site_members").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("user_id", targetId);
    if (updateError) return respond(500, { error: "Não foi possível suspender o acesso." });
    await admin.from("secretary_audit_logs").insert({ actor_id: user.id, action: "assistant_suspended", target_type: "site_member", target_id: targetId, details: {} });
    return respond(200, { success: true });
  }

  if (body.action === "set_permissions") {
    const targetId = body.user_id || "";
    const { data: target, error } = await admin.from("site_members").select("role,status").eq("user_id", targetId).maybeSingle();
    if (error || target?.role !== "assistant" || target.status !== "active") return respond(404, { error: "Assistente activa não encontrada." });
    if (!Array.isArray(body.permissions) || body.permissions.length > 40) return respond(400, { error: "Lista de permissões inválida." });
    const allowed = new Set(DEFAULT_PERMISSIONS.map(([m,a]) => m + ":" + a));
    const requested = body.permissions;
    if (requested.some(pair => !Array.isArray(pair) || pair.length !== 2 || !allowed.has(pair[0] + ":" + pair[1]))) {
      return respond(400, { error: "A lista contém uma permissão não permitida." });
    }
    const { error: deleteError } = await admin.from("site_member_permissions").delete().eq("user_id", targetId);
    if (deleteError) return respond(500, { error: "Não foi possível actualizar as permissões." });
    if (requested.length) {
      const { error: insertError } = await admin.from("site_member_permissions").insert(
        requested.map(([module,action]) => ({ user_id: targetId, module, action, granted_by: user.id })),
      );
      if (insertError) return respond(500, { error: "Não foi possível gravar a nova lista de permissões." });
    }
    await admin.from("secretary_audit_logs").insert({
      actor_id: user.id, action: "assistant_permissions_updated", target_type: "site_member", target_id: targetId,
      details: { permission_count: requested.length },
    });
    return respond(200, { success: true, permission_count: requested.length });
  }

  return respond(400, { error: "Acção não reconhecida." });
});
