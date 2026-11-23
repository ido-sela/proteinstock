/* Catalog model shared by the storefront and the admin: categories, brand detection and the product builder. */
const CATS = [
  {id:'protein-snacks', name:'חטיפי חלבון', icon:'🍫', desc:'Snickers, Mars, Warrior, Muscle Moose ועוד — מושלם אחרי אימון או בכל רגע ביום.'},
  {id:'protein-cookies', name:'עוגיות חלבון', icon:'🍪', desc:'עוגיות רכות ואפויות של Snickers ו-Mars עם 15 גרם חלבון.'},
  {id:'protein-beverages', name:'משקאות חלבון', icon:'🥤', desc:'משקאות חלבון מוכנים לשתייה — עד 50 גרם חלבון בבקבוק.'},
  {id:'energy-drinks', name:'משקאות אנרגיה', icon:'⚡', desc:'מארזי Monster במגוון טעמים — אנרגיה ומיקוד לכל אימון.'},
  {id:'protein-fortified-oatmeal', name:'שיבולת שועל בתוספת חלבון', icon:'🥣', desc:'דייסות Critical Oats — ארוחת בוקר עם 23 גרם חלבון.'},
  {id:'protein-powders', name:'אבקות חלבון', icon:'💪', desc:'אבקות חלבון צלול לבניית שריר והתאוששות מהירה.'},
  {id:'protein-health-snacks', name:'חטיפי בריאות עם חלבון', icon:'🌱', desc:'נשנושים אורגניים וטבעוניים עשירים בחלבון.'},
  {id:'creatine-and-nutritional-supplements', name:'קריאטין ותוספי תזונה', icon:'🧪', desc:'גומי קריאטין וכל מה שתומך בביצועים.'}
];
/* Sugar per unit (grams) for products whose title doesn't state it. A title containing "X גרם סוכר" takes priority. */
const SUGAR = {'57yf4w':2};
/* Virtual categories: computed from product data, shown in the store only (the admin keeps using CATS). */
const VCATS = [
  {id:'over-20g-protein', name:'מעל 20 גרם חלבון', icon:'🏋️', desc:'כל המוצרים עם 20 גרם חלבון ומעלה ביחידה — חטיפים, משקאות ודייסות.', test:p=>p.protein>=20}
];
const SHOP_CATS = [...VCATS, ...CATS];
/* old store category addresses that have no category of their own here */
const CAT_ALIAS = {'high-protein':'over-20g-protein','savory-protein-snacks':'protein-health-snacks','low-calorie-protein-powders':'protein-powders','weight-gain-supplement':'protein-powders'};
const inCat = (p, id) => { const v=VCATS.find(c=>c.id===id); if(v) return v.test(p); return p.cat===id || (p.cats||[]).includes(id); };
const catName = id => (SHOP_CATS.find(c=>c.id===id)||{}).name || '';

const BRANDS = [
  ['Monster',/monster/i],['Snickers',/snickers|סניקרס/i],['Mars',/\bmars\b|מרס/i],['Warrior',/warrior/i],
  ['Muscle Moose',/muscle moose/i],['Applied Nutrition',/applied nutrition/i],['UFIT',/ufit/i],
  ['ProPud',/propud/i],['Profusion',/profusion/i],['Hubba Bubba',/hubba bubba/i],['M&M\'s',/m&ms?/i]
];

function build(r){
  const [id,title,price,old,tagStr,img]=r;
  const parts=title.split('|').map(s=>s.trim());
  const rawTags=tagStr.split(',').filter(Boolean);
  const out=rawTags.includes('אזל');
  const tags=rawTags.filter(t=>t!=='אזל');
  let brand=''; for(const [n,re] of BRANDS){ if(re.test(title)){brand=n;break;} }
  // Snickers/Mars title ordering: first match wins; "Mars" suffix on Snickers items handled by order
  if(/snickers|סניקרס/i.test(title)) brand='Snickers';
  const pm=title.match(/(\d+(?:\.\d+)?)\s*גרם חלבון/); const protein=pm?parseFloat(pm[1]):0;
  const sm=title.match(/(\d+(?:\.\d+)?)\s*גרם סוכר/); const sugar=sm?parseFloat(sm[1]):(SUGAR[id]??null);
  let cat='protein-snacks';
  if(/monster/i.test(title)) cat='energy-drinks';
  else if(/^משקה חלבון/.test(title)) cat='protein-beverages';
  else if(/^עוגיית/.test(title)) cat='protein-cookies';
  else if(/^דייסת/.test(title)) cat='protein-fortified-oatmeal';
  else if(/קריאטין/.test(title)) cat='creatine-and-nutritional-supplements';
  else if(/^אבקת/.test(title)) cat='protein-powders';
  else if(/profusion/i.test(title)) cat='protein-health-snacks';
  const cats=[];   // extra categories a product also appears in (besides cat)
  if(/warrior raw/i.test(title)) cats.push('protein-health-snacks');
  const name=parts[0];
  const rest=parts.slice(1).filter(p=>p.toLowerCase()!==brand.toLowerCase());
  return {id,title,name,rest,price,old,tags,img:'img/p/'+img,out,brand,protein,sugar,cat,cats,
    sale:old>price, pct:old>price?Math.round((1-price/old)*100):0};
}
