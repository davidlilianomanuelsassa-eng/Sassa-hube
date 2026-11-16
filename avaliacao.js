const ratingClient=window.supabase?.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const voteKey="sassa_hube_visitor_rating_v1";
const voteButtons=[...document.querySelectorAll("#voteLike,#voteDislike,[data-rating-vote]")];
const voteMessage=document.getElementById("voteMessage");
const ratingPrompt=document.getElementById("ratingPrompt");
const ratingPromptMessage=document.getElementById("ratingPromptMessage");
const ratingFloatingLink=document.getElementById("ratingFloatingLink");
let promptShown=false;

function visitorKey(){
  let key=localStorage.getItem(voteKey);
  if(!key){key=crypto.randomUUID();localStorage.setItem(voteKey,key);}
  return key;
}
function hasVoted(){return localStorage.getItem(voteKey+"_done")==="1";}
function closeRatingPrompt(){
  if(ratingPrompt) ratingPrompt.hidden=true;
  try{sessionStorage.setItem("sassa_rating_prompt_dismissed","1");}catch(_){}
}
function showRatingPrompt(){
  if(!ratingPrompt||hasVoted()||promptShown)return;
  try{if(sessionStorage.getItem("sassa_rating_prompt_dismissed")==="1")return;}catch(_){}
  promptShown=true;
  ratingPrompt.hidden=false;
}
async function refreshRatings(){
  if(!ratingClient)return;
  const {data,error}=await ratingClient.from("site_ratings").select("vote");
  if(error||!data)return;
  const likes=document.getElementById("likesCount");
  const dislikes=document.getElementById("dislikesCount");
  if(likes)likes.textContent=data.filter(x=>x.vote==="like").length;
  if(dislikes)dislikes.textContent=data.filter(x=>x.vote==="dislike").length;
}
async function sendVote(vote){
  if(hasVoted()){
    if(voteMessage)voteMessage.textContent="Já registaste a tua avaliação neste navegador. Obrigado!";
    if(ratingPromptMessage)ratingPromptMessage.textContent="Obrigado! Já recebemos a tua avaliação neste navegador.";
    closeRatingPrompt();
    return;
  }
  if(!ratingClient){
    if(voteMessage)voteMessage.textContent="A avaliação ainda não está disponível.";
    if(ratingPromptMessage)ratingPromptMessage.textContent="A avaliação ainda não está disponível.";
    return;
  }
  voteButtons.forEach(button=>button.disabled=true);
  const {error}=await ratingClient.from("site_ratings").insert({vote,visitor_key:visitorKey()});
  if(error){
    const message=error.code==="23505"?"Já registaste uma avaliação. Obrigado!":"Não foi possível registar. Tenta novamente mais tarde.";
    if(voteMessage)voteMessage.textContent=message;
    if(ratingPromptMessage)ratingPromptMessage.textContent=message;
    voteButtons.forEach(button=>button.disabled=false);
    return;
  }
  localStorage.setItem(voteKey+"_done","1");
  if(voteMessage)voteMessage.textContent="Obrigado pela tua opinião!";
  if(ratingPromptMessage)ratingPromptMessage.textContent="Obrigado pela tua opinião!";
  voteButtons.forEach(button=>{
    button.classList.toggle("selected",button.dataset.ratingVote===vote||button.id===(vote==="like"?"voteLike":"voteDislike"));
    button.disabled=true;
  });
  if(ratingFloatingLink)ratingFloatingLink.hidden=true;
  window.setTimeout(()=>{if(ratingPrompt)ratingPrompt.hidden=true;},1300);
  await refreshRatings();
}
voteButtons.forEach(button=>{
  const vote=button.dataset.ratingVote||(button.id==="voteLike"?"like":"dislike");
  button.addEventListener("click",()=>sendVote(vote));
});
document.getElementById("ratingPromptClose")?.addEventListener("click",closeRatingPrompt);
ratingFloatingLink?.addEventListener("click",()=>{if(ratingPrompt)ratingPrompt.hidden=true;});
if(hasVoted()&&ratingFloatingLink)ratingFloatingLink.hidden=true;
window.setTimeout(showRatingPrompt,10000);
document.addEventListener("mouseout",event=>{
  if(event.relatedTarget===null&&event.clientY<=0)showRatingPrompt();
});
refreshRatings();
