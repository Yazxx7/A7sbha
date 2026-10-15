import { getFood } from './foods';
import { getMealItemFood } from './meal-items';
import type { Goals, Meal, MealItem, Nutrients, NutritionPlan, Profile } from './types';

export const DEFAULT_GOALS: Goals = { calories: 2200, protein: 150, carbs: 250, fat: 65, waterMl: 2500 };
const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
const round = (number: number) => Math.round((number + Number.EPSILON) * 10) / 10;

export function foodNutrients(foodId: string, grams: number): Nutrients {
  const food = getFood(foodId);
  if (!food) throw new Error('Food is not in the local database.');
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) throw new Error('Portion must be between 0 and 5,000 grams.');
  return { calories: food.per100g.calories * grams / 100,
    protein: food.per100g.protein * grams / 100,
    carbs: food.per100g.carbs * grams / 100,
    fat: food.per100g.fat * grams / 100 };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce((total, item) => ({ calories: total.calories + item.calories,
    protein: total.protein + item.protein, carbs: total.carbs + item.carbs, fat: total.fat + item.fat }), { ...ZERO });
}

export function mealNutrients(meal: Meal): Nutrients {
  return sumNutrients(meal.items.map(itemNutrients));
}

export function itemNutrients(item: MealItem): Nutrients {
  const food = getMealItemFood(item);
  if (!food) throw new Error('Food is not in the local database or its AI estimate is invalid.');
  const minimum = item.foodId === 'ai-estimate' ? 0.1 : Number.MIN_VALUE;
  if (!Number.isFinite(item.grams) || item.grams < minimum || item.grams > 5000) {
    throw new Error(`Portion must be between ${minimum} and 5,000 grams.`);
  }
  return { calories: food.per100g.calories * item.grams / 100,
    protein: food.per100g.protein * item.grams / 100,
    carbs: food.per100g.carbs * item.grams / 100,
    fat: food.per100g.fat * item.grams / 100 };
}

export function dailyNutrients(meals: Meal[], date: string): Nutrients {
  return sumNutrients(meals.filter((meal) => meal.date === date).map(mealNutrients));
}

function within(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
}

export function calculatePlan(profile: Profile, options: { allowReachedGoal?: boolean } = {}): NutritionPlan {
  within(profile.weight, 30, 350, 'Weight in kg');
  within(profile.targetWeight, 30, 350, 'Target weight in kg');
  within(profile.height, 120, 230, 'Height in cm');
  within(profile.age, 18, 100, 'Adult age');
  within(profile.weeklyRate, profile.goal === 'maintain' ? 0 : 0.1, 1, 'Weekly weight change in kg');
  if (profile.gender !== 'male' && profile.gender !== 'female') throw new Error('Choose a gender for the Mifflin–St Jeor formula.');
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  if (!Object.prototype.hasOwnProperty.call(multipliers, profile.activity)) throw new Error('Choose a valid activity level.');
  const multiplier = multipliers[profile.activity];
  if (!['cut', 'bulk', 'maintain'].includes(profile.goal)) throw new Error('Choose a valid goal.');
  const reachedGoal = profile.goal === 'cut' ? profile.weight <= profile.targetWeight
    : profile.goal === 'bulk' ? profile.weight >= profile.targetWeight : false;
  if (!options.allowReachedGoal && profile.goal === 'cut' && reachedGoal) throw new Error('For weight loss, choose a target below your current weight.');
  if (!options.allowReachedGoal && profile.goal === 'bulk' && reachedGoal) throw new Error('For weight gain, choose a target above your current weight.');

  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.gender === 'male' ? 5 : -161);
  const tdee = bmr * multiplier;
  const notes = ['Estimated with Mifflin–St Jeor. Actual needs vary; adjust using your weight trend over 2–4 weeks.'];
  if (reachedGoal) notes.push('Your target has been reached. This plan now estimates maintenance calories.');
  const maintenance = profile.goal === 'maintain' || reachedGoal;
  const requestedRate = maintenance ? 0 : Math.min(profile.weeklyRate, profile.weight * (profile.goal === 'cut' ? 0.01 : 0.005));
  if (requestedRate < profile.weeklyRate && !maintenance) notes.push('The weekly rate is limited to a gradual change for your current weight.');
  const calorieChange = requestedRate * 7700 / 7;
  const minimumCalories = profile.gender === 'male' ? 1500 : 1200;
  const rawCalories = tdee + (profile.goal === 'cut' ? -calorieChange : profile.goal === 'bulk' ? calorieChange : 0);
  const calories = Math.round(Math.max(minimumCalories, rawCalories));
  if (rawCalories < minimumCalories) notes.push('Calories are limited to a general adult minimum; the estimated timeline is adjusted to this intake.');
  const effectiveRate = maintenance ? 0 : Math.max(0, (profile.goal === 'cut' ? tdee - calories : calories - tdee) * 7 / 7700);
  const protein = round(Math.min(profile.weight * (profile.goal === 'cut' && !reachedGoal ? 2 : 1.8), calories * 0.35 / 4));
  const fat = round(calories * 0.25 / 9);
  const carbs = round(Math.max(0, (calories - protein * 4 - fat * 9) / 4));
  const targetBmi = profile.targetWeight / ((profile.height / 100) ** 2);
  if (targetBmi < 18.5 || targetBmi >= 30) notes.push('Your target falls outside the usual adult BMI range; discuss a suitable goal with a qualified professional.');
  if (!maintenance && effectiveRate === 0) notes.push('This intake does not produce the requested weight change; a reliable timeline cannot be estimated.');
  return { calories, protein, carbs, fat, bmr: Math.round(bmr), tdee: Math.round(tdee),
    weeklyRate: round(effectiveRate), weeksToGoal: reachedGoal ? 0 : profile.goal === 'maintain' || effectiveRate <= 0 ? null : Math.ceil(Math.abs(profile.weight - profile.targetWeight) / effectiveRate),
    completed: reachedGoal, notes };
}
