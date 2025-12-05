/* My Energy - SPA (Front-end multiusuário com localStorage)
   - autenticação simples (localStorage)
   - CRUD: users, clients, houses, consumptions
   - recuperação de senha com token simulado (mostra token no UI)
   - gráfico por residência usando Chart.js
*/

/* ---------- Helpers & Storage ---------- */
const DB_KEY = "myenergy_db_v1";

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const seed = {
      users: [
        { id: idGen(), name: "Admin", email: "admin@myenergy.local", password: hash("admin123"), role: "admin", createdAt: Date.now() }
      ],
      clients: [], // {id, userId(owner), name, contact}
      houses: [],  // {id, clientId, label, address}
      consumptions: [], // {id, houseId, date, kwh, note}
      passwordTokens: [] // {email, token, expires}
    };
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw);
}

function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function idGen() { return 'id_' + Math.random().toString(36).slice(2, 9); }
function nowISO(d = new Date()) { return d.toISOString().slice(0,10); }

/* Nota: hash simples somente para protótipo */
function hash(s){ return btoa(s).slice(0,12); }

/* Simple notification */
function toast(msg, color="red"){ const el = document.getElementById("generalMsg"); el.innerText = msg; showView("view-msg"); }

/* ---------- App State ---------- */
let DB = loadDB();
let currentUser = null;
let chartInstance = null;

/* ---------- UI helpers ---------- */
function showView(id){
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");

  // nav visibility
  const nav = document.getElementById("topNav");
  if (currentUser) nav.classList.remove("hidden"); else nav.classList.add("hidden");
  // admin-only UI
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = currentUser && currentUser.role === "admin" ? "inline-block" : "none";
  });
}

/* ---------- Auth flows ---------- */
function findUserByEmail(email){ return DB.users.find(u => u.email.toLowerCase() === email.toLowerCase()); }

function login(email, password) {
  const u = findUserByEmail(email);
  if (!u) return {ok:false, msg:"Usuário não encontrado"};
  if (u.password !== hash(password)) return {ok:false, msg:"Senha incorreta"};
  currentUser = u;
  sessionStorage.setItem("myenergy_session", u.id);
  return {ok:true};
}

function logout(){
  currentUser = null;
  sessionStorage.removeItem("myenergy_session");
  showView("view-login");
}

function registerUser(name, email, password, role="user"){
  if (!name || !email || !password) return {ok:false, msg:"Preencha todos os campos"};
  if (findUserByEmail(email)) return {ok:false, msg:"Email já cadastrado"};
  const newU = { id: idGen(), name, email, password: hash(password), role, createdAt: Date.now() };
  DB.users.push(newU); saveDB(DB);
  return {ok:true, user:newU};
}

/* Password recovery (simulado): gera token e guarda em DB.passwordTokens */
function generateTokenFor(email){
  const user = findUserByEmail(email);
  if (!user) return {ok:false, msg:"Email não encontrado"};
  const token = Math.random().toString(36).slice(2,8).toUpperCase();
  const expires = Date.now() + 1000 * 60 * 60; // 1h
  DB.passwordTokens.push({ email: user.email, token, expires });
  saveDB(DB);
  return {ok:true, token};
}

function resetPassword(email, token, newPass){
  const rec = DB.passwordTokens.find(t => t.email === email && t.token === token && t.expires > Date.now());
  if (!rec) return {ok:false, msg:"Token inválido ou expirado"};
  const user = findUserByEmail(email);
  if (!user) return {ok:false, msg:"Usuário não encontrado"};
  user.password = hash(newPass);
  // remove token
  DB.passwordTokens = DB.passwordTokens.filter(t => !(t.email===email && t.token===token));
  saveDB(DB);
  return {ok:true};
}

/* ---------- Load session ---------- */
function loadSession(){
  const id = sessionStorage.getItem("myenergy_session");
  if (!id) return;
  const u = DB.users.find(x => x.id === id);
  if (u) currentUser = u;
}

/* ---------- CRUD: Clients / Houses / Consumptions ---------- */
function addClient(userId, name, contact){
  const c = { id: idGen(), userId, name, contact: contact||"", createdAt: Date.now() };
  DB.clients.push(c); saveDB(DB); return c;
}
function updateClient(id, fields){ const c = DB.clients.find(x=>x.id===id); if (!c) return; Object.assign(c, fields); saveDB(DB); return c; }
function removeClient(id){
  // remove houses + consumptions for that client
  const houseIds = DB.houses.filter(h => h.clientId === id).map(h => h.id);
  DB.houses = DB.houses.filter(h => h.clientId !== id);
  DB.consumptions = DB.consumptions.filter(cons => !houseIds.includes(cons.houseId));
  DB.clients = DB.clients.filter(c => c.id !== id);
  saveDB(DB);
}

function addHouse(clientId, label, address){
  const h = { id: idGen(), clientId, label, address, createdAt: Date.now() };
  DB.houses.push(h); saveDB(DB); return h;
}
function updateHouse(id, fields){ const h = DB.houses.find(x=>x.id===id); if (!h) return; Object.assign(h, fields); saveDB(DB); return h; }
function removeHouse(id){
  DB.houses = DB.houses.filter(h => h.id !== id);
  DB.consumptions = DB.consumptions.filter(c => c.houseId !== id);
  saveDB(DB);
}

function addConsumption(houseId, date, kwh, note){
  const c = { id: idGen(), houseId, date, kwh: parseFloat(kwh), note: note||"", createdAt: Date.now() };
  DB.consumptions.push(c); saveDB(DB); return c;
}
function updateConsumption(id, fields){ const c = DB.consumptions.find(x=>x.id===id); if(!c) return; Object.assign(c, fields); saveDB(DB); return c; }
function removeConsumption(id){ DB.consumptions = DB.consumptions.filter(c => c.id !== id); saveDB(DB); }

/* ---------- UI renderers ---------- */
function refreshDashboard(){
  if (!currentUser) return;
  const userClients = DB.clients.filter(c => c.userId === currentUser.id);
  const houses = DB.houses.filter(h => userClients.map(c=>c.id).includes(h.clientId));
  const houseIds = houses.map(h=>h.id);
  const consumptions = DB.consumptions.filter(co => houseIds.includes(co.houseId));

  const total = consumptions.reduce((s, c) => s + c.kwh, 0);
  const media = consumptions.length ? total / consumptions.length : 0;

  document.getElementById("dashTotal").innerText = `Consumo Total: ${total.toFixed(2)} kWh`;
  document.getElementById("dashMedia").innerText = `Média: ${media.toFixed(2)} kWh`;
  document.getElementById("dashMeta").innerText = `Residências: ${houses.length}`;

  // populate client select
  const selClient = document.getElementById("selectClient");
  selClient.innerHTML = "";
  const emptyOpt = document.createElement("option"); emptyOpt.value=""; emptyOpt.innerText = "-- selecione cliente --";
  selClient.appendChild(emptyOpt);
  userClients.forEach(c => {
    const opt = document.createElement("option"); opt.value = c.id; opt.innerText = c.name;
    selClient.appendChild(opt);
  });

  // clear houses select
  const selHouse = document.getElementById("selectHouse");
  selHouse.innerHTML = "<option value=''>-- selecione residência --</option>";

  // show list of consumptions (initially empty until house selected)
  document.getElementById("consumptionList").innerHTML = "<small class='muted'>Selecione uma residência para ver os consumos.</small>";

  // clear chart
  updateChart([], []);
}

/* populate houses when client selected */
function onClientChange(clientId){
  const housesSel = document.getElementById("selectHouse");
  housesSel.innerHTML = "<option value=''>-- selecione residência --</option>";
  if (!clientId) return;
  const houses = DB.houses.filter(h => h.clientId === clientId);
  houses.forEach(h => {
    const opt = document.createElement("option"); opt.value = h.id; opt.innerText = `${h.label} — ${h.address || ""}`;
    housesSel.appendChild(opt);
  });
}

/* when house selected, show consumption list + chart */
function onHouseChange(houseId){
  const list = document.getElementById("consumptionList");
  list.innerHTML = "";
  if (!houseId) { list.innerHTML = "<small class='muted'>Selecione uma residência para ver os consumos.</small>"; updateChart([], []); return; }
  const consumos = DB.consumptions.filter(c => c.houseId === houseId).sort((a,b)=> new Date(a.date) - new Date(b.date));
  if (consumos.length === 0) list.innerHTML = "<small class='muted'>Nenhum consumo registrado.</small>";
  consumos.forEach(c => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<div>
        <strong>${c.kwh.toFixed(2)} kWh</strong><br/>
        <small>${c.date} ${c.note ? "• "+c.note : ""}</small>
      </div>
      <div class="actions">
        <button class="btn btn-edit" data-action="edit-cons" data-id="${c.id}">Editar</button>
        <button class="btn btn-danger" data-action="del-cons" data-id="${c.id}">Apagar</button>
      </div>`;
    list.appendChild(div);
  });

  // prepare chart
  const labels = consumos.map(c => c.date);
  const data = consumos.map(c => c.kwh);
  updateChart(labels, data);
}

/* Chart update */
function updateChart(labels, data){
  const ctx = document.getElementById("dashChart").getContext("2d");
  if (chartInstance) { chartInstance.data.labels = labels; chartInstance.data.datasets[0].data = data; chartInstance.update(); return; }
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'kWh',
        data,
        borderColor: '#4c63ff',
        backgroundColor: 'rgba(76,99,255,0.15)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive:true,
      scales:{ y:{ beginAtZero:true } }
    }
  });
}

/* CLIENTS UI */
function renderClientsList(){
  const userClients = DB.clients.filter(c => c.userId === currentUser.id);
  const cont = document.getElementById("clientsList"); cont.innerHTML = "";
  userClients.forEach(c => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<div>
        <strong>${c.name}</strong><br/><small>${c.contact||""}</small>
      </div>
      <div class="actions">
        <button class="btn" data-action="select-client" data-id="${c.id}">Selecionar</button>
        <button class="btn btn-edit" data-action="edit-client" data-id="${c.id}">Editar</button>
        <button class="btn btn-danger" data-action="del-client" data-id="${c.id}">Apagar</button>
      </div>`;
    cont.appendChild(div);
  });
}

/* HOUSES UI for selected client */
let currentClientSelected = null;
function renderHousesList(clientId){
  currentClientSelected = clientId;
  const title = document.getElementById("housesTitle");
  const cont = document.getElementById("housesList");
  if (!clientId) { title.innerText = "Selecione um cliente"; cont.innerHTML = ""; return; }
  const client = DB.clients.find(c => c.id === clientId);
  title.innerText = `Residências de ${client.name}`;
  const houses = DB.houses.filter(h => h.clientId === clientId);
  cont.innerHTML = "";
  houses.forEach(h => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<div>
        <strong>${h.label}</strong><br/><small>${h.address || ""}</small>
      </div>
      <div class="actions">
        <button class="btn" data-action="select-house" data-id="${h.id}">Abrir</button>
        <button class="btn btn-edit" data-action="edit-house" data-id="${h.id}">Editar</button>
        <button class="btn btn-danger" data-action="del-house" data-id="${h.id}">Apagar</button>
      </div>`;
    cont.appendChild(div);
  });
}

/* USERS UI (admin) */
function renderUsersList(){
  const cont = document.getElementById("usersList"); cont.innerHTML = "";
  DB.users.forEach(u => {
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `<div>
      <strong>${u.name}</strong><br/><small>${u.email} • ${u.role}</small>
    </div>
    <div class="actions">
      <button class="btn btn-edit" data-action="edit-user" data-id="${u.id}">Editar</button>
      <button class="btn btn-danger" data-action="del-user" data-id="${u.id}">Apagar</button>
    </div>`;
    cont.appendChild(div);
  });
}

/* PROFILE */
function renderProfile(){
  if (!currentUser) return;
  document.getElementById("profileName").value = currentUser.name;
  document.getElementById("profileEmail").value = currentUser.email;
  document.getElementById("profilePassword").value = "";
}

/* ---------- Event bindings ---------- */
function bindUI(){
  // initial nav buttons
  document.getElementById("navDashboard").addEventListener("click", ()=> { showView("view-dashboard"); refreshDashboard(); });
  document.getElementById("navClients").addEventListener("click", ()=> { showView("view-clients"); renderClientsList(); });
  document.getElementById("navUsers").addEventListener("click", ()=> { showView("view-users"); renderUsersList(); });
  document.getElementById("navProfile").addEventListener("click", ()=> { showView("view-profile"); renderProfile(); });
  document.getElementById("logoutBtn").addEventListener("click", ()=> { logout(); });

  // login / register navigation
  document.getElementById("toRegister").addEventListener("click", ()=> showView("view-register"));
  document.getElementById("backToLogin1").addEventListener("click", ()=> showView("view-login"));
  document.getElementById("backToLogin2").addEventListener("click", ()=> showView("view-login"));
  document.getElementById("backToLogin3").addEventListener("click", ()=> showView("view-login"));
  document.getElementById("toForgot").addEventListener("click", ()=> showView("view-forgot"));

  // login form
  document.getElementById("loginBtn").addEventListener("click", ()=>{
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPassword").value;
    const res = login(email, pass);
    if (!res.ok) { document.getElementById("loginMsg").innerText = res.msg; return; }
    document.getElementById("loginMsg").innerText = "";
    document.getElementById("loginEmail").value = ""; document.getElementById("loginPassword").value = "";
    initAfterAuth();
  });

  // register user (public)
  document.getElementById("registerBtn").addEventListener("click", ()=>{
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const pass = document.getElementById("regPassword").value;
    const role = document.getElementById("regRole").value;
    const r = registerUser(name,email,pass,role);
    if (!r.ok) { document.getElementById("registerMsg").innerText = r.msg; return; }
    document.getElementById("registerMsg").style.color = "green";
    document.getElementById("registerMsg").innerText = "Usuário cadastrado com sucesso. Faça login.";
    setTimeout(()=>{ document.getElementById("registerMsg").innerText = ""; showView("view-login"); }, 1000);
  });

  // password recovery
  document.getElementById("forgotBtn").addEventListener("click", ()=>{
    const email = document.getElementById("forgotEmail").value.trim();
    const result = generateTokenFor(email);
    const out = document.getElementById("forgotResult");
    if (!result.ok) { out.innerText = result.msg; out.style.color = "red"; return; }
    out.style.color = "black";
    out.innerHTML = `<strong>Token (simulado):</strong> ${result.token} <br/><small>Copie e use em Redefinir senha.</small>`;
  });

  document.getElementById("resetBtn").addEventListener("click", ()=>{
    const email = document.getElementById("resetEmail").value.trim();
    const token = document.getElementById("resetToken").value.trim();
    const np = document.getElementById("resetPassword").value;
    const res = resetPassword(email, token, np);
    const el = document.getElementById("resetMsg");
    if (!res.ok) { el.style.color="red"; el.innerText = res.msg; return; }
    el.style.color="green"; el.innerText="Senha redefinida com sucesso.";
    setTimeout(()=>{ showView("view-login"); }, 1000);
  });

  /* Dashboard selects & add consumption */
  document.getElementById("selectClient").addEventListener("change", (e)=> onClientChange(e.target.value));
  document.getElementById("selectHouse").addEventListener("change", (e)=> onHouseChange(e.target.value));
  document.getElementById("addConsumptionBtn").addEventListener("click", ()=>{
    const hid = document.getElementById("selectHouse").value;
    const kwh = document.getElementById("inputKwh").value;
    const date = document.getElementById("inputDate").value || nowISO();
    const note = document.getElementById("inputNote").value;
    if (!hid) return alert("Selecione uma residência");
    if (!kwh || isNaN(kwh) || kwh<=0) return alert("Informe kWh válido");
    addConsumption(hid, date, parseFloat(kwh), note);
    document.getElementById("inputKwh").value=""; document.getElementById("inputNote").value="";
    onHouseChange(hid);
    refreshDashboard();
  });

  /* consumption edit/delete via delegation */
  document.getElementById("consumptionList").addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === "del-cons") {
      if (!confirm("Apagar consumo?")) return;
      removeConsumption(id);
      const selHouse = document.getElementById("selectHouse").value;
      onHouseChange(selHouse);
      refreshDashboard();
    } else if (action === "edit-cons") {
      const cons = DB.consumptions.find(c=>c.id===id);
      if (!cons) return;
      const newK = prompt("kWh", cons.kwh);
      const newD = prompt("Data (YYYY-MM-DD)", cons.date);
      const newN = prompt("Observação", cons.note);
      if (newK) updateConsumption(id, { kwh: parseFloat(newK), date: newD||cons.date, note: newN||cons.note });
      onHouseChange(cons.houseId);
      refreshDashboard();
    }
  });

  /* Clients area */
  document.getElementById("addClientBtn").addEventListener("click", ()=>{
    const name = document.getElementById("clientName").value.trim();
    const contact = document.getElementById("clientContact").value.trim();
    if (!name) return alert("Nome do cliente é obrigatório");
    addClient(currentUser.id, name, contact);
    document.getElementById("clientName").value=""; document.getElementById("clientContact").value="";
    renderClientsList();
    refreshDashboard();
  });

  // client list actions
  document.getElementById("clientsList").addEventListener("click", (e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const act = btn.dataset.action, id = btn.dataset.id;
    if (act === "select-client") { renderHousesList(id); renderClientsList(); }
    if (act === "del-client") { if(confirm("Apagar cliente e todas as residências/consumos?")) { removeClient(id); renderClientsList(); renderHousesList(null); refreshDashboard(); } }
    if (act === "edit-client") {
      const c = DB.clients.find(x=>x.id===id);
      const newName = prompt("Nome", c.name);
      const newContact = prompt("Contato", c.contact);
      if (newName) updateClient(id, { name:newName, contact: newContact });
      renderClientsList(); renderHousesList(id);
    }
  });

  /* Houses area */
  document.getElementById("addHouseBtn").addEventListener("click", ()=>{
    if (!currentClientSelected) return alert("Selecione um cliente à esquerda");
    const label = document.getElementById("houseLabel").value.trim();
    const address = document.getElementById("houseAddress").value.trim();
    if (!label) return alert("Label é obrigatório");
    addHouse(currentClientSelected, label, address);
    document.getElementById("houseLabel").value=""; document.getElementById("houseAddress").value="";
    renderHousesList(currentClientSelected);
    refreshDashboard();
  });

  document.getElementById("housesList").addEventListener("click",(e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const a = btn.dataset.action, id = btn.dataset.id;
    if (a === "select-house") { // open in dashboard
      showView("view-dashboard");
      refreshDashboard();
      // select client and house in dashboard selects
      const house = DB.houses.find(h=>h.id===id);
      document.getElementById("selectClient").value = house.clientId;
      onClientChange(house.clientId);
      document.getElementById("selectHouse").value = house.id;
      onHouseChange(house.id);
    }
    if (a === "del-house") { if(confirm("Apagar residência e seus consumos?")) { removeHouse(id); renderHousesList(currentClientSelected); refreshDashboard(); } }
    if (a === "edit-house") {
      const h = DB.houses.find(x=>x.id===id);
      const newLabel = prompt("Apelido", h.label);
      const newAddr = prompt("Endereço", h.address);
      if (newLabel) updateHouse(id, { label: newLabel, address: newAddr });
      renderHousesList(currentClientSelected);
    }
  });

  /* Users area (admin) */
  document.getElementById("addUserBtn").addEventListener("click", ()=>{
    if (!currentUser || currentUser.role !== "admin") return alert("Somente admin");
    const name = document.getElementById("userName").value.trim();
    const email = document.getElementById("userEmail").value.trim();
    const role = document.getElementById("userRole").value;
    if (!name || !email) return alert("Preencha nome e email");
    const tmpPass = Math.random().toString(36).slice(2,8);
    const r = registerUser(name,email,tmpPass,role);
    if (!r.ok) return alert(r.msg);
    alert(`Usuário criado. Senha temporária: ${tmpPass} (copie e informe ao usuário)`);
    document.getElementById("userName").value=""; document.getElementById("userEmail").value="";
    renderUsersList();
  });

  document.getElementById("usersList").addEventListener("click",(e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const a = btn.dataset.action, id = btn.dataset.id;
    if (a === "del-user") {
      if (!confirm("Apagar usuário?")) return;
      DB.users = DB.users.filter(u=>u.id!==id); saveDB(DB); renderUsersList();
    }
    if (a === "edit-user") {
      const u = DB.users.find(x=>x.id===id);
      const nn = prompt("Nome", u.name);
      const role = prompt("Papel (admin/user)", u.role);
      if (nn) { u.name = nn; u.role = role; saveDB(DB); renderUsersList(); }
    }
  });

  /* Profile */
  document.getElementById("saveProfileBtn").addEventListener("click", ()=>{
    const nm = document.getElementById("profileName").value.trim();
    const pw = document.getElementById("profilePassword").value;
    if (!nm) return alert("Nome obrigatório");
    currentUser.name = nm;
    if (pw) currentUser.password = hash(pw);
    saveDB(DB);
    document.getElementById("profileMsg").innerText = "Salvo com sucesso";
    setTimeout(()=> document.getElementById("profileMsg").innerText="", 1200);
    renderUsersList();
  });

  /* Back from message */
  document.getElementById("msgBack").addEventListener("click", ()=> {
    if (currentUser) showView("view-dashboard"); else showView("view-login");
  });
}

/* ---------- Initialize after login ---------- */
function initAfterAuth(){
  // render nav
  showView("view-dashboard");
  refreshDashboard();
  renderClientsList();
  renderUsersList();
  renderProfile();
}

/* ---------- Boot ---------- */
function boot(){
  DB = loadDB();
  loadSession();
  bindUI();

  if (currentUser) {
    initAfterAuth();
  } else {
    showView("view-login");
  }
}

/* start app */
boot();
