/* Catalog model shared by the storefront and the admin: categories, brand detection and the product builder. */
const CATS = [
  {id:'protein-snacks', name:'חטיפי חלבון', icon:'🍫', desc:'Snickers, Mars, Warrior, Muscle Moose ועוד — מושלם אחרי אימון או בכל רגע ביום.'},
  {id:'protein-cookies', name:'עוגיות חלבון', icon:'🍪', desc:'עוגיות רכות ואפויות של Snickers ו-Mars עם 15 גרם חלבון.'},
  {id:'protein-beverages', name:'משקאות חלבון', icon:'🥤', desc:'משקאות חלבון מוכנים לשתייה — עד 50 גרם חלבון בבקבוק.'},
  {id:'energy-drinks', name:'משקאות אנרגיה', icon:'⚡', desc:'מארזי Monster במגוון טעמים — אנרגיה ומיקוד לכל אימון.'},
  {id:'protein-fortified-oatmeal', name:'שיבולת שועל עם חלבון', icon:'🥣', desc:'דייסות Critical Oats — ארוחת בוקר עם 23 גרם חלבון.'},
  {id:'protein-powders', name:'אבקות חלבון', icon:'💪', desc:'אבקות חלבון צלול לבניית שריר והתאוששות מהירה.'},
  {id:'protein-health-snacks', name:'חטיפי בריאות עם חלבון', icon:'🌱', desc:'נשנושים אורגניים וטבעוניים עשירים בחלבון.'},
  {id:'creatine-and-nutritional-supplements', name:'קריאטין ותוספי תזונה', icon:'🧪', desc:'גומי קריאטין וכל מה שתומך בביצועים.'}
];
const catName = id => (CATS.find(c=>c.id===id)||{}).name || '';

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
  let cat='protein-snacks';
  if(/monster/i.test(title)) cat='energy-drinks';
  else if(/^משקה חלבון/.test(title)) cat='protein-beverages';
  else if(/^עוגיית/.test(title)) cat='protein-cookies';
  else if(/^דייסת/.test(title)) cat='protein-fortified-oatmeal';
  else if(/קריאטין/.test(title)) cat='creatine-and-nutritional-supplements';
  else if(/^אבקת/.test(title)) cat='protein-powders';
  else if(/profusion/i.test(title)) cat='protein-health-snacks';
  const name=parts[0];
  const rest=parts.slice(1).filter(p=>p.toLowerCase()!==brand.toLowerCase());
  return {id,title,name,rest,price,old,tags,img:'img/p/'+img,out,brand,protein,cat,
    sale:old>price, pct:old>price?Math.round((1-price/old)*100):0};
}
