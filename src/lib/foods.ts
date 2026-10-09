import type { Food } from './types';

// Approximate nutrition per 100 g of the edible portion. Cooked foods are
// explicitly labeled; branded products and recipes can vary considerably.
const food = (
  id: string, name: string, nameAr: string, category: Food['category'], emoji: string,
  values: [number, number, number, number], servingGrams: number,
  servingLabel: string, servingLabelAr: string, aliases: string[] = [],
): Food => ({ id, name, nameAr, category, emoji, per100g: {
  calories: values[0], protein: values[1], carbs: values[2], fat: values[3],
}, servingGrams, servingLabel, servingLabelAr, aliases });

export const foods: Food[] = [
  food('chicken-breast', 'Chicken breast, cooked', 'صدر دجاج مطبوخ', 'protein', '🍗', [165,31,0,3.6], 150, '1 breast', 'صدر واحد', ['chicken','دجاج','فراخ']),
  food('salmon', 'Salmon, cooked', 'سلمون مطبوخ', 'protein', '🐟', [206,22,0,12], 150, '1 fillet', 'قطعة فيليه', ['سمك','fish']),
  food('tuna', 'Tuna, canned in water, drained', 'تونة بالماء مصفاة', 'protein', '🐟', [116,25.5,0,0.8], 100, '1 small can', 'علبة صغيرة', ['tuna fish','تونه']),
  food('egg', 'Egg, boiled', 'بيض مسلوق', 'protein', '🥚', [155,12.6,1.1,10.6], 50, '1 large egg', 'بيضة كبيرة', ['eggs','بيضه']),
  food('egg-white', 'Egg white, cooked', 'بياض البيض مطبوخ', 'protein', '🥚', [52,10.9,0.7,0.2], 33, '1 egg white', 'بياض بيضة'),
  food('lean-beef', 'Lean beef, cooked', 'لحم بقري قليل الدهن مطبوخ', 'protein', '🥩', [217,26,0,12], 120, '1 portion', 'حصة واحدة', ['beef','steak','لحم']),
  food('shrimp', 'Shrimp, cooked', 'روبيان مطبوخ', 'protein', '🦐', [99,24,0.2,0.3], 100, '1 portion', 'حصة واحدة', ['prawns','جمبري']),
  food('turkey', 'Turkey breast, cooked', 'صدر ديك رومي مطبوخ', 'protein', '🍗', [147,30,0,2.1], 120, '1 portion', 'حصة واحدة', ['ديك رومي']),
  food('tofu', 'Firm tofu', 'توفو صلب', 'protein', '🧈', [144,17.3,2.8,8.7], 100, '1 portion', 'حصة واحدة', ['soy','صويا']),
  food('lentils', 'Lentils, cooked', 'عدس مطبوخ', 'protein', '🥣', [116,9,20.1,0.4], 150, '¾ cup', 'ثلاثة أرباع كوب', ['lentil','عدس']),
  food('chickpeas', 'Chickpeas, cooked', 'حمص حب مطبوخ', 'protein', '🫘', [164,8.9,27.4,2.6], 150, '¾ cup', 'ثلاثة أرباع كوب', ['garbanzo','حمص']),
  food('kidney-beans', 'Kidney beans, cooked', 'فاصوليا حمراء مطبوخة', 'protein', '🫘', [127,8.7,22.8,0.5], 150, '¾ cup', 'ثلاثة أرباع كوب', ['beans','فاصوليا']),
  food('white-rice', 'White rice, cooked', 'أرز أبيض مطبوخ', 'grains', '🍚', [130,2.7,28.2,0.3], 150, '¾ cup', 'ثلاثة أرباع كوب', ['rice','رز','عيش']),
  food('brown-rice', 'Brown rice, cooked', 'أرز بني مطبوخ', 'grains', '🍚', [123,2.7,25.6,1], 150, '¾ cup', 'ثلاثة أرباع كوب', ['rice','رز بني']),
  food('oats', 'Oats, dry', 'شوفان جاف', 'grains', '🥣', [389,16.9,66.3,6.9], 40, '½ cup dry', 'نصف كوب جاف', ['oatmeal','شوفان']),
  food('whole-wheat-bread', 'Whole wheat bread', 'خبز قمح كامل', 'grains', '🍞', [247,13,41,4.2], 35, '1 slice', 'شريحة واحدة', ['toast','brown bread','توست','خبز اسمر']),
  food('white-bread', 'White bread', 'خبز أبيض', 'grains', '🍞', [265,9,49,3.2], 30, '1 slice', 'شريحة واحدة', ['bread','toast','توست ابيض']),
  food('pita', 'Pita bread', 'خبز عربي', 'grains', '🫓', [275,9.1,55.7,1.2], 60, '1 medium pita', 'رغيف متوسط', ['arabic bread','عيش عربي']),
  food('pasta', 'Pasta, cooked', 'معكرونة مطبوخة', 'grains', '🍝', [158,5.8,30.9,0.9], 150, '1 cup', 'كوب واحد', ['spaghetti','مكرونه','مكرونة','باستا']),
  food('quinoa', 'Quinoa, cooked', 'كينوا مطبوخة', 'grains', '🥣', [120,4.4,21.3,1.9], 150, '¾ cup', 'ثلاثة أرباع كوب'),
  food('bulgur', 'Bulgur, cooked', 'برغل مطبوخ', 'grains', '🥣', [83,3.1,18.6,0.2], 150, '¾ cup', 'ثلاثة أرباع كوب'),
  food('potato', 'Potato, boiled', 'بطاطس مسلوقة', 'vegetables', '🥔', [87,1.9,20.1,0.1], 150, '1 medium potato', 'حبة متوسطة', ['potatoes','بطاطا']),
  food('sweet-potato', 'Sweet potato, baked', 'بطاطا حلوة مشوية', 'vegetables', '🍠', [90,2,20.7,0.2], 150, '1 medium potato', 'حبة متوسطة'),
  food('banana', 'Banana', 'موز', 'fruit', '🍌', [89,1.1,22.8,0.3], 120, '1 medium banana', 'موزة متوسطة'),
  food('apple', 'Apple, with skin', 'تفاح بالقشر', 'fruit', '🍎', [52,0.3,13.8,0.2], 180, '1 medium apple', 'تفاحة متوسطة', ['apples','تفاحة']),
  food('orange', 'Orange', 'برتقال', 'fruit', '🍊', [47,0.9,11.8,0.1], 130, '1 medium orange', 'برتقالة متوسطة'),
  food('dates', 'Dates', 'تمر', 'fruit', '🌴', [282,2.5,75,0.4], 24, '3 small dates', 'ثلاث تمرات صغيرة', ['date','تمور']),
  food('strawberry', 'Strawberries', 'فراولة', 'fruit', '🍓', [32,0.7,7.7,0.3], 150, '1 cup', 'كوب واحد', ['strawberry','فراوله']),
  food('blueberry', 'Blueberries', 'توت أزرق', 'fruit', '🫐', [57,0.7,14.5,0.3], 150, '1 cup', 'كوب واحد', ['blueberry','توت']),
  food('grapes', 'Grapes', 'عنب', 'fruit', '🍇', [69,0.7,18.1,0.2], 150, '1 cup', 'كوب واحد'),
  food('watermelon', 'Watermelon', 'بطيخ', 'fruit', '🍉', [30,0.6,7.6,0.2], 200, '1 large slice', 'شريحة كبيرة', ['جح','حبحب']),
  food('mango', 'Mango', 'مانجو', 'fruit', '🥭', [60,0.8,15,0.4], 150, '1 cup', 'كوب واحد', ['مانجا']),
  food('broccoli', 'Broccoli, cooked', 'بروكلي مطبوخ', 'vegetables', '🥦', [35,2.4,7.2,0.4], 100, '1 portion', 'حصة واحدة'),
  food('cucumber', 'Cucumber', 'خيار', 'vegetables', '🥒', [15,0.7,3.6,0.1], 100, '1 small cucumber', 'حبة صغيرة'),
  food('tomato', 'Tomato', 'طماطم', 'vegetables', '🍅', [18,0.9,3.9,0.2], 120, '1 medium tomato', 'حبة متوسطة', ['tomatoes','طماط','بندورة']),
  food('carrot', 'Carrot', 'جزر', 'vegetables', '🥕', [41,0.9,9.6,0.2], 60, '1 medium carrot', 'حبة متوسطة'),
  food('spinach', 'Spinach, raw', 'سبانخ طازجة', 'vegetables', '🥬', [23,2.9,3.6,0.4], 60, '2 cups', 'كوبان'),
  food('lettuce', 'Lettuce', 'خس', 'vegetables', '🥬', [15,1.4,2.9,0.2], 50, '1 cup', 'كوب واحد'),
  food('green-peas', 'Green peas, cooked', 'بازلاء مطبوخة', 'vegetables', '🫛', [84,5.4,15.6,0.2], 100, '½ cup', 'نصف كوب', ['peas','بسلة','بازيلا']),
  food('milk', 'Milk, low fat', 'حليب قليل الدسم', 'dairy', '🥛', [42,3.4,5,1], 240, '1 cup', 'كوب واحد', ['milk','لبن']),
  food('whole-milk', 'Milk, whole', 'حليب كامل الدسم', 'dairy', '🥛', [61,3.2,4.8,3.3], 240, '1 cup', 'كوب واحد'),
  food('greek-yogurt', 'Greek yogurt, plain, nonfat', 'زبادي يوناني سادة خالي الدسم', 'dairy', '🥣', [59,10.3,3.6,0.4], 170, '1 pot', 'علبة واحدة', ['yogurt','yoghurt','روب','زبادي']),
  food('yogurt', 'Yogurt, plain, whole milk', 'زبادي سادة كامل الدسم', 'dairy', '🥣', [61,3.5,4.7,3.3], 170, '1 pot', 'علبة واحدة', ['yoghurt','روب']),
  food('cottage-cheese', 'Cottage cheese, low fat', 'جبن قريش قليل الدسم', 'dairy', '🧀', [82,11.1,3.4,2.3], 100, '½ cup', 'نصف كوب', ['cheese','جبنة']),
  food('feta', 'Feta cheese', 'جبن فيتا', 'dairy', '🧀', [264,14.2,4.1,21.3], 30, '1 small piece', 'قطعة صغيرة', ['cheese','جبنة بيضاء']),
  food('labneh', 'Labneh, full fat', 'لبنة كاملة الدسم', 'dairy', '🥣', [220,8,6,18], 40, '2 tablespoons', 'ملعقتان كبيرتان', ['لبنه']),
  food('almonds', 'Almonds', 'لوز', 'fats', '🥜', [579,21.2,21.6,49.9], 28, '1 small handful', 'حفنة صغيرة', ['almond']),
  food('walnuts', 'Walnuts', 'جوز', 'fats', '🥜', [654,15.2,13.7,65.2], 28, '1 small handful', 'حفنة صغيرة', ['walnut','عين الجمل']),
  food('peanut-butter', 'Peanut butter', 'زبدة فول سوداني', 'fats', '🥜', [588,25,20,50], 16, '1 tablespoon', 'ملعقة كبيرة'),
  food('olive-oil', 'Olive oil', 'زيت زيتون', 'fats', '🫒', [884,0,0,100], 14, '1 tablespoon', 'ملعقة كبيرة', ['oil','زيت']),
  food('avocado', 'Avocado', 'أفوكادو', 'fats', '🥑', [160,2,8.5,14.7], 100, '½ medium avocado', 'نصف حبة متوسطة', ['افوكادو']),
  food('tahini', 'Tahini', 'طحينة', 'fats', '🥄', [595,17,21.2,53.8], 15, '1 tablespoon', 'ملعقة كبيرة', ['sesame','سمسم']),
  food('hummus', 'Hummus dip', 'حمص بالطحينة', 'dishes', '🥣', [166,7.9,14.3,9.6], 60, '¼ cup', 'ربع كوب', ['حمص مهروس']),
  food('falafel', 'Falafel, fried', 'فلافل مقلية', 'dishes', '🧆', [333,13.3,31.8,17.8], 50, '2 small pieces', 'حبتان صغيرتان', ['طعمية']),
  food('chicken-kabsa', 'Chicken kabsa, sample recipe', 'كبسة دجاج وصفة تقريبية', 'dishes', '🍛', [180,10,23,5.3], 250, '1 plate', 'طبق واحد', ['kabsa','كبسه','مكبوس','مجبوس']),
  food('chicken-shawarma', 'Chicken shawarma wrap, sample recipe', 'ساندويتش شاورما دجاج وصفة تقريبية', 'dishes', '🌯', [220,14,24,7.5], 220, '1 medium wrap', 'ساندويتش متوسط', ['shawarma','شاورما']),
  food('lentil-soup', 'Lentil soup, sample recipe', 'شوربة عدس وصفة تقريبية', 'dishes', '🍲', [65,3.8,10,1.3], 250, '1 bowl', 'وعاء واحد', ['soup','شوربه']),
  food('tabbouleh', 'Tabbouleh, sample recipe', 'تبولة وصفة تقريبية', 'dishes', '🥗', [120,2.6,12.2,7.1], 150, '1 bowl', 'وعاء واحد', ['salad','سلطة','تبوله']),
  food('grilled-chicken-salad', 'Grilled chicken salad, sample recipe', 'سلطة دجاج مشوي وصفة تقريبية', 'dishes', '🥗', [112,13,5,4.5], 250, '1 bowl', 'وعاء واحد', ['salad','سلطة']),
];

export function normalizeFoodQuery(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function searchFoods(query: string, category: Food['category'] | 'all' = 'all'): Food[] {
  const tokens = normalizeFoodQuery(query).split(' ').filter(Boolean);
  return foods.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    const text = normalizeFoodQuery([item.name, item.nameAr, ...item.aliases].join(' '));
    return tokens.every((token) => text.includes(token));
  });
}

export function getFood(id: string): Food | undefined {
  return foods.find((item) => item.id === id);
}
