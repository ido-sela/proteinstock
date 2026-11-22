/* Product information shown on the product page: nutrition per unit, allergens, warnings and notes.
   Collected from the manufacturers' UK/EU product listings (retailer pages quoting the pack label), November 2026.
   The binding information is the label on the package; the product page says so.
   n: per unit (one bar / bottle / can / pot / serving), grams unless noted. caf = caffeine in mg.
   Leave a value out when it was not found for that exact flavour — never copy it from another flavour. */

const INFO = (() => {   // family constants stay private so they cannot clash with other scripts (data.js has a global RAW)
const A = {milk:'חלב', soy:'סויה', peanut:'בוטנים', nuts:'אגוזים', hazel:'אגוזי לוז', egg:'ביצים', gluten:'גלוטן', wheat:'חיטה', barley:'שעורה', oats:'שיבולת שועל', sesame:'שומשום', sulph:'סולפיטים'};
const W = {
  lax: 'צריכה מופרזת עלולה לגרום להשפעה משלשלת.',
  caf: 'תכולת קפאין גבוהה. לא מומלץ לילדים, לנשים בהריון או מניקות ולאנשים הרגישים לקפאין. יש לצרוך באחריות.',
  collagen: 'מכיל קולגן — אינו מתאים לצמחונים.',
  gelatine: 'מכיל ג׳לטין — אינו מתאים לצמחונים.',
  phe: 'מכיל מקור לפנילאלנין (ממתיק אספרטיים).',
  lactose: 'מכיל לקטוז — אינו מתאים לרגישים ללקטוז.'
};

/* shared family data */
const SNICKERS_LS = {contains:[A.milk, A.soy, A.peanut], may:[A.nuts, A.egg, A.gluten], warn:[W.lax, W.collagen], note:'ממותק בממתיקים (מלטיטול).'};
const MARS_LS = {contains:[A.milk, A.barley, A.gluten], may:[A.peanut, A.nuts, A.egg, A.soy], warn:[W.lax, W.collagen], note:'ממותק בממתיקים (מלטיטול).'};
const HP_COOKIE = {contains:[A.wheat, A.gluten, A.soy, A.milk], may:[A.nuts], note:'עוגייה אפויה עשירה בחלבון (חלבון חיטה, אפונה וסויה).'};
const RAW = {contains:[A.milk, A.oats, A.gluten, A.soy], may:[A.egg, A.nuts, A.peanut, A.sesame], warn:[W.lax, W.gelatine], note:'מבוסס שיבולת שועל, עשיר בסיבים. ממותק בממתיקים.'};
const CRUNCH = {contains:[A.milk, A.soy, A.barley, A.gluten], may:[A.nuts, A.egg, A.peanut], warn:[W.lax, W.collagen], note:'חטיף רב-שכבתי פריך. ממותק בממתיקים (מלטיטול).'};
const MONSTER_ZERO = {contains:[], warn:[W.caf], note:'ללא סוכר, עם ממתיקים. ללא אלרגנים מוצהרים. כמות הקפאין מופיעה על הפחית.'};
const MONSTER_SUGAR = {contains:[], warn:[W.caf], note:'מכיל סוכר וממתיקים. ללא אלרגנים מוצהרים.'};
const UFIT = {contains:[A.milk], warn:[W.lactose], note:'ללא תוספת סוכר (מכיל סוכרי חלב טבעיים). ללא שומן כמעט. מתאים לצמחונים. לאחר פתיחה לשמור בקירור ולשתות תוך 24 שעות.'};
const APPLIED_SHAKE = {contains:[A.milk], warn:[W.lactose], note:'ללא תוספת סוכר, דל שומן, ממותק בסוכרלוז. לאחר פתיחה לשמור בקירור ולשתות תוך 24 שעות.'};
const OATS = {contains:[A.oats, A.gluten, A.milk, A.soy], may:[A.sesame, A.nuts], note:'שיבולת שועל מלאה אורגנית עם חלבון מי גבינה ו-MCT. מכינים עם 150 מ״ל מים רותחים או חלב וממתינים 2–3 דקות. מתאים לצמחונים, בעל הכשר חלאל.'};
const APPLIED_CRUNCH = {contains:[A.milk, A.wheat, A.gluten, A.soy], may:[A.peanut, A.nuts, A.sulph], note:'ממותק בממתיקים (מלטיטול). מתאים לצמחונים, בעל הכשר חלאל.'};
const GUMMIES = {contains:[], warn:['מנה: 4 סוכריות ביום (3 גרם קריאטין מונוהידראט). אין לחרוג מהמנה המומלצת.'], note:'ללא אלרגנים נפוצים (מיוצר במפעל שמטפל גם בחלב, סויה, ביצים, דגים וגלוטן). טבעוני, ללא גלוטן, בעל הכשר חלאל. רכיבים: קריאטין מונוהידראט, סוכר, סירופ גלוקוז, מים, פקטין, חומרי טעם, ציפוי (MCT, שעוות קרנאובה).'};
const DINKY = {contains:[A.milk, A.soy, A.wheat, A.gluten], may:[A.nuts, A.peanut], note:'חטיף חלבון קטן (35 גרם) דל סוכר ועשיר בסיבים.'};
const PROPUD = {contains:[A.milk, A.soy], may:[A.egg, A.nuts, A.sesame, A.wheat], warn:[W.lax, W.phe], note:'ללא תוספת סוכר וללא שמן דקלים. ממותק בממתיקים.'};

return {
  /* Snickers Hi Protein Low Sugar 57g */
  '57yf4w': {...SNICKERS_LS, per:'לחטיף (57 גרם)', n:{kcal:218, fat:10, sat:4.3, carb:15, sugar:2.0, protein:20, salt:0.58}},
  '35eyfl': {...SNICKERS_LS, per:'לחטיף (57 גרם)', n:{kcal:217, fat:10, sat:4.2, carb:15, sugar:1.9, protein:20, salt:0.58}},
  '3o7nip': {...SNICKERS_LS, per:'לחטיף (57 גרם)', n:{kcal:215, fat:10, sat:4.2, carb:14, sugar:1.1, protein:20, salt:0.56}},
  'nho05h': {...SNICKERS_LS, contains:[A.milk, A.soy, A.peanut, A.hazel], per:'לחטיף (57 גרם)', n:{kcal:221, fat:11, carb:15, protein:20}},
  'yux81n': {contains:[A.milk, A.soy, A.peanut], may:[A.nuts, A.egg], per:'לחטיף (57 גרם)', n:{kcal:225, fat:8.5, sat:3, carb:20, sugar:9.4, protein:20}},
  'wc2qj8': {contains:[A.milk, A.soy, A.peanut], may:[A.nuts, A.egg, A.gluten], per:'לחטיף (55 גרם)', n:{kcal:217, fat:8.2, carb:15.4, protein:20}, note:'חטיף עם בוטנים, קרמל ופתיתים פריכים בציפוי שוקולד חלב.'},
  /* Mars Hi Protein Low Sugar 57g */
  '3wvtn8': {...MARS_LS, per:'לחטיף (57 גרם)', n:{kcal:201, sugar:1.9, protein:18}},
  'glj0p8': {...MARS_LS, contains:[A.milk, A.soy, A.barley, A.gluten], may:[A.nuts, A.egg, A.peanut], per:'לחטיף (57 גרם)', n:{kcal:196, fat:7.7, sat:4.6, carb:18, sugar:1.7, protein:18, salt:0.39}},
  '0k7r7a': {...MARS_LS, per:'לחטיף (57 גרם)', n:{kcal:201, fat:7.8, sat:4.6, carb:22, sugar:1.8, protein:18, salt:0.27}},
  /* M&M's Hi Protein 51g */
  'wu794d': {contains:[A.milk, A.soy], may:[A.peanut, A.nuts, A.egg, A.wheat, A.barley, A.oats], warn:[W.collagen], per:'לחטיף (51 גרם)', n:{kcal:192, fat:6.3, sat:3.7, carb:19, sugar:13, protein:15, salt:0.34}, note:'עם פתיתי M&M׳s מיני אמיתיים בציפוי שוקולד חלב.'},
  /* Hi Protein cookies 60g */
  'frraw9': {...HP_COOKIE, contains:[A.wheat, A.gluten, A.soy, A.milk, A.peanut], per:'לעוגייה (60 גרם)', n:{kcal:249, fat:9.3, sat:2.5, carb:25, sugar:13, protein:15, salt:0.42}},
  'hfygfs': {...HP_COOKIE, contains:[A.wheat, A.gluten, A.soy, A.milk, A.peanut], per:'לעוגייה (60 גרם)', n:{protein:15}},
  'x06j8d': {...HP_COOKIE, per:'לעוגייה (60 גרם)', n:{kcal:233, fat:7.2, sat:2.1, carb:25, sugar:14, protein:15}},
  '5g4sp7': {...HP_COOKIE, per:'לעוגייה (60 גרם)', n:{protein:15}},
  /* Hi Protein milk drinks 250ml */
  '4v4i0n': {contains:[A.milk, A.barley, A.gluten], warn:[W.lactose], per:'לבקבוק (250 מ״ל)', n:{kcal:158, fat:3, sat:2, carb:12, sugar:12, protein:20, salt:0.5}, note:'משקה חלב עשיר בחלבון בטעם מארס.'},
  'n01acm': {contains:[A.milk], warn:[W.lactose], per:'לבקבוק (250 מ״ל)', n:{protein:20}, note:'משקה חלב עשיר בחלבון (חלב מופחת שומן, תרכיז חלבון חלב ומי גבינה) בטעם סניקרס.'},
  /* Warrior RAW 75g */
  'tt5tk9': {...RAW, per:'לחטיף (75 גרם)', n:{kcal:249, fat:3.8, sat:1.4, carb:20.9, sugar:3.7, fiber:7.6, protein:20.1, salt:0.23}},
  'ysom9e': {...RAW, contains:[A.milk, A.oats, A.gluten, A.soy, A.peanut], per:'לחטיף (75 גרם)', n:{kcal:262, fat:5.6, sat:1.6, carb:20.6, sugar:3.7, fiber:6.8, protein:20.1, salt:0.18}},
  'sp0qrj': {...RAW, contains:[A.milk, A.oats, A.barley, A.gluten, A.soy, A.peanut], per:'לחטיף (75 גרם)', n:{kcal:255, fat:5.3, sugar:3.5, fiber:8.5, protein:21}},
  'abm5zw': {...RAW, per:'לחטיף (75 גרם)', n:{sugar:3.1, protein:20}},
  'uvfrli': {...RAW, per:'לחטיף (75 גרם)', n:{kcal:246, fiber:8.5, protein:20}},
  'h9umx1': {...RAW, per:'לחטיף (75 גרם)', n:{protein:20}},
  /* Warrior Crunch 64g */
  'tsn2s9': {...CRUNCH, per:'לחטיף (64 גרם)', n:{kcal:239, fat:11, sat:6.1, carb:24, sugar:2.3, protein:20, salt:0.36}},
  'dwu0pp': {...CRUNCH, per:'לחטיף (64 גרם)', n:{kcal:243, fat:11, sat:7.3, carb:23, sugar:2.3, protein:20, salt:0.35}},
  'vdx2p0': {...CRUNCH, per:'לחטיף (64 גרם)', n:{kcal:241, fat:11, sat:7.1, carb:25, sugar:2.1, protein:20}},
  'yakth3': {...CRUNCH, per:'לחטיף (64 גרם)', n:{kcal:239, sugar:2.1, protein:20}},
  'zmr5rv': {...CRUNCH, contains:[A.milk, A.soy, A.barley, A.gluten, A.peanut], per:'לחטיף (64 גרם)', n:{protein:20}},
  'airpzb': {...CRUNCH, contains:[A.milk, A.soy, A.barley, A.gluten, A.peanut], per:'לחטיף (64 גרם)', n:{protein:20}},
  '2n052s': {...CRUNCH, per:'לחטיף (64 גרם)', n:{protein:20}},
  '6rnjgr': {...CRUNCH, per:'לחטיף (64 גרם)', n:{protein:20}},
  /* Monster — zero sugar */
  'hz5ul4': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  '5k4qpy': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'nfn76o': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'rftzpe': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'xhrk27': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{kcal:14, carb:4.4, sugar:0}},
  '7jwocl': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'zeynbx': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'ecio0t': {...MONSTER_ZERO, per:'לפחית (500 מ״ל)', n:{sugar:0}},
  'ciprpw': {...MONSTER_ZERO, per:'לפחית (473 מ״ל)', n:{sugar:0}},
  'xfm9y6': {...MONSTER_ZERO, per:'לפחית (473 מ״ל)', n:{sugar:0}},
  'ozdi0k': {...MONSTER_ZERO, per:'לפחית (473 מ״ל)', n:{sugar:0}},
  'mnao75': {...MONSTER_ZERO, per:'לפחית (473 מ״ל)', n:{sugar:0}},
  'x1vyqh': {...MONSTER_ZERO, per:'לפחית (473 מ״ל)', n:{sugar:0}},
  /* Monster — with sugar */
  'cgypj1': {...MONSTER_SUGAR, per:'לפחית (500 מ״ל)', n:{kcal:229, carb:57, sugar:55, salt:0.2, caf:160}},
  '20kjyo': {...MONSTER_SUGAR, per:'לפחית (500 מ״ל)', n:{kcal:179, carb:46, sugar:41, salt:0.86, caf:160}, note:'מכיל 6% מיץ פירות מרוכז, סוכר וממתיקים. ללא אלרגנים מוצהרים.'},
  'op107x': {...MONSTER_SUGAR, per:'לפחית (500 מ״ל)'},
  '1se7a1': {...MONSTER_SUGAR, per:'לפחית (500 מ״ל)'},
  'hqihcl': {contains:[], warn:[W.caf], per:'לפחית (458 מ״ל)', note:'משקה אנרגיה על בסיס תה. ללא אלרגנים מוצהרים.'},
  /* UFIT 500ml */
  '24lhib': {...UFIT, per:'לבקבוק (500 מ״ל)', n:{kcal:295, fat:1.5, sat:1, carb:18, sugar:17, protein:50, salt:0.7}},
  'hwgbud': {...UFIT, per:'לבקבוק (500 מ״ל)', n:{kcal:285, fat:1, sat:0.5, carb:19, sugar:18, protein:50, salt:0.8}},
  'd20mju': {...UFIT, per:'לבקבוק (500 מ״ל)', n:{kcal:280, fat:0.5, sat:0.5, carb:18, protein:50, salt:1.3}},
  'bla03u': {...UFIT, per:'לבקבוק (500 מ״ל)', n:{kcal:280, fat:0.5, sat:0.5, carb:18.5, sugar:18, protein:50}},
  /* Applied Nutrition High Protein Shake 500ml */
  'euudrs': {...APPLIED_SHAKE, per:'לבקבוק (500 מ״ל)', n:{protein:42}, ingr:'תרכיז חלבון חלב (65%), מים, חלב רזה (7.5%), חומרי טעם, מייצבים (קרגינן, גלאן), מווסת חומציות (טריסודיום ציטרט), צבע (בטא קרוטן), ממתיק (סוכרלוז).'},
  '1wbn8q': {...APPLIED_SHAKE, per:'לבקבוק (500 מ״ל)', n:{protein:42}, ingr:'תרכיז חלבון חלב (65%), מים, חלב רזה (7.5%), חומרי טעם, מייצבים (קרגינן, גלאן), מווסת חומציות (טריסודיום ציטרט), צבע (ליקופן), ממתיק (סוכרלוז).'},
  'rrivbm': {...APPLIED_SHAKE, per:'לבקבוק (500 מ״ל)', n:{protein:42}, ingr:'תרכיז חלבון חלב (62%), מים, חלב רזה (10%), אבקת קקאו מופחתת שומן (0.9%), מייצבים (קרגינן, גלאן), מווסת חומציות (טריסודיום ציטרט), חומרי טעם, ממתיק (סוכרלוז).'},
  'hk1dvq': {...APPLIED_SHAKE, per:'לבקבוק (500 מ״ל)', n:{protein:42}, ingr:'תרכיז חלבון חלב (65%), מים, חלב רזה (7.5%), חומרי טעם, מייצבים (קרגינן, גלאן), מווסת חומציות (טריסודיום ציטרט), צבע (בטא קרוטן), ממתיק (סוכרלוז).'},
  /* Critical Oats 60g pots */
  '1zv6tk': {...OATS, per:'לגביע (60 גרם)', n:{kcal:238, fat:6.4, sat:3.1, carb:23, sugar:1.4, fiber:3.9, protein:23}},
  'qtkqxx': {...OATS, per:'לגביע (60 גרם)', n:{protein:23}},
  '9eoguz': {...OATS, per:'לגביע (60 גרם)', n:{protein:23}},
  /* Applied Nutrition bars */
  'dyh8uv': {...APPLIED_CRUNCH, per:'לחטיף (62 גרם)', n:{kcal:195, fat:5.8, sugar:1.8, protein:21}},
  'z6ei7d': {...APPLIED_CRUNCH, per:'לחטיף (62 גרם)', n:{sugar:1.8, protein:21}},
  'vlmmh5': {...APPLIED_CRUNCH, contains:[A.milk, A.wheat, A.gluten, A.soy, A.peanut], per:'לחטיף (65 גרם)', n:{sugar:1.8, protein:21}},
  'w7pq7z': {contains:[A.wheat, A.gluten, A.milk, A.soy], per:'לחטיף (45 גרם)', n:{kcal:140, sugar:1, protein:12}, note:'חטיף חלבון דל קלוריות עם ויטמינים מוספים. ממותק בממתיקים. מתאים לצמחונים, בעל הכשר חלאל.'},
  /* Creatine gummies */
  'alw8g4': {...GUMMIES, per:'למנה (4 סוכריות)', n:{creatine:3}},
  'df1gcx': {...GUMMIES, per:'למנה (4 סוכריות)', n:{creatine:3}},
  /* Muscle Moose Dinky 35g */
  '0fswlm': {...DINKY, per:'לחטיף (35 גרם)', n:{kcal:130, fat:4.6, sat:1.6, carb:11, sugar:1.4, fiber:4.7, protein:11, salt:0.11}},
  'dp9u4r': {...DINKY, per:'לחטיף (35 גרם)', n:{kcal:129, fat:4.9, sugar:1.5, protein:11}},
  '4k5aj5': {...DINKY, per:'לחטיף (35 גרם)', n:{kcal:130, fiber:5, protein:11}},
  'zwjee9': {...DINKY, per:'לחטיף (35 גרם)', n:{protein:11}},
  /* ProPud 55g */
  'onpwcm': {...PROPUD, per:'לחטיף (55 גרם)', n:{kcal:232, fat:12, sat:6.6, carb:17.6, sugar:1.5, protein:18, salt:0.24}},
  'g5cl2p': {...PROPUD, per:'לחטיף (55 גרם)', n:{protein:18}},
  'z5kewh': {...PROPUD, per:'לחטיף (55 גרם)', n:{protein:18}}
};
})();

const NUT_ROWS = [['kcal','אנרגיה','קק״ל'],['protein','חלבון','גרם'],['carb','פחמימות','גרם'],['sugar','מתוכן סוכרים','גרם'],['fat','שומנים','גרם'],['sat','מתוכם שומן רווי','גרם'],['fiber','סיבים תזונתיים','גרם'],['salt','מלח','גרם'],['caf','קפאין','מ״ג'],['creatine','קריאטין מונוהידראט','גרם']];
const infoOf = id => INFO[id] || null;
