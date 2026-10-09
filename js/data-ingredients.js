/* =====================================================================
   PrepPlan — ingredient database
   Nutrition: per 100 g, raw / dry weight (sources: Israeli Ministry of
   Health "Tzameret" food composition DB and USDA FoodData Central).
   price: average ILS per kg in Israeli supermarkets, October 2026.
     Anchors: Numbeo national averages (2 Oct 2026) for chicken fillet,
     beef, eggs, rice, milk, bread, cheese, potatoes, onions, tomatoes,
     apples, bananas, oranges, lettuce. Other items estimated relative
     to these anchors and typical chain shelf prices. Not exact to the shekel.
   pkg: typical package size in grams (shopping list rounds up to whole packs).
   tag: dietary tag used by the "don't eat" filter.
   cat 'pantry' = spices, sauces, herbs: assumed to be at home, not counted
   in the weekly budget, listed separately to check.
   ===================================================================== */

const CATS = {
  meat:'בשר ועוף', fish:'דגים', eggs:'ביצים', dairy:'מוצרי חלב', grains:'דגנים ופחמימות',
  bakery:'לחם ומאפים', legumes:'קטניות', plant:'חלבון צמחי', veg:'ירקות', fruit:'פירות',
  nuts:'אגוזים וזרעים', oils:'שמנים', pantry:'תבלינים, רטבים ועשבי תיבול'
};
const TAGS = {meat:'בשר ועוף', fish:'דגים', dairy:'מוצרי חלב', eggs:'ביצים', gluten:'גלוטן', nuts:'אגוזים ובוטנים'};

// I(name, category, kcal, protein, carbs, fat, price ₪/kg, package g, tags, extra)
function I(n,cat,k,p,c,f,price,pkg,tags,extra){ return Object.assign({n,cat,k,p,c,f,price,pkg,tags:tags||[]},extra||{}); }

const ING = {
  // ---------- meat & poultry ----------
  chicken:        I('חזה עוף',                 'meat',120,22.5,0,2.6, 44,1000,['meat']),
  thigh:          I('פרגיות',                  'meat',150,19,0,8,     52,1000,['meat']),
  drumstick:      I('שוקיים עוף',              'meat',160,18,0,9.5,   25,1000,['meat']),
  wings:          I('כנפיים',                  'meat',200,18,0,14,    22,1000,['meat']),
  whole_chicken:  I('עוף שלם',                 'meat',215,18.6,0,15,  20,1500,['meat']),
  chicken_liver:  I('כבד עוף',                 'meat',120,17,1,4.8,   30,500, ['meat']),
  ground_chicken: I('עוף טחון',                'meat',150,17.5,0,8,   42,500, ['meat']),
  turkey:         I('הודו טחון',               'meat',150,19.5,0,8,   48,500, ['meat']),
  turkey_breast:  I('חזה הודו',                'meat',115,23.5,0,1.7, 55,1000,['meat']),
  turkey_shawarma:I('שווארמה הודו',            'meat',160,20,0,8.5,   55,1000,['meat']),
  beef:           I('בקר טחון 15%',            'meat',215,18.5,0,15,  62,500, ['meat']),
  beef_lean:      I('בקר טחון רזה 5%',         'meat',140,21,0,5,     75,500, ['meat']),
  beef_shoulder:  I('כתף בקר לבישול',          'meat',180,20,0,11,    80,1000,['meat']),
  beef_sirloin:   I('סינטה',                   'meat',160,22,0,8,     120,500,['meat']),
  steak:          I('אנטריקוט',                'meat',250,19,0,19,    150,500,['meat']),
  lamb:           I('כבש טחון',                'meat',280,16.5,0,23,  90,500, ['meat']),
  sausage:        I('נקניקיות',                'meat',250,12,3,21,    35,400, ['meat']),
  pastrami:       I('פסטרמה הודו',             'meat',110,18,3,2.5,   70,200, ['meat']),

  // ---------- fish ----------
  tuna:           I('טונה במים',               'fish',116,26,0,1,     45,160, ['fish']),
  tuna_oil:       I('טונה בשמן',               'fish',190,25,0,9,     45,160, ['fish']),
  salmon:         I('פילה סלמון',              'fish',208,20,0,13,    110,400,['fish']),
  tilapia:        I('פילה אמנון',              'fish',96,20,0,1.7,    55,800, ['fish']),
  hake:           I('פילה הייק',               'fish',90,18,0,1.5,    40,800, ['fish']),
  cod:            I('פילה קוד',                'fish',82,18,0,0.7,    70,400, ['fish']),
  sea_bream:      I('דניס',                    'fish',120,20,0,4,     90,400, ['fish']),
  trout:          I('טרוטה',                   'fish',140,20,0,6.6,   80,400, ['fish']),
  sardines:       I('סרדינים בשמן',            'fish',208,25,0,11,    50,125, ['fish']),

  // ---------- eggs ----------
  eggs:           I('ביצים',                   'eggs',143,12.6,0.7,9.5, 21,720,['eggs'],{each:60,eachN:'ביצים',pkgN:'תבנית 12'}),
  egg_whites:     I('חלבוני ביצה',             'eggs',52,11,0.7,0.2,  30,500, ['eggs']),

  // ---------- dairy ----------
  milk:           I('חלב 3%',                  'dairy',60,3.3,4.8,3,  7.6,1000,['dairy']),
  milk1:          I('חלב 1%',                  'dairy',42,3.4,4.9,1,  7.6,1000,['dairy']),
  yogurt:         I('יוגורט יווני 0%',         'dairy',56,10,4,0,     30,200, ['dairy']),
  yogurt_plain:   I('יוגורט 3%',               'dairy',60,3.5,4.5,3,  20,200, ['dairy']),
  yogurt_pro:     I('יוגורט חלבון',            'dairy',65,10,4.5,0.5, 35,200, ['dairy']),
  cottage:        I("קוטג' 5%",                'dairy',95,11,1.5,5,   24,250, ['dairy']),
  cottage1:       I("קוטג' 1%",                'dairy',70,12,2,1,     24,250, ['dairy']),
  white_cheese:   I('גבינה לבנה 5%',           'dairy',95,9,4,5,      22,250, ['dairy']),
  labneh:         I('לבנה 5%',                 'dairy',110,7,4,7,     30,250, ['dairy']),
  cheese:         I('גבינה צהובה',             'dairy',300,27,0,21,   58,200, ['dairy']),
  mozzarella:     I('מוצרלה',                  'dairy',250,22,2,17,   60,200, ['dairy']),
  feta:           I('גבינה בולגרית 5%',        'dairy',140,17,1,7,    50,250, ['dairy']),
  parmesan:       I('פרמזן',                   'dairy',390,35,3,26,   150,200,['dairy']),
  ricotta:        I('ריקוטה',                  'dairy',150,10,3,10,   50,250, ['dairy']),
  cream:          I('שמנת לבישול 15%',         'dairy',160,3,4,15,    25,250, ['dairy']),
  butter:         I('חמאה',                    'dairy',717,0.9,0.1,81,45,200, ['dairy']),
  whey:           I('אבקת חלבון',              'dairy',380,78,7,5,    150,500, ['dairy']),

  // ---------- grains & starches ----------
  rice:           I('אורז לבן',                'grains',360,7,79,0.6, 10.65,1000),
  rice_brown:     I('אורז מלא',                'grains',365,7.5,76,2.7,14,1000),
  basmati:        I('אורז בסמטי',              'grains',355,8,78,0.6, 16,1000),
  pasta:          I('פסטה',                    'grains',371,13,75,1.5,10,500, ['gluten']),
  pasta_ww:       I('פסטה מקמח מלא',           'grains',350,14,70,2.5,14,500, ['gluten']),
  couscous:       I('קוסקוס',                  'grains',376,12.8,77,0.6,12,500,['gluten']),
  ptitim:         I('פתיתים',                  'grains',370,12,76,1.5,10,500, ['gluten']),
  quinoa:         I('קינואה',                  'grains',368,14,64,6,  30,500),
  bulgur:         I('בורגול',                  'grains',342,12,76,1.3,10,1000,['gluten']),
  freekeh:        I('פריקה',                   'grains',350,13,72,2.5,25,500, ['gluten']),
  oats:           I('שיבולת שועל',             'grains',389,17,66,7,  12,1000,['gluten']),
  buckwheat:      I('כוסמת',                   'grains',343,13,72,3.4,20,500),
  noodles:        I('אטריות אורז',             'grains',360,6,80,0.6, 30,400),
  potato:         I('תפוחי אדמה',              'grains',77,2,17,0.1,  5.84,2000),
  sweetpot:       I('בטטה',                    'grains',86,1.6,20,0.1,9,1000),
  corn:           I('תירס',                    'grains',86,3.3,19,1.4,15,400),
  flour:          I('קמח לבן',                 'grains',364,10,76,1,  6,1000, ['gluten']),

  // ---------- bakery ----------
  bread:          I('לחם מלא',                 'bakery',250,10,45,3,  14,750, ['gluten']),
  white_bread:    I('לחם לבן',                 'bakery',265,9,49,3.2, 18.6,500,['gluten']),
  pita:           I('פיתות',                   'bakery',275,9,55,1.2, 12,600, ['gluten'],{each:60,eachN:'פיתות',pkgN:'שקית של 10'}),
  tortilla:       I('טורטיות',                 'bakery',310,8,52,8,   25,360, ['gluten'],{each:45,eachN:'טורטיות',pkgN:'חבילה של 8'}),
  breadcrumbs:    I('פירורי לחם',              'bakery',395,13,72,5,  15,500, ['gluten']),

  // ---------- legumes ----------
  lentils:        I('עדשים ירוקות',            'legumes',352,25,60,1, 12,1000),
  red_lentils:    I('עדשים כתומות',            'legumes',358,24,63,2, 12,1000),
  black_lentils:  I('עדשים שחורות',            'legumes',352,25,60,1, 18,500),
  chickpeas:      I('חומוס יבש',               'legumes',364,19,61,6, 11,1000),
  chickpeas_can:  I('חומוס בקופסה',            'legumes',140,7,22,2.6,18,400),
  beans:          I('שעועית לבנה יבשה',        'legumes',333,23,60,0.9,14,1000),
  red_beans:      I('שעועית אדומה בקופסה',     'legumes',125,8,22,0.5,16,400),
  black_beans:    I('שעועית שחורה יבשה',       'legumes',341,21.6,62,1.4,18,500),
  peas:           I('אפונה קפואה',             'legumes',81,5.4,14,0.4,14,800),
  edamame:        I('אדממה קפוא',              'legumes',121,12,9,5,  35,400),
  hummus:         I('חומוס (ממרח)',            'legumes',250,8,14,18, 20,400),

  // ---------- plant protein ----------
  tofu:           I('טופו',                    'plant',145,16,3,8,    32,300),
  tempeh:         I('טמפה',                    'plant',195,20,8,11,   60,200),
  seitan:         I('סייטן',                   'plant',120,21,4,2,    60,250, ['gluten']),
  soy_chunks:     I('גרגירי סויה מיובשים',     'plant',340,50,30,1,   35,200),

  // ---------- vegetables ----------
  broccoli:       I('ברוקולי קפוא',            'veg',34,2.8,7,0.4,    18,800),
  cauliflower:    I('כרובית קפואה',            'veg',25,1.9,5,0.3,    16,800),
  veg:            I('ירקות מעורבים (בצל, פלפל, גזר)','veg',35,1.2,7,0.2,8,1000),
  frozen_veg:     I('תערובת ירקות למוקפץ',     'veg',45,2,8,0.3,      14,800),
  onion:          I('בצל',                     'veg',40,1.1,9.3,0.1,  5.27,1000),
  carrot:         I('גזר',                     'veg',41,0.9,9.6,0.2,  6,1000),
  pepper:         I('פלפל אדום',               'veg',31,1,6,0.3,      12,1000),
  tomato:         I('עגבניות',                 'veg',18,0.9,3.9,0.2,  8.84,1000),
  cherry_tomato:  I('עגבניות שרי',             'veg',20,1,4,0.2,      18,500),
  cucumber:       I('מלפפון',                  'veg',15,0.7,3.6,0.1,  7,1000),
  zucchini:       I('קישוא',                   'veg',17,1.2,3.1,0.3,  8,1000),
  eggplant:       I('חציל',                    'veg',25,1,6,0.2,      7,1000),
  spinach:        I('תרד קפוא',                'veg',23,2.9,3.6,0.4,  16,800),
  lettuce:        I('חסה',                     'veg',15,1.4,2.9,0.2,  20,400),
  cabbage:        I('כרוב',                    'veg',25,1.3,5.8,0.1,  5,1000),
  mushrooms:      I('פטריות שמפיניון',         'veg',22,3.1,3.3,0.3,  30,250),
  green_beans:    I('שעועית ירוקה קפואה',      'veg',31,1.8,7,0.2,    14,800),
  pumpkin:        I('דלעת',                    'veg',26,1,6.5,0.1,    8,1000),
  beet:           I('סלק',                     'veg',43,1.6,10,0.2,   7,1000),
  celery:         I('סלרי',                    'veg',16,0.7,3,0.2,    10,500),
  leek:           I('כרשה',                    'veg',61,1.5,14,0.3,   12,500),
  kale:           I('קייל',                    'veg',43,3,8,0.9,      48,250),
  asparagus:      I('אספרגוס',                 'veg',20,2.2,3.9,0.1,  60,250),
  avocado:        I('אבוקדו',                  'veg',160,2,8.5,14.7,  14,1000),
  tomato_crushed: I('עגבניות מרוסקות (קופסה)', 'veg',32,1.6,7,0.3,    12,400),

  // ---------- fruit ----------
  banana:         I('בננות',                   'fruit',89,1.1,23,0.3, 10.58,1000),
  apple:          I('תפוחים',                  'fruit',52,0.3,14,0.2, 13.4,1000),
  orange:         I('תפוזים',                  'fruit',47,0.9,12,0.1, 7.69,1000),
  dates:          I("תמרים מג'הול",            'fruit',277,1.8,75,0.2,45,500),
  berries:        I('פירות יער קפואים',        'fruit',50,0.7,12,0.3, 35,800),
  strawberries:   I('תותים',                   'fruit',32,0.7,7.7,0.3,25,500),
  mango:          I('מנגו',                    'fruit',60,0.8,15,0.4, 15,1000),
  grapes:         I('ענבים',                   'fruit',69,0.7,18,0.2, 15,1000),
  pear:           I('אגסים',                   'fruit',57,0.4,15,0.1, 14,1000),
  kiwi:           I('קיווי',                   'fruit',61,1.1,15,0.5, 20,500),
  peach:          I('אפרסקים',                 'fruit',39,0.9,10,0.3, 14,1000),
  pineapple:      I('אננס',                    'fruit',50,0.5,13,0.1, 15,1500),
  watermelon:     I('אבטיח',                   'fruit',30,0.6,7.6,0.2,4,3000),
  pomegranate:    I('רימונים',                 'fruit',83,1.7,19,1.2, 12,1000),
  raisins:        I('צימוקים',                 'fruit',299,3,79,0.5,  30,300),

  // ---------- nuts & seeds ----------
  almonds:        I('שקדים',                   'nuts',579,21,22,50,   70,200, ['nuts']),
  walnuts:        I('אגוזי מלך',               'nuts',654,15,14,65,   80,200, ['nuts']),
  cashews:        I('קשיו',                    'nuts',553,18,30,44,   80,200, ['nuts']),
  pistachio:      I('פיסטוקים',                'nuts',560,20,28,45,   100,200,['nuts']),
  peanuts:        I('בוטנים קלויים',           'nuts',585,24,21,50,   35,300, ['nuts']),
  pb:             I('חמאת בוטנים',             'nuts',590,25,20,50,   40,350, ['nuts']),
  almond_butter:  I('חמאת שקדים',              'nuts',614,21,19,56,   100,250,['nuts']),
  tahini:         I('טחינה גולמית',            'nuts',600,17,21,54,   25,500),
  sesame:         I('שומשום',                  'nuts',573,17.7,23,49.7,30,250),
  chia:           I("צ'יה",                    'nuts',486,17,42,31,   60,250),
  flax:           I('זרעי פשתן',               'nuts',534,18,29,42,   30,250),
  sunflower:      I('גרעיני חמנייה קלופים',    'nuts',584,21,20,51,   40,200),
  pumpkin_seeds:  I('גרעיני דלעת',             'nuts',559,30,11,49,   70,200),

  // ---------- oils ----------
  oil:            I('שמן זית',                 'oils',884,0,0,100,    43,750),
  canola:         I('שמן קנולה',               'oils',884,0,0,100,    15,1000),
  coconut_oil:    I('שמן קוקוס',               'oils',892,0,0,99,     60,400),

  // ---------- pantry: spices, sauces, herbs ----------
  salt:           I('מלח',                     'pantry',0,0,0,0,      3,1000),
  black_pepper:   I('פלפל שחור',               'pantry',251,10,64,3.3,100,100),
  paprika:        I('פפריקה',                  'pantry',282,14,54,13, 80,100),
  cumin:          I('כמון',                    'pantry',375,18,44,22, 80,100),
  turmeric:       I('כורכום',                  'pantry',312,10,67,3,  80,100),
  curry:          I('אבקת קארי',               'pantry',325,14,56,14, 80,100),
  zaatar:         I('זעתר',                    'pantry',280,9,45,8,   60,100),
  cinnamon:       I('קינמון',                  'pantry',247,4,81,1.2, 60,100),
  chili:          I("צ'ילי גרוס",              'pantry',282,12,50,14, 80,100),
  garlic:         I('שום',                     'pantry',149,6.4,33,0.5,30,250),
  garlic_powder:  I('אבקת שום',                'pantry',331,17,73,0.7,60,100),
  ginger:         I("ג'ינג'ר טרי",             'pantry',80,1.8,18,0.8,30,200),
  lemon:          I('לימון',                   'pantry',29,1.1,9.3,0.3,8,1000),
  parsley:        I('פטרוזיליה',               'pantry',36,3,6,0.8,   40,100),
  cilantro:       I('כוסברה',                  'pantry',23,2.1,3.7,0.5,40,100),
  dill:           I('שמיר',                    'pantry',43,3.5,7,1.1, 40,100),
  mint:           I('נענע',                    'pantry',44,3.3,8,0.7, 40,100),
  green_onion:    I('בצל ירוק',                'pantry',32,1.8,7,0.2, 30,150),
  soy_sauce:      I('רוטב סויה',               'pantry',53,8,5,0.6,   30,500, ['gluten']),
  teriyaki:       I('רוטב טריאקי',             'pantry',89,6,16,0,    40,250, ['gluten']),
  tomato_paste:   I('רסק עגבניות',             'pantry',82,4.3,19,0.5,20,260),
  honey:          I('דבש',                     'pantry',304,0.3,82,0, 50,500),
  silan:          I('סילאן',                   'pantry',290,1,72,0,   40,350),
  sugar:          I('סוכר',                    'pantry',387,0,100,0,  6,1000),
  vinegar:        I('חומץ',                    'pantry',18,0,0.04,0,  8,1000),
  mustard:        I('חרדל',                    'pantry',66,4,6,3.3,   30,250),
  mayo:           I('מיונז',                   'pantry',680,1,0.6,75, 20,500, ['eggs']),
  ketchup:        I('קטשופ',                   'pantry',112,1.7,26,0.1,15,750),
  harissa:        I('הריסה',                   'pantry',100,3,10,5,   40,200),
  schug:          I('סחוג',                    'pantry',90,2,8,6,     50,200),
  olives:         I('זיתים',                   'pantry',115,0.8,6,10.7,25,300),
  pickles:        I('מלפפונים חמוצים',         'pantry',11,0.3,2,0.2, 10,300),
  coconut_milk:   I('חלב קוקוס',               'pantry',197,2,3,21,   30,400),
  pesto:          I('פסטו',                    'pantry',450,5,6,45,   80,190, ['dairy','nuts']),
  stock:          I('אבקת מרק',                'pantry',230,8,35,6,   60,400),
  cocoa:          I('אבקת קקאו',               'pantry',228,20,58,14, 60,250),
  cornstarch:     I('קורנפלור',                'pantry',381,0.3,91,0.1,15,400),
  sriracha:       I("סרירצ'ה",                 'pantry',93,1.9,19,0.9,40,450),
  baking_powder:  I('אבקת אפייה',              'pantry',53,0,28,0,    40,100),
  vanilla:        I('תמצית וניל',              'pantry',288,0.1,13,0.1,100,50),
};

if (typeof module !== 'undefined') module.exports = { ING, CATS, TAGS };
