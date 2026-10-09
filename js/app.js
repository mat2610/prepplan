/* =====================================================================
   PrepPlan — user interface (wizard, results, saved weeks)
   Depends on: data-ingredients.js, data-recipes.js, model.js, gemini.js
   ===================================================================== */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0) => Number(n).toLocaleString('he-IL',{maximumFractionDigits:d,minimumFractionDigits:d});
const store = gStore;
const DAYN = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const SLOT = ['צהריים','ערב','ארוחה 3'];
const LIM  = {weight:[40,160,1], budget:[80,800,10], time:[45,360,15], days:[3,7,1]};
const FLOW = ['s1','s2','s3','s4'];

function toast(t){ const el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>el.hidden=true,1800); }

/* ---------- state ---------- */
const st = {
  screen:'s0', mode:'cost', plan:null, view:'menu', day:0, rec:0, ticks:{}, savedId:null, customTargets:false,
  S:{goal:'bulk', weight:80, kcal:2800, protein:160, budget:250, time:150, days:5, meals:2, snacks:2, variety:'mid',
     exclude:[], fridge:['rice','oil','salt'], ban:[], prefer:[], seed:0, avoid:[]},
  gem:null   // last Gemini result for the current plan: {note, report, error, prompt}
};
function targetsFor(goal,w){ const t={bulk:[35,2.0],maintain:[31,1.8],cut:[26,2.2]}[goal]; return {kcal:Math.round(w*t[0]/50)*50, protein:Math.round(w*t[1]/5)*5}; }
function syncTargets(){ if(!st.customTargets) Object.assign(st.S,targetsFor(st.S.goal,st.S.weight)); }

/* ---------- Gemini recipes kept between visits ---------- */
function loadGeminiRecipes(){ try{ importRecipes(JSON.parse(store.get('prepplan.gemini')||'[]')); }catch(e){} }
function saveGeminiRecipes(list){ try{ const old=JSON.parse(store.get('prepplan.gemini')||'[]'); store.set('prepplan.gemini',JSON.stringify([...old,...list].slice(-60))); }catch(e){} }

/* =========================================================
   Screens 1–3: inputs
   ========================================================= */
function renderInputs(){
  const S=st.S;
  $$('#goal .choice').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.goal));
  $('#weightOut').textContent=S.weight+' ק"ג';
  $('#targetLine').innerHTML=`<span>היעד היומי: <b>${fmt(S.kcal)}</b> קק"ל · <b>${S.protein}</b> ג' חלבון</span><button class="linkbtn" type="button" id="toggleEdit">${$('#editTargets').hidden?'לשנות ידנית':'סגור'}</button>`;
  $('#kcal').value=S.kcal; $('#protein').value=S.protein;
  $('#budgetOut').textContent=S.budget+' ₪';
  $('#timeOut').textContent=(S.time/60).toLocaleString('he-IL',{maximumFractionDigits:2})+' שעות';
  $('#daysOut').textContent=S.days+' ימים';
  $$('#mode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===st.mode));
  $$('#variety button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.variety));
  $('#varietyHint').textContent={low:'מעט מתכונים שחוזרים על עצמם: הכי מעט זמן בישול.',mid:'כל מנה עיקרית לכל היותר 3 פעמים בשבוע.',high:'כל מנה עיקרית לכל היותר פעמיים בשבוע: יותר מתכונים, יותר זמן בישול.'}[S.variety];
  renderFridge();
  $('#exclude').innerHTML=Object.entries(TAGS).map(([k,n])=>`<button type="button" class="chip no" data-ex="${k}" aria-pressed="${S.exclude.includes(k)}">${n}</button>`).join('');
}
function renderFridge(){
  const q=$('#fridgeSearch').value.trim(), S=st.S, open=new Set($$('#fridge details[open]').map(d=>d.dataset.cat));
  $('#fridge').innerHTML=Object.entries(CATS).map(([cat,label])=>{
    const items=Object.entries(ING).filter(([id,x])=>x.cat===cat && (!q || x.n.includes(q)));
    if(!items.length) return '';
    const sel=items.filter(([id])=>S.fridge.includes(id)).length;
    return `<details class="cat" data-cat="${cat}" ${q||open.has(cat)?'open':''}><summary>${label}<span>${sel?sel+' נבחרו':items.length+' מרכיבים'}</span></summary>
      <div class="chips">${items.map(([id,x])=>`<button type="button" class="chip" data-fr="${id}" aria-pressed="${S.fridge.includes(id)}">${esc(x.n)}</button>`).join('')}</div></details>`;
  }).join('') || '<p class="small muted" style="margin:0">לא נמצא מרכיב בשם הזה.</p>';
}
$('#goal').addEventListener('click',e=>{ const b=e.target.closest('.choice'); if(!b) return; st.S.goal=b.dataset.v; st.customTargets=false; syncTargets(); renderInputs(); });
$('#mode').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; st.mode=b.dataset.v; renderInputs(); });
$('#variety').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; st.S.variety=b.dataset.v; renderInputs(); });
$('#fridgeSearch').addEventListener('input',renderFridge);
['kcal','protein'].forEach(id=>$('#'+id).addEventListener('change',e=>{ st.S[id]=Number(e.target.value)||st.S[id]; st.customTargets=true; renderInputs(); }));
document.addEventListener('click',e=>{
  const s=e.target.closest('[data-step]');
  if(s){ const k=s.dataset.step,[mn,mx,step]=LIM[k]; st.S[k]=Math.max(mn,Math.min(mx,st.S[k]+step*Number(s.dataset.d))); if(k==='weight') syncTargets(); renderInputs(); }
  if(e.target.id==='toggleEdit'){ $('#editTargets').hidden=!$('#editTargets').hidden; renderInputs(); }
  const fr=e.target.closest('[data-fr]');
  if(fr){ const v=fr.dataset.fr, a=st.S.fridge; st.S.fridge=a.includes(v)?a.filter(x=>x!==v):[...a,v]; renderFridge(); }
  const ex=e.target.closest('[data-ex]');
  if(ex){ const v=ex.dataset.ex, a=st.S.exclude; st.S.exclude=a.includes(v)?a.filter(x=>x!==v):[...a,v]; renderInputs(); }
});

/* =========================================================
   Building the week: (Gemini) → verification → optimiser
   ========================================================= */
const plain = it => ({id:it.id, base:it.base, big:it.big, n:it.n, time:it.time, ing:it.ing, steps:it.steps||[], k:it.k, p:it.p, c:it.c, f:it.f, src:it.src});
function finish(p){ p.breakfasts=p.breakfasts||[]; p.tot=totals(p.meals,p.snacks,p.S,p.breakfasts); p.days=assignDays(p,p.S); p.shop=shoppingList(p,p.S); return p; }
function solvePlan(){
  if(typeof solver==='undefined') return {error:'ספריית החישוב לא נטענה. רעננו את הדף.'};
  let r=solveBalanced(st.S,st.mode), auto=null;
  if(!r.feasible){
    const diag=diagnose(st.S);
    // apply automatically the gentlest single change (time, variety, budget), protein changes stay the user's call
    const gentle=diag.find(x=>x.key==='time' && x.need<=st.S.time*1.5) || diag.find(x=>x.key==='variety') || diag.find(x=>x.key==='budget' && x.need<=st.S.budget*1.3);
    if(!gentle) return {infeasible:true, diag};
    const before={time:st.S.time, variety:st.S.variety, budget:st.S.budget};
    if(gentle.key==='time') st.S.time=Math.ceil(gentle.need/15)*15;
    if(gentle.key==='variety') st.S.variety=gentle.need;
    if(gentle.key==='budget') st.S.budget=Math.ceil(gentle.need/10)*10;
    r=solveBalanced(st.S,st.mode);
    if(!r.feasible){ Object.assign(st.S,before); return {infeasible:true, diag}; }
    auto={key:gentle.key, before, diag};
  }
  return finish({auto, S:JSON.parse(JSON.stringify(st.S)), meals:r.meals.map(m=>({item:plain(m.item),q:m.q})), snacks:r.snacks.map(m=>({item:plain(m.item),q:m.q})), breakfasts:r.breakfasts.map(m=>({item:plain(m.item),q:m.q})), ms:r.ms});
}

/* apply a Gemini JSON answer: verify recipes, remember bans */
function applyGeminiAnswer(data){
  const list=Array.isArray(data.recipes)?data.recipes:[];
  const report=importRecipes(list);
  saveGeminiRecipes(list.filter((_,i)=>report[i].added));
  const ban=(Array.isArray(data.ban)?data.ban:[]).filter(id=>ING[id]);
  st.S.ban=[...new Set([...(st.S.ban||[]),...ban])];
  st.S.prefer=report.filter(r=>r.added).map(r=>r.id);
  return {note:data.note?String(data.note):'', report, ban};
}

async function buildWeek(request){
  st.day=0; st.rec=0; st.ticks={}; st.savedId=null; st.view='menu'; st.gem=null; st.S.prefer=[]; st.S.seed=0; st.S.avoid=[];
  go('s4');
  if(request){
    const prompt=recipePrompt(request, st.S, st.plan&&st.plan.meals?st.plan.meals.map(m=>m.item.n):[]);
    if(gemAvailable()){
      setBusy('Gemini יוצר מתכונים לפי הבקשה שלך… (זה יכול לקחת עד חצי דקה)');
      try{ st.gem=applyGeminiAnswer(parseJSON(await gemini(prompt,true))); }
      catch(err){ st.gem={error:gemErrorText(err), prompt}; }
    } else st.gem={error:gemErrorText(new Error('nokey')), prompt};
    st.gem.request=request;
  }
  setBusy('מחשב את התפריט הכי טוב…');
  await new Promise(r=>setTimeout(r,30));
  st.plan=solvePlan();
  setBusy('');
  renderResults(); updateNav();
}
function setBusy(t){ $('#busy').hidden=!t; $('#busyText').textContent=t; if(t){ $('#results').hidden=true; $('#alert').hidden=true; $('#gemNote').hidden=true; } }

/* =========================================================
   Screen 4: results
   ========================================================= */
function devCell(c,a){
  if(c==null||a==null) return '<td class="n muted">—</td>';
  const d=(c-a)/a, x=Math.abs(d), k=x<=.15?'good':x<=.30?'warn':'bad';
  return `<td class="n"><div>Gemini: ${fmt(c)}</div><div class="muted">חישוב: ${fmt(a)}</div><span class="tag ${k}" dir="ltr">${d>0?'+':''}${fmt(d*100)}%</span></td>`;
}
function renderGemNote(){
  const g=st.gem, box=$('#gemNote');
  if(!g){ box.hidden=true; return; }
  box.hidden=false;
  if(g.error){
    box.innerHTML=`<b>הבקשה: "${esc(g.request||'')}"</b><span class="small" style="color:var(--bad)">${esc(g.error)} התפריט נבנה בלי הבקשה.</span>
      <div><button class="btn sm" type="button" id="gRetry">נסה שוב</button></div>
      <details class="adv"><summary>או להעתיק את הפרומפט ל־gemini.google.com ולהדביק כאן את התשובה</summary><div style="display:grid;gap:8px;margin-top:8px">
      <pre class="prompt" id="gPrompt">${esc(g.prompt)}</pre>
      <div><button class="btn ghost sm" type="button" data-copyfrom="gPrompt">העתק פרומפט</button></div>
      <textarea id="gPaste" dir="ltr" placeholder="הדביקו כאן את ה־JSON ש־Gemini החזיר"></textarea>
      <div><button class="btn sm" type="button" id="gApply">החל</button></div></div></details>`;
    return;
  }
  const used=st.plan&&st.plan.meals?st.plan.meals.filter(m=>m.item.src==='gemini').length:0;
  const ok=g.report.filter(r=>r.added).length;
  box.innerHTML=`<b>Gemini: ${esc(g.note||'נוצרו מתכונים לפי הבקשה')}</b>
    <span class="small muted">${g.report.length} מתכונים נוצרו · ${ok} עברו בדיקה${g.ban.length?' · הוסרו: '+g.ban.map(id=>esc(ING[id].n)).join(', '):''} · ${used?used+' נכנסו לתפריט':'אף אחד לא נכנס לתפריט'}</span>
    <details class="adv"><summary>בדיקת המספרים של Gemini</summary>
      <div class="tbl" style="margin-top:8px"><table><thead><tr><th>מתכון</th><th class="n">קלוריות</th><th class="n">חלבון (ג')</th></tr></thead><tbody>${
        g.report.map(r=>r.errors.length?`<tr><td>${esc(r.name)}<div class="small" style="color:var(--bad)">נדחה: ${esc(r.errors.join('; '))}</div></td><td></td><td></td></tr>`
          :`<tr><td>${esc(r.name)}</td>${devCell(r.ck,r.k)}${devCell(r.cp,r.p)}</tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="margin:6px 0 0">עד 15% סטייה: תקין. מעל 30%: טעות של Gemini. התפריט משתמש רק בערכים המחושבים.</p>
    </details>`;
}
function renderResults(){
  const p=st.plan; if(!p) return;
  renderGemNote();
  $('#alert').hidden=true; $('#alert').className='alert'; $('#results').hidden=false;
  if(p.error){ $('#alert').hidden=false; $('#alert').textContent=p.error; $('#results').hidden=true; return; }
  if(p.infeasible){
    $('#results').hidden=true; $('#alert').hidden=false;
    const L={budget:x=>[`להעלות את התקציב ל־${Math.ceil(x.need/10)*10} ₪`,'budget',Math.ceil(x.need/10)*10],
             time:x=>[`להגדיל את זמן הבישול ל־${Math.ceil(x.need/15)*15} דקות`,'time',Math.ceil(x.need/15)*15],
             protein:x=>[`להוריד את יעד החלבון ל־${x.need} ג' ביום`,'protein',x.need],
             proteinUp:x=>[`להעלות את יעד החלבון ל־${x.need} ג' ביום (בקלוריות האלה קשה לאכול פחות חלבון)`,'protein',x.need],
             variety:x=>[`פחות גיוון בתפריט (${VARIETY[x.need].label})`,'variety',x.need],
             prefer:x=>['לוותר על המתכונים מהבקשה ל־Gemini','prefer',0]};
    const items=p.diag.map(x=>L[x.key](x));
    $('#resTitle').textContent='אין תפריט שעומד בכל הדרישות'; $('#resSub').textContent='';
    $('#alert').innerHTML=items.length?`<b>כל אחד מהשינויים האלה לבד יפתור את זה:</b><ul>${items.map(([t,k,v])=>`<li>${t} <button class="linkbtn" type="button" data-fix="${k}" data-val="${v}">לעשות את זה</button></li>`).join('')}</ul>`
      :`<b>גם שינוי של דרישה אחת לא מספיק.</b><span>חזרו אחורה ונסו להוריד הגבלות תזונה או להעלות תקציב וזמן.</span>`;
    return;
  }
  const S=p.S;
  if(p.auto){
    const t={time:`זמן הבישול הוגדל ל־${S.time} דקות (במקום ${p.auto.before.time})`, variety:`הגיוון הורד ל"${VARIETY[S.variety].label}" (במקום "${VARIETY[p.auto.before.variety].label}")`, budget:`התקציב הוגדל ל־${S.budget} ₪ (במקום ${p.auto.before.budget})`}[p.auto.key];
    $('#alert').hidden=false; $('#alert').className='note';
    $('#alert').innerHTML=`<b>כדי שהתפריט יעמוד בכל השאר, ${t}.</b><span class="small muted">עם ההגדרות המקוריות אין תפריט אפשרי.</span><div><button class="linkbtn" type="button" id="undoAuto">לבטל ולראות אפשרויות אחרות</button></div>`;
  } else $('#alert').className='alert';
  $('#resTitle').textContent=st.savedId?(loadWeeks().find(w=>w.id===st.savedId)?.name||'השבוע שלך'):'השבוע שלך';
  $('#resSub').textContent=`${S.days} ימים · ${new Set(p.meals.map(m=>m.item.base||m.item.id)).size} מנות עיקריות · ${p.breakfasts.length} ארוחות בוקר · בישול אחד של ${p.tot.time} דקות`;
  $('#summary').innerHTML=`
    <div class="sum"><span>עלות האוכל</span><b>${fmt(p.tot.cost)} ₪</b><small>מתוך ${S.budget} ₪</small></div>
    <div class="sum"><span>חלבון ביום</span><b>${fmt(p.tot.p/S.days)} ג'</b><small>יעד ${S.protein}</small></div>
    <div class="sum"><span>קלוריות ביום</span><b>${fmt(p.tot.k/S.days)}</b><small>יעד ${fmt(S.kcal)}</small></div>
    <div class="sum"><span>זמן בישול</span><b>${p.tot.time} דק'</b><small>מתוך ${S.time}</small></div>`;
  $$('#view button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===st.view));
  ({menu:viewMenu, shop:viewShop, cook:viewCook})[st.view]();
}
function pager(i,n,label,sub,key){
  return `<div class="pager"><button class="arrow" type="button" data-pg="${key}" data-d="-1" ${i===0?'disabled':''} aria-label="הקודם">›</button>
    <div class="t"><h3>${label}</h3><span class="small muted">${sub}</span></div>
    <button class="arrow" type="button" data-pg="${key}" data-d="1" ${i===n-1?'disabled':''} aria-label="הבא">‹</button></div>`;
}
const gtag = it => it.src==='gemini' ? '<span class="gtag">Gemini</span>' : '';
function viewMenu(){
  const p=st.plan, S=p.S, d=p.days[st.day];
  const sk=Math.abs(d.k/S.kcal-1)<=KCAL_TOL?'good':Math.abs(d.k/S.kcal-1)<=2*KCAL_TOL?'warn':'bad';
  const sp=d.p>=S.protein*.98?'good':d.p>=S.protein*.9?'warn':'bad';
  $('#viewBody').innerHTML=pager(st.day,p.days.length,'יום '+DAYN[st.day],`${st.day+1} מתוך ${p.days.length}`,'day')+
    `<div>${d.breakfast?`<div class="meal"><span class="slot">בוקר</span><span>${esc(d.breakfast.n)}</span><span class="mac">${fmt(d.breakfast.k)} קק"ל · ${fmt(d.breakfast.p)} ג'</span></div>`:''}${d.meals.map((m,i)=>`<div class="meal"><span class="slot">${SLOT[i]}</span><b>${esc(m.n)}${gtag(m)}</b><span class="mac">${fmt(m.k)} קק"ל · ${fmt(m.p)} ג'</span></div>`).join('')}
     ${d.snacks.map(m=>`<div class="meal"><span class="slot">נשנוש</span><span>${esc(m.n)}</span><span class="mac">${fmt(m.k)} קק"ל · ${fmt(m.p)} ג'</span></div>`).join('')}</div>
     <div class="daytot"><span class="tag ${sk}">${fmt(d.k)} קק"ל</span><span class="tag ${sp}">${fmt(d.p)} ג' חלבון</span></div>
     <div class="dots">${p.days.map((x,i)=>`<button type="button" data-goday="${i}" aria-current="${i===st.day}">${DAYN[i]}</button>`).join('')}</div>`;
}
function qtyText(id,g){ const x=ING[id]; if(x.each) return `${fmt(Math.max(1,Math.round(g/x.each)))} ${x.eachN}`; return g>=1000?`${fmt(g/1000,2)} ק"ג`:`${fmt(Math.round(g))} ג'`; }
function pkgText(id,pk){ const x=ING[id]; if(x.pkgN) return `${pk} × ${x.pkgN}`; return `${pk} × ${x.pkg>=1000?fmt(x.pkg/1000,1)+' ק"ג':x.pkg+" ג'"}`; }
function viewShop(){
  const s=st.plan.shop, got=s.buy.filter(b=>st.ticks[b.id]).length;
  let lastCat='';
  const rows=s.buy.map(b=>{
    const c=ING[b.id].cat, head=c!==lastCat?`<h4>${CATS[c]}</h4>`:''; lastCat=c;
    return head+`<li class="${st.ticks[b.id]?'got':''}"><input type="checkbox" data-tick="${b.id}" ${st.ticks[b.id]?'checked':''} aria-label="${esc(ING[b.id].n)}">
      <div><div class="nm">${esc(ING[b.id].n)}</div><div class="sub">${pkgText(b.id,b.pk)} · צריך ${qtyText(b.id,b.g)}</div></div><span class="pr">${fmt(b.paid)} ₪</span></li>`;
  }).join('');
  $('#viewBody').innerHTML=`<div class="pager"><div class="t" style="text-align:start"><h3>רשימת קניות</h3><span class="small muted">${got} מתוך ${s.buy.length} בעגלה · בקופה כ־${fmt(s.paid)} ₪</span></div></div>
   <ul class="shop">${rows}</ul>
   ${s.pantry.length?`<p class="small" style="margin:0"><b>לבדוק שיש בבית:</b> ${s.pantry.map(h=>esc(ING[h.id].n)).join(' · ')}</p>`:''}
   ${s.have.length?`<p class="small muted" style="margin:0">מהמקרר: ${s.have.map(h=>`${esc(ING[h.id].n)} (${qtyText(h.id,h.g)})`).join(' · ')}</p>`:''}
   <p class="small muted" style="margin:0">מחירים ממוצעים בישראל, אוקטובר 2026, בעיגול. הסכום בקופה גבוה מעלות האוכל כי קונים אריזות שלמות; מה שנשאר נכנס למזווה.</p>`;
}
function viewCook(){
  const groups={};
  for (const {item,q} of st.plan.meals){
    const id=item.base||item.id, factor=item.big?BIG:1;
    const g=groups[id]||(groups[id]={item:{...item, n:item.big?item.n.replace(' (מנה גדולה)',''):item.n}, units:0, normal:0, big:0});
    g.units+=q*factor; if(item.big) g.big+=q; else g.normal+=q;
    if(item.big) g.item.ing=Object.fromEntries(Object.entries(item.ing).map(([k,v])=>[k,v/BIG]));
  }
  const list=Object.values(groups).map(g=>({item:g.item, q:g.units, label:[g.normal?g.normal+' מנות':'',g.big?g.big+' מנות גדולות':''].filter(Boolean).join(' + ')})).sort((a,b)=>b.item.time-a.item.time), n=list.length+1;
  if(st.rec>=n) st.rec=0;
  if(st.rec<list.length){
    const {item,q,label}=list[st.rec];
    $('#viewBody').innerHTML=pager(st.rec,n,esc(item.n)+gtag(item),`מתכון ${st.rec+1} מתוך ${list.length} · ${label} · ${item.time} דק'`,'rec')+
      `<div class="qty">${Object.entries(item.ing).map(([id,g])=>`<span>${esc(ING[id].n)}</span><span>${qtyText(id,g*q)}</span>`).join('')}</div>
       <ol class="stepsl">${item.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
       ${st.rec===0?'<p class="small muted" style="margin:0">מתחילים מהמתכון הארוך ביותר, ובזמן שהוא על האש מכינים את הבאים.</p>':''}`;
  } else {
    $('#viewBody').innerHTML=pager(st.rec,n,'לוח זמנים מ־Gemini','סוף הבישול','rec')+
      `<p style="margin:0">Gemini מסדר את כל המתכונים ללוח זמנים אחד שמנצל תנור וכיריים במקביל. הכמויות נשארות בדיוק כמו שחושבו.</p>
       <input type="text" id="taste" placeholder="העדפות טעם (לא חובה), למשל: אוהב חריף">
       <div><button class="btn sm" type="button" id="cookBtn">בקש מ־Gemini</button></div>
       <div class="status" id="cookStatus"></div>
       <div id="cookManual" hidden><pre class="prompt" id="cookPrompt"></pre><div style="margin-top:8px"><button class="btn ghost sm" type="button" data-copyfrom="cookPrompt">העתק פרומפט</button></div></div>
       <div class="out" id="cookOut" hidden></div>`;
  }
}
function md(t){
  return esc(t).split('\n').map(l=>{ l=l.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
    if(/^#{1,4}\s/.test(l)) return `<h4>${l.replace(/^#+\s/,'')}</h4>`;
    if(/^\s*([-*•]|\d+[.)])\s/.test(l)) return `<li>${l.replace(/^\s*([-*•]|\d+[.)])\s/,'')}</li>`;
    return l.trim()?`<p>${l}</p>`:''; }).join('').replace(/(<li>.*?<\/li>)+/g,m=>`<ul>${m}</ul>`);
}

/* results interactions */
$('#view').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; st.view=b.dataset.v; renderResults(); });
document.addEventListener('click',async e=>{
  const pg=e.target.closest('[data-pg]'); if(pg){ st[pg.dataset.pg]+=Number(pg.dataset.d); renderResults(); }
  const gd=e.target.closest('[data-goday]'); if(gd){ st.day=Number(gd.dataset.goday); renderResults(); }
  const fx=e.target.closest('[data-fix]'); if(fx){ if(fx.dataset.fix==='prefer'){ st.S.prefer=[]; st.plan=solvePlan(); renderResults(); updateNav(); return; } if(fx.dataset.fix==='variety'){ st.S.variety=fx.dataset.val; buildWeek(''); return; } st.S[fx.dataset.fix]=Number(fx.dataset.val); if(fx.dataset.fix==='protein') st.customTargets=true; buildWeek(''); }
  if(e.target.id==='undoAuto' && st.plan && st.plan.auto){ Object.assign(st.S, st.plan.auto.before); st.plan={infeasible:true, diag:st.plan.auto.diag}; renderResults(); updateNav(); return; }
  if(e.target.id==='askBtn'){ const r=$('#askIn').value.trim(); if(!r){ $('#askIn').focus(); return; } $('#askIn').value=''; buildWeek(r); }
  if(e.target.id==='gRetry' && st.gem){ buildWeek(st.gem.request); return; }
  if(e.target.id==='gApply'){
    try{ const req=st.gem.request; st.gem=applyGeminiAnswer(parseJSON($('#gPaste').value)); st.gem.request=req; st.plan=solvePlan(); renderResults(); updateNav(); }
    catch(err){ toast('זה לא JSON תקין. העתיקו רק את הבלוק שבין { ל־}.'); }
  }
  if(e.target.id==='cookBtn'){
    const btn=e.target, s=$('#cookStatus'), pr=cookPrompt(st.plan,$('#taste').value,qtyText);
    btn.disabled=true; s.className='status'; s.textContent='Gemini כותב…';
    try{ $('#cookOut').innerHTML=md(await gemini(pr,false)); $('#cookOut').hidden=false; s.textContent=''; }
    catch(err){ s.className='status err'; s.textContent=gemErrorText(err)+' העתיקו את הפרומפט ל־gemini.google.com:'; $('#cookPrompt').textContent=pr; $('#cookManual').hidden=false; }
    btn.disabled=false;
  }
  const cf=e.target.closest('[data-copyfrom]'); if(cf){ const el=$('#'+cf.dataset.copyfrom);
    navigator.clipboard?.writeText(el.textContent).then(()=>{ cf.textContent='הועתק'; setTimeout(()=>cf.textContent='העתק פרומפט',1500); })
      .catch(()=>{ const r=document.createRange(); r.selectNodeContents(el); const sl=getSelection(); sl.removeAllRanges(); sl.addRange(r); }); }
});
$('#another').addEventListener('click',()=>{
  if(!st.plan||!st.plan.meals) return;
  st.S.avoid=st.plan.meals.map(m=>m.item.base||m.item.id); st.S.seed=1+Math.floor(Math.random()*997);
  st.day=0; st.rec=0; st.ticks={}; st.savedId=null;
  st.plan=solvePlan(); renderResults(); updateNav(); toast('הנה תפריט אחר');
});
$('#askIn').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#askBtn').click(); });
document.addEventListener('change',e=>{ const t=e.target.closest('[data-tick]'); if(t){ st.ticks[t.dataset.tick]=t.checked; if(st.savedId) saveWeek(true); renderResults(); } });

/* =========================================================
   Saved weeks
   ========================================================= */
function loadWeeks(){ try{ return JSON.parse(store.get('prepplan.weeks')||'[]'); }catch(e){ return []; } }
function saveWeeks(w){ store.set('prepplan.weeks',JSON.stringify(w)); $('#nWeeks').textContent=w.length; }
function saveWeek(silent){
  const p=st.plan; if(!p||!p.meals) return;
  const w=loadWeeks();
  if(st.savedId){ const x=w.find(x=>x.id===st.savedId); if(x){ x.ticks=st.ticks; saveWeeks(w); } if(!silent) toast('נשמר'); return; }
  const d=new Date(), id='w'+d.getTime();
  w.unshift({id, name:`שבוע של ${d.getDate()}.${d.getMonth()+1}`, date:d.toISOString(), S:p.S, mode:st.mode, meals:p.meals, snacks:p.snacks, breakfasts:p.breakfasts, ticks:st.ticks});
  saveWeeks(w); st.savedId=id; toast('השבוע נשמר ב"השבועות שלי"'); renderResults(); updateNav();
}
function openWeek(id){
  const x=loadWeeks().find(w=>w.id===id); if(!x) return;
  st.S=JSON.parse(JSON.stringify(x.S)); st.mode=x.mode; st.gem=null;
  st.plan=finish({S:x.S, meals:x.meals, snacks:x.snacks, breakfasts:x.breakfasts||[]}); st.ticks=x.ticks||{}; st.savedId=id; st.day=0; st.rec=0; st.view='menu';
  go('s4');
}
function renderWeeks(){
  const w=loadWeeks();
  $('#weeksList').innerHTML=w.length?w.map(x=>{ const t=totals(x.meals,x.snacks,x.S,x.breakfasts||[]);
    return `<div class="week-item"><div><b>${esc(x.name)}</b><div class="small muted">${x.S.days} ימים · ${[...new Set(x.meals.map(m=>esc(m.item.n.replace(' (מנה גדולה)',''))))].join(', ')}</div><div class="small muted">${fmt(t.cost)} ₪ · ${fmt(t.p/x.S.days)} ג' חלבון ביום</div></div>
      <div class="acts"><button class="btn sm" type="button" data-open="${x.id}">פתח</button><button class="btn ghost sm" type="button" data-del="${x.id}">מחק</button></div></div>`; }).join('')
    :'<p class="muted" style="margin:0">עוד לא שמרת שבוע. בסוף התכנון לוחצים "שמור את השבוע".</p>';
}
document.addEventListener('click',e=>{
  const o=e.target.closest('[data-open]'); if(o) openWeek(o.dataset.open);
  const d=e.target.closest('[data-del]');
  if(d){ if(d.dataset.confirm){ saveWeeks(loadWeeks().filter(w=>w.id!==d.dataset.del)); if(st.savedId===d.dataset.del) st.savedId=null; renderWeeks(); }
         else { d.dataset.confirm='1'; d.textContent='בטוח?'; } }
});

/* =========================================================
   How it works
   ========================================================= */
function renderHow(){
  const S=st.S, N=S.days*S.meals, rep=Math.min(S.days,VARIETY[S.variety].rep), main=Object.values(ING).filter(x=>x.cat!=='pantry').length;
  $('#dataLine').textContent=`${main} מרכיבים עיקריים, ${Object.keys(ING).length-main} תבלינים ורטבים, ${RECIPES.filter(r=>r.src==='base').length} מתכוני בסיס${RECIPES.some(r=>r.src==='gemini')?' ו־'+RECIPES.filter(r=>r.src==='gemini').length+' מתכונים מ־Gemini':''}.`;
  $('#howGoal').textContent='לפי ההגדרות הנוכחיות שלך. המטרה: '+({cost:'התפריט הכי זול',time:'הכי מעט זמן בישול',protein:'הכי הרבה חלבון'})[st.mode]+' שעומד בכל הדרישות.';
  const rows=[
    [`${N} ארוחות עיקריות`, `${S.days} ימים × 2`],
    ['ארוחת בוקר כל יום', 'כל אחת עד פעמיים בשבוע'],
    ['קלוריות ביום', `\u2066${fmt(S.kcal*(1-KCAL_TOL))}–${fmt(S.kcal*(1+KCAL_TOL))}\u2069`],
    ['חלבון ביום', `\u2066${S.protein}–${Math.round(S.protein*(st.mode==='protein'?1.3:1.15))}\u2069 ג'`],
    ['עלות האוכל לשבוע', `עד ${S.budget} ₪`],
    ['זמן בישול לשבוע', `עד ${S.time} דק'`],
    ['כל מנה עיקרית', `עד ${rep} פעמים בשבוע`],
  ];
  if(S.exclude.length) rows.push(['בלי', S.exclude.map(t=>TAGS[t]).join(', ')]);
  $('#guar').innerHTML=rows.map(([k,v])=>`<li><span>${k}</span><b>${esc(v)}</b></li>`).join('');
  $('#formula').textContent=`minimize   ${({cost:'Σ cost·(x + 1.4z)',time:'Σ time_r·y_r',protein:'−Σ protein·(x + 1.4z)'})[st.mode]}
subject to Σ (x_r + z_r) = ${N}
           Σ b_k = ${S.days},   b_k ≤ 2
           Σ s_k ≤ ${S.snacks*S.days}
           ${fmt(S.kcal*S.days*(1-KCAL_TOL))} ≤ Σ kcal ≤ ${fmt(S.kcal*S.days*(1+KCAL_TOL))}
           ${S.protein*S.days} ≤ Σ protein ≤ ${Math.round(S.protein*S.days*(st.mode==='protein'?1.3:1.15))}
           Σ cost ≤ ${S.budget}
           Σ time_r·y_r ≤ ${S.time}
           y_r ≤ x_r + z_r ≤ ${rep}·y_r
           x, z, b, s ∈ ℤ⁺ ,  y ∈ {0,1}`;
  $('#gproxy').value=gemProxy(); $('#gkey').value=gemKey();
}
$('#gproxy').addEventListener('change',e=>store.set('gproxy',e.target.value.trim()));
$('#gkey').addEventListener('change',e=>store.set('gkey',e.target.value.trim()));

/* =========================================================
   Navigation
   ========================================================= */
function go(id){
  st.screen=id;
  $$('.screen').forEach(s=>s.hidden=s.id!==id);
  const i=FLOW.indexOf(id);
  $('#progress').hidden=i<0; $('#topbar').hidden=id==='s0'; $('.nav').hidden=id==='s0';
  $$('#progress div').forEach((d,k)=>{ d.className=k===i?'on':k<i?'done':''; });
  if(id==='s0'){ const n=loadWeeks().length; $('#resume').hidden=!n; $('#resume').textContent=n?`או לפתוח שבוע ששמרת (${n})`:''; }
  else if(id==='s4') renderResults();
  else if(id==='sweeks') renderWeeks();
  else if(id==='show') renderHow();
  else if(i>=0) renderInputs();
  updateNav(); window.scrollTo(0,0);
}
function updateNav(){
  const id=st.screen, i=FLOW.indexOf(id), back=$('#back'), next=$('#next');
  if(id==='s0') return;
  back.hidden=false; next.hidden=false;
  if(i<0){ back.textContent='חזרה'; next.hidden=true; return; }
  back.textContent=i===0?'לדף הבית':i===3?'שינוי הגדרות':'הקודם';
  if(i<2) next.textContent='הבא';
  else if(i===2) next.textContent='בנה לי תפריט';
  else { const ok=st.plan&&st.plan.meals; next.hidden=!ok; next.textContent=st.savedId?'נשמר ✓':'שמור את השבוע'; }
}
$('#next').addEventListener('click',()=>{
  const i=FLOW.indexOf(st.screen);
  if(i<2) go(FLOW[i+1]);
  else if(i===2) buildWeek($('#request').value.trim());
  else saveWeek();
});
$('#back').addEventListener('click',()=>{
  const i=FLOW.indexOf(st.screen);
  if(i<0) go(st.plan?'s4':'s0'); else if(i===0) go('s0'); else if(i===3) go('s1'); else go(FLOW[i-1]);
});
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go('s'+b.dataset.go)));
$('#home').addEventListener('click',()=>go('s0'));
$('#start').addEventListener('click',()=>{ st.S.ban=[]; go('s1'); });
$('#resume').addEventListener('click',()=>go('sweeks'));

/* ---------- boot ---------- */
loadGeminiRecipes();
$('#nWeeks').textContent=loadWeeks().length;
go('s0');
