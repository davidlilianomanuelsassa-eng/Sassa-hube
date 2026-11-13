const featuredRoot=document.getElementById("featuredBooks");
const featuredStatus=document.getElementById("featuredBooksStatus");
const featuredDb=window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&window.supabase?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;

function featuredPrice(p){
  return Number(p.price)===0?"Gratuito":new Intl.NumberFormat("pt-AO",{style:"currency",currency:p.currency||"AOA"}).format(Number(p.price));
}

function makeGeneratedCover(product){
  const cover=document.createElement("div");
  cover.className="featured-book-placeholder generated-book-cover";
  cover.setAttribute("role","img");
  cover.setAttribute("aria-label","Capa provisória de "+(product.title||"Livro Sassa Hube"));

  const brand=document.createElement("span");
  brand.className="generated-cover-brand";
  brand.textContent="SASSA HUBE";

  const line=document.createElement("span");
  line.className="generated-cover-line";

  const title=document.createElement("strong");
  title.className="generated-cover-title";
  title.textContent=product.title||"Publicação Sassa Hube";

  const format=document.createElement("small");
  format.className="generated-cover-format";
  format.textContent=product.format==="Digital"?"EDIÇÃO DIGITAL":"EDIÇÃO IMPRESSA";

  const author=document.createElement("span");
  author.className="generated-cover-author";
  author.textContent="AUTOR: DAVID SASSA";

  const seal=document.createElement("span");
  seal.className="generated-cover-seal";
  seal.textContent="SH";

  cover.append(brand,line,title,author,format,seal);
  return cover;
}

function renderFeaturedBooks(products){
  featuredRoot.replaceChildren();
  products.slice(0,6).forEach(p=>{
    const card=document.createElement("article");
    card.className="work-card featured-book-card";

    if(p.cover_url){
      const coverWrap=document.createElement("div");
      coverWrap.className="book-cover-wrap";
      const img=document.createElement("img");
      img.src=p.cover_url;
      img.alt="Capa de "+p.title+" — Autor: David Sassa";
      img.loading="lazy";
      img.onerror=()=>coverWrap.replaceWith(makeGeneratedCover(p));
      const titleOverlay=document.createElement("span");
      titleOverlay.className="book-cover-title-overlay";
      const coverTitleKey=(p.title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
      const isSocialHealthBook=coverTitleKey.includes("REDES SOCIAIS") && coverTitleKey.includes("SAUDE MENTAL");
      if(isSocialHealthBook){
        titleOverlay.classList.add("book-cover-title-contrast");
        titleOverlay.style.setProperty("position","absolute","important");
        titleOverlay.style.setProperty("z-index","20","important");
        titleOverlay.style.setProperty("top","20%","important");
        titleOverlay.style.setProperty("bottom","22%","important");
        titleOverlay.style.setProperty("left","6%","important");
        titleOverlay.style.setProperty("right","6%","important");
        titleOverlay.style.setProperty("display","flex","important");
        titleOverlay.style.setProperty("align-items","center","important");
        titleOverlay.style.setProperty("justify-content","center","important");
        titleOverlay.style.setProperty("padding","14px 12px","important");
        titleOverlay.style.setProperty("overflow","visible","important");
        titleOverlay.style.setProperty("color","#f5d36f","important");
        titleOverlay.style.setProperty("background","linear-gradient(145deg,#081b34,#173f68)","important");
        titleOverlay.style.setProperty("border","2px solid #c99b4b","important");
        titleOverlay.style.setProperty("border-radius","7px","important");
        titleOverlay.style.setProperty("font","900 16px/1.35 Manrope,sans-serif","important");
        titleOverlay.style.setProperty("text-align","center","important");
        titleOverlay.style.setProperty("text-shadow","none","important");
        titleOverlay.style.setProperty("-webkit-line-clamp","unset","important");
        titleOverlay.style.setProperty("-webkit-box-orient","initial","important");
      }
      titleOverlay.textContent=p.title||"Livro Sassa Hube";
      const author=document.createElement("span");
      author.className="book-cover-author";
      author.textContent="AUTOR: DAVID SASSA";
      coverWrap.append(img,titleOverlay,author);
      card.append(coverWrap);
    }else{
      card.append(makeGeneratedCover(p));
    }

    const type=document.createElement("span");
    type.className="store-format";
    type.textContent=p.format==="Digital"?"📘 Livro digital":"📚 Livro físico";

    const title=document.createElement("h3");
    title.textContent=p.title||"Livro sem título";

    const desc=document.createElement("p");
    desc.textContent=p.description||"Descobre esta publicação na Livraria Sassa Hube.";

    const price=document.createElement("strong");
    price.className="store-price";
    price.textContent=featuredPrice(p);

    const link=document.createElement("a");
    link.className="btn btn-primary";
    link.href="livraria.html?produto="+encodeURIComponent(p.id)+"#orderPanel";
    link.textContent=Number(p.price)===0?"Obter gratuitamente":"Comprar livro";

    card.append(type,title,desc,price,link);
    featuredRoot.append(card);
  });

  featuredStatus.textContent=products.length
    ?"A mostrar "+Math.min(products.length,6)+" de "+products.length+" livro(s) disponível(is)."
    :"Ainda não há livros publicados na livraria.";
}

async function loadFeaturedBooks(){
  if(!featuredDb){
    featuredStatus.textContent="A livraria estará disponível assim que a ligação for configurada.";
    return;
  }
  const {data,error}=await featuredDb.from("store_products")
    .select("id,title,description,price,currency,format,cover_url")
    .eq("active",true)
    .order("created_at",{ascending:false});

  if(error){
    featuredStatus.textContent="Não foi possível carregar os livros neste momento.";
    return;
  }
  renderFeaturedBooks(data||[]);
}

loadFeaturedBooks();
