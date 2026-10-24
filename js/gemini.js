/* =====================================================================
   PrepPlan — Gemini layer
   Gemini understands free-text requests and writes recipes / cooking plans.
   It never decides the numbers: recipes go through importRecipes() in model.js.
   Connection order: personal API key (if set) → PrepPlan proxy (Cloudflare Worker,
   key kept server-side) → manual copy/paste fallback.
   ===================================================================== */

const PROXY_URL = 'https://prepplan-gemini.mathiasankri2610.workers.dev';   // Cloudflare Worker (worker/worker.js) — keeps the API key server-side
const GEMINI_MODEL = 'gemini-3.8-flash';

const gStore = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
function gemProxy(){ return (gStore.get('gproxy') || PROXY_URL).trim(); }
function gemKey(){ return (gStore.get('gkey') || '').trim(); }
function gemAvailable(){ return !!(gemKey() || gemProxy()); }

async function gemini(prompt, json){
  const key=gemKey(), proxy=gemProxy();
  if (key){
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{
      method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig: json?{responseMimeType:'application/json',temperature:0.4}:{temperature:0.6}})});
    const data=await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error?.message || ('HTTP '+res.status));
    return (data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
  }
  if (proxy){
    const res=await fetch(proxy,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,json:!!json})});
    const data=await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || ('HTTP '+res.status));
    return data.text || '';
  }
  throw new Error('nokey');
}

function gemErrorText(err){
  if (err.message==='nokey')   return 'אין חיבור ל־Gemini (לא הוגדר שרת).';
  if (/high demand|overloaded|UNAVAILABLE|503|429|quota/i.test(err.message)) return 'Gemini עמוס כרגע (עומס זמני אצל Google). נסו שוב בעוד דקה.';
  if (err instanceof TypeError) return 'אין גישה ל־Gemini מכאן (הרשת חסומה).';
  if (err instanceof SyntaxError) return 'Gemini החזיר תשובה שאינה JSON תקין.';
  return 'שגיאה מ־Gemini: '+err.message;
}

function parseJSON(raw){
  const t=String(raw).trim().replace(/^```(json)?/,'').replace(/```$/,'').trim();
  return JSON.parse(t);
}

/* ---- prompt: create recipes for a free-text request ---- */
function recipePrompt(request, S, currentNames){
  const ingList=Object.entries(ING).map(([k,x])=>`${k}=${x.n}`).join(', ');
  return `אתה עוזר באפליקציית meal-prep שמבצעת אופטימיזציה תזונתית.
בקשת המשתמש: """${request}"""
${currentNames&&currentNames.length?'המתכונים בתפריט הנוכחי: '+currentNames.join(', ')+'\n':''}יעד יומי: ${S.kcal} קק"ל, ${S.protein} ג' חלבון.${S.exclude.length?' המשתמש לא אוכל: '+S.exclude.map(t=>TAGS[t]).join(', ')+'.':''}

המשימה:
1. צור 4 עד 6 מתכונים לארוחה עיקרית שמתאימים לבקשה: מנה אחת = 500–800 קק"ל, עשירה בחלבון, מתאימה לבישול מראש ולשמירה 4 ימים במקרר.${S.level==='fancy'?' המשתמש רוצה מנות מושקעות: טכניקות כמו מרינדה, בישול ארוך, אפייה או רוטב מושקע, ו־5 שלבים מפורטים עם טמפרטורות וזמנים.':S.level==='simple'?' המשתמש רוצה מנות פשוטות ומהירות: עד 40 דקות.':''}${S.shop==='fridge'?' המשתמש רוצה לרוקן את המקרר: כל מתכון צריך להשתמש בכמה שיותר מהמרכיבים שכבר יש לו ('+(S.fridge||[]).filter(id=>ING[id]&&!['pantry','oils'].includes(ING[id].cat)).join(', ')+'), ובמעט מרכיבים חדשים.':''}
2. אם המשתמש ביקש לוותר על מרכיבים, החזר את המזהים שלהם במערך ban (אחרת מערך ריק).
3. note: משפט אחד קצר בעברית שמסביר למשתמש מה עשית.

חוקים מחייבים:
- השתמש רק במזהי המרכיבים מהרשימה, בגרמים למנה אחת (גולמי/יבש). תבלינים ורטבים בכמויות קטנות.
- time_min = זמן לבשל את כל הכמות בבת אחת, בדקות.
- ${S.level==='fancy'?'5 שלבי הכנה מפורטים':'3 שלבי הכנה קצרים'} בעברית.
- claimed = ההערכה שלך לקלוריות ולחלבון למנה.
- החזר JSON בלבד.

מזהי מרכיבים: ${ingList}

פורמט:
{"ban":[],"note":"...","recipes":[{"name":"...","time_min":40,"ingredients":{"chicken":180,"rice":80},"steps":["...","...","..."],"claimed":{"kcal":600,"protein":45}}]}`;
}

/* ---- prompt: one cooking session for the whole week ---- */
function cookPrompt(plan, taste, qtyText){
  const S=plan.S;
  const rec=[...plan.meals].sort((a,b)=>b.item.time-a.item.time)
    .map(({item,q})=>`- ${item.n} × ${q} מנות (${item.time} דק'): ${Object.entries(item.ing).map(([id,g])=>`${ING[id].n} ${qtyText(id,g*q)}`).join(', ')}`).join('\n');
  return `אתה שף שמתמחה ב־meal prep. כתוב בעברית תוכנית לסשן בישול אחד שמכין את כל המנות לשבוע.
חוקים: אל תשנה כמויות או מרכיבים (הם חושבו כדי לעמוד ביעד ${S.protein} ג' חלבון ו־${S.kcal} קק"ל ליום). מותר להציע תבלינים ורטבים בלי קלוריות משמעותיות.
מבנה: 1) הכנה מוקדמת 2) לוח זמנים בדקות שמנצל תנור וכיריים במקביל 3) חלוקה לקופסאות ואחסון 4) טיפ לחימום. קצר ומעשי.
העדפות טעם: ${taste||'אין'}

המנות:
${rec}`;
}

if (typeof module!=='undefined') module.exports={gemini,recipePrompt,cookPrompt,parseJSON,gemErrorText};
