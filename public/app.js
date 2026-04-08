// =============================================
// CONFIG — injectée par le Worker Cloudflare
// =============================================
const API_BASE = '/api'; // Worker proxy

// =============================================
// RECETTES DE BASE
// =============================================
const BASE_RECIPES = [
  { id:1,  emoji:'🥕', name:'Velouté de carottes',    desc:'Onctueux, sucré naturel, adoré des petits.',   tags:['végétarien','rapide'], time:'10 min', kids:true,  ingredients:[{name:'Carottes',qty:'500g'},{name:'Oignon',qty:'1'},{name:'Crème fraîche',qty:'2 cs'},{name:'Bouillon légumes',qty:'500ml'}] },
  { id:2,  emoji:'🍝', name:'Pâtes pesto maison',     desc:'Basilic frais, parmesan, pignons.',            tags:['végétarien'],          time:'12 min', kids:true,  ingredients:[{name:'Pâtes',qty:'300g'},{name:'Basilic',qty:'1 bouquet'},{name:'Parmesan',qty:'50g'},{name:'Pignons',qty:'30g'},{name:'Huile olive',qty:'4 cs'}] },
  { id:3,  emoji:'🐟', name:'Saumon vapeur brocolis', desc:'Vapeur douce, citron, sauce yaourt.',          tags:['poisson'],             time:'15 min', kids:true,  ingredients:[{name:'Saumon',qty:'4 pavés'},{name:'Brocolis',qty:'400g'},{name:'Yaourt grec',qty:'2'},{name:'Citron',qty:'1'}] },
  { id:4,  emoji:'🍲', name:'Curry lentilles corail', desc:'Lait de coco, curcuma, réconfortant.',         tags:['végétarien'],          time:'15 min', kids:false, ingredients:[{name:'Lentilles corail',qty:'250g'},{name:'Lait de coco',qty:'400ml'},{name:'Tomates concassées',qty:'1 boîte'},{name:'Curry',qty:'2 cc'}] },
  { id:5,  emoji:'🍗', name:'Poulet rôti aux herbes', desc:'Juteux et tendre, tous les enfants adorent.',  tags:['viande'],              time:'15 min', kids:true,  ingredients:[{name:'Cuisses de poulet',qty:'4'},{name:'Herbes de Provence',qty:'2 cc'},{name:'Ail',qty:'3 gousses'},{name:'Huile olive',qty:'3 cs'}] },
  { id:6,  emoji:'🥦', name:'Gratin de courgettes',   desc:'Fondant, gruyère, tomates cerises.',           tags:['végétarien'],          time:'12 min', kids:true,  ingredients:[{name:'Courgettes',qty:'3'},{name:'Gruyère râpé',qty:'100g'},{name:'Crème fraîche',qty:'150ml'},{name:'Tomates cerises',qty:'200g'}] },
  { id:7,  emoji:'🥚', name:'Omelette champignons',   desc:'Simple, protéinée, en 8 minutes.',            tags:['végétarien','rapide'], time:'8 min',  kids:true,  ingredients:[{name:'Oeufs',qty:'6'},{name:'Champignons',qty:'200g'},{name:'Crème fraîche',qty:'2 cs'},{name:'Ciboulette',qty:'1 bouquet'}] },
  { id:8,  emoji:'🫛', name:'Quinoa petits pois',     desc:'Menthe fraîche, citron, léger et complet.',    tags:['végétarien'],          time:'12 min', kids:false, ingredients:[{name:'Quinoa',qty:'200g'},{name:'Petits pois',qty:'300g'},{name:'Menthe',qty:'1 bouquet'},{name:'Citron',qty:'1'}] },
  { id:9,  emoji:'🥣', name:'Risotto parmesan',       desc:'Crémeux, léger, champignons de Paris.',       tags:['végétarien'],          time:'15 min', kids:true,  ingredients:[{name:'Riz arborio',qty:'300g'},{name:'Champignons',qty:'250g'},{name:'Parmesan',qty:'80g'},{name:'Bouillon légumes',qty:'1L'}] },
  { id:10, emoji:'🐠', name:'Cabillaud en papillote', desc:'Légumes fondants, herbes de Provence.',        tags:['poisson'],             time:'14 min', kids:true,  ingredients:[{name:'Cabillaud',qty:'4 filets'},{name:'Tomates',qty:'2'},{name:'Courgette',qty:'1'},{name:'Herbes de Provence',qty:'2 cc'}] },
];

// =============================================
// ÉTAT
// =============================================
let db = null;
let recipes = [...BASE_RECIPES];
let selectedRecipes = new Set();
let planning = {};
let shoppingList = [];
let currentFilter = 'all';
let currentWeekOffset = 0;
let currentSlot = null;
let lastSnapshot = {};
let editingRecipeId = null;
let currentDetailId = null;

const WEEKDAYS = [
  {key:'lun',label:'Lun',weekend:false},{key:'mar',label:'Mar',weekend:false},
  {key:'mer',label:'Mer',weekend:false},{key:'jeu',label:'Jeu',weekend:false},
  {key:'ven',label:'Ven',weekend:false},{key:'sam',label:'Sam',weekend:true},
  {key:'dim',label:'Dim',weekend:true},
];

function getSlotsForDay(d) { return d.weekend ? ['midi','soir'] : ['soir']; }

function getWeekLabel(offset) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString('fr-FR', {day:'numeric',month:'short'});
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// =============================================
// SUPABASE
// =============================================
async function initSupabase() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('No config');
    const { supabaseUrl, supabaseKey } = await res.json();
    db = supabase.createClient(supabaseUrl, supabaseKey);
    await syncFromDB();
    setInterval(async () => { try { await syncFromDB(); } catch(e){} }, 5000);
    setSyncStatus('ok');
  } catch(e) {
    console.warn('Supabase non dispo, mode local');
    setSyncStatus('error');
    loadLocal();
  }
}

async function syncFromDB() {
  setSyncStatus('syncing');
  const { data, error } = await db.from('app_state').select('*');
  if (error) throw error;
  let changed = false;
  for (const row of data) {
    if (lastSnapshot[row.key] === row.value) continue;
    lastSnapshot[row.key] = row.value; changed = true;
    if (row.key === 'selected_recipes') selectedRecipes = new Set(JSON.parse(row.value));
    if (row.key === 'planning') planning = JSON.parse(row.value);
    if (row.key === 'shopping_list') shoppingList = JSON.parse(row.value);
    if (row.key === 'recipes_extra') { const ex = JSON.parse(row.value); recipes = [...BASE_RECIPES, ...ex]; }
  }
  setSyncStatus('ok');
  if (changed) renderAll();
}

async function saveToDB(key, value) {
  saveLocal();
  if (!db) return;
  setSyncStatus('syncing');
  const strValue = JSON.stringify(value);
  lastSnapshot[key] = strValue;
  try {
    await db.from('app_state').upsert({ key, value: strValue }, { onConflict: 'key' });
    setSyncStatus('ok');
  } catch(e) { setSyncStatus('error'); }
}

function saveLocal() {
  localStorage.setItem('selected_recipes', JSON.stringify([...selectedRecipes]));
  localStorage.setItem('planning', JSON.stringify(planning));
  localStorage.setItem('shopping_list', JSON.stringify(shoppingList));
  const extra = recipes.filter(r => r.id > 10);
  localStorage.setItem('recipes_extra', JSON.stringify(extra));
}

function loadLocal() {
  try {
    const sr = localStorage.getItem('selected_recipes'); if(sr) selectedRecipes = new Set(JSON.parse(sr));
    const pl = localStorage.getItem('planning'); if(pl) planning = JSON.parse(pl);
    const sl = localStorage.getItem('shopping_list'); if(sl) shoppingList = JSON.parse(sl);
    const ex = localStorage.getItem('recipes_extra'); if(ex) { const extra = JSON.parse(ex); recipes = [...BASE_RECIPES, ...extra]; }
  } catch(e) {}
  renderAll();
}

function setSyncStatus(s) {
  const dot = document.querySelector('.sync-dot');
  const label = document.querySelector('.sync-label');
  dot.className = 'sync-dot';
  if (s==='syncing') { dot.classList.add('syncing'); label.textContent='...'; }
  else if (s==='error') { dot.classList.add('error'); label.textContent='Local'; }
  else { label.textContent='Sync'; }
}

// =============================================
// RENDER — PLANNING
// =============================================
function renderWeek() {
  document.getElementById('weekLabel').textContent = getWeekLabel(currentWeekOffset);
  const wk = `w${currentWeekOffset}_`;
  document.getElementById('weekGrid').innerHTML = WEEKDAYS.map(day => {
    const slots = getSlotsForDay(day);
    const slotsHTML = slots.map(slot => {
      const key = wk + day.key + '-' + slot;
      const rid = planning[key];
      const recipe = rid ? recipes.find(r => r.id === rid) : null;
      const lbl = slots.length > 1 ? `<div class="slot-row-label">${slot}</div>` : '';
      if (recipe) return `${lbl}<div class="slot slot-filled" onclick="openAssignModal('${day.key}','${slot}')"><div class="slot-inner"><span class="slot-emoji">${recipe.emoji}</span><div class="slot-name">${recipe.name}</div></div></div>`;
      return `${lbl}<div class="slot" onclick="openAssignModal('${day.key}','${slot}')"><div class="slot-inner"><div class="slot-add">+</div></div></div>`;
    }).join('');
    return `<div class="day-col ${day.weekend?'weekend':''}"><div class="day-label">${day.label}</div><div class="slot-container">${slotsHTML}</div></div>`;
  }).join('');
  document.getElementById('noRecipesTip').style.display = selectedRecipes.size === 0 ? 'flex' : 'none';
}

// =============================================
// RENDER — RECETTES
// =============================================
function renderRecipes() {
  let filtered = recipes;
  if (currentFilter !== 'all') {
    if (currentFilter === 'rapide') filtered = recipes.filter(r => parseInt(r.time) <= 10);
    else if (currentFilter === 'cookidoo') filtered = recipes.filter(r => r.cookidooUrl);
    else filtered = recipes.filter(r => r.tags.includes(currentFilter));
  }
  document.getElementById('recipesGrid').innerHTML = filtered.map(r => {
    const sel = selectedRecipes.has(r.id);
    const cookidooTag = r.cookidooUrl ? `<span class="tag tag-cookidoo">Cookidoo</span>` : '';
    const cookidooLink = r.cookidooUrl ? `<a class="cookidoo-link" href="${r.cookidooUrl}" target="_blank" onclick="event.stopPropagation()">↗ Voir sur Cookidoo</a>` : '';
    return `
      <div class="recipe-card ${sel?'selected':''}" onclick="toggleRecipe(${r.id})">
        <div class="check">✓</div>
        <div class="card-actions">
          <button class="card-action-btn" onclick="event.stopPropagation();openDetailModal(${r.id})" title="Voir">👁</button>
          <button class="card-action-btn" onclick="event.stopPropagation();openEditRecipe(${r.id})" title="Modifier">✏️</button>
        </div>
        <span class="recipe-emoji">${r.emoji}</span>
        <div class="recipe-name">${r.name}</div>
        <div class="recipe-desc">${r.desc}</div>
        <div class="recipe-tags">
          <span class="tag tag-time">⏱ ${r.time}</span>
          <span class="tag tag-thermo">⚡ Thermo</span>
          ${r.kids?'<span class="tag tag-kids">👧 Enfants</span>':''}
          ${r.tags.includes('végétarien')?'<span class="tag tag-veggie">🌿 Végé</span>':''}
          ${cookidooTag}
        </div>
        ${cookidooLink}
      </div>`;
  }).join('');
  document.getElementById('selectedCount').textContent = selectedRecipes.size;
}

// =============================================
// RENDER — COURSES
// =============================================
function renderShopping() {
  const content = document.getElementById('shopContent');
  if (!shoppingList.length) { content.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div><p>Sélectionnez des recettes<br>puis générez la liste</p></div>`; return; }
  const total = shoppingList.reduce((s,c) => s+c.items.length, 0);
  const done = shoppingList.reduce((s,c) => s+c.items.filter(i=>i.done).length, 0);
  const pct = total ? Math.round(done/total*100) : 0;
  content.innerHTML =
    `<div class="shop-progress"><span>${done}/${total} articles</span><div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>` +
    shoppingList.map((cat,ci) =>
      `<div class="shop-category"><div class="shop-cat-header"><span class="shop-cat-emoji">${cat.emoji}</span><span class="shop-cat-title">${cat.category}</span><span class="shop-cat-count">${cat.items.filter(i=>!i.done).length} restants</span></div>` +
      cat.items.map((item,ii) =>
        `<div class="shop-item ${item.done?'done':''}" onclick="toggleShopItem(${ci},${ii})"><div class="shop-checkbox">${item.done?'✓':''}</div>${item.bio?'<div class="bio-dot"></div>':''}<span class="shop-item-name">${item.name}</span><span class="shop-item-qty">${item.qty}</span></div>`
      ).join('') + '</div>'
    ).join('');
}

function renderAll() { renderWeek(); renderRecipes(); renderShopping(); }

// =============================================
// ACTIONS
// =============================================
function toggleRecipe(id) {
  if (selectedRecipes.has(id)) selectedRecipes.delete(id); else selectedRecipes.add(id);
  saveToDB('selected_recipes', [...selectedRecipes]); renderRecipes();
}

function openAssignModal(day, slot) {
  if (selectedRecipes.size === 0) { showToast('Sélectionnez d\'abord des recettes 👆'); return; }
  currentSlot = { day, slot };
  document.getElementById('modalTitle').textContent = `${day.charAt(0).toUpperCase()+day.slice(1)} – ${slot}`;
  const wk = `w${currentWeekOffset}_`;
  document.getElementById('modalList').innerHTML = [...selectedRecipes].map(rid => {
    const r = recipes.find(x => x.id === rid); if (!r) return '';
    const isAssigned = planning[wk+day+'-'+slot] === rid;
    return `<div class="modal-recipe-item" onclick="assignRecipe(${rid})" style="${isAssigned?'background:var(--green-light);':''}"><span class="modal-recipe-emoji">${r.emoji}</span><span class="modal-recipe-name">${r.name}</span><span class="modal-recipe-time">${r.time}</span>${isAssigned?'<span style="color:var(--green)">✓</span>':''}</div>`;
  }).join('');
  document.getElementById('assignModal').style.display = 'flex';
}

function assignRecipe(rid) {
  const key = `w${currentWeekOffset}_`+currentSlot.day+'-'+currentSlot.slot;
  planning[key] = rid; saveToDB('planning', planning); closeAssignModal(); renderWeek();
}

function clearSlot() {
  const key = `w${currentWeekOffset}_`+currentSlot.day+'-'+currentSlot.slot;
  delete planning[key]; saveToDB('planning', planning); closeAssignModal(); renderWeek();
}

function closeAssignModal() { document.getElementById('assignModal').style.display='none'; currentSlot=null; }

function toggleShopItem(ci,ii) {
  shoppingList[ci].items[ii].done = !shoppingList[ci].items[ii].done;
  saveToDB('shopping_list', shoppingList); renderShopping();
}

// =============================================
// MODAL RECETTE — AJOUT / ÉDITION
// =============================================
function openAddRecipe() {
  editingRecipeId = null;
  document.getElementById('recipeModalTitle').textContent = 'Nouvelle recette';
  document.getElementById('r-emoji').value = '';
  document.getElementById('r-name').value = '';
  document.getElementById('r-time').value = '';
  document.getElementById('r-tag').value = 'végétarien';
  document.getElementById('r-desc').value = '';
  document.getElementById('r-url').value = '';
  document.getElementById('r-search').value = '';
  document.getElementById('r-kids').checked = true;
  document.getElementById('recipeDeleteBtn').style.display = 'none';
  renderIngredients([]);
  document.getElementById('recipeModal').style.display = 'flex';
}

function openEditRecipe(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  editingRecipeId = id;
  document.getElementById('recipeModalTitle').textContent = 'Modifier la recette';
  document.getElementById('r-emoji').value = r.emoji || '';
  document.getElementById('r-name').value = r.name || '';
  document.getElementById('r-time').value = r.time || '';
  document.getElementById('r-tag').value = r.tags.find(t => ['végétarien','viande','poisson'].includes(t)) || 'végétarien';
  document.getElementById('r-desc').value = r.desc || '';
  document.getElementById('r-url').value = r.cookidooUrl || '';
  document.getElementById('r-search').value = '';
  document.getElementById('r-kids').checked = !!r.kids;
  document.getElementById('recipeDeleteBtn').style.display = id > 10 ? 'block' : 'none';
  renderIngredients(r.ingredients || []);
  document.getElementById('recipeModal').style.display = 'flex';
}

function renderIngredients(list) {
  document.getElementById('ingredientsList').innerHTML = list.map((ing,i) => `
    <div class="ingredient-row" id="ing-${i}">
      <input type="text" placeholder="Ingrédient" value="${ing.name||''}" oninput="updateIngredient(${i},'name',this.value)"/>
      <input type="text" class="ingredient-qty" placeholder="Quantité" value="${ing.qty||''}" oninput="updateIngredient(${i},'qty',this.value)"/>
      <button class="remove-ingredient" onclick="removeIngredient(${i})">×</button>
    </div>`).join('');
}

let ingredientData = [];
function updateIngredient(i, field, val) { if (!ingredientData[i]) ingredientData[i]={}; ingredientData[i][field]=val; }
function removeIngredient(i) { ingredientData.splice(i,1); renderIngredients(ingredientData); }

function addIngredient() {
  ingredientData.push({name:'',qty:''});
  renderIngredients(ingredientData);
  const rows = document.querySelectorAll('.ingredient-row');
  if (rows.length) rows[rows.length-1].querySelector('input').focus();
}

function getIngredients() {
  const rows = document.querySelectorAll('.ingredient-row');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input');
    return { name: inputs[0].value.trim(), qty: inputs[1].value.trim() };
  }).filter(i => i.name);
}

function saveRecipe() {
  const emoji = document.getElementById('r-emoji').value.trim() || '🍽';
  const name = document.getElementById('r-name').value.trim();
  const time = document.getElementById('r-time').value.trim() || '15 min';
  const tag = document.getElementById('r-tag').value;
  const desc = document.getElementById('r-desc').value.trim();
  const cookidooUrl = document.getElementById('r-url').value.trim();
  const kids = document.getElementById('r-kids').checked;
  const ingredients = getIngredients();
  const tags = [tag];
  if (parseInt(time) <= 10) tags.push('rapide');

  if (!name) { showToast('Donnez un nom à la recette'); return; }

  if (editingRecipeId) {
    const idx = recipes.findIndex(r => r.id === editingRecipeId);
    if (idx !== -1) recipes[idx] = { ...recipes[idx], emoji, name, time, tags, desc, cookidooUrl, kids, ingredients };
  } else {
    const maxId = Math.max(...recipes.map(r => r.id), 10);
    recipes.push({ id: maxId+1, emoji, name, time, tags, desc, cookidooUrl, kids, ingredients });
  }

  const extra = recipes.filter(r => r.id > 10);
  saveToDB('recipes_extra', extra);
  document.getElementById('recipeModal').style.display = 'none';
  renderRecipes();
  showToast(editingRecipeId ? '✓ Recette modifiée' : '✓ Recette ajoutée');
}

function deleteRecipe() {
  if (!editingRecipeId || editingRecipeId <= 10) return;
  if (!confirm('Supprimer cette recette ?')) return;
  recipes = recipes.filter(r => r.id !== editingRecipeId);
  selectedRecipes.delete(editingRecipeId);
  saveToDB('recipes_extra', recipes.filter(r => r.id > 10));
  saveToDB('selected_recipes', [...selectedRecipes]);
  document.getElementById('recipeModal').style.display = 'none';
  renderAll();
  showToast('Recette supprimée');
}

// =============================================
// MODAL DÉTAIL RECETTE
// =============================================
function openDetailModal(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  currentDetailId = id;
  document.getElementById('detailTitle').textContent = r.name;
  const ingredientsHTML = r.ingredients?.length
    ? `<div class="detail-ingredients"><h5>Ingrédients</h5>${r.ingredients.map(i=>`<div class="ingredient-item"><span>${i.name}</span><span class="ingredient-item-qty">${i.qty}</span></div>`).join('')}</div>`
    : '';
  const cookidooHTML = r.cookidooUrl
    ? `<a class="detail-cookidoo" href="${r.cookidooUrl}" target="_blank">↗ Voir la recette sur Cookidoo</a>`
    : '';
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-header-row">
      <div class="detail-big-emoji">${r.emoji}</div>
      <div class="detail-meta">
        <h4>${r.name}</h4>
        <div class="recipe-tags">
          <span class="tag tag-time">⏱ ${r.time}</span>
          ${r.kids?'<span class="tag tag-kids">👧 Enfants</span>':''}
          ${r.cookidooUrl?'<span class="tag tag-cookidoo">Cookidoo</span>':''}
        </div>
        <p style="font-size:13px;color:var(--ink-muted);margin-top:6px">${r.desc}</p>
      </div>
    </div>
    ${ingredientsHTML}
    ${cookidooHTML}`;
  document.getElementById('detailModal').style.display = 'flex';
}

// =============================================
// COOKIDOO SEARCH
// =============================================
function searchCookidoo() {
  const query = document.getElementById('r-search').value.trim();
  if (!query) { showToast('Entrez un nom de recette'); return; }
  const url = `https://cookidoo.fr/search/fr-FR?query=${encodeURIComponent(query)}`;
  window.open(url, '_blank');
  showToast('Copiez le lien depuis Cookidoo et collez-le ci-dessus');
}

// =============================================
// IA — SUGGÉRER RECETTES
// =============================================
async function generateRecipes() {
  const btn = document.getElementById('generateBtn');
  const txt = document.getElementById('generateBtnText');
  btn.disabled = true; txt.textContent = '...';
  const existing = BASE_RECIPES.map(r => r.name).join(', ');
  const prompt = `Tu es un chef Thermomix expert en cuisine familiale bio pour enfants de 2 et 4 ans. Génère 4 nouvelles recettes Thermomix simples (<15 min) différentes de: ${existing}. Réponds UNIQUEMENT en JSON valide (pas de backticks): [{"id":1,"emoji":"🥘","name":"Nom court","desc":"Description 50 chars max","tags":["végétarien"],"time":"12 min","kids":true,"ingredients":[{"name":"Ingrédient","qty":"100g"}]}] Tags possibles: végétarien, poisson, viande, rapide.`;
  try {
    const resp = await fetch(`${API_BASE}/ai`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt })
    });
    const data = await resp.json();
    const text = (data.text||'').replace(/```json|```/g,'').trim();
    const newRecipes = JSON.parse(text);
    const maxId = Math.max(...recipes.map(r => r.id));
    newRecipes.forEach((r,i) => r.id = maxId+i+1);
    const extra = recipes.filter(r => r.id > 10).concat(newRecipes);
    recipes = [...BASE_RECIPES, ...extra];
    await saveToDB('recipes_extra', extra);
    renderRecipes();
    showToast('✦ '+newRecipes.length+' nouvelles recettes !');
  } catch(e) { console.error(e); showToast('Erreur. Réessayez.'); }
  btn.disabled = false; txt.textContent = 'Suggérer';
}

// =============================================
// IA — LISTE DE COURSES
// =============================================
async function generateShoppingList() {
  if (selectedRecipes.size === 0) { showToast('Sélectionnez d\'abord des recettes'); return; }
  const btn = document.getElementById('shopGenBtn');
  btn.disabled = true;
  document.getElementById('shopContent').innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Génération de la liste bio...</p></div>`;
  const recipeNames = [...selectedRecipes].map(id => recipes.find(r => r.id===id)?.name).filter(Boolean).join(', ');
  const prompt = `Tu es nutritionniste bio pour familles avec enfants de 2 et 4 ans. Pour ces recettes Thermomix: ${recipeNames}. Génère une liste de courses BIO complète. Réponds UNIQUEMENT en JSON valide: {"categories":[{"category":"Légumes & fruits","emoji":"🥕","items":[{"name":"Carottes","qty":"500g","bio":true,"done":false}]}]} Catégories: Légumes & fruits 🥕, Protéines 🥩, Féculents & céréales 🌾, Produits laitiers 🧀, Épicerie & condiments 🫙. Max 6 items/catégorie, quantités pour 4 personnes.`;
  try {
    const resp = await fetch(`${API_BASE}/ai`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt })
    });
    const data = await resp.json();
    const text = (data.text||'').replace(/```json|```/g,'').trim();
    shoppingList = JSON.parse(text).categories || [];
    await saveToDB('shopping_list', shoppingList);
    renderShopping(); showToast('✦ Liste générée !');
  } catch(e) { console.error(e); document.getElementById('shopContent').innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><p>Erreur. Réessayez.</p></div>`; }
  btn.disabled = false;
}

// =============================================
// UTILITAIRES
// =============================================
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// =============================================
// EVENTS
// =============================================
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
}));

document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active'); currentFilter = chip.dataset.filter; renderRecipes();
}));

document.getElementById('generateBtn').addEventListener('click', generateRecipes);
document.getElementById('shopGenBtn').addEventListener('click', generateShoppingList);
document.getElementById('addRecipeBtn').addEventListener('click', openAddRecipe);
document.getElementById('modalClose').addEventListener('click', closeAssignModal);
document.getElementById('modalClear').addEventListener('click', clearSlot);
document.getElementById('assignModal').addEventListener('click', e => { if(e.target===document.getElementById('assignModal')) closeAssignModal(); });
document.getElementById('prevWeek').addEventListener('click', () => { currentWeekOffset--; renderWeek(); });
document.getElementById('nextWeek').addEventListener('click', () => { currentWeekOffset++; renderWeek(); });

document.getElementById('recipeModalClose').addEventListener('click', () => { document.getElementById('recipeModal').style.display='none'; });
document.getElementById('recipeModal').addEventListener('click', e => { if(e.target===document.getElementById('recipeModal')) document.getElementById('recipeModal').style.display='none'; });
document.getElementById('recipeSaveBtn').addEventListener('click', saveRecipe);
document.getElementById('recipeDeleteBtn').addEventListener('click', deleteRecipe);
document.getElementById('addIngredientBtn').addEventListener('click', addIngredient);
document.getElementById('cookidooSearchBtn').addEventListener('click', searchCookidoo);

document.getElementById('detailClose').addEventListener('click', () => { document.getElementById('detailModal').style.display='none'; });
document.getElementById('detailModal').addEventListener('click', e => { if(e.target===document.getElementById('detailModal')) document.getElementById('detailModal').style.display='none'; });
document.getElementById('detailEditBtn').addEventListener('click', () => { document.getElementById('detailModal').style.display='none'; openEditRecipe(currentDetailId); });

// Init
document.getElementById('weekLabel').textContent = getWeekLabel(0);
initSupabase();
