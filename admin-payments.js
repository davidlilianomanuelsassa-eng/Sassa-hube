// Avisos no painel e revisão manual dos comprovativos de transferência.
const proofBox=document.getElementById("paymentProofs"),proofBadge=document.getElementById("paymentNoticeBadge");
async function loadPaymentProofs(){
 if(!db||!proofBox||document.getElementById("dashboard").classList.contains("hidden"))return;
 const {data,error}=await db.from("store_payment_proofs").select("id,order_id,proof_path,status,submitted_at,store_orders(product_title,buyer_name,buyer_contact,price,currency)").order("submitted_at",{ascending:false});
 if(error){proofBox.textContent="Não foi possível carregar comprovativos. Confirma a instalação do SQL de pagamentos.";return;}
 const pending=(data||[]).filter(p=>p.status==="pending");proofBadge.textContent=pending.length+" por verificar";
 proofBadge.style.cssText="display:inline-block;margin-left:8px;padding:5px 9px;border-radius:20px;background:"+(pending.length?"#fff1d6":"#eef2f6")+";color:#173f78;font-size:11px";
 proofBox.replaceChildren();
 if(!data?.length){proofBox.textContent="Ainda não recebeste comprovativos.";return;}
 for(const p of data){
  const row=document.createElement("article");row.className="admin-row store-order-row";
  const details=document.createElement("div"),o=p.store_orders||{};
  const title=document.createElement("strong");title.textContent=(o.product_title||"Livro")+" · "+(o.buyer_name||"Comprador");
  const meta=document.createElement("small");meta.textContent=(o.buyer_contact||"")+" · "+new Intl.NumberFormat("pt-AO",{style:"currency",currency:o.currency||"AOA"}).format(Number(o.price||0))+" · "+new Date(p.submitted_at).toLocaleString("pt-PT");
  const state=document.createElement("small");state.textContent="Comprovativo: "+({pending:"Por verificar",accepted:"Aceite",rejected:"Rejeitado"})[p.status];details.append(title,meta,state);
  const actions=document.createElement("div");actions.style.cssText="display:flex;gap:7px;flex-wrap:wrap";
  const signed=await db.storage.from("payment-proofs").createSignedUrl(p.proof_path,300);
  if(!signed.error){const a=document.createElement("a");a.href=signed.data.signedUrl;a.target="_blank";a.rel="noopener";a.className="btn btn-outline";a.textContent="Ver comprovativo";actions.append(a);}
  if(p.status==="pending"){
   for(const [label,status] of [["Confirmar pagamento","accepted"],["Rejeitar","rejected"]]){
    const b=document.createElement("button");b.type="button";b.className="btn "+(status==="accepted"?"btn-primary":"btn-outline");b.textContent=label;
    b.addEventListener("click",async()=>{b.disabled=true;const {data:{user}}=await db.auth.getUser();const upd=await db.from("store_payment_proofs").update({status,reviewed_at:new Date().toISOString(),reviewed_by:user?.id||null}).eq("id",p.id);if(upd.error){b.disabled=false;alert("Não foi possível actualizar o comprovativo.");return;}if(status==="accepted"){const ord=await db.from("store_orders").update({status:"confirmed"}).eq("id",p.order_id);if(ord.error)alert("Comprovativo aceite, mas não foi possível actualizar o estado da encomenda. Actualiza-o manualmente.");}await loadPaymentProofs();await loadStoreOrders();});
    actions.append(b);
   }
  }
  row.append(details,actions);proofBox.append(row);
 }
}
document.getElementById("refreshPaymentProofs")?.addEventListener("click",loadPaymentProofs);
setInterval(loadPaymentProofs,30000);
const dashboardNode=document.getElementById("dashboard");
new MutationObserver(()=>{if(!dashboardNode.classList.contains("hidden"))loadPaymentProofs();}).observe(dashboardNode,{attributes:true,attributeFilter:["class"]});
