const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();
let db = null, currentCategory = "Todos", allWorks = [];
const configured = Boolean(window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
  !String(window.SUPABASE_URL).includes("COLOCA_AQUI") &&
  !String(window.SUPABASE_ANON_KEY).includes("COLOCA_AQUI"));
if (configured && window.supabase) {
  db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
function iconFor(cat) {
  return {"PDF e Word":"▤","PowerPoint":"▧","Imagens e cartazes":"▣","Vídeos":"▶","Outros ficheiros":"⌘"}[cat] || "▤";
}
function renderWorks() {
  const q = $("search").value.trim().toLocaleLowerCase("pt");
  const filtered = allWorks.filter(w =>
    (currentCategory === "Todos" || w.category === currentCategory) &&
    (String(w.title || "") + " " + String(w.description || "")).toLocaleLowerCase("pt").includes(q)
  );
  $("items").replaceChildren();
  $("status").textContent = filtered.length
    ? filtered.length + (filtered.length === 1 ? " publicação encontrada." : " publicações encontradas.")
    : "Não foram encontradas publicações. Experimenta outra pesquisa ou categoria.";
  filtered.forEach(w => {
    const card = document.createElement("article"); card.className = "work-card";
    const icon = document.createElement("div"); icon.className = "file-symbol"; icon.textContent = iconFor(w.category);
    const title = document.createElement("h3"); title.textContent = w.title || "Publicação sem título";
    const desc = document.createElement("p"); desc.textContent = w.description || "Sem descrição adicional.";
    const meta = document.createElement("div"); meta.className = "work-meta"; meta.textContent = w.category || "Recurso digital";
    const link = document.createElement("a"); link.href = w.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Abrir publicação →";
    card.append(icon,title,desc,meta,link); $("items").append(card);
  });
}
async function loadWorks() {
  if (!db) { $("status").textContent = "A biblioteca está pronta. A ligação à base de dados precisa de ser configurada."; return; }
  const {data,error} = await db.from("works").select("id,title,description,category,url,created_at").order("created_at",{ascending:false});
  if (error) { $("status").textContent = "Não foi possível carregar as publicações. Verifica a ligação ao Supabase."; return; }
  allWorks = data || []; renderWorks();
}
$("search").addEventListener("input",renderWorks);
document.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click",() => {
  currentCategory = btn.dataset.cat;
  document.querySelectorAll(".filter").forEach(x => x.classList.toggle("active",x === btn));
  renderWorks();
}));
loadWorks();