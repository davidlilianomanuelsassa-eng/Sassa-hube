
const $ = id => document.getElementById(id);

let db = null;
let products = [];
let formatFilter = "Todos";

const MAX_PROOF_SIZE = 10 * 1024 * 1024;

const PROOF_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

if (
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  window.supabase
) {
  db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );
}

function renderStore() {
  const list = products.filter(
    p => formatFilter === "Todos" || p.format === formatFilter
  );

  $("storeItems").replaceChildren();

  list.forEach(p => {
    const card = document.createElement("article");
    card.className = "work-card store-card";

    if (p.cover_url) {
      const img = document.createElement("img");
      img.src = p.cover_url;
      img.alt = "Capa de " + p.title;
      img.loading = "lazy";
      card.append(img);
    }

    const tag = document.createElement("span");
    tag.className = "store-format";
    tag.textContent = p.format === "Digital"
      ? "📘 Livro digital · PDF"
      : "📚 Livro físico";

    const title = document.createElement("h3");
    title.textContent = p.title;

    const desc = document.createElement("p");
    desc.textContent = p.description || "Sem descrição adicional.";

    const price = document.createElement("strong");
    price.className = "store-price";
    price.textContent = Number(p.price) === 0
      ? "Gratuito"
      : new Intl.NumberFormat("pt-AO", {
          style: "currency",
          currency: p.currency || "AOA"
        }).format(Number(p.price));

    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = Number(p.price) === 0
      ? "Obter gratuitamente"
      : "Encomendar";

    btn.addEventListener("click", () => openOrder(p));

    card.append(tag, title, desc, price, btn);
    $("storeItems").append(card);
  });

  $("storeStatus").textContent = list.length
    ? list.length + " livro(s) disponível(is)."
    : "Ainda não há livros disponíveis nesta categoria.";
}

function openOrder(p) {
  $("productId").value = p.id;

  const priceText = Number(p.price) === 0
    ? "Gratuito"
    : new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency: p.currency || "AOA"
      }).format(Number(p.price));

  $("selectedBook").textContent = p.title + " — " + priceText;

  $("orderPanel").classList.remove("hidden");
  $("orderMessage").textContent = "";
  $("orderReceipt").classList.add("hidden");

  $("orderPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function loadStore() {
  if (!db) {
    $("storeStatus").textContent =
      "A livraria precisa de ligação ao Supabase.";
    return;
  }

  const { data, error } = await db
    .from("store_products")
    .select("id,title,description,price,currency,format,cover_url")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    $("storeStatus").textContent =
      "Não foi possível carregar os livros. Verifica a ligação ao Supabase.";
    return;
  }

  products = data || [];
  renderStore();

  const requestedProduct =
    new URLSearchParams(window.location.search).get("produto");

  if (requestedProduct) {
    const chosen = products.find(
      p => String(p.id) === requestedProduct
    );

    if (chosen) openOrder(chosen);
  }
}

document.querySelectorAll("[data-format]").forEach(button => {
  button.addEventListener("click", () => {
    formatFilter = button.dataset.format;

    document.querySelectorAll("[data-format]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderStore();
  });
});

async function uploadPaymentProof(file, orderId) {
  if (!file) return null;

  if (file.size > MAX_PROOF_SIZE) {
    throw new Error("O comprovativo não pode ultrapassar 10 MB.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const contentType = PROOF_TYPES[extension];

  if (!contentType) {
    throw new Error(
      "Formato inválido. Envia PDF, JPG, PNG ou WEBP."
    );
  }

  const filePath =
    orderId + "/" + crypto.randomUUID() + "." + extension;

  const { error } = await db.storage
    .from("payment-proofs")
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType,
      upsert: false
    });

  if (error) {
    throw new Error(
      "Não foi possível guardar o comprovativo. Tenta novamente."
    );
  }

  return filePath;
}

$("storeOrderForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!db) {
    $("orderMessage").textContent =
      "A ligação à livraria não está disponível.";
    return;
  }

  const product = products.find(
    p => p.id === $("productId").value
  );

  if (!product) {
    $("orderMessage").textContent =
      "Escolhe novamente o livro.";
    return;
  }

  const buyerEmail = $("buyerEmail").value.trim();

  if (!buyerEmail) {
    $("orderMessage").textContent =
      "Introduz o endereço de e-mail.";
    return;
  }

  const proofFile = $("paymentProof").files[0] || null;

  if (Number(product.price) > 0 && !proofFile) {
    $("orderMessage").textContent =
      "Anexa o comprovativo de pagamento antes de enviar a encomenda.";
    $("paymentProof").focus();
    return;
  }

  const orderId = crypto.randomUUID();

  const accessCode = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessCode)
  );

  const accessCodeHash = Array.from(
    new Uint8Array(hashBuffer),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "A enviar...";

  try {
    let proofPath = null;

    if (proofFile) {
      proofPath = await uploadPaymentProof(proofFile, orderId);
    }

    const payload = {
      id: orderId,
      product_id: product.id,
      product_title: product.title,
      format: product.format,
      price: product.price,
      currency: product.currency || "AOA",
      buyer_name: $("buyerName").value.trim(),
      buyer_contact: $("buyerContact").value.trim(),
      buyer_email: buyerEmail,
      note: $("buyerNote").value.trim() || null,
      access_code_hash: accessCodeHash,
      payment_proof_path: proofPath
    };

    const { error } = await db
      .from("store_orders")
      .insert(payload);

    if (error) {
      throw new Error(
        "Não foi possível registar a encomenda. Tenta novamente."
      );
    }

    $("orderMessage").textContent = proofPath
      ? "Encomenda e comprovativo enviados com sucesso. Aguarda a verificação da equipa Sassa Hube."
      : "Pedido do livro gratuito recebido.";

    $("orderReceipt").classList.remove("hidden");
    $("createdOrderId").textContent = orderId;
    $("createdOrderCode").textContent = accessCode;

    event.target.reset();

  } catch (error) {
    $("orderMessage").textContent =
      error.message || "Ocorreu um erro ao enviar a encomenda.";
  } finally {
    button.disabled = false;
    button.textContent = "Enviar encomenda";
  }
});

$("downloadOrderForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!db) {
    $("downloadMessage").textContent =
      "A ligação à livraria não está disponível.";
    return;
  }

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "A verificar...";

  const downloadWindow = window.open("about:blank", "_blank");

  try {
    const { data, error } = await db.functions.invoke(
      "download-book",
      {
        body: {
          order_id: $("downloadOrderId").value.trim(),
          access_code: $("downloadAccessCode").value.trim()
        }
      }
    );

    if (error || !data?.download_url) {
      if (downloadWindow) downloadWindow.close();

      $("downloadMessage").textContent =
        data?.error ||
        "Não foi possível verificar a encomenda. Confirma os dados e tenta novamente.";

      return;
    }

    $("downloadMessage").textContent =
      "Acesso autorizado. O link é válido durante 5 minutos.";

    if (downloadWindow) {
      downloadWindow.location.href = data.download_url;
    } else {
      window.location.href = data.download_url;
    }

  } catch {
    if (downloadWindow) downloadWindow.close();

    $("downloadMessage").textContent =
      "Ocorreu um erro ao consultar a encomenda.";
  } finally {
    button.disabled = false;
    button.textContent = "Descarregar livro";
  }
});

loadStore();
