import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method!=="POST") return respond(405,{error:"Método não permitido."});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return respond(401,{error:"Sessão necessária."});
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service) return respond(503,{error:"Serviço não configurado."});
  const auth=createClient(url,anon);
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return respond(401,{error:"Sessão inválida."});
  let body:{task_id?:string;status?:string};
  try{body=await req.json();}catch{return respond(400,{error:"Pedido inválido."});}
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowedStatus=["open","in_progress","blocked","done"];
  if(!body.task_id||!uuid.test(body.task_id)||!allowedStatus.includes(body.status||"")) return respond(400,{error:"Tarefa ou estado inválido."});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="active") return respond(403,{error:"Sem autorização."});
  const {data:task,error:taskError}=await admin.from("secretary_tasks").select("created_by,assigned_to").eq("id",body.task_id).maybeSingle();
  if(taskError||!task) return respond(404,{error:"Tarefa não encontrada."});
  const owner=member.role==="owner";
  if(!owner){
    const {data:permission,error:permissionError}=await admin.from("site_member_permissions").select("user_id").eq("user_id",user.id).eq("module","tasks").eq("action","update").maybeSingle();
    if(permissionError||!permission) return respond(403,{error:"Este perfil não tem permissão para actualizar tarefas."});
  }
  if(!owner && task.created_by!==user.id && task.assigned_to!==user.id) return respond(403,{error:"Não podes alterar esta tarefa."});
  const {error:updateError}=await admin.from("secretary_tasks").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",body.task_id);
  if(updateError) return respond(500,{error:"Não foi possível actualizar a tarefa."});
  await admin.from("secretary_audit_logs").insert({actor_id:user.id,action:"task_status_updated",target_type:"secretary_task",target_id:body.task_id,details:{status:body.status}});
  return respond(200,{success:true});
});