import type { Nutrients } from './types';

export type PhotoAnalysisInput = { file: File; description?: string; locale?: 'ar' | 'en' };
export type PhotoAnalysisResult =
  | { status: 'unavailable'; message: string }
  | { status: 'success'; foods: { foodId?: string; label: string; estimatedGrams: number; nutrients: Nutrients; confidence?: number }[]; message: string };

// A future server-backed implementation can implement this interface. Keep
// service credentials on the server; uploaded pictures are never evidence of
// a particular food or portion until the user confirms an analysis result.
export interface FoodPhotoAnalyzer {
  analyze(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult>;
}

export const localPhotoAnalyzer: FoodPhotoAnalyzer = {
  async analyze(input) {
    return { status: 'unavailable', message: input.locale === 'ar'
      ? 'تحليل الصور غير مفعّل. أضف الأطعمة والكميات من قاعدة البيانات المحلية؛ لن يتم إرسال الصورة لأي خدمة.'
      : 'Photo analysis is not enabled. Choose foods and portions from the local database; your photo is not sent to any service.' };
  },
};
