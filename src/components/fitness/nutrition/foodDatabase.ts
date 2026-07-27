// Mock food database — stands in for the SQLite USDA/Cronometer dataset.
// When the real .sqlite file lands, replace `FOODS` with rows from
// the foods table and keep the same shape so the UI doesn't change.

export interface Nutrients {
  calories: number;
  protein: number;       // g
  carbs: number;         // g
  fat: number;           // g
  saturatedFat: number;  // g
  cholesterol: number;   // mg
  fiber: number;         // g
  sugar: number;         // g
  sodium: number;        // mg
  potassium: number;     // mg
  calcium: number;       // mg
  iron: number;          // mg
  magnesium: number;     // mg
  zinc: number;          // mg
  vitaminA: number;      // µg RAE
  vitaminC: number;      // mg
  vitaminD: number;      // IU
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  servingSize: number; // grams
  servingLabel: string;
  per100g: Nutrients;
}

export interface DiaryEntry {
  id: string;
  foodId: string;
  meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
  grams: number;
}

export const TARGETS: Nutrients = {
  calories: 2400,
  protein: 180,
  carbs: 250,
  fat: 65,
  saturatedFat: 22,
  cholesterol: 300,
  fiber: 30,
  sugar: 50,
  sodium: 2300,
  potassium: 3500,
  calcium: 1000,
  iron: 18,
  magnesium: 400,
  zinc: 11,
  vitaminA: 900,
  vitaminC: 90,
  vitaminD: 600,
};

// Nutrients that should be *limited* — bar turns coral when over target.
export const LIMIT_NUTRIENTS = new Set<keyof Nutrients>([
  'saturatedFat', 'cholesterol', 'sugar', 'sodium',
]);

const n = (
  calories: number, protein: number, carbs: number, fat: number,
  satFat: number, chol: number, fiber: number, sugar: number,
  sodium: number, potassium: number, calcium: number, iron: number,
  mg: number, zn: number, va: number, vc: number, vd: number
): Nutrients => ({
  calories, protein, carbs, fat,
  saturatedFat: satFat, cholesterol: chol,
  fiber, sugar, sodium, potassium, calcium, iron,
  magnesium: mg, zinc: zn,
  vitaminA: va, vitaminC: vc, vitaminD: vd,
});

export const FOODS: Food[] = [
  { id: 'f1',  name: 'Greek Yogurt, plain', brand: 'Fage 0%', servingSize: 170, servingLabel: '1 container (170g)',
    per100g: n(59,10.3,3.6,0.4, 0.1,5, 0,3.2, 36,141,110,0.1, 11,0.5, 0,0,0) },
  { id: 'f2',  name: 'Rolled Oats, dry', servingSize: 40, servingLabel: '½ cup dry (40g)',
    per100g: n(379,13.2,67.7,6.5, 1.2,0, 10.1,0.99, 6,362,52,4.25, 138,3.6, 0,0,0) },
  { id: 'f3',  name: 'Blueberries, fresh', servingSize: 75, servingLabel: '½ cup (75g)',
    per100g: n(57,0.7,14.5,0.3, 0,0, 2.4,10, 1,77,6,0.28, 6,0.16, 3,9.7,0) },
  { id: 'f4',  name: 'Chicken Breast, grilled', servingSize: 170, servingLabel: '6 oz (170g)',
    per100g: n(165,31,0,3.6, 1,85, 0,0, 74,256,15,1.04, 29,1, 6,0,4) },
  { id: 'f5',  name: 'Brown Rice, cooked', servingSize: 195, servingLabel: '1 cup (195g)',
    per100g: n(123,2.7,25.6,1, 0.2,0, 1.6,0.24, 4,86,3,0.56, 39,0.62, 0,0,0) },
  { id: 'f6',  name: 'Broccoli, steamed', servingSize: 90, servingLabel: '1 cup (90g)',
    per100g: n(35,2.4,7.2,0.4, 0.1,0, 3.3,1.4, 41,293,40,0.67, 21,0.45, 77,64.9,0) },
  { id: 'f7',  name: 'Olive Oil', servingSize: 14, servingLabel: '1 tbsp (14g)',
    per100g: n(884,0,0,100, 13.8,0, 0,0, 2,1,1,0.56, 0,0, 0,0,0) },
  { id: 'f8',  name: 'Salmon, baked', servingSize: 170, servingLabel: '6 oz (170g)',
    per100g: n(206,22.1,0,12.4, 3.1,63, 0,0, 61,384,9,0.34, 29,0.64, 12,0,526) },
  { id: 'f9',  name: 'Sweet Potato, baked', servingSize: 150, servingLabel: '1 medium (150g)',
    per100g: n(90,2,20.7,0.2, 0,0, 3.3,6.5, 36,475,38,0.69, 27,0.32, 961,19.6,0) },
  { id: 'f10', name: 'Almonds, raw', servingSize: 28, servingLabel: '1 oz (28g)',
    per100g: n(579,21.2,21.6,49.9, 3.8,0, 12.5,4.4, 1,733,269,3.71, 270,3.12, 0,0,0) },
  { id: 'f11', name: 'Banana', servingSize: 118, servingLabel: '1 medium (118g)',
    per100g: n(89,1.1,22.8,0.3, 0.1,0, 2.6,12.2, 1,358,5,0.26, 27,0.15, 3,8.7,0) },
  { id: 'f12', name: 'Whey Protein, vanilla', brand: 'Optimum Nutrition', servingSize: 30, servingLabel: '1 scoop (30g)',
    per100g: n(400,80,10,3.3, 2,167, 0,3.3, 433,533,467,0, 100,11.7, 0,0,0) },
  { id: 'f13', name: 'Eggs, large', servingSize: 50, servingLabel: '1 large (50g)',
    per100g: n(155,13,1.1,11, 3.3,373, 0,1.1, 124,126,50,1.75, 12,1.29, 160,0,87) },
  { id: 'f14', name: 'Avocado', servingSize: 68, servingLabel: '½ avocado (68g)',
    per100g: n(160,2,8.5,14.7, 2.1,0, 6.7,0.7, 7,485,12,0.55, 29,0.64, 7,10,0) },
  { id: 'f15', name: 'Spinach, raw', servingSize: 30, servingLabel: '1 cup (30g)',
    per100g: n(23,2.9,3.6,0.4, 0.1,0, 2.2,0.4, 79,558,99,2.71, 79,0.53, 469,28.1,0) },
];

export const INITIAL_DIARY: DiaryEntry[] = [
  { id: 'd1', foodId: 'f1',  meal: 'Breakfast', grams: 170 },
  { id: 'd2', foodId: 'f2',  meal: 'Breakfast', grams: 40 },
  { id: 'd3', foodId: 'f3',  meal: 'Breakfast', grams: 75 },
  { id: 'd4', foodId: 'f4',  meal: 'Lunch',     grams: 170 },
  { id: 'd5', foodId: 'f5',  meal: 'Lunch',     grams: 195 },
  { id: 'd6', foodId: 'f6',  meal: 'Lunch',     grams: 90 },
  { id: 'd7', foodId: 'f12', meal: 'Snacks',    grams: 30 },
  { id: 'd8', foodId: 'f11', meal: 'Snacks',    grams: 118 },
];

export function scale(per100g: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  const out: any = {};
  (Object.keys(per100g) as (keyof Nutrients)[]).forEach(key => { out[key] = per100g[key] * k; });
  return out as Nutrients;
}

export function emptyNutrients(): Nutrients {
  return n(0,0,0,0, 0,0, 0,0, 0,0,0,0, 0,0, 0,0,0);
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce((acc, cur) => {
    const out: any = {};
    (Object.keys(acc) as (keyof Nutrients)[]).forEach(key => { out[key] = acc[key] + cur[key]; });
    return out as Nutrients;
  }, emptyNutrients());
}
