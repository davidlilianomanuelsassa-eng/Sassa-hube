(() => {
  const status = document.getElementById("homeLibraryStatus");
  const items = document.getElementById("homeLibraryItems");
  if (!status || !items) return;
  const el = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined) n.textContent = value;
    return n;
  };
  async function load() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      status.textContent = "A biblioteca está temporariamente indisponível.";
      return;
    }
    try {
      const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data, error } = await client.from("works").select("id,title,description,category,url,created_at").order("created_at", {ascending:false}).limit(6);
      if (error) throw error;
      items.replaceChildren();
      if (!data || !data.length) {
        status.textContent = "Ainda não existem publicações disponíveis.";
        return;
      }
      data.forEach(work => {
        const card = el("article", "card");
        card.append(el("small", "", work.category || "Publicação"));
        card.append(el("h3", "", work.title || "Publicação"));
        card.append(el("p", "", work.description || "Sem descrição adicional."));
        const link = el("a", "", "Abrir publicação");
        link.href = work.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
        items.append(card);
      });
      status.textContent = data.length + " publicação(ões) mais recentes.";
    } catch (_) {
      status.textContent = "Não foi possível carregar as publicações. Tenta novamente mais tarde.";
    }
  }
  load();
})();
