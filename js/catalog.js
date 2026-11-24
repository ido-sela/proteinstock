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
/* brand logos (img/brands/<file>.webp); brands without a logo show their name */
const BRAND_LOGOS = {'Snickers':'snickers','Mars':'mars',"M&M's":'mms','Warrior':'warrior','Monster':'monster','Applied Nutrition':'applied-nutrition','UFIT':'ufit','Muscle Moose':'muscle-moose','Hubba Bubba':'hubba-bubba'};
const BRAND_ORDER = ['Snickers','Mars','Warrior','Monster',"M&M's",'Applied Nutrition','UFIT','Muscle Moose','Hubba Bubba','ProPud','Profusion'];
const brandLogo = b => BRAND_LOGOS[b] ? '/img/brands/'+BRAND_LOGOS[b]+'.webp' : '';
const brandTile = (b, cls) => `<a class="${cls||'brand-tile'}" href="/products?brand=${encodeURIComponent(b)}" aria-label="${String(b).replace(/"/g,'&quot;')}">${brandLogo(b)?`<img src="${brandLogo(b)}" alt="${String(b).replace(/"/g,'&quot;')}" loading="lazy" width="160" height="80">`:`<span>${String(b).replace(/[<>&]/g,'')}</span>`}</a>`;
/* every category each product was listed in on the old store (Zappy), so category pages show the same products as before */
const ZCATS = {"0zpa50":["protein-snacks"],"s5r79f":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"nho05h":["protein-snacks"],"cgypj1":["energy-drinks"],"24lhib":["protein-beverages","over-20g-protein"],"vdx2p0":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"5g4sp7":["protein-cookies","protein-snacks"],"wu794d":["protein-snacks"],"euudrs":["protein-beverages","over-20g-protein"],"0fswlm":["protein-snacks"],"4v4i0n":["protein-beverages"],"qtkqxx":["protein-fortified-oatmeal","over-20g-protein"],"7jwocl":["energy-drinks"],"alw8g4":["creatine-and-nutritional-supplements"],"uvfrli":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"0k7r7a":["protein-snacks"],"hfygfs":["protein-cookies","protein-snacks"],"hwgbud":["protein-beverages","over-20g-protein"],"zeynbx":["energy-drinks"],"ecio0t":["energy-drinks"],"5k4qpy":["energy-drinks"],"ozdi0k":["energy-drinks"],"hqihcl":["energy-drinks"],"mnao75":["energy-drinks"],"ciprpw":["energy-drinks"],"xfm9y6":["energy-drinks"],"20kjyo":["energy-drinks"],"nfn76o":["energy-drinks"],"op107x":["energy-drinks"],"xhrk27":["energy-drinks"],"rftzpe":["energy-drinks"],"hz5ul4":["energy-drinks"],"1se7a1":["energy-drinks"],"bla03u":["protein-beverages","over-20g-protein"],"d20mju":["protein-beverages","over-20g-protein"],"ysom9e":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"h9umx1":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"abm5zw":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"sp0qrj":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"tt5tk9":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"6rnjgr":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"tsn2s9":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"zmr5rv":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"yakth3":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"airpzb":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"dwu0pp":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"2n052s":["protein-snacks","protein-health-snacks","protein-fortified-oatmeal"],"z5kewh":["protein-snacks"],"g5cl2p":["protein-snacks"],"onpwcm":["protein-snacks"],"l55t3o":["savory-protein-snacks"],"ebc0hm":["savory-protein-snacks"],"zgivhu":["savory-protein-snacks"],"b6d4wx":["savory-protein-snacks"],"zwjee9":["protein-snacks"],"4k5aj5":["protein-snacks"],"dp9u4r":["protein-snacks"],"ban3qt":["protein-powders"],"c6s359":["protein-powders"],"frraw9":["protein-cookies","protein-snacks"],"x06j8d":["protein-cookies","protein-snacks"],"n01acm":["protein-beverages"],"1wbn8q":["protein-beverages","over-20g-protein"],"rrivbm":["protein-beverages","over-20g-protein"],"hk1dvq":["protein-beverages","over-20g-protein"],"df1gcx":["creatine-and-nutritional-supplements"],"yux81n":["protein-snacks"],"wc2qj8":["protein-snacks"],"3o7nip":["protein-snacks"],"35eyfl":["protein-snacks"],"57yf4w":["protein-snacks"],"glj0p8":["protein-snacks"],"3wvtn8":["protein-snacks"],"dyh8uv":["protein-snacks"],"vlmmh5":["protein-snacks"],"z6ei7d":["protein-snacks"],"w7pq7z":["protein-snacks"],"9eoguz":["protein-fortified-oatmeal","over-20g-protein"],"x1vyqh":["energy-drinks"],"1zv6tk":["protein-fortified-oatmeal","over-20g-protein"]};
/* old store category addresses that have no category of their own here */
const CAT_ALIAS = {'high-protein':'over-20g-protein','savory-protein-snacks':'protein-health-snacks','low-calorie-protein-powders':'protein-powders','weight-gain-supplement':'protein-powders'};
const inCat = (p, id) => { const v=VCATS.find(c=>c.id===id); if(v) return v.test(p) || (p.cats||[]).includes(id); return p.cat===id || (p.cats||[]).includes(id); };
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
  for(const c of ((typeof ZCATS!=='undefined'&&ZCATS[id])||[])){ const a=(typeof CAT_ALIAS!=='undefined'&&CAT_ALIAS[c])||c; if(a!==cat&&!cats.includes(a)) cats.push(a); }
  const name=parts[0];
  const rest=parts.slice(1).filter(p=>p.toLowerCase()!==brand.toLowerCase());
  return {id,title,name,rest,price,old,tags,img:'img/p/'+img,out,brand,protein,sugar,cat,cats,
    sale:old>price, pct:old>price?Math.round((1-price/old)*100):0};
}
