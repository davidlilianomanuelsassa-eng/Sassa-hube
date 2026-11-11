const $=id=>document.getElementById(id);
let db=null,products=[],formatFilter="Todos";
if(window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&window.supabase)db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
function renderStore(){
 const list=products.filter(p=>formatFilter==="Todos"||p.format===formatFilter);
 $("storeItems").replaceChildren();
 list.forEach(p=>{
  const card=document.createElement("article");card.className="work-card store-card";
  if(p.cover_url){const img=document.createElement("img");img.src=p.cover_url;img.alt="Capa de "+p.title;img.loading="lazy";card.append(img);}
  const tag=document.createElement("span");tag.className="store-format";tag.textContent=p.format==="Digital"?"📘 Livro digital · PDF":"📚 Livro físico";
  const title=document.createElement("h3");title.textContent=p.title;
  const desc=document.createElement("p");desc.textContent=p.description||"Sem descrição adicional.";
  const price=document.createElement("strong");price.className="store-price";price.textContent=new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));
  const btn=document.createElement("button");btn.className="btn btn-primary";btn.textContent="Encomendar";btn.addEventListener("click",()=>{ $("productId").value=p.id;$("selectedBook").textContent=p.title+" — "+price.textContent;$("orderPanel").classList.remove("hidden");$("orderMessage").textContent="";$("orderPanel").scrollIntoView({behavior:"smooth",block:"start"});});
  card.append(tag,title,desc,price,btn);$("storeItems").append(card);
 });
 $("storeStatus").textContent=list.length?list.length+" livro(s) disponível(is).":"Ainda não há livros disponíveis nesta categoria.";
}
async function loadStore(){
 if(!db){$("storeStatus").textContent="A livraria precisa de ligação ao Supabase.";return;}
 const {data,error}=await db.from("store_products").select("id,title,description,price,currency,format,cover_url").eq("active",true).order("created_at",{ascending:false});
 if(error){$("storeStatus").textContent="Não foi possível carregar os livros. Executa o ficheiro supabase-livraria.sql no Supabase.";return;}
 products=data||[];renderStore();
}
document.querySelectorAll("[data-format]").forEach(b=>b.addEventListener("click",()=>{formatFilter=b.dataset.format;document.querySelectorAll("[data-format]").forEach(x=>x.classList.toggle("active",x===b));renderStore();}));
$("storeOrderForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!db){$("orderMessage").textContent="A ligação à livraria não está disponível.";return;}
 const product=products.find(p=>p.id===$("productId").value);if(!product){$("orderMessage").textContent="Escolhe novamente o livro.";return;}
 const proof=$("buyerProof").files[0];if(!proof){$("orderMessage").textContent="Anexa o comprovativo da transferência.";return;}if(proof.size>5*1024*1024){$("orderMessage").textContent="O comprovativo deve ter no máximo 5 MB.";return;}const orderId=crypto.randomUUID();const payload={id:orderId,product_id:product.id,product_title:product.title,format:product.format,price:product.price,currency:product.currency||"AOA",buyer_name:$("buyerName").value.trim(),buyer_contact:$("buyerContact").value.trim(),note:$("buyerNote").value.trim()||null};
 const btn=e.submitter;btn.disabled=true;btn.textContent="A enviar...";
 const {error}=await db.from("store_orders").insert(payload);
 if(error){btn.disabled=false;btn.textContent="Enviar encomenda e comprovativo";$("orderMessage").textContent="Não foi possível registar a encomenda. Tenta novamente mais tarde.";return;}
 const ext=(proof.name.split(".").pop()||"pdf").toLowerCase().replace(/[^a-z0-9]/g,"");const proofPath=orderId+"/"+crypto.randomUUID()+"."+ext;
 const {error:uploadError}=await db.storage.from("payment-proofs").upload(proofPath,proof,{upsert:false,contentType:proof.type||"application/octet-stream"});
 if(uploadError){btn.disabled=false;btn.textContent="Enviar encomenda e comprovativo";$("orderMessage").textContent="A encomenda foi registada, mas o comprovativo não foi enviado. Contacta a equipa e indica a referência "+orderId+".";return;}
 const {error:proofError}=await db.from("store_payment_proofs").insert({order_id:orderId,proof_path:proofPath});
 btn.disabled=false;btn.textContent="Enviar encomenda e comprovativo";
 if(proofError){$("orderMessage").textContent="A encomenda foi registada, mas não foi possível associar o comprovativo. Contacta a equipa e indica a referência "+orderId+".";return;}
 $("orderMessage").textContent="Encomenda e comprovativo enviados! A equipa Sassa Hube irá verificar a transferência antes de confirmar o pagamento.";
 e.target.reset();
});
loadStore();