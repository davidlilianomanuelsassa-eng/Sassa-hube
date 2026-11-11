(() => {
  const search = document.getElementById("librarySearch");
  const category = document.getElementById("libraryCategory");
  const status = document.getElementById("libraryStatus");
  const items = document.getElementById("libraryItems");
  let publications = [];

  const escapeText = (value) => String(value ?? "");
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function render() {
    const term = search.value.trim().toLocaleLowerCase("pt");
    const selected = category.value;
    const filtered = publications.filter((work) => {
      const haystack = [work.title, work.description, work.category]
        .map(escapeText).join(" ").toLocaleLowerCase("pt");
      return (!selected || work.category === selected) && (!term || haystack.includes(term));
    });

    items.replaceChildren();
    status.textContent = filtered.length
      ? filtered.length + (filtered.length === 1 ? " publicação encontrada." : " publicações encontradas.")
      : "Não foram encontradas publicações com estes critérios.";

    filtered.forEach((work) => {
      const card = make("article", "library-item");
      card.append(make("div", "library-meta", work.category || "Publicação"));
      card.append(make("h3", "", work.title || "Publicação sem título"));
      card.append(make("p", "", work.description || "Sem descrição adicional."));
      const actions = make("div", "library-actions");
      const open = make("a", "open-file", "Abrir / descarregar");
      open.href = work.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.append(open);

      const share = make("button", "share-file", "Partilhar no WhatsApp");
      share.type = "button";
      share.addEventListener("click", () => {
        const pageUrl = window.location.href;
        const message = (work.title || "Publicação do Sassa Hube") + " — " + pageUrl;
        window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
      });
      actions.append(share);
      card.append(actions);
      items.append(card);
    });
  }

  async function init() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      status.textContent = "A ligação à biblioteca não está configurada. Verifica config.js e a biblioteca Supabase.";
      return;
    }
    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const { data, error } = await client.from("works")
      .select("id,title,description,category,url,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      status.textContent = "Não foi possível carregar as publicações. Confirma a ligação e as políticas de leitura pública do Supabase.";
      return;
    }

    publications = data || [];
    const categories = [...new Set(publications.map((work) => work.category).filter(Boolean))].sort();
    categories.forEach((value) => category.add(new Option(value, value)));
    render();
  }

  search.addEventListener("input", render);
  category.addEventListener("change", render);
  init();
})();
