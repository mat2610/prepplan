/* =====================================================================
   PrepPlan — optimisation model (pure logic, no DOM)
   Integer Linear Programming solved with javascript-lp-solver (global `solver`).
   Depends on: data-ingredients.js (ING, TAGS), data-recipes.js (RECIPES, SNACKS)
   ===================================================================== */

const KCAL_TOL = 0.05;          // daily calories allowed within ±5% of target (weekly total)
const OPT = { useBase: true };  // include the base recipe library

const isPantry = id => ING[id] && ING[id].cat === 'pantry';

/* macros and dietary tags of a recipe, computed from its ingredients (never trusted from outside) */
function nutrition(item){
  let k=0,p=0,c=0,f=0; const tags=new Set();
  for (const [id,g] of Object.entries(item.ing)){
    const x=ING[id]; k+=x.k*g/100; p+=x.p*g/100; c+=x.c*g/100; f+=x.f*g/100;
    x.tags.forEach(t=>tags.add(t));
  }
  return {k,p,c,f,tags};
}
[...RECIPES, ...BREAKFASTS, ...SNACKS].forEach(r => Object.assign(r, nutrition(r), {src:'base'}));
const BIG = 1.4;   // a 'large portion' = 1.4 × the standard recipe
const VARIETY = {low:{rep:5,label:'מעט'}, mid:{rep:3,label:'בינוני'}, high:{rep:2,label:'הרבה'}, max:{rep:1,label:'בלי חזרות'}};
/* small deterministic noise so 'another menu' gives a different valid plan */
function noise(seed,id){ let h=seed*2654435761>>>0; for(const ch of id) h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0; return (h%1000)/1000; }

/* cost of one portion; pantry items and what's already in the fridge cost 0 */
function itemCost(item, fridge){
  let cost=0;
  for (const [id,g] of Object.entries(item.ing))
    if (!fridge.has(id) && !isPantry(id)) cost += ING[id].price*g/1000;
  return cost;
}
/* value of what a portion takes from the fridge (used by the 'empty the fridge first' option) */
function fridgeValue(item, fridge){
  let v=0;
  for (const [id,g] of Object.entries(item.ing))
    if (fridge.has(id) && !isPantry(id)) v += ING[id].price*g/1000;
  return v;
}
const LEVEL = {simple:'פשוט ומהיר', normal:'רגיל', fancy:'מושקע'};

/* Build the integer program.
   x_r = weekly portions of recipe r (integer)   y_r = 1 if recipe r is cooked this week (binary)
   s_k = weekly portions of snack k (integer) */
function buildModel(S, mode, drop=new Set()){
  const fridge=new Set(S.fridge), excl=new Set(S.exclude), ban=new Set(S.ban||[]);
  const ok = it => ![...it.tags].some(t=>excl.has(t)) && !Object.keys(it.ing).some(id=>ban.has(id));
  const N = S.days*S.meals;
  const rep = Math.min(S.days, (VARIETY[S.variety]||VARIETY.mid).rep);   // max portions of one recipe per week
  const seed = S.seed||0, avoid=new Set(S.avoid||[]);
  const jitter = id => seed ? 1 + 0.35*noise(seed,id) + (avoid.has(id)?0.4:0) : 1;
  const C = {
    meals:{equal:N},
    breakfasts:{equal:S.days},
    snacks:{max:S.snacks*S.days},
    kcal:{min:S.kcal*S.days*(1-KCAL_TOL), max:S.kcal*S.days*(1+KCAL_TOL)},
    protein:{min:S.protein*S.days, max:(S.proteinCap||S.protein)*S.days*(mode==='protein'?1.3:1.15)},   // protein stays in a range: target … +15% (+30% in 'max protein')
    cost:{max:S.budget},
    time:{max:S.time},
    distinct:{min:Math.ceil(N/rep)},
  };
  const level=S.level||'normal', lvlOk = r => level!=='simple' || (!r.lvl && r.time<=40);
  const prefer=new Set(S.prefer||[]);
  const nPref=RECIPES.filter(r=>prefer.has(r.id)&&ok(r)).length;
  if (nPref) C.prefer={min:Math.min(2,nPref)};   // recipes the user asked for (via Gemini) must appear
  if (drop.has('proteinMax')) delete C.protein.max;
  for (const d of drop) delete C[d];
  const V={}, ints={};
  const recipes = RECIPES.filter(r=>ok(r) && lvlOk(r) && (OPT.useBase || r.src!=='base'));
  const nFancy = recipes.filter(r=>r.lvl).length;
  if (level==='fancy' && nFancy && !drop.has('level')) C.fancy={min:Math.min(2,nFancy)};   // 'elaborate' week: at least 2 elaborate dishes
  const snacks  = SNACKS.filter(ok);
  const breakfasts = BREAKFASTS.filter(ok);
  const W = mode==='cost' ? {cost:1,time:0,protein:0} : mode==='time' ? {cost:0.001,time:1,protein:0} : {cost:0.001,time:0,protein:-1};
  /* 'empty the fridge first': every dish cooked gets a bonus for each fridge item it uses (on the existing y_r binary,
     so the model stays as fast), and buying less counts even when the goal is time or protein. */
  const FR = S.shop==='fridge', FRW = 12;
  const frItems = FR ? [...fridge].filter(id=>ING[id] && !isPantry(id) && ING[id].cat!=='oils') : [];
  const frCount = it => frItems.filter(id=>it.ing[id]).length;
  const pObj = (it,cost,f,j) => (W.protein*it.p*f + W.cost*cost)*(W.protein?1/j:j) + (FR && mode!=='cost' ? 0.5*cost : 0);
  for (const r of recipes){
    const cost=itemCost(r,fridge);
    const j=jitter(r.id);
    V['x_'+r.id]={meals:1, kcal:r.k, protein:r.p, cost, ['lim_'+r.id]:1, ['lo_'+r.id]:1, obj:pObj(r,cost,1,j)};
    V['z_'+r.id]={meals:1, kcal:r.k*BIG, protein:r.p*BIG, cost:cost*BIG, ['lim_'+r.id]:1, ['lo_'+r.id]:1, obj:pObj(r,cost*BIG,BIG,j)};
    ints['z_'+r.id]=1;
    V['y_'+r.id]={time:r.time, distinct:1, prefer:prefer.has(r.id)?1:0, fancy:r.lvl?1:0, ['lim_'+r.id]:-rep, ['lo_'+r.id]:-1, ['cap_'+r.id]:1, obj:W.time*r.time - FRW*frCount(r)};
    ints['x_'+r.id]=1; ints['y_'+r.id]=1;
    C['lim_'+r.id]={max:0};   // x_r <= rep * y_r : variety cap, only if cooked
    C['lo_'+r.id]={min:0};    // x_r >= y_r        : cooked => eaten
    C['cap_'+r.id]={max:1};   // y_r is binary
  }
  for (const s of snacks){
    const cost=itemCost(s,fridge);
    V['s_'+s.id]={snacks:1, kcal:s.k, protein:s.p, cost, ['slim_'+s.id]:1, obj:pObj(s,cost,1,1) - 3*frCount(s)};
    ints['s_'+s.id]=1; C['slim_'+s.id]={max:snacks.length>=4?rep:S.days};   // snacks rotate too
  }
  const bRep = S.variety==='max' && breakfasts.length>=S.days ? 1 : breakfasts.length>=Math.ceil(S.days/2) ? 2 : S.days;   // 'no repeats': a different breakfast every day   // rotate breakfasts: same one at most twice a week
  for (const b of breakfasts){
    const cost=itemCost(b,fridge);
    V['b_'+b.id]={breakfasts:1, kcal:b.k, protein:b.p, cost, ['blim_'+b.id]:1, obj:(W.protein*b.p+W.cost*cost)*jitter(b.id) + (FR && mode!=='cost' ? 0.5*cost : 0) - 3*frCount(b)};
    ints['b_'+b.id]=1; C['blim_'+b.id]={max:bRep};
  }
  return {model:{optimize:'obj', opType:'min', constraints:C, variables:V, ints, options:{timeout:1500}},
          nVars:Object.keys(V).length, nCons:Object.keys(C).length, recipes, snacks, breakfasts};
}

function bigVersion(r){
  return {...r, id:r.id+'L', base:r.id, big:true, n:r.n+' (מנה גדולה)',
    ing:Object.fromEntries(Object.entries(r.ing).map(([k,g])=>[k,g*BIG])), k:r.k*BIG, p:r.p*BIG, c:r.c*BIG, f:r.f*BIG};
}
const isInteger = res => Object.entries(res).every(([k,v])=>typeof v!=='number' || !/^[xzysb]_/.test(k) || Math.abs(v-Math.round(v))<1e-6);
function solve(S, mode, drop){
  let b=buildModel(S,mode,drop);
  const t0=Date.now(); let res=solver.Solve(b.model);
  // the solver very rarely returns a fractional answer: retry with a tiny perturbation of the objective
  for (let k=1; res.feasible && !isInteger(res) && k<=3; k++){ b=buildModel({...S, seed:(S.seed||0)+k*101}, mode, drop); res=solver.Solve(b.model); }
  const ms=Date.now()-t0;
  if (!res.feasible || !isInteger(res)) return {...b, feasible:false, ms};
  const meals=[], snacks=[], breakfasts=[];
  for (const x of b.breakfasts){ const q=Math.round(res['b_'+x.id]||0); if(q>0) breakfasts.push({item:x,q}); }
  for (const r of b.recipes){
    const q=Math.round(res['x_'+r.id]||0); if(q>0) meals.push({item:r,q});
    const z=Math.round(res['z_'+r.id]||0); if(z>0) meals.push({item:bigVersion(r),q:z});
  }
  for (const s of b.snacks){ const q=Math.round(res['s_'+s.id]||0); if(q>0) snacks.push({item:s,q}); }
  return {...b, feasible:true, ms, meals, snacks, breakfasts};
}

/* The protein constraint is weekly, so a day can fall short after portions are spread.
   Re-solve with a small safety margin until every single day reaches the target (±2%). */
function solveBalanced(S, mode){
  let best=null;
  for (const margin of [0, 0.03, 0.06, 0.1]){
    const r=solve({...S, protein:Math.round(S.protein*(1+margin)), proteinCap:S.protein}, mode);
    if (!r.feasible) break;
    best=r;
    const days=assignDays(r,S);
    if (Math.min(...days.map(d=>d.p)) >= S.protein*0.98) break;   // margins never raise the +15% ceiling
  }
  return best || solve(S,mode);
}

/* totals for a plan */
function totals(meals, snacks, S, breakfasts=[]){
  const fr=new Set(S.fridge);
  const t=[...meals,...snacks,...breakfasts].reduce((a,{item,q})=>({k:a.k+item.k*q, p:a.p+item.p*q, c:a.c+item.c*q, f:a.f+item.f*q, cost:a.cost+itemCost(item,fr)*q}), {k:0,p:0,c:0,f:0,cost:0});
  const seen=new Set(); t.time=meals.reduce((a,m)=>{ const id=m.item.base||m.item.id; if(seen.has(id)) return a; seen.add(id); return a+m.item.time; },0);
  return t;
}

/* infeasible: relax one constraint at a time and report what would be needed */
function diagnose(S){
  const out=[]; let r;
  r=solve(S,'cost',new Set(['cost']));        if(r.feasible) out.push({key:'budget',  need:Math.ceil(totals(r.meals,r.snacks,S,r.breakfasts).cost)});
  r=solve(S,'time',new Set(['time']));        if(r.feasible) out.push({key:'time',    need:totals(r.meals,r.snacks,S,r.breakfasts).time});
  r=solve(S,'protein',new Set(['protein']));  if(r.feasible){ const n=Math.floor(totals(r.meals,r.snacks,S,r.breakfasts).p/S.days); if(n<S.protein) out.push({key:'protein', need:n}); }
  r=solve(S,'cost',new Set(['proteinMax']));  if(r.feasible){ const n=Math.ceil(totals(r.meals,r.snacks,S,r.breakfasts).p/S.days/1.15/5)*5; if(n>S.protein) out.push({key:'proteinUp', need:n}); }
  if (S.variety!=='low'){ const dn={max:'high',high:'mid',mid:'low'}[S.variety]; r=solve({...S,variety:dn},'cost'); if(r.feasible) out.push({key:'variety',need:dn}); }
  if ((S.level||'normal')==='fancy'){ r=solve(S,'cost',new Set(['level'])); if(r.feasible) out.push({key:'level',need:'normal'}); }
  if ((S.prefer||[]).length){ r=solve(S,'cost',new Set(['prefer'])); if(r.feasible) out.push({key:'prefer'}); }
  return out;
}

/* spread portions over days: highest-protein first, each into the day with least protein so far */
function assignDays(plan, S){
  const days=Array.from({length:S.days},()=>({breakfast:null,meals:[],snacks:[],k:0,p:0}));
  const bl=(plan.breakfasts||[]).flatMap(b=>Array(b.q).fill(b.item));
  // spread breakfasts so the same one is not on consecutive days
  const order=bl.sort((a,b)=>a.id.localeCompare(b.id));
  const slots=[...Array(S.days).keys()].sort((a,b)=>(a%2)-(b%2)||a-b);
  order.forEach((it,i)=>{ const d=days[slots[i]]; d.breakfast=it; d.k+=it.k; d.p+=it.p; });
  const mealList=plan.meals.flatMap(m=>Array(m.q).fill(m.item)).sort((a,b)=>(b.p/S.protein+b.k/S.kcal)-(a.p/S.protein+a.k/S.kcal));
  for (const it of mealList){
    const base=it.base||it.id;
    const cand=days.filter(d=>d.meals.length<S.meals && !d.meals.some(x=>(x.base||x.id)===base));
    let pool=cand.length?cand:days.filter(d=>d.meals.length<S.meals);
    if(!pool.length) pool=[...days].sort((a,b)=>a.meals.length-b.meals.length).slice(0,1);   // safety: never crash on rounding
    const d=pool.sort((a,b)=>(a.p/S.protein+a.k/S.kcal)-(b.p/S.protein+b.k/S.kcal))[0]; d.meals.push(it); d.k+=it.k; d.p+=it.p;
  }
  const snackList=plan.snacks.flatMap(s=>Array(s.q).fill(s.item)).sort((a,b)=>b.p-a.p);
  for (const it of snackList){
    const cand=days.filter(d=>d.snacks.length<S.snacks && !d.snacks.includes(it));
    let pool=cand.length?cand:days.filter(d=>d.snacks.length<S.snacks);
    if(!pool.length) pool=[...days].sort((a,b)=>a.snacks.length-b.snacks.length).slice(0,1);
    const d=pool.sort((a,b)=>(a.p/S.protein+a.k/S.kcal)-(b.p/S.protein+b.k/S.kcal))[0];
    d.snacks.push(it); d.k+=it.k; d.p+=it.p;
  }
  balanceDays(days,S);
  return days;
}

/* local search: swap meals / move or swap snacks between days while the daily balance improves */
function balanceDays(days,S){
  const score=d=>((d.k-S.kcal)/S.kcal)**2 + 0.5*Math.max(0,(S.protein-d.p)/S.protein)**2;
  const baseOf=x=>x.base||x.id;
  // the same dish on two days in a row counts as a small penalty, so the week feels different every day
  const repeats=()=>{ let n=0; for (let i=1;i<days.length;i++){ const prev=new Set(days[i-1].meals.map(baseOf)); n+=days[i].meals.filter(x=>prev.has(baseOf(x))).length; } return n; };
  const total=()=>days.reduce((a,d)=>a+score(d),0) + 0.01*repeats();
  const apply=(a,b,ia,ib,key)=>{ const x=a[key][ia], y=b[key][ib];
    a[key][ia]=y; b[key][ib]=x; a.k+=y.k-x.k; a.p+=y.p-x.p; b.k+=x.k-y.k; b.p+=x.p-y.p; };
  for (let iter=0; iter<200; iter++){
    let best=total(), move=null;
    for (let i=0;i<days.length;i++) for (let j=i+1;j<days.length;j++){
      const a=days[i], b=days[j];
      for (const key of ['meals','snacks']) for (let ia=0;ia<a[key].length;ia++) for (let ib=0;ib<b[key].length;ib++){
        const x=a[key][ia], y=b[key][ib]; if (baseOf(x)===baseOf(y)) continue;
        if (a[key].some((z,k)=>k!==ia && baseOf(z)===baseOf(y)) || b[key].some((z,k)=>k!==ib && baseOf(z)===baseOf(x))) continue;
        apply(a,b,ia,ib,key); const t=total(); apply(a,b,ia,ib,key);
        if (t<best-1e-9){ best=t; move=['swap',a,b,ia,ib,key]; }
      }
      if (a.breakfast && b.breakfast && a.breakfast.id!==b.breakfast.id){
        const x=a.breakfast, y=b.breakfast; a.k+=y.k-x.k; a.p+=y.p-x.p; b.k+=x.k-y.k; b.p+=x.p-y.p;
        const t=total(); a.k-=y.k-x.k; a.p-=y.p-x.p; b.k-=x.k-y.k; b.p-=x.p-y.p;
        if (t<best-1e-9){ best=t; move=['bswap',a,b]; }
      }
      for (const [from,to] of [[a,b],[b,a]]) for (let k=0;k<from.snacks.length;k++){
        const x=from.snacks[k]; if (to.snacks.length>=S.snacks || to.snacks.some(z=>z.id===x.id)) continue;
        from.k-=x.k; from.p-=x.p; to.k+=x.k; to.p+=x.p; const t=total(); from.k+=x.k; from.p+=x.p; to.k-=x.k; to.p-=x.p;
        if (t<best-1e-9){ best=t; move=['move',from,to,k]; }
      }
    }
    if (!move) break;
    if (move[0]==='swap') apply(move[1],move[2],move[3],move[4],move[5]);
    else if (move[0]==='bswap'){ const [,a,b]=move, x=a.breakfast, y=b.breakfast; a.breakfast=y; b.breakfast=x; a.k+=y.k-x.k; a.p+=y.p-x.p; b.k+=x.k-y.k; b.p+=x.p-y.p; }
    else { const [,from,to,k]=move, x=from.snacks.splice(k,1)[0]; to.snacks.push(x); from.k-=x.k; from.p-=x.p; to.k+=x.k; to.p+=x.p; }
  }
}

/* shopping list rounded to whole packages; fridge and pantry listed separately */
function shoppingList(plan, S){
  const fridge=new Set(S.fridge), need={};
  for (const {item,q} of [...plan.meals,...plan.snacks,...(plan.breakfasts||[])])
    for (const [id,g] of Object.entries(item.ing)) need[id]=(need[id]||0)+g*q;
  const buy=[], have=[], pantry=[];
  for (const [id,g] of Object.entries(need)){
    if (fridge.has(id)) { have.push({id,g}); continue; }
    if (isPantry(id))   { pantry.push({id,g}); continue; }
    const x=ING[id], pk=Math.ceil(g/x.pkg);
    buy.push({id,g,pk,paid:pk*x.pkg/1000*x.price});
  }
  const order=Object.keys(CATS);
  buy.sort((a,b)=>order.indexOf(ING[a.id].cat)-order.indexOf(ING[b.id].cat) || b.paid-a.paid);
  return {buy, have, pantry, paid:buy.reduce((a,b)=>a+b.paid,0)};
}

/* Recipes generated by Gemini: structure checked, unknown ingredients rejected,
   macros RECOMPUTED from the ingredient table and compared with Gemini's own claim. */
function importRecipes(list){
  if (!Array.isArray(list)) throw new Error('missing recipes array');
  return list.map((g,i)=>{
    const row={name:String(g.name||('#'+(i+1))).slice(0,60), errors:[], added:false};
    const ing=(g.ingredients && typeof g.ingredients==='object')?g.ingredients:{};
    if (!Object.keys(ing).length) row.errors.push('אין מרכיבים');
    const unknown=Object.keys(ing).filter(id=>!ING[id]);
    if (unknown.length) row.errors.push('מרכיבים לא מוכרים: '+unknown.join(', '));
    const bad=Object.entries(ing).filter(([,v])=>!(Number(v)>0 && Number(v)<=1000));
    if (bad.length) row.errors.push('כמות לא סבירה: '+bad.map(([id,v])=>id+'='+v).join(', '));
    const time=Number(g.time_min);
    if (!(time>=5 && time<=240)) row.errors.push('זמן הכנה חסר או לא סביר');
    if (!row.errors.length){
      const r={id:'g'+Date.now().toString(36)+i, n:row.name, time:Math.round(time),
        ing:Object.fromEntries(Object.entries(ing).map(([k,v])=>[k,Number(v)])),
        steps:(Array.isArray(g.steps)?g.steps:[]).slice(0,6).map(String), src:'gemini'};
      Object.assign(r, nutrition(r));
      if (r.steps.length>=5 && r.time>=40) r.lvl=2;   // detailed, longer Gemini recipes count as 'elaborate'
      if (RECIPES.some(x=>x.n===r.n)) row.errors.push('כבר קיים במאגר');
      else { RECIPES.push(r); row.added=true; row.k=r.k; row.p=r.p; row.id=r.id; }
    }
    const cl=g.claimed||{};
    row.ck=Number(cl.kcal)||null; row.cp=Number(cl.protein)||null;
    return row;
  });
}
function removeGemini(){ for (let i=RECIPES.length-1;i>=0;i--) if (RECIPES[i].src==='gemini') RECIPES.splice(i,1); }

if (typeof module!=='undefined') module.exports={fridgeValue,LEVEL,solveBalanced,VARIETY,KCAL_TOL,OPT,nutrition,itemCost,buildModel,solve,totals,diagnose,assignDays,shoppingList,importRecipes,removeGemini};
