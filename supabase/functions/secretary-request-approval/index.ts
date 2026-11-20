import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedActions = new Set([
  "delete_book","delete_publication","delete_document",
  "change_payment_settings","change_bank_details","change_integration",
  "change_global_settings","change_security_policy",
  "create_admin","change_ownership","financial_exception",
]);
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[ch]!));

async function sendPending(admin: ReturnType<typeof createClient>, id: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("SECRETARIA_FROM_EMAIL");
  if (!apiKey || !from) return "pending";
  const { data: mail } = await admin.from("secretary_email_outbox").select("*").eq("id",id).maybeSingle();
  if (!mail || mail.status==="sent") return mail?.status || "failed";
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[mail.recipient_email],subject:mail.subject,html:mail.html_body}),
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0,400);
    await admin.from("secretary_email_outbox").update({
      status:"failed",attempts:mail.attempts+1,last_error:message,
    }).eq("id",id);
    return "failed";
  }
  await admin.from("secretary_email_outbox").update({
    status:"sent",attempts:mail.attempts+1,last_error:null,sent_at:new Date().toISOString(),
  }).eq("id",id);
  return "sent";
}

Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return reply({error:"Método não permitido."},405);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return reply({error:"Sessão necessária."},401);
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service) return reply({error:"Serviço não configurado."},503);
  const auth=createClient(url,anon);
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return reply({error:"Sessão inválida."},401);
  let body:{action_key?:string;resource_type?:string;resource_id?:string;reason?:string};
  try{body=await req.json();}catch{return reply({error:"Pedido inválido."},400);}
  const action=String(body.action_key||"");
  const resource=String(body.resource_type||"").slice(0,80);
  const reason=String(body.reason||"").trim().slice(0,1200);
  if(!allowedActions.has(action)||resource.length<2||reason.length<5) return reply({error:"Tipo de operação, recurso ou justificação inválidos."},400);

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(!member||member.role!=="assistant"||member.status!=="active") return reply({error:"Apenas uma assistente activa pode submeter este pedido."},403);

  const {data:owner}=await admin.from("site_members").select("user_id").eq("role","owner").eq("status","active").limit(1).maybeSingle();
  if(!owner) return reply({error:"Proprietário não configurado."},503);
  const {data:ownerAuth}=await admin.auth.admin.getUserById(owner.user_id);
  const ownerEmail=ownerAuth.user?.email;
  if(!ownerEmail) return reply({error:"E-mail do proprietário não confirmado."},503);

  const {data:request,error:requestError}=await admin.from("secretary_approval_requests").insert({
    requested_by:user.id,action_key:action,resource_type:resource,
    resource_id:body.resource_id?String(body.resource_id).slice(0,160):null,
    reason,status:"pending",
  }).select("id").single();
  if(requestError||!request) return reply({error:"Não foi possível registar o pedido."},500);

  await admin.from("secretary_notifications").insert({
    recipient_id:owner.user_id,notification_type:"approval_request",
    title:"Novo pedido de aprovação",
    body:"A assistente submeteu um pedido: "+action+". Entra no painel para analisar.",
    href:"secretaria.html",
  });
  await admin.from("secretary_audit_logs").insert({
    actor_id:user.id,action:"secretary_approval_requested",
    target_type:resource,target_id:request.id,
    details:{action_key:action},
  });

  const siteUrl=(Deno.env.get("SECRETARIA_SITE_URL")||"").replace(/\/$/,"");
  const link=siteUrl+"/secretaria.html";
  const subject="SASSA HUBE — pedido de aprovação";
  const html="<p>Foi submetido um novo pedido de aprovação no Campo da Secretaria.</p>"+
    "<p><b>Operação:</b> "+escapeHtml(action)+"</p>"+
    "<p><b>Recurso:</b> "+escapeHtml(resource)+"</p>"+
    "<p><b>Justificação:</b> "+escapeHtml(reason)+"</p>"+
    '<p><a href="'+escapeHtml(link)+'">Abrir o painel autenticado</a></p>'+
    "<p>Por segurança, a aprovação só pode ser feita depois de iniciar sessão no painel.</p>";
  const {data:outbox}=await admin.from("secretary_email_outbox").insert({
    event_key:"approval-request:"+request.id,recipient_email:ownerEmail,
    subject,html_body:html,status:"pending",
  }).select("id").single();
  let emailStatus="pending";
  if(outbox?.id) emailStatus=await sendPending(admin,outbox.id);
  return reply({success:true,approval_id:request.id,email_status:emailStatus},201);
});
