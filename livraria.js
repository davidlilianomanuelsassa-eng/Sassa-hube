
(() => {
  "use strict";

  const root = document.getElementById("featuredBooks");
  const status = document.getElementById("featuredBooksStatus");

  if (!root || !status) return;

  const database =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    window.supabase
      ? window.supabase.createClient(
          window.SUPABASE_URL,
          window.SUPABASE_ANON_KEY
        )
      : null;

  function createElement(tag, className, content) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;

    return element;
  }

  function formatPrice(product) {
    const price = Number(product.price);

    if (!Number.isFinite(price) || price === 0) {
      return "Gratuito";
    }

    try {
      return new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency: product.currency || "AOA"
      }).format(price);
    } catch {
      return price.toLocaleString("pt-AO") + " " +
        (product.currency || "AOA");
    }
  }

  function createCoverPlaceholder(product) {
    const cover = createElement(
      "div",
      "featured-book-placeholder generated-book-cover"
    );

    cover.setAttribute("role", "img");
    cover.setAttribute(
      "aria-label",
      "Capa provisória de " + (product.title || "Livro Sassa Hube")
    );

    const brand = createElement(
      "span",
      "generated-cover-brand",
      "SASSA HUBE"
    );

    const line = createElement("span", "generated-cover-line");

    const title = createElement(
      "strong",
      "generated-cover-title",
      product.title || "Publicação Sassa Hube"
    );

    const author = createElement(
      "span",
      "generated-cover-author",
      "AUTOR: DAVID SASSA"
    );

    const format = createElement(
      "small",
      "generated-cover-format",
      product.format === "Digital"
        ? "EDIÇÃO DIGITAL"
        : "EDIÇÃO IMPRESSA"
    );

    const seal = createElement("span", "generated-cover-seal", "SH");

    cover.append(brand, line, title, author, format, seal);

    return cover;
  }

  function createBookCover(product) {
    if (!product.cover_url) {
      return createCoverPlaceholder(product);
    }

    const wrapper = createElement("div", "featured-cover-frame");

    const image = createElement("img", "featured-cover-image");

    image.src = product.cover_url;
    image.alt = "Capa de " + (product.title || "livro") +
      " — Autor: David Sassa";
    image.loading = "lazy";
    image.decoding = "async";

    const titleOverlay = createElement(
      "span",
      "book-cover-title-overlay",
      product.title || "Livro Sassa Hube"
    );

    image.addEventListener("error", () => {
      wrapper.replaceWith(createCoverPlaceholder(product));
    }, { once: true });

    wrapper.append(image, titleOverlay);

    return wrapper;
  }

  function createBookCard(product) {
    const card = createElement("article", "work-card featured-book-card");

    card.append(createBookCover(product));

    const format = createElement(
      "span",
      "store-format",
      product.format === "Digital"
        ? "Livro digital"
        : "Livro físico"
    );

    const title = createElement(
      "h3",
      "",
      product.title || "Livro sem título"
    );

    const description = createElement(
      "p",
      "featured-book-description",
      product.description ||
        "Descobre esta publicação na Livraria Sassa Hube."
    );

    const price = createElement(
      "strong",
      "store-price",
      formatPrice(product)
    );

    const link = createElement(
      "a",
      "btn btn-primary featured-book-button",
      Number(product.price) === 0
        ? "Obter gratuitamente"
        : "Consultar e comprar"
    );

    link.href =
      "livraria.html?produto=" +
      encodeURIComponent(product.id) +
      "#orderPanel";

    card.append(format, title, description, price, link);

    return card;
  }

  function renderBooks(products) {
    root.replaceChildren();

    const availableBooks = products.slice(0, 6);

    if (!availableBooks.length) {
      status.textContent =
        "Ainda não existem livros publicados na livraria.";
      return;
    }

    const fragment = document.createDocumentFragment();

    availableBooks.forEach(product => {
      fragment.append(createBookCard(product));
    });

    root.append(fragment);

    status.textContent =
      "A mostrar " + availableBooks.length +
      " de " + products.length +
      " livro(s) disponível(is).";
  }

  async function loadBooks() {
    if (!database) {
      status.textContent =
        "A livraria está temporariamente indisponível.";
      return;
    }

    status.textContent = "A carregar livros disponíveis...";

    try {
      const { data, error } = await database
        .from("store_products")
        .select(
          "id,title,description,price,currency,format,cover_url"
        )
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;

      renderBooks(data || []);
    } catch (error) {
      console.error("Erro ao carregar livros:", error);

      root.replaceChildren();

      status.textContent =
        "Não foi possível carregar os livros. Tenta novamente mais tarde.";
    }
  }

  loadBooks();
})();
