// Carregamento de capas e PDFs na Livraria Sassa Hube.
const storeFormFiles=document.getElementById("storeProductForm");
if(storeFormFiles)storeFormFiles.addEventListener("submit",async e=>{
 e.preventDefault();e.stopImmediatePropagation();
 const msg=document.getElementById("storeAdminMsg"),btn=e.submitter;
 const say=(t,ok=false)=>{msg.textContent=t;msg.style.color=ok?"#16804a":"#b42318";};
 if(!db||!await isAdmin()){say("Acesso administrativo não confirmado.");return;}
 const coverFile=document.getElementById("storeCoverFile").files[0];
 const pdfFile=document.getElementById("storePdfFile").files[0];
 const format=document.getElementById("storeFormat").value;
 if(coverFile&&(coverFile.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(coverFile.type))){say("A capa deve ser JPG, PNG ou WEBP e ter até 5 MB.");return;}
 if(format==="Digital"&&(!pdfFile||pdfFile.type!=="application/pdf")){say("Para livro digital, selecciona um ficheiro PDF.");return;}
 if(pdfFile&&(pdfFile.type!=="application/pdf"||pdfFile.size>50*1024*1024)){say("O PDF deve ter até 50 MB.");return;}
 btn.disabled=true;const old=btn.textContent;btn.textContent="A carregar ficheiros...";
 try{
  const {data:{user}}=await db.auth.getUser();if(!user)throw new Error("Sessão expirada.");
  let coverUrl=document.getElementById("storeCover").value.trim()||null,pdfPath=null;
  if(coverFile){const path=user.id+"/"+crypto.randomUUID()+"-"+coverFile.name.replace(/[^a-zA-Z0-9._-]/g,"-");const up=await db.storage.from("store-assets").upload(path,coverFile,{contentType:coverFile.type});if(up.error)throw up.error;coverUrl=db.storage.from("store-assets").getPublicUrl(path).data.publicUrl;}
  if(pdfFile){pdfPath=user.id+"/"+crypto.randomUUID()+".pdf";const up=await db.storage.from("store-files").upload(pdfPath,pdfFile,{contentType:"application/pdf"});if(up.error)throw up.error;}
  const {error}=await db.from("store_products").insert({title:document.getElementById("storeTitle").value.trim(),description:document.getElementById("storeDescription").value.trim()||null,price:Number(document.getElementById("storePrice").value),currency:document.getElementById("storeCurrency").value,format,cover_url:coverUrl,pdf_path:pdfPath,active:true});
  if(error)throw error;
  say("Livro adicionado ao catálogo com os ficheiros carregados.",true);storeFormFiles.reset();
 }catch(err){console.error(err);say("Não foi possível carregar. Confirma se executaste supabase-pagamentos.sql e as permissões do Supabase.");}
 finally{btn.disabled=false;btn.textContent=old;}
},true);
