const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();
const configured = window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.startsWith("COLOCA_AQUI") && !window.SUPABASE_ANON_KEY.startsWith("COLOCA_AQUI");
let db = null, currentCategory = "Todos", allWorks = [];

if (configured && window.supabase) db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
function msg(id, text, error=true){$(id).textContent=text;$(id).style.color=error?"#b33":"#18794e";}
function openModal(id){$(id).classList.remove("hidden");}
function closeModal(id){$(id).classList.add("hidden");}
$("adminOpen").onclick=()=>{if(!db){alert("Ainda falta ligar o Supabase. Segue o ficheiro LEIA-ME.");return;}openModal("loginModal");};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{closeModal("loginModal");closeModal("adminModal");});
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id);}));
document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{currentCategory=b.dataset.cat;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));renderWorks();});
$("search").addEventListener("input",renderWorks);
function iconFor(cat){return {"PDF e Word":"▤","PowerPoint":"▧","Imagens e cartazes":"▣","Vídeos":"▶","Outros ficheiros":"⌘"}[cat]||"▤";}
function renderWorks(){
 const q=$("search").value.toLowerCase();
 const filtered=allWorks.filter(w=>(currentCategory==="Todos"||w.category===currentCategory)&&(`${w.title} ${w.description||""}`).toLowerCase().includes(q));
 $("items").innerHTML="";
 $("status").textContent=filtered.length?`${filtered.length} trabalho(s) encontrado(s).`:"Ainda não existem trabalhos publicados nesta categoria.";
 filtered.forEach(w=>{const el=document.createElement("article");el.className="work-card";
  const icon=document.createElement("div");icon.className="file-symbol";icon.textContent=iconFor(w.category);
  const h=document.createElement("h3");h.textContent=w.title;
  const p=document.createElement("p");p.textContent=w.description||"Sem descrição adicional.";
  const meta=document.createElement("div");meta.className="work-meta";meta.textContent=w.category;
  const a=document.createElement("a");a.href=w.url;a.target="_blank";a.rel="noopener";a.textContent="Abrir / descarregar →";
  el.append(icon,h,p,meta,a);$("items").append(el);
 });
}
async function loadWorks(){
 if(!db){$("status").textContent="A plataforma está preparada. Liga o Supabase para começar a publicar.";return;}
 const {data,error}=await db.from("works").select("*").order("created_at",{ascending:false});
 if(error){$("status").textContent="Não foi possível carregar os trabalhos. Verifica a configuração e as políticas do Supabase.";return;}
 allWorks=data||[];renderWorks();
}
async function refreshAdmin(){
 const {data,error}=await db.from("works").select("*").order("created_at",{ascending:false});
 if(error){msg("adminMsg","Erro ao carregar a lista: "+error.message);return;}
 $("adminItems").innerHTML="";
 (data||[]).forEach(w=>{const row=document.createElement("div");row.className="admin-row";const name=document.createElement("span");name.textContent=w.title+" — "+w.category;const del=document.createElement("button");del.className="delete";del.textContent="Apagar";del.onclick=()=>deleteWork(w);row.append(name,del);$("adminItems").append(row);});
 if(!data?.length)$("adminItems").textContent="Ainda não publicaste trabalhos.";
}
$("loginForm").onsubmit=async e=>{
 e.preventDefault();msg("loginMsg","A verificar...",false);
 const {error}=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});
 if(error){msg("loginMsg","Não foi possível entrar. Confirma o email e a palavra-passe.");return;}
 closeModal("loginModal");await refreshAdmin();openModal("adminModal");
};
$("logout").onclick=async()=>{await db.auth.signOut();closeModal("adminModal");};
$("uploadForm").onsubmit=async e=>{
 e.preventDefault();const file=$("file").files[0];if(!file)return;
 if(file.size>50*1024*1024){msg("adminMsg","O ficheiro ultrapassa 50 MB.");return;}
 msg("adminMsg","A carregar ficheiro...",false);
 const safeName=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_");
 const path=`${crypto.randomUUID()}-${safeName}`;
 const {error:upErr}=await db.storage.from("work-files").upload(path,file,{upsert:false});
 if(upErr){msg("adminMsg","Falha no envio: "+upErr.message);return;}
 const {data:urlData}=db.storage.from("work-files").getPublicUrl(path);
 const {error:dbErr}=await db.from("works").insert({title:$("title").value.trim(),description:$("description").value.trim(),category:$("category").value,file_path:path,url:urlData.publicUrl});
 if(dbErr){await db.storage.from("work-files").remove([path]);msg("adminMsg","Falha ao guardar publicação: "+dbErr.message);return;}
 $("uploadForm").reset();msg("adminMsg","Trabalho publicado com sucesso!",false);await refreshAdmin();await loadWorks();
};
async function deleteWork(w){
 if(!confirm(`Apagar "${w.title}"? Esta ação não pode ser desfeita.`))return;
 const {error}=await db.from("works").delete().eq("id",w.id);
 if(error){msg("adminMsg","Não foi possível apagar: "+error.message);return;}
 await db.storage.from("work-files").remove([w.file_path]);await refreshAdmin();await loadWorks();
}
if(db){db.auth.onAuthStateChange(async(_event,session)=>{if(!session)closeModal("adminModal");});}
loadWorks();
