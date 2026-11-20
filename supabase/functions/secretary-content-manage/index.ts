import { createClient } from "npm:@supabase/supabase-js@2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method!=="POST") return respond(405,{error:"Método não permitido."});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return respond(401,{error:"Sessão necessária."});
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service) return respond(503,{error:"Serviço não configurado."});
  const auth=createClient(url,anon);
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return respond(401,{error:"Sessão inválida."});
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return respond(400,{error:"Pedido inválido."});}
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from("site_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="active") return respond(403,{error:"Sem autorização para esta área."});
  const owner=member.role==="owner";
  const can=async(module:string,action:string)=>{
    if(owner) return true;
    const {data,error}=await admin.from("site_member_permissions").select("id").eq("user_id",user.id).eq("module",module).eq("action",action).maybeSingle();
    return !error&&!!data;
  };
  const hasHttps=(v:unknown)=>typeof v==="string"&&v.length<=1000&&/^https:\/\//i.test(v);
  const audit=async(action:string,type:string,id:string,details:Record<string,unknown>={})=>{
    await admin.from("secretary_audit_logs").insert({actor_id:user.id,action,target_type:type,target_id:id,details});
  };

  if(body.action==="product_create"||body.action==="product_update"){
    const updating=body.action==="product_update";
    const required=updating?"edit":"create";
    if(!await can("store",required)) return respond(403,{error:"Não tens permissão para gerir livros da loja."});
    const title=String(body.title||"").trim(),description=String(body.description||"").trim();
    const price=Number(body.price),format=body.format,currency=body.currency||"AOA";
    if(title.length<2||title.length>180||description.length>1200||!Number.isFinite(price)||price<0||
      !["Digital","Físico"].includes(String(format))||!["AOA","USD","EUR"].includes(String(currency))||
      (body.cover_url&&!hasHttps(body.cover_url))){
      return respond(400,{error:"Dados do livro inválidos. Usa preço não negativo e ligações HTTPS."});
    }
    const active=body.active===true;
    if(active&&!await can("store","publish")) return respond(403,{error:"A publicação de livros não está autorizada para este perfil."});
    const payload={title,description,price,currency,format,cover_url:body.cover_url||null,active,
      digital_file_path:typeof body.digital_file_path==="string"&&body.digital_file_path.length<=500?body.digital_file_path:null};
    if(updating){
      const id=String(body.id||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)) return respond(400,{error:"Identificador do livro inválido."});
      const {data,error}=await admin.from("store_products").update(payload).eq("id",id).select("id").maybeSingle();
      if(error||!data) return respond(500,{error:"Não foi possível actualizar o livro."});
      await audit("store_product_updated","store_product",id,{active});
      return respond(200,{success:true,id});
    }
    const {data,error}=await admin.from("store_products").insert(payload).select("id").single();
    if(error||!data) return respond(500,{error:"Não foi possível criar o livro."});
    await audit("store_product_created","store_product",data.id,{active});
    return respond(200,{success:true,id:data.id});
  }

  if(body.action==="work_create"||body.action==="work_update"){
    const updating=body.action==="work_update";
    if(!await can("works",updating?"edit":"create")) return respond(403,{error:"Não tens permissão para gerir publicações."});
    const title=String(body.title||"").trim(),description=String(body.description||"").trim(),category=String(body.category||"").trim();
    const status=String(body.status||"draft");
    if(title.length<2||title.length>250||description.length>5000||category.length<2||category.length>120||
      !["draft","published","archived"].includes(status)||
      (body.url&&!hasHttps(body.url))||
      (body.file_path&&(typeof body.file_path!=="string"||body.file_path.length>500||body.file_path.includes("..")))){
      return respond(400,{error:"Dados da publicação inválidos."});
    }
    if(status==="published"&&!await can("works","publish")) return respond(403,{error:"Não tens permissão para publicar este conteúdo."});
    const payload={title,description,category,status,url:body.url||'',file_path:body.file_path||''};
    if(updating){
      const id=String(body.id||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)) return respond(400,{error:"Identificador da publicação inválido."});
      const {data,error}=await admin.from("works").update(payload).eq("id",id).select("id").maybeSingle();
      if(error||!data) return respond(500,{error:"Não foi possível actualizar a publicação."});
      await audit("work_updated","work",id,{status});
      return respond(200,{success:true,id});
    }
    const {data,error}=await admin.from("works").insert(payload).select("id").single();
    if(error||!data) return respond(500,{error:"Não foi possível criar a publicação."});
    await audit("work_created","work",data.id,{status});
    return respond(200,{success:true,id:data.id});
  }

  if(body.action==="answer_question"){
    if(!await can("questions","answer")) return respond(403,{error:"Não tens permissão para responder a perguntas."});
    const id=String(body.id||""),answer=String(body.answer||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(id)||answer.length>2000) return respond(400,{error:"Resposta inválida."});
    const {data,error}=await admin.from("site_questions").update({answer:answer||null}).eq("id",id).select("id").maybeSingle();
    if(error||!data) return respond(500,{error:"Não foi possível guardar a resposta."});
    await audit("question_answered","site_question",id,{answered:!!answer});
    return respond(200,{success:true,id});
  }

  if(body.action==="mark_order_delivered"){
    if(!await can("orders","update_status")) return respond(403,{error:"Não tens permissão para actualizar encomendas."});
    const id=String(body.id||"");
    if(!/^[0-9a-f-]{36}$/i.test(id)) return respond(400,{error:"Identificador inválido."});
    const {data:order,error:readError}=await admin.from("store_orders").select("status").eq("id",id).maybeSingle();
    if(readError||!order) return respond(404,{error:"Encomenda não encontrada."});
    if(order.status!=="confirmed") return respond(409,{error:"Só uma encomenda já confirmada pode ser marcada como entregue. Alterações financeiras exigem aprovação do proprietário."});
    const {error}=await admin.from("store_orders").update({status:"delivered"}).eq("id",id);
    if(error) return respond(500,{error:"Não foi possível actualizar a encomenda."});
    await audit("order_marked_delivered","store_order",id,{});
    return respond(200,{success:true,id});
  }

  return respond(400,{error:"Operação não reconhecida."});
});