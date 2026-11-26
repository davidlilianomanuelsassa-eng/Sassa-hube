import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PERMISSIONS = [
  ["library","view"],["library","create"],["library","edit"],["library","publish"],
  ["store","view"],["store","create"],["store","edit"],["store","publish"],
  ["orders","view"],["orders","update_status"],
  ["works","view"],["works","create"],["works","edit"],["works","publish"],
  ["questions","view"],["questions","answer"],
  ["tasks","view"],["tasks","create"],["tasks","update"],
  ["messages","view"],["messages","send"],["notifications","view"],["reports","view"],
];
const response = (status:number, body:Record<string,unknown>) =>
  new Response(JSON.stringify(body), {status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async (req:Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return response(405,{error:"Método não permitido."});
  const url=Deno.env.get("SUPABASE_URL");
  const anon=Deno.env.get("SUPABASE_ANON_KEY");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !anon || !service) return response(503,{error:"Serviço temporariamente indisponível."});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:Record<string,unknown>;
  try { body=await req.json(); } catch { return response(400,{error:"Pedido inválido."}); }

  if(body.action==="signup"){
    const fullName=String(body.full_name||"").trim();
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    const existingAccount=body.existing_account===true;
    if(fullName.length<3 || fullName.length>120) return response(400,{error:"Indica o nome completo (3 a 120 caracteres)."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return response(400,{error:"Indica um e-mail válido."});
    if(password.length<1 || password.length>128 || (!existingAccount && password.length<10)) return response(400,{error:"A palavra-passe deve ter pelo menos 10 caracteres para uma conta nova."});

    const loginClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    let userId:string|null=null;
    let createdNew=false;

    if(existingAccount){
      const {data:loginData,error:loginError}=await loginClient.auth.signInWithPassword({email,password});
      if(loginError || !loginData.user) return response(401,{error:"Não foi possível validar a conta. Confirma o e-mail e a palavra-passe actual."});
      userId=loginData.user.id;
    }else{
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email,password,email_confirm:true,user_metadata:{full_name:fullName,account_request:"secretary"}
      });
      if(created?.user){
        userId=created.user.id;
        createdNew=true;
      }else{
        // Existing Auth accounts must verify ownership with their current password.
        const {data:loginData,error:loginError}=await loginClient.auth.signInWithPassword({email,password});
        if(loginError || !loginData.user){
          console.error("Secretary signup createUser:",createError?.message);
          return response(409,{error:"Não foi possível criar a conta. Se já tens conta, selecciona «Já tenho conta» e usa a palavra-passe actual."});
        }
        userId=loginData.user.id;
      }
    }
    if(!userId) return response(500,{error:"Não foi possível identificar a conta."});

    const {data:member,error:memberError}=await admin.from("site_members").select("role,status").eq("user_id",userId).maybeSingle();
    if(memberError) return response(500,{error:"Não foi possível verificar o estado do acesso."});
    if(member?.role==="owner" && member.status==="active") return response(403,{error:"Esta conta é do proprietário; entra pelo painel administrativo."});
    if(member?.role==="assistant" && member.status==="active"){
      return response(200,{success:true,already_active:true,message:"Esta conta já tem acesso aprovado ao Campo da Secretaria. Entra no painel com a palavra-passe actual."});
    }

    const {data:oldRequest,error:oldRequestError}=await admin.from("secretary_signup_requests")
      .select("id,status").eq("user_id",userId).maybeSingle();
    if(oldRequestError) return response(500,{error:"Não foi possível consultar o pedido anterior."});
    if(oldRequest?.status==="pending"){
      return response(200,{success:true,already_pending:true,message:"Já existe um pedido pendente para esta conta. Aguarda a análise do proprietário."});
    }
    if(oldRequest?.status==="approved"){
      return response(403,{error:"O pedido já foi aprovado, mas o acesso está suspenso. Contacta o proprietário para reactivar a conta."});
    }

    let insertError=null;
    if(oldRequest?.status==="rejected"){
      const result=await admin.from("secretary_signup_requests").update({
        full_name:fullName,email,status:"pending",reviewed_by:null,reviewed_at:null,review_note:null
      }).eq("id",oldRequest.id).eq("status","rejected");
      insertError=result.error;
    }else{
      const result=await admin.from("secretary_signup_requests").insert({
        user_id:userId,full_name:fullName,email,status:"pending"
      });
      insertError=result.error;
    }
    if(insertError){
      if(createdNew) await admin.auth.admin.deleteUser(userId);
      console.error("Secretary signup request:",insertError.message);
      return response(500,{error:"Não foi possível guardar o pedido. Tenta novamente."});
    }
    const {data:owners}=await admin.from("site_members").select("user_id").eq("role","owner").eq("status","active");
    if(owners?.length) await admin.from("secretary_notifications").insert(owners.map(o=>({
      recipient_id:o.user_id,notification_type:"secretary_signup",title:"Novo pedido para a Secretaria",
      body:fullName+" ("+email+") pediu acesso ao Campo da Secretaria.",href:"aprovar-secretaria.html"
    })));
    return response(201,{success:true,message:"Pedido recebido. O acesso só será activado depois da aprovação do proprietário."});
  }

const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return response(401,{error:"Inicia sessão como proprietário."});
  const auth=createClient(url,anon);
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError || !user) return response(401,{error:"Sessão inválida."});
  const {data:owner,error:ownerError}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(ownerError || owner?.role!=="owner" || owner.status!=="active") return response(403,{error:"Apenas o proprietário pode gerir os pedidos."});

  if(body.action==="list"){
    const {data,error}=await admin.from("secretary_signup_requests").select("id,user_id,full_name,email,status,created_at,reviewed_at,review_note").order("created_at",{ascending:false}).limit(100);
    if(error) return response(500,{error:"Não foi possível carregar os pedidos."});
    return response(200,{requests:data||[]});
  }

  if(body.action==="review"){
    const id=String(body.request_id||"");
    const decision=String(body.decision||"");
    if(!/^[0-9a-f-]{36}$/i.test(id) || !["approve","reject"].includes(decision)) return response(400,{error:"Decisão ou pedido inválido."});
    const {data:request,error:requestError}=await admin.from("secretary_signup_requests").select("id,user_id,full_name,email,status").eq("id",id).maybeSingle();
    if(requestError || !request) return response(404,{error:"Pedido não encontrado."});
    if(request.status!=="pending") return response(409,{error:"Este pedido já foi analisado."});
    if(decision==="reject"){
      const {error}=await admin.from("secretary_signup_requests").update({status:"rejected",reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
      if(error) return response(500,{error:"Não foi possível rejeitar o pedido."});
      await admin.from("secretary_audit_logs").insert({actor_id:user.id,action:"assistant_signup_rejected",target_type:"secretary_signup_request",target_id:id,details:{email:request.email}});
      return response(200,{success:true,status:"rejected"});
    }
    if(request.user_id===user.id) return response(400,{error:"Não podes aprovar a tua própria conta."});
    const {data:existing}=await admin.from("site_members").select("role").eq("user_id",request.user_id).maybeSingle();
    if(existing?.role==="owner") return response(409,{error:"Esta conta já pertence ao proprietário."});
    const {error:memberError}=await admin.from("site_members").upsert({
      user_id:request.user_id,role:"assistant",status:"active",created_by:user.id,updated_at:new Date().toISOString()
    });
    if(memberError) return response(500,{error:"Não foi possível activar o perfil da secretária."});
    const {error:permissionError}=await admin.from("site_member_permissions").upsert(
      PERMISSIONS.map(([module,action])=>({user_id:request.user_id,module,action,granted_by:user.id})),
      {onConflict:"user_id,module,action"}
    );
    if(permissionError){
      await admin.from("site_members").update({status:"suspended"}).eq("user_id",request.user_id);
      return response(500,{error:"As permissões não foram guardadas. O acesso ficou suspenso por segurança."});
    }
    const {error:reviewError}=await admin.from("secretary_signup_requests").update({
      status:"approved",reviewed_by:user.id,reviewed_at:new Date().toISOString()
    }).eq("id",id).eq("status","pending");
    if(reviewError){
      await admin.from("site_members").update({status:"suspended"}).eq("user_id",request.user_id);
      return response(500,{error:"Não foi possível concluir a aprovação. O acesso ficou suspenso."});
    }
    await admin.from("secretary_notifications").insert({
      recipient_id:request.user_id,notification_type:"access_approved",title:"Acesso aprovado",
      body:"O proprietário aprovou o teu acesso ao Campo da Secretaria.",href:"secretaria.html"
    });
    await admin.from("secretary_audit_logs").insert({actor_id:user.id,action:"assistant_signup_approved",target_type:"site_member",target_id:request.user_id,details:{email:request.email,permission_count:PERMISSIONS.length}});
    return response(200,{success:true,status:"approved"});
  }
  return response(400,{error:"Acção não reconhecida."});
});