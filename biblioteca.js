(() => {
  const search = document.getElementById("librarySearch");
  const category = document.getElementById("libraryCategory");
  const status = document.getElementById("libraryStatus");
  const items = document.getElementById("libraryItems");
  let publications = [];

  const textValue = value => String(value ?? "");
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const normalize = value => textValue(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt").trim();

  function render() {
    const term = search.value.trim().toLocaleLowerCase("pt");
    const selected = category.value;
    const filtered = publications.filter(work => {
      const haystack = [work.title, work.description, work.category]
        .map(textValue).join(" ").toLocaleLowerCase("pt");
      return (!selected || work.category === selected) &&
        (!term || haystack.includes(term));
    });

    items.replaceChildren();
    status.textContent = filtered.length
      ? filtered.length + (filtered.length === 1
        ? " publicação encontrada."
        : " publicações encontradas.")
      : "Não foram encontradas publicações com estes critérios.";

    filtered.forEach(work => {
      const card = make("article", "library-item");
      card.append(make("div", "library-meta", work.category || "Publicação"));
      card.append(make("h3", "", work.title || "Publicação sem título"));
      card.append(make("p", "", work.description || "Sem descrição adicional."));

      if (work.price !== null && work.price !== undefined) {
        const priceText = Number(work.price) === 0
          ? "Gratuito"
          : new Intl.NumberFormat("pt-AO", {
              style: "currency",
              currency: work.currency || "AOA"
            }).format(Number(work.price));
        card.append(make("strong", "library-price", priceText));
      }

      const actions = make("div", "library-actions");
      const open = make("a", "open-file",
        work.kind === "store" ? "Ver na livraria / encomendar" : "Abrir / descarregar");
      open.href = work.kind === "store"
        ? "livraria.html?produto=" + encodeURIComponent(work.id)
        : work.url;
      if (work.kind !== "store") {
        open.target = "_blank";
        open.rel = "noopener noreferrer";
      }
      actions.append(open);

      const share = make("button", "share-file", "Partilhar no WhatsApp");
      share.type = "button";
      share.addEventListener("click", () => {
        const shareUrl = work.kind === "store"
          ? new URL("livraria.html?produto=" + encodeURIComponent(work.id), window.location.href).href
          : (work.url || window.location.href);
        const message = (work.title || "Publicação do Sassa Hube") + " — " + shareUrl;
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
    status.textContent = "A carregar publicações e livros...";
    try {
      const [worksResult, productsResult] = await Promise.all([
        client.from("works")
          .select("id,title,description,category,url,created_at")
          .order("created_at", { ascending: false }),
        client.from("store_products")
          .select("id,title,description,price,currency,format,created_at")
          .eq("active", true)
          .order("created_at", { ascending: false })
      ]);

      if (worksResult.error && productsResult.error) {
        throw worksResult.error;
      }

      const works = (worksResult.data || []).map(work => ({
        ...work,
        kind: "work",
        category: work.category || "Publicação"
      }));

      const products = (productsResult.data || []).map(product => ({
        ...product,
        kind: "store",
        category: product.format === "Físico" ? "Livro físico" : "Livro digital"
      }));

      // Evita mostrar duas vezes o mesmo título caso também exista em works.
      const seenTitles = new Set();
      publications = [...products, ...works].filter(item => {
        const key = normalize(item.title);
        if (!key || seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      if (worksResult.error || productsResult.error) {
        status.textContent = "Algumas publicações não puderam ser carregadas; a lista apresenta os registos disponíveis.";
      }

      const categories = [...new Set(publications.map(work => work.category).filter(Boolean))].sort();
      category.replaceChildren(new Option("Todas as categorias", ""));
      categories.forEach(value => category.add(new Option(value, value)));
      render();
    } catch (error) {
      console.error("Erro ao carregar a Biblioteca Digital:", error);
      status.textContent = "Não foi possível carregar as publicações. Confirma a ligação e as políticas de leitura pública do Supabase.";
    }
  }

  search.addEventListener("input", render);
  category.addEventListener("change", render);
  init();
})();
