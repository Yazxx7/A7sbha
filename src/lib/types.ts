export type Locale = 'en' | 'ar';
export type Theme = 'light' | 'dark';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Nutrients = { calories: number; protein: number; carbs: number; fat: number };
export type Food = {
  id: string; name: string; nameAr: string; aliases: string[];
  category: 'protein' | 'grains' | 'fruit' | 'vegetables' | 'dairy' | 'fats' | 'dishes';
  emoji: string; per100g: Nutrients; servingGrams: number; servingLabel: string; servingLabelAr: string;
};
export type MealItem = { id: string; foodId: string; grams: number };
export type Meal = { id: string; type: MealType; name: string; date: string; items: MealItem[]; photo?: string; createdAt: string };
export type Goals = Nutrients & { waterMl: number };
export type Profile = {
  name: string; goal: 'cut' | 'bulk' | 'maintain'; weight: number; targetWeight: number;
  height: number; age: number; gender: 'male' | 'female';
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'; weeklyRate: number;
};
export type NutritionPlan = Nutrients & { bmr: number; tdee: number; weeklyRate: number; weeksToGoal: number | null; notes: string[]; completed?: boolean };
export type WeightEntry = { id: string; date: string; weight: number };
export type LocalState = {
  version: 1; meals: Meal[]; goals: Goals; profile: Profile | null; targetSource: 'manual' | 'calculated';
  weights: WeightEntry[]; water: Record<string, number>; locale: Locale; theme: Theme; demoLoaded: boolean;
};
