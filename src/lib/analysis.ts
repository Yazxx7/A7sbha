import type { Nutrients } from './types';

export type PhotoAnalysisInput = { file: File; description?: string; locale?: 'ar' | 'en'; signal?: AbortSignal };
export type AnalyzedFood = {
  label: string; labelAr: string; estimatedGrams: number; per100g: Nutrients;
  confidence: 'low' | 'medium' | 'high';
};
export type PhotoAnalysisAvailability = { available: boolean; provider: 'openai' };
export type PhotoAnalysisResult =
  | { status: 'unavailable'; code: 'not_configured'; message: string }
  | { status: 'error'; code: string; message: string }
  | { status: 'success'; foods: AnalyzedFood[]; message: string };

// Credentials stay on the server. Results are estimates requiring review.
export interface FoodPhotoAnalyzer {
  analyze(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult>;
}

export const localPhotoAnalyzer: FoodPhotoAnalyzer = {
  async analyze(input) {
    return { status: 'unavailable', code: 'not_configured', message: input.locale === 'ar'
      ? 'تحليل الصور غير مفعّل. أضف الأطعمة والكميات من قاعدة البيانات المحلية؛ لن يتم إرسال الصورة لأي خدمة.'
      : 'Photo analysis is not enabled. Choose foods and portions from the local database; your photo is not sent to any service.' };
  },
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analysis response.');
  return value as Record<string, unknown>;
}

function label(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('Invalid food label.');
  return value.trim();
}

function amount(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid nutrition estimate.');
  return value;
}

/** Provider output and API responses both cross an untrusted boundary. Copy only known fields. */
export function parseAnalyzedFoods(value: unknown): AnalyzedFood[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid food list.');
  return value.map(entry => {
    const food = object(entry);
    const nutrients = object(food.per100g);
    if (food.confidence !== 'low' && food.confidence !== 'medium' && food.confidence !== 'high') throw new Error('Invalid confidence.');
    return {
      label: label(food.label), labelAr: label(food.labelAr),
      estimatedGrams: amount(food.estimatedGrams, 0.1, 5000),
      per100g: {
        calories: amount(nutrients.calories, 0, 1000), protein: amount(nutrients.protein, 0, 100),
        carbs: amount(nutrients.carbs, 0, 100), fat: amount(nutrients.fat, 0, 100),
      }, confidence: food.confidence,
    };
  });
}

export async function getPhotoAnalysisAvailability(signal?: AbortSignal): Promise<PhotoAnalysisAvailability> {
  const response = await fetch('/api/food-analysis', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Could not check photo analysis availability.');
  const result = object(await response.json());
  if (typeof result.available !== 'boolean' || result.provider !== 'openai') throw new Error('Invalid availability response.');
  return { available: result.available, provider: result.provider };
}

export function photoDataUrlToFile(photo: string): File {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
  if (!match || photo.length > 400_000) throw new Error('Invalid prepared food photo.');
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new File([bytes], 'meal-photo.' + (match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1]), { type: match[1] });
}

/** Browser adapter: only our own server receives the upload; no credential is accepted here. */
export const apiPhotoAnalyzer: FoodPhotoAnalyzer = {
  async analyze(input) {
    const ar = input.locale === 'ar';
    const fallback = ar ? 'تعذر تحليل الصورة. حاول مجدداً أو أضف الأطعمة يدوياً.' : 'Could not analyze the photo. Try again or add foods manually.';
    const timeout = AbortSignal.timeout(45_000);
    try {
      const form = new FormData();
      form.set('image', input.file);
      form.set('description', input.description?.trim() ?? '');
      form.set('locale', input.locale ?? 'en');
      const response = await fetch('/api/food-analysis', {
        method: 'POST', body: form, cache: 'no-store',
        signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
      });
      const result = object(await response.json());
      if (typeof result.message !== 'string' || result.message.length > 1000) throw new Error('Invalid analysis message.');
      if (response.ok && result.status === 'success') return { status: 'success', foods: parseAnalyzedFoods(result.foods), message: result.message };
      if (result.status === 'unavailable' && result.code === 'not_configured') return { status: 'unavailable', code: 'not_configured', message: result.message };
      if (result.status === 'error' && typeof result.code === 'string' && result.code.length <= 100) return { status: 'error', code: result.code, message: result.message };
      throw new Error('Invalid analysis response.');
    } catch (error) {
      if (input.signal?.aborted) throw error;
      return { status: 'error', code: timeout.aborted ? 'timeout' : 'request_failed', message: timeout.aborted
        ? (ar ? 'استغرق التحليل وقتاً طويلاً. حاول مجدداً.' : 'Analysis took too long. Please try again.') : fallback };
    }
  },
};
