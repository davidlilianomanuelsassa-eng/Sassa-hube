import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { order_id, access_code } = await req.json();
    if (typeof order_id !== "string" || typeof access_code !== "string" || access_code.length < 30 || access_code.length > 100) {
      return new Response(JSON.stringify({ error: "Referência ou código de acesso inválido." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Configuração do servidor incompleta.");

    const supabase = createClient(url, serviceKey);
    const { data: order, error: orderError } = await supabase
      .from("store_orders")
      .select("id, product_id, format, status, access_code_hash")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError || !order || !order.access_code_hash || order.access_code_hash !== await sha256(access_code)) {
      return new Response(JSON.stringify({ error: "Não foi possível validar a encomenda. Confirma a referência e o código." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (order.format !== "Digital") {
      return new Response(JSON.stringify({ error: "Esta encomenda não corresponde a um livro digital." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!["confirmed", "free_delivered", "delivered"].includes(order.status)) {
      return new Response(JSON.stringify({ error: "A encomenda ainda aguarda confirmação do pagamento." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: product, error: productError } = await supabase
      .from("store_products")
      .select("digital_file_path")
      .eq("id", order.product_id)
      .maybeSingle();
    if (productError || !product?.digital_file_path) {
      return new Response(JSON.stringify({ error: "O ficheiro deste livro ainda não está disponível." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("store-files")
      .createSignedUrl(product.digital_file_path, 5 * 60);
    if (signedError || !signed?.signedUrl) throw new Error("Não foi possível preparar a descarga segura.");

    return new Response(JSON.stringify({ download_url: signed.signedUrl, expires_in_seconds: 300 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Ocorreu um erro ao preparar a descarga. Tenta novamente." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
