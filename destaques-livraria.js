const featuredRoot=document.getElementById("featuredBooks");
const featuredStatus=document.getElementById("featuredBooksStatus");
const featuredDb=window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&window.supabase?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;
function featuredPrice(p){return Number(p.price)===0?"Gratuito":new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));}
function renderFeaturedBooks(products){
 featuredRoot.replaceChildren();
 products.slice(0,6).forEach(p=>{
  const card=document.createElement("article");card.className="work-card featured-book-card";
  if(p.cover_url){const img=document.createElement("img");img.src=p.cover_url;img.alt="Capa de "+p.title;img.loading="lazy";card.append(img);}
  else{const placeholder=document.createElement("div");placeholder.className="featured-book-placeholder";placeholder.textContent="SASSA HUBE";card.append(placeholder);}
  const type=document.createElement("span");type.className="store-format";type.textContent=p.format==="Digital"?"📘 Livro digital":"📚 Livro físico";
  const title=document.createElement("h3");title.textContent=p.title||"Livro sem título";
  const desc=document.createElement("p");desc.textContent=p.description||"Descobre esta publicação na Livraria Sassa Hube.";
  const price=document.createElement("strong");price.className="store-price";price.textContent=featuredPrice(p);
  const link=document.createElement("a");link.className="btn btn-primary";link.href="livraria.html?produto="+encodeURIComponent(p.id)+"#orderPanel";link.textContent=Number(p.price)===0?"Obter gratuitamente":"Comprar livro";
  card.append(type,title,desc,price,link);featuredRoot.append(card);
 });
 featuredStatus.textContent=products.length?"A mostrar "+Math.min(products.length,6)+" de "+products.length+" livro(s) disponível(is).":"Ainda não há livros publicados na livraria.";
}
async function loadFeaturedBooks(){
 if(!featuredDb){featuredStatus.textContent="A livraria estará disponível assim que a ligação for configurada.";return;}
 const {data,error}=await featuredDb.from("store_products").select("id,title,description,price,currency,format,cover_url").eq("active",true).order("created_at",{ascending:false});
 if(error){featuredStatus.textContent="Não foi possível carregar os livros neste momento.";return;}
 renderFeaturedBooks(data||[]);
}
loadFeaturedBooks();