const homeStoreRoot=document.getElementById("homeStoreItems");
const homeStoreStatus=document.getElementById("homeStoreStatus");
(async function loadHomeStore(){
 if(!homeStoreRoot||!homeStoreStatus)return;
 if(!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY||!window.supabase){homeStoreStatus.textContent="A livraria estará disponível em breve.";return;}
 const client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
 const {data,error}=await client.from("store_products").select("id,title,description,price,currency,format,cover_url").eq("active",true).order("created_at",{ascending:false}).limit(6);
 if(error){homeStoreStatus.textContent="Não foi possível carregar os livros neste momento.";return;}
 homeStoreRoot.replaceChildren();
 (data||[]).forEach(p=>{
  const card=document.createElement("article");card.className="work-card store-card home-store-card";
  if(p.cover_url){const img=document.createElement("img");img.src=p.cover_url;img.alt="Capa de "+p.title;img.loading="lazy";card.append(img);}
  const tag=document.createElement("span");tag.className="store-format";tag.textContent=p.format==="Digital"?"📘 Livro digital":"📚 Livro físico";
  const title=document.createElement("h3");title.textContent=p.title;
  const desc=document.createElement("p");desc.textContent=p.description||"Descobre esta obra na Livraria Sassa Hube.";
  const price=document.createElement("strong");price.className="store-price";price.textContent=Number(p.price)===0?"Gratuito":new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));
  const link=document.createElement("a");link.className="btn btn-primary home-buy-link";link.href="livraria.html?produto="+encodeURIComponent(p.id)+"#orderPanel";link.textContent=Number(p.price)===0?"Obter livro":"Comprar livro";
  card.append(tag,title,desc,price,link);homeStoreRoot.append(card);
 });
 homeStoreStatus.textContent=(data||[]).length?(data.length+" livro(s) em destaque. Consulta a Livraria para ver todas as obras.":"Ainda não há livros publicados na Livraria.");
})();
