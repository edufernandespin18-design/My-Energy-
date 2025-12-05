/* My Energy SPA - corrigido para Netlify/localStorage */
const DB_KEY="myenergy_db_v1";
let DB=null, currentUser=null, chartInstance=null;

/* ---------- Storage ---------- */
function loadDB(){ 
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){
    const seed = {users:[{id:idGen(),name:"Admin",email:"admin@myenergy.local",password:hash("admin123"),role:"admin",createdAt:Date.now()}],
                  clients:[], houses:[], consumptions:[], passwordTokens:[]};
    localStorage.setItem(DB_KEY,JSON.stringify(seed)); return seed;
  }
  return JSON.parse(raw);
}
function saveDB(){ localStorage.setItem(DB_KEY,JSON.stringify(DB)); }
function idGen(){ return 'id_'+Math.random().toString(36).slice(2,9); }
function hash(s){ return btoa(s).slice(0,12); }
function nowISO(d=new Date()){ return d.toISOString().slice(0,10); }

/* ---------- Auth ---------- */
function findUserByEmail(email){ return DB.users.find(u=>u.email.toLowerCase()===email.toLowerCase()); }
function login(email,pass){
  const u=findUserByEmail(email);
  if(!u) return {ok:false,msg:"Usuário não encontrado"};
  if(u.password!==hash(pass)) return {ok:false,msg:"Senha incorreta"};
  currentUser=u; sessionStorage.setItem("myenergy_session",u.id); return {ok:true};
}
function logout(){ currentUser=null; sessionStorage.removeItem("myenergy_session"); showView("view-login"); }
function registerUser(name,email,pass,role="user"){
  if(!name||!email||!pass) return {ok:false,msg:"Preencha todos os campos"};
  if(findUserByEmail(email)) return {ok:false,msg:"Email já cadastrado"};
  const u={id:idGen(),name,email,password:hash(pass),role,createdAt:Date.now()};
  DB.users.push(u); saveDB(); return {ok:true,user:u};
}
function generateTokenFor(email){
  const u=findUserByEmail(email);
  if(!u) return {ok:false,msg:"Email não encontrado"};
  const token=Math.random().toString(36).slice(2,8).toUpperCase();
  DB.passwordTokens.push({email:u.email,token,expires:Date.now()+3600000}); saveDB();
  return {ok:true,token};
}
function resetPassword(email,token,newPass){
  const rec=DB.passwordTokens.find(t=>t.email===email&&t.token===token&&t.expires>Date.now());
  if(!rec) return {ok:false,msg:"Token inválido ou expirado"};
  const u=findUserByEmail(email); if(!u) return {ok:false,msg:"Usuário não encontrado"};
  u.password=hash(newPass); DB.passwordTokens=DB.passwordTokens.filter(t=>!(t.email===email&&t.token===token)); saveDB();
  return {ok:true};
}

/* ---------- Session ---------- */
function loadSession(){
  const id=sessionStorage.getItem("myenergy_session");
  if(!id) return;
  const u=DB.users.find(x=>x.id===id);
  if(u) currentUser=u;
}

/* ---------- Views ---------- */
function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  const nav=document.getElementById("topNav");
  if(currentUser) nav.classList.remove("hidden"); else nav.classList.add("hidden");
  document.querySelectorAll(".admin-only").forEach(el=>el.style.display=currentUser&&currentUser.role==="admin"?"inline-block":"none");
}

/* ---------- CRUD ---------- */
function addClient(userId,name,contact=""){ const c={id:idGen(),userId,name,contact,createdAt:Date.now()}; DB.clients.push(c); saveDB(); return c; }
function updateClient(id,fields){ const c=DB.clients.find(x=>x.id===id); if(!c)return; Object.assign(c,fields); saveDB(); return c; }
function removeClient(id){
  const houseIds=DB.houses.filter(h=>h.clientId===id).map(h=>h.id);
  DB.houses=DB.houses.filter(h=>h.clientId!==id);
  DB.consumptions=DB.consumptions.filter(c=>!houseIds.includes(c.houseId));
  DB.clients=DB.clients.filter(c=>c.id!==id); saveDB();
}
function addHouse(clientId,label,address){ const h={id:idGen(),clientId,label,address,createdAt:Date.now()}; DB.houses.push(h); saveDB(); return h; }
function updateHouse(id,fields){ const h=DB.houses.find(x=>x.id===id); if(!h)return; Object.assign(h,fields); saveDB(); return h; }
function removeHouse(id){ DB.houses=DB.houses.filter(h=>h.id!==id); DB.consumptions=DB.consumptions.filter(c=>c.houseId!==id); saveDB(); }
function addConsumption(houseId,date,kwh,note=""){ const c={id:idGen(),houseId,date,kwh:parseFloat(kwh),note,createdAt:Date.now()}; DB.consumptions.push(c); saveDB(); return c; }
function updateConsumption(id,fields){ const c=DB.consumptions.find(x=>x.id===id); if(!c)return; Object.assign(c,fields); saveDB(); return c; }
function removeConsumption(id){ DB.consumptions=DB.consumptions.filter(c=>c.id!==id); saveDB(); }

/* ---------- Dashboard ---------- */
function refreshDashboard(){
  if(!currentUser)return;
  const userClients=DB.clients.filter(c=>c.userId===currentUser.id);
  const houses=DB.houses.filter(h=>userClients.map(c=>c.id).includes(h.clientId));
  const houseIds=houses.map(h=>h.id);
  const consumptions=DB.consumptions.filter(c=>houseIds.includes(c.houseId));

  const total=consumptions.reduce((s,c)=>s+c.kwh,0);
  const media=consumptions.length?total/consumptions.length:0;

  document.getElementById("dashTotal").innerText=`Consumo Total: ${total.toFixed(2)} kWh`;
  document.getElementById("dashMedia").innerText=`Média: ${media.toFixed(2)} kWh`;
  document.getElementById("dashMeta").innerText=`Residências: ${houses.length}`;

  const selClient=document.getElementById("selectClient"); selClient.innerHTML="";
  const emptyOpt=document.createElement("option"); emptyOpt.value=""; emptyOpt.innerText="-- selecione cliente --";
  selClient.appendChild(emptyOpt);
  userClients.forEach(c=>{ const o=document.createElement("option"); o.value=c.id;o.innerText=c.name; selClient.appendChild(o); });

  const selHouse=document.getElementById("selectHouse"); selHouse.innerHTML="<option value=''>-- selecione residência --</option>";
  document.getElementById("consumptionList").innerHTML="<small class='muted'>Selecione uma residência para ver os consumos.</small>";
  updateChart([],[]);
}
function onClientChange(cid){
  const sel=document.getElementById("selectHouse"); sel.innerHTML="<option value=''>-- selecione residência --</option>";
  if(!cid)return;
  const houses=DB.houses.filter(h=>h.clientId===cid);
  houses.forEach(h=>{ const o=document.createElement("option"); o.value=h.id; o.innerText=`${h.label} — ${h.address||""}`; sel.appendChild(o); });
}
function onHouseChange(hid){
  const list=document.getElementById("consumptionList"); list.innerHTML="";
  if(!hid){ list.innerHTML="<small class='muted'>Selecione uma residência para ver os consumos.</small>"; updateChart([],[]); return; }
  const cons=DB.consumptions.filter(c=>c.houseId===hid).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(cons.length===0) list.innerHTML="<small class='muted'>Nenhum consumo registrado.</small>";
  cons.forEach(c=>{ const div=document.createElement("div"); div.className="item"; div.innerHTML=`<div><strong>${c.kwh.toFixed(2)} kWh</strong><br/><small>${c.date} ${c.note? "• "+c.note : ""}</small></div><div class="actions"><button class="btn btn-edit" data-action="edit-cons" data-id="${c.id}">Editar</button><button class="btn btn-danger" data-action="del-cons" data-id="${c.id}">Apagar</button></div>`; list.appendChild(div); });
  updateChart(cons.map(c=>c.date),cons.map(c=>c.kwh));
}
function updateChart(labels,data){
  const ctx=document.getElementById("dashChart").getContext("2d");
  if(chartInstance){ chartInstance.data.labels=labels; chartInstance.data.datasets[0].data=data; chartInstance.update(); return; }
  chartInstance=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'kWh',data,borderColor:'#4c63ff',backgroundColor:'rgba(76,99,255,0.15)',fill:true,tension:0.3}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
}

/* ---------- Boot ---------- */
function boot(){
  DB=loadDB(); loadSession(); bindUI(); if(currentUser)initAfterAuth(); else showView("view-login");
}
function initAfterAuth(){ showView("view-dashboard"); refreshDashboard(); renderClientsList(); renderUsersList(); renderProfile(); }

/* ---------- Helpers ---------- */
function toast(msg,color="red"){ const el=document.getElementById("generalMsg"); el.innerText=msg; showView("view-msg"); }

/* ---------- Bindings ---------- */
function bindUI(){
  // nav
  document.getElementById("navDashboard").addEventListener("click",()=>{showView("view-dashboard");refreshDashboard();});
  document.getElementById("navClients").addEventListener("click",()=>{showView("view-clients");renderClientsList();});
  document.getElementById("navUsers").addEventListener("click",()=>{showView("view-users");renderUsersList();});
  document.getElementById("navProfile").addEventListener("click",()=>{showView("view-profile");renderProfile();});
  document.getElementById("logoutBtn").addEventListener("click",()=>{logout();});

  // login/register/forgot/reset buttons
  document.getElementById("loginBtn").addEventListener("click",()=>{ const e=document.getElementById("loginEmail").value.trim(); const p=document.getElementById("loginPassword").value; const r=login(e,p); if(!r.ok){document.getElementById("loginMsg").innerText=r.msg; return;} document.getElementById("loginMsg").innerText=""; document.getElementById("loginEmail").value=""; document.getElementById("loginPassword").value=""; initAfterAuth(); });
  document.getElementById("toRegister").addEventListener("click",()=>showView("view-register"));
  document.getElementById("toForgot").addEventListener("click",()=>showView("view-forgot"));
  document.getElementById("backToLogin1").addEventListener("click",()=>showView("view-login"));
  document.getElementById("backToLogin2").addEventListener("click",()=>showView("view-login"));
  document.getElementById("backToLogin3").addEventListener("click",()=>showView("view-login"));
  document.getElementById("registerBtn").addEventListener("click",()=>{ const n=document.getElementById("regName").value.trim(); const e=document.getElementById("regEmail").value.trim(); const p=document.getElementById("regPassword").value; const r=document.getElementById("regRole").value; const res=registerUser(n,e,p,r); if(!res.ok){document.getElementById("registerMsg").innerText=res.msg; return;} const msgEl=document.getElementById("registerMsg"); msgEl.style.color="green"; msgEl.innerText="Usuário cadastrado com sucesso. Faça login."; setTimeout(()=>{msgEl.innerText="";showView("view-login");},1000);});
  document.getElementById("forgotBtn").addEventListener("click",()=>{ const e=document.getElementById("forgotEmail").value.trim(); const res=generateTokenFor(e); const out=document.getElementById("forgotResult"); if(!res.ok){ out.innerText=res.msg; out.style.color="red"; return;} out.style.color="black"; out.innerHTML=`<strong>Token (simulado):</strong> ${res.token} <br/><small>Copie e use em Redefinir senha.</small>`; });
  document.getElementById("resetBtn").addEventListener("click",()=>{ const e=document.getElementById("resetEmail").value.trim(); const t=document.getElementById("resetToken").value.trim(); const p=document.getElementById("resetPassword").value; const r=resetPassword(e,t,p); const el=document.getElementById("resetMsg"); if(!r.ok){ el.style.color="red"; el.innerText=r.msg; return;} el.style.color="green"; el.innerText="Senha redefinida com sucesso."; setTimeout(()=>showView("view-login"),1000); });

  // dashboard selects
  document.getElementById("selectClient").addEventListener("change",(e)=>onClientChange(e.target.value));
  document.getElementById("selectHouse").addEventListener("change",(e)=>onHouseChange(e.target.value));
  document.getElementById("addConsumptionBtn").addEventListener("click",()=>{
    const hid=document.getElementById("selectHouse").value; const k=document.getElementById("inputKwh").value; const d=document.getElementById("inputDate").value||nowISO(); const n=document.getElementById("inputNote").value;
    if(!hid){ alert("Selecione residência"); return;} if(!k||isNaN(k)||k<=0){alert("Informe kWh válido");return;}
    addConsumption(hid,d,parseFloat(k),n); document.getElementById("inputKwh").value=""; document.getElementById("inputNote").value=""; onHouseChange(hid); refreshDashboard();
  });

  // consumption edit/delete
  document.getElementById("consumptionList").addEventListener("click",(e)=>{
    const btn=e.target.closest("button"); if(!btn)return; const a=btn.dataset.action; const id=btn.dataset.id;
    if(a==="del-cons"){ if(!confirm("Apagar consumo?")) return; removeConsumption(id); onHouseChange(document.getElementById("selectHouse").value); refreshDashboard(); }
    if(a==="edit-cons"){ const c=DB.consumptions.find(x=>x.id===id); if(!c)return; const nk=prompt("kWh",c.kwh); const nd=prompt("Data (YYYY-MM-DD)",c.date); const nn=prompt("Observação",c.note); if(nk)updateConsumption(id,{kwh:parseFloat(nk),date:nd||c.date,note:nn||c.note}); onHouseChange(c.houseId); refreshDashboard(); }
  });

  document.getElementById("msgBack").addEventListener("click",()=>{ if(currentUser)showView("view-dashboard"); else showView("view-login");});
}
