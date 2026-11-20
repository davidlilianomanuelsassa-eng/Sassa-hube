import { createClient } from "npm:@supabase/supabase-js@2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method!=="POST") return respond(405,{error:"Método não permitido."});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return respond(401,{error:"Sessão necessária."});
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resend=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("SECRETARY_FROM_EMAIL"),siteUrl=Deno.env.get("SECRETARY_SITE_URL");
  if(!url||!anon||!service) return respond(503,{error:"Serviço não configurado."});
  if(!resend||!from||!siteUrl) return respond(503,{error:"Notificação por e-mail ainda não configurada. A notificação interna continua disponível."});
  let body:{approval_id?:string};
  try{body=await req.json();}catch{return respond(400,{error:"Pedido inválido."});}
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!body.approval_id||!uuid.test(body.approval_id)) return respond(400,{error:"Pedido de aprovação inválido."});
  const auth=createClient(url,anon);
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return respond(401,{error:"Sessão inválida."});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="active") return respond(403,{error:"Sem autorização."});
  const {data:request,error:requestError}=await admin.from("secretary_approval_requests").select("id,action_key,reason,status,requested_by").eq("id",body.approval_id).maybeSingle();
  if(requestError||!request||request.status!=="pending"||request.requested_by!==user.id) return respond(404,{error:"Pedido pendente não encontrado."});
  const {data:owners,error:ownersError}=await admin.from("site_members").select("user_id").eq("role","owner").eq("status","active").limit(1);
  if(ownersError||!owners?.length) return respond(500,{error:"Proprietário não encontrado."});
  const {data:owner,error:ownerError}=await admin.auth.admin.getUserById(owners[0].user_id);
  if(ownerError||!owner?.user?.email) return respond(500,{error:"E-mail do proprietário indisponível."});
  const panelUrl=new URL("secretaria.html",siteUrl).toString();
  const textBody=[
    "Foi recebido um pedido de aprovação no Campo da Secretaria.",
    "",
    "Acção: "+request.action_key,
    "Justificação: "+request.reason,
    "",
    "Para rever o pedido, entra na tua conta e abre o painel privado:",
    panelUrl,
    "",
    "Por segurança, a aprovação só pode ser feita dentro do painel autenticado. Não respondas a este e-mail para aprovar."
  ].join("\n");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"Authorization":"Bearer "+resend,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[owner.user.email],subject:"SASSA HUBE — pedido de aprovação",text:textBody})
  });
  if(!response.ok) return respond(502,{error:"O pedido foi registado, mas o e-mail não foi enviado. Verifica o remetente e a chave do serviço de e-mail."});
  return respond(200,{success:true});
});