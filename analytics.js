/* SASSA HUBE — estatísticas de audiência com recolha mínima.
   Regista apenas página, domínio de origem e classe de dispositivo.
   Não recolhe nomes, e-mails, IP, identificadores persistentes ou conteúdo de formulários. */
(() => {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
  const path = window.location.pathname || "/";
  if (path.toLowerCase().endsWith("/admin.html")) return;
  const ua = navigator.userAgent || "";
  const device = /iPad|Tablet|PlayBook|Silk/i.test(ua) ? "tablet" :
    (/Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile" : "desktop");
  let source = "";
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin !== window.location.origin) source = ref.hostname.slice(0,120);
    }
  } catch (_) {}
  try {
    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    client.rpc("record_site_view", {
      p_page: path.slice(0,180),
      p_referrer: source,
      p_device: device
    }).then(({ error }) => {
      if (error) console.warn("Estatística de visita não registada:", error.message);
    }).catch(() => {});
  } catch (_) {}
})();
