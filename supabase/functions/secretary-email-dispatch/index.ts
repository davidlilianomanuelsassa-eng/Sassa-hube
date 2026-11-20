import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"},
});

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return reply({error:"Método não permitido."},405);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return reply({error:"Sessão necessária."},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("SECRETARIA_FROM_EMAIL");
  if(!url||!anon||!service) return reply({error:"Serviço não configurado."},503);
  if(!apiKey||!from) return reply({error:"O envio de e-mail ainda não está configurado."},503);
  const auth=createClient(url,anon);
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user) return reply({error:"Sessão inválida."},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(member?.role!=="owner"||member.status!=="active") return reply({error:"Apenas o proprietário pode processar a fila de e-mails."},403);

  const {data:pending,error:queueError}=await admin.from("secretary_email_outbox")
    .select("id,recipient_email,subject,html_body,attempts")
    .in("status",["pending","failed"]).lt("attempts",5)
    .order("created_at",{ascending:true}).limit(20);
  if(queueError) return reply({error:"Não foi possível consultar a fila."},500);
  let sent=0,failed=0;
  for(const mail of pending||[]){
    const result=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({from,to:[mail.recipient_email],subject:mail.subject,html:mail.html_body}),
    });
    if(result.ok){
      await admin.from("secretary_email_outbox").update({
        status:"sent",attempts:mail.attempts+1,last_error:null,sent_at:new Date().toISOString(),
      }).eq("id",mail.id);
      sent++;
    }else{
      const detail=(await result.text()).slice(0,400);
      await admin.from("secretary_email_outbox").update({
        status:"failed",attempts:mail.attempts+1,last_error:detail,
      }).eq("id",mail.id);
      failed++;
    }
  }
  return reply({success:true,processed:(pending||[]).length,sent,failed});
});
