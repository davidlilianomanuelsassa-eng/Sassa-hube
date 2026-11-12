
const $=id=>document.getElementById(id);
let db=null,products=[],formatFilter="Todos";

if(window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&window.supabase){
 db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
}

function renderStore(){
 const list=products.filter(p=>formatFilter==="Todos"||p.format===formatFilter);
 $("storeItems").replaceChildren();

 list.forEach(p=>{
  const card=document.createElement("article");
  card.className="work-card store-card";

  if(p.cover_url){
   const img=document.createElement("img");
   img.src=p.cover_url;
   img.alt="Capa de "+p.title;
   img.loading="lazy";
   card.append(img);
  }

  const tag=document.createElement("span");
  tag.className="store-format";
  tag.textContent=p.format==="Digital"?"📘 Livro digital · PDF":"📚 Livro físico";

  const title=document.createElement("h3");
  title.textContent=p.title;

  const desc=document.createElement("p");
  desc.textContent=p.description||"Sem descrição adicional.";

  const price=document.createElement("strong");
  price.className="store-price";
  price.textContent=Number(p.price)===0?"Gratuito":new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));

  const btn=document.createElement("button");
  btn.className="btn btn-primary";
  btn.textContent=Number(p.price)===0?"Obter gratuitamente":"Encomendar";
  btn.addEventListener("click",()=>openOrder(p));

  card.append(tag,title,desc,price,btn);
  $("storeItems").append(card);
 });

 $("storeStatus").textContent=list.length?list.length+" livro(s) disponível(is).":"Ainda não há livros disponíveis nesta categoria.";
}

function openOrder(p){
 $("productId").value=p.id;

 const priceText=Number(p.price)===0?"Gratuito":new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));

 $("selectedBook").textContent=p.title+" — "+priceText;
 $("orderPanel").classList.remove("hidden");
 $("orderMessage").textContent="";
 $("orderPanel").scrollIntoView({behavior:"smooth",block:"start"});
}

async function loadStore(){
 if(!db){
  $("storeStatus").textContent="A livraria precisa de ligação ao Supabase.";
  return;
 }

 const {data,error}=await db.from("store_products")
  .select("id,title,description,price,currency,format,cover_url")
  .eq("active",true)
  .order("created_at",{ascending:false});

 if(error){
  $("storeStatus").textContent="Não foi possível carregar os livros. Executa o ficheiro supabase-livraria.sql no Supabase.";
  return;
 }

 products=data||[];
 renderStore();

 const requestedProduct=new URLSearchParams(window.location.search).get("produto");

 if(requestedProduct){
  const chosen=products.find(p=>String(p.id)===requestedProduct);
  if(chosen)openOrder(chosen);
 }
}

document.querySelectorAll("[data-format]").forEach(b=>{
 b.addEventListener("click",()=>{
  formatFilter=b.dataset.format;
  document.querySelectorAll("[data-format]").forEach(x=>x.classList.toggle("active",x===b));
  renderStore();
 });
});

$("storeOrderForm").addEventListener("submit",async e=>{
 e.preventDefault();

 if(!db){
  $("orderMessage").textContent="A ligação à livraria não está disponível.";
  return;
 }

 const product=products.find(p=>p.id===$("productId").value);

 if(!product){
  $("orderMessage").textContent="Escolhe novamente o livro.";
  return;
 }

 const buyerEmail=$("buyerEmail").value.trim();

 if(!buyerEmail){
  $("orderMessage").textContent="Introduz o endereço de e-mail.";
  return;
 }

 const orderId=crypto.randomUUID();

 const accessCode=Array.from(
  crypto.getRandomValues(new Uint8Array(32)),
  b=>b.toString(16).padStart(2,"0")
 ).join("");

 const hashBuffer=await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(accessCode)
 );

 const accessCodeHash=Array.from(
  new Uint8Array(hashBuffer),
  b=>b.toString(16).padStart(2,"0")
 ).join("");

 const payload={
  id:orderId,
  product_id:product.id,
  product_title:product.title,
  format:product.format,
  price:product.price,
  currency:product.currency||"AOA",
  buyer_name:$("buyerName").value.trim(),
  buyer_contact:$("buyerContact").value.trim(),
  buyer_email:buyerEmail,
  note:$("buyerNote").value.trim()||null,
  access_code_hash:accessCodeHash
 };

 const btn=e.submitter;
 btn.disabled=true;
 btn.textContent="A enviar...";

 const {error}=await db.from("store_orders").insert(payload);

 btn.disabled=false;
 btn.textContent="Enviar encomenda";

 if(error){
  $("orderMessage").textContent="Não foi possível enviar. Tenta novamente mais tarde.";
  return;
 }

 $("orderMessage").textContent=Number(product.price)===0
  ?"Pedido do livro gratuito recebido. Guarda os dados de acesso abaixo."
  :"Encomenda enviada! Guarda a referência e o código abaixo. Depois da confirmação do pagamento, poderás descarregar o livro nesta página.";

 $("orderReceipt").classList.remove("hidden");
 $("createdOrderId").textContent=orderId;
 $("createdOrderCode").textContent=accessCode;

 e.target.reset();
});

$("downloadOrderForm").addEventListener("submit",async e=>{
 e.preventDefault();

 const btn=e.submitter;
 btn.disabled=true;
 btn.textContent="A verificar...";

 const downloadWindow=window.open("about:blank","_blank");

 const {data,error}=await db.functions.invoke("download-book",{
  body:{
   order_id:$("downloadOrderId").value.trim(),
   access_code:$("downloadAccessCode").value.trim()
  }
 });

 btn.disabled=false;
 btn.textContent="Descarregar livro";

 if(error||!data?.download_url){
  if(downloadWindow)downloadWindow.close();
  $("downloadMessage").textContent=data?.error||"Não foi possível verificar a encomenda. Confirma os dados e tenta novamente.";
  return;
 }

 $("downloadMessage").textContent="Acesso autorizado. O link é válido durante 5 minutos.";

 if(downloadWindow){
  downloadWindow.location.href=data.download_url;
 }else{
  window.location.href=data.download_url;
 }
});

loadStore();
