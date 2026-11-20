import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return reply({error:"Método não permitido."},405);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return reply({error:"Sessão necessária."},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service) return reply({error:"Serviço não configurado."},503);
  const auth=createClient(url,anon),{data:{user},error}=await auth.auth.getUser(token);
  if(error||!user) return reply({error:"Sessão inválida."},401);
  let body:{message?:string};try{body=await req.json();}catch{return reply({error:"Pedido inválido."},400);}
  const message=String(body.message||"").trim();
  if(message.length<1||message.length>4000) return reply({error:"A mensagem deve ter entre 1 e 4.000 caracteres."},400);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(!member||member.status!=="active") return reply({error:"Acesso não autorizado."},403);
  const targetRole=member.role==="owner"?"assistant":"owner";
  const {data:target}=await admin.from("site_members").select("user_id").eq("role",targetRole).eq("status","active").limit(1).maybeSingle();
  if(!target) return reply({error:"Ainda não existe outro membro activo para receber a mensagem."},404);
  const {data:row,error:insertError}=await admin.from("secretary_messages").insert({
    sender_id:user.id,recipient_id:target.user_id,body:message,
  }).select("id").single();
  if(insertError||!row) return reply({error:"Não foi possível enviar a mensagem."},500);
  await admin.from("secretary_audit_logs").insert({
    actor_id:user.id,action:"secretary_message_sent",target_type:"message",target_id:row.id,details:{},
  });
  await admin.from("secretary_notifications").insert({
    recipient_id:target.user_id,notification_type:"new_message",title:"Nova mensagem privada",
    body:"Recebeste uma nova mensagem no Campo da Secretaria.",href:"secretaria.html",
  });
  return reply({success:true,message_id:row.id},201);
});
