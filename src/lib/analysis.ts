import type { Nutrients } from './types';

export type FoodAnalysisMode = 'photo' | 'description';
type AnalysisOptions = { locale?: 'ar' | 'en'; signal?: AbortSignal };
export type PhotoAnalysisInput = AnalysisOptions & { file: File; description?: string };
export type FoodAnalysisInput =
  | (PhotoAnalysisInput & { mode: 'photo' })
  | (AnalysisOptions & { mode: 'description'; description: string });
export type AnalyzedFood = {
  label: string; labelAr: string; estimatedGrams: number; per100g: Nutrients;
  confidence: 'low' | 'medium' | 'high';
};
export type PhotoAnalysisAvailability = { available: boolean; provider: 'gemini' };
export type FoodAnalysisResult =
  | { status: 'unavailable'; code: 'not_configured'; message: string }
  | { status: 'error'; code: string; message: string; retryable?: boolean; retryAfterSeconds?: number; requestId?: string }
  | { status: 'clarification'; message: string }
  | { status: 'success'; foods: AnalyzedFood[]; message: string };
export type PhotoAnalysisResult = FoodAnalysisResult;

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
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch('/api/food-analysis', {
    cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error('Could not check photo analysis availability.');
  const result = object(await response.json());
  signal?.throwIfAborted();
  if (typeof result.available !== 'boolean' || result.provider !== 'gemini') throw new Error('Invalid availability response.');
  return { available: result.available, provider: result.provider };
}

export function photoDataUrlToFile(photo: string): File {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
  if (!match || photo.length > 400_000) throw new Error('Invalid prepared food photo.');
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new File([bytes], 'meal-photo.' + (match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1]), { type: match[1] });
}

function fallback(input: FoodAnalysisInput, status?: number): FoodAnalysisResult {
  const ar = input.locale === 'ar';
  if (status === 401 || status === 403) return {
    status: 'error', code: 'authentication_error', retryable: false,
    message: ar ? 'تعذّر السماح بطلب التحليل. تحقّق من إعدادات الخادم وصلاحيات مفتاح API.'
      : 'The analysis request was not authorized. Check the server settings and API key permissions.',
  };
  if (status === 429) return {
    status: 'error', code: 'rate_limited', retryable: true,
    message: ar ? 'وصل طلب التحليل إلى حد الاستخدام. حاول لاحقًا؛ قد يحتاج حساب API إلى مراجعة حدوده.'
      : 'The analysis request reached a usage limit. Try later; the API account limits may need review.',
  };
  if (status === 408 || status === 504) return {
    status: 'error', code: 'timeout', retryable: true,
    message: ar ? 'استغرق التحليل وقتًا طويلًا. حاول مجددًا.' : 'Analysis took too long. Please try again.',
  };
  if (status !== undefined && status >= 500) return {
    status: 'error', code: 'provider_unavailable', retryable: true,
    message: ar ? 'خدمة التحليل غير متاحة مؤقتًا. حاول لاحقًا.' : 'The analysis service is temporarily unavailable. Please try later.',
  };
  return {
    status: 'error', code: 'request_failed',
    message: input.mode === 'photo'
      ? (ar ? 'تعذر تحليل الصورة. حاول مجددًا أو أضف الأطعمة يدويًا.' : 'Could not analyze the photo. Try again or add foods manually.')
      : (ar ? 'تعذر تحليل الوصف. حاول مجددًا أو أضف الأطعمة يدويًا.' : 'Could not analyze the description. Try again or add foods manually.'),
  };
}

function parseResult(value: unknown, ok: boolean): FoodAnalysisResult {
  const result = object(value);
  if (typeof result.message !== 'string' || !result.message.trim() || result.message.length > 1000) throw new Error('Invalid analysis message.');
  if (ok && result.status === 'success') return { status: 'success', foods: parseAnalyzedFoods(result.foods), message: result.message };
  if (ok && result.status === 'clarification') return { status: 'clarification', message: result.message };
  if (result.status === 'unavailable' && result.code === 'not_configured') return { status: 'unavailable', code: 'not_configured', message: result.message };
  if (result.status === 'error' && typeof result.code === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(result.code)) {
    return {
      status: 'error', code: result.code, message: result.message,
      ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
      ...(typeof result.retryAfterSeconds === 'number' && Number.isFinite(result.retryAfterSeconds)
        && result.retryAfterSeconds >= 0 && result.retryAfterSeconds <= Number.MAX_SAFE_INTEGER ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      ...(typeof result.requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.requestId) ? { requestId: result.requestId } : {}),
    };
  }
  throw new Error('Invalid analysis response.');
}

/** Only our own server receives meal content. Bounded retries belong to the server. */
export const apiFoodAnalyzer: { analyze(input: FoodAnalysisInput): Promise<FoodAnalysisResult> } = {
  async analyze(input) {
    const ar = input.locale === 'ar';
    const timeout = AbortSignal.timeout(45_000);
    let responseStatus: number | undefined;
    try {
      input.signal?.throwIfAborted();
      const form = new FormData();
      form.set('mode', input.mode);
      form.set('locale', input.locale ?? 'en');
      form.set('description', input.description?.trim() ?? '');
      if (input.mode === 'photo') form.set('image', input.file);
      const response = await fetch('/api/food-analysis', {
        method: 'POST', body: form, cache: 'no-store',
        signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
      });
      responseStatus = response.status;
      const value: unknown = await response.json();
      input.signal?.throwIfAborted();
      return parseResult(value, response.ok);
    } catch (error) {
      if (input.signal?.aborted) throw error;
      if (timeout.aborted) return fallback(input, 504);
      if (responseStatus === undefined && error instanceof TypeError) return {
        status: 'error', code: 'network_error', retryable: true,
        message: ar ? 'تعذر الاتصال بخادم التحليل. تحقّق من اتصالك بالإنترنت وحاول مجددًا.'
          : 'Could not connect to the analysis server. Check your internet connection and try again.',
      };
      return fallback(input, responseStatus);
    }
  },
};

/** Compatibility adapter for integrations that still submit photo inputs. */
export const apiPhotoAnalyzer: FoodPhotoAnalyzer = {
  analyze: input => apiFoodAnalyzer.analyze({ ...input, mode: 'photo' }),
};
