'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import { apiPhotoAnalyzer, getPhotoAnalysisAvailability, photoDataUrlToFile, type AnalyzedFood } from '@/lib/analysis';
import type { Locale, MealItem, Nutrients } from '@/lib/types';

type Props = {
  locale: Locale;
  photo?: string;
  preparing: boolean;
  remainingSlots: number;
  onAdd: (items: MealItem[]) => boolean;
};
type ReviewFood = AnalyzedFood & { reviewId: string };
type Availability = 'checking' | 'available' | 'unavailable' | 'error';
const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const;

function isValidFood(food: ReviewFood): boolean {
  return [food.label, food.labelAr].every(name => name.trim().length > 0 && name.trim().length <= 100)
    && Number.isFinite(food.estimatedGrams) && food.estimatedGrams >= 0.1 && food.estimatedGrams <= 5000
    && nutrientKeys.every(key => Number.isFinite(food.per100g[key]) && food.per100g[key] >= 0 && food.per100g[key] <= (key === 'calories' ? 1000 : 100));
}

/** The image stays in the browser until the user explicitly requests analysis. */
export default function PhotoAnalysisPanel({ locale, photo, preparing, remainingSlots, onAdd }: Props) {
  const ar = locale === 'ar';
  const t = (english: string, arabic: string) => ar ? arabic : english;
  const descriptionId = useId();
  const disclosureId = useId();
  const [availability, setAvailability] = useState<Availability>('checking');
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [description, setDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [foods, setFoods] = useState<ReviewFood[] | null>(null);
  const [hadSuggestions, setHadSuggestions] = useState(false);
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const appendRef = useRef(false);
  const latestPhoto = useRef(photo);
  latestPhoto.current = photo;

  function cancelAnalysis() {
    requestRef.current?.abort();
    requestRef.current = null;
    requestVersion.current += 1;
  }

  useEffect(() => {
    const controller = new AbortController();
    setAvailability('checking');
    getPhotoAnalysisAvailability(controller.signal).then(result => {
      if (!controller.signal.aborted) setAvailability(result.available ? 'available' : 'unavailable');
    }).catch(() => {
      if (!controller.signal.aborted) setAvailability('error');
    });
    return () => controller.abort();
  }, [availabilityAttempt]);

  useEffect(() => {
    cancelAnalysis();
    setAnalyzing(false);
    setFoods(null);
    setHadSuggestions(false);
    setMessage('');
    setAdded(false);
    appendRef.current = false;
    return cancelAnalysis;
  }, [photo, preparing]);

  function changeDescription(value: string) {
    cancelAnalysis();
    setDescription(value);
    setAnalyzing(false);
    setFoods(null);
    setHadSuggestions(false);
    setMessage('');
    setAdded(false);
    appendRef.current = false;
  }

  async function analyze() {
    if (!photo || preparing || analyzing || availability !== 'available') return;
    cancelAnalysis();
    const controller = new AbortController();
    requestRef.current = controller;
    const version = requestVersion.current;
    const analyzedPhoto = photo;
    setAnalyzing(true);
    setFoods(null);
    setHadSuggestions(false);
    setMessage('');
    setAdded(false);
    appendRef.current = false;
    try {
      const result = await apiPhotoAnalyzer.analyze({ file: photoDataUrlToFile(photo), description: description.trim() || undefined, locale, signal: controller.signal });
      if (controller.signal.aborted || version !== requestVersion.current || analyzedPhoto !== latestPhoto.current) return;
      if (result.status === 'unavailable') {
        setAvailability('unavailable');
      } else if (result.status === 'error') {
        setMessage(result.message || t('Photo analysis failed. Please try again or add foods manually.', 'تعذر تحليل الصورة. حاول مجدداً أو أضف الأطعمة يدوياً.'));
      } else {
        setFoods(result.foods.map(food => ({ ...food, per100g: { ...food.per100g }, reviewId: crypto.randomUUID() })));
        setHadSuggestions(result.foods.length > 0);
      }
    } catch {
      if (!controller.signal.aborted && version === requestVersion.current && analyzedPhoto === latestPhoto.current) {
        setMessage(t('Could not connect to photo analysis. Please try again or add foods manually.', 'تعذر الاتصال بخدمة تحليل الصور. حاول مجدداً أو أضف الأطعمة يدوياً.'));
      }
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current && analyzedPhoto === latestPhoto.current) {
        setAnalyzing(false);
        requestRef.current = null;
      }
    }
  }

  function updateFood(id: string, update: Partial<ReviewFood>) {
    setFoods(previous => previous?.map(food => food.reviewId === id ? { ...food, ...update } : food) ?? null);
  }

  function addReviewed() {
    if (appendRef.current || !foods?.length || !foods.every(isValidFood) || foods.length > remainingSlots) return;
    appendRef.current = true;
    const items: MealItem[] = foods.map(food => ({
      id: crypto.randomUUID(), foodId: 'ai-estimate', grams: food.estimatedGrams,
      estimatedFood: { source: 'openai', name: food.label.trim(), nameAr: food.labelAr.trim(), per100g: { ...food.per100g } },
    }));
    if (onAdd(items)) setAdded(true);
    else appendRef.current = false;
  }

  const fieldClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/15 disabled:opacity-60';
  const format = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString(ar ? 'ar' : 'en') : '—';
  const confidence = { low: t('Low confidence', 'ثقة منخفضة'), medium: t('Medium confidence', 'ثقة متوسطة'), high: t('High confidence', 'ثقة مرتفعة') };
  const nutrientLabels: Record<keyof Nutrients, string> = {
    calories: t('Calories per 100 g', 'السعرات لكل ١٠٠ غ'),
    protein: t('Protein per 100 g', 'البروتين لكل ١٠٠ غ'),
    carbs: t('Carbs per 100 g', 'الكارب لكل ١٠٠ غ'),
    fat: t('Fat per 100 g', 'الدهون لكل ١٠٠ غ'),
  };
  const invalidReview = Boolean(foods?.some(food => !isValidFood(food)));
  const tooMany = Boolean(foods && foods.length > remainingSlots);

  return (
    <section className="mt-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--soft)] p-4" aria-label={t('AI food photo analysis', 'تحليل صورة الطعام بالذكاء الاصطناعي')}>
      <div className="flex gap-3"><Sparkles className="mt-0.5 shrink-0 text-[var(--green)]" size={20} /><div><h3 className="text-sm font-bold">{t('Estimate nutrition with OpenAI', 'تقدير القيم الغذائية عبر OpenAI')}</h3><p id={disclosureId} className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{t('Only when you choose Analyze photo, this photo and your description are sent to OpenAI for analysis. Avoid including personal information. You can always add foods manually.', 'تُرسل هذه الصورة والوصف إلى OpenAI للتحليل فقط عند اختيار «تحليل الصورة». تجنب تضمين معلومات شخصية. يمكنك دائماً إضافة الأطعمة يدوياً.')}</p></div></div>

      <div>
        <label htmlFor={descriptionId} className="text-sm font-semibold">{t('Meal description (optional)', 'وصف الوجبة (اختياري)')}</label>
        <textarea id={descriptionId} value={description} maxLength={2000} rows={3} onChange={event => changeDescription(event.target.value)} placeholder={t('e.g. Grilled chicken, rice and a teaspoon of olive oil', 'مثلاً: دجاج مشوي وأرز وملعقة صغيرة من زيت الزيتون')} className={`${fieldClass} resize-y`} />
        <p className="mt-1 text-xs text-[var(--muted)]">{t('Add ingredients, cooking method or portion clues for a better estimate.', 'أضف المكونات أو طريقة الطهي أو معلومات عن الكمية لتحسين التقدير.')}</p>
      </div>

      {availability === 'checking' && <p role="status" className="text-sm text-[var(--muted)]">{t('Checking photo analysis availability…', 'جارٍ التحقق من توفر تحليل الصور…')}</p>}
      {availability === 'unavailable' && <p role="status" className="text-sm text-[var(--muted)]">{t('Photo analysis is not configured on the server. You can still add foods manually.', 'تحليل الصور غير مفعّل على الخادم. يمكنك إضافة الأطعمة يدوياً.')}</p>}
      {availability === 'error' && <div className="text-sm"><p role="status" className="text-[var(--muted)]">{t('Could not check photo analysis availability. Manual food search still works.', 'تعذر التحقق من توفر تحليل الصور. يمكنك استخدام البحث اليدوي عن الطعام.')}</p><button type="button" onClick={() => setAvailabilityAttempt(value => value + 1)} className="mt-2 font-semibold text-[var(--green)] underline underline-offset-4">{t('Retry connection', 'إعادة الاتصال')}</button></div>}

      <button type="button" onClick={() => void analyze()} disabled={!photo || preparing || analyzing || availability !== 'available'} aria-describedby={disclosureId} className="inline-flex items-center gap-2 rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-45 dark:text-[#173b25]">{analyzing ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}{analyzing ? t('Analyzing photo…', 'جارٍ تحليل الصورة…') : t('Analyze photo', 'تحليل الصورة')}</button>
      {!photo && <p className="text-xs text-[var(--muted)]">{t('Upload a photo above to use photo analysis.', 'حمّل صورة أعلاه لاستخدام تحليل الصور.')}</p>}
      {analyzing && <p role="status" className="text-sm text-[var(--muted)]">{t('Estimating foods and portions. You can edit the description or close this window to cancel.', 'جارٍ تقدير الأطعمة والكميات. يمكنك تعديل الوصف أو إغلاق النافذة لإلغاء التحليل.')}</p>}
      {message && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{message}</p>}
      {foods?.length === 0 && <p role="status" className="text-sm text-[var(--muted)]">{hadSuggestions ? t('All food estimates were removed. Analyze again or add foods manually.', 'تم حذف جميع تقديرات الطعام. حلّل الصورة مجدداً أو أضف الأطعمة يدوياً.') : t('No food could be identified in this photo. Try another photo or add foods manually.', 'لم يمكن تحديد طعام في هذه الصورة. جرّب صورة أخرى أو أضف الأطعمة يدوياً.')}</p>}

      {Boolean(foods?.length) && <section aria-label={t('Review food estimates', 'مراجعة تقديرات الطعام')} className="space-y-3 border-t border-[var(--border)] pt-4">
        <h4 className="font-bold">{t('Review before adding', 'راجع التقديرات قبل الإضافة')}</h4>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{t('AI estimates can be inaccurate, especially portions, oils and hidden ingredients. Review and correct every food. These values are not suitable for medical decisions.', 'قد تخطئ تقديرات الذكاء الاصطناعي، خصوصاً في الكميات والزيوت والمكونات غير الظاهرة. راجع كل طعام وصحّح قيمه. هذه القيم غير مناسبة لاتخاذ قرارات طبية.')}</p>
        {foods?.map((food, index) => {
          const portion = Object.fromEntries(nutrientKeys.map(key => [key, food.per100g[key] * food.estimatedGrams / 100])) as Nutrients;
          return <article key={food.reviewId} aria-label={t(`Estimated food ${index + 1}`, `الطعام المقدّر ${index + 1}`)} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--muted)]">{t('AI estimate', 'تقدير بالذكاء الاصطناعي')} · {confidence[food.confidence]}</p><button type="button" disabled={added} onClick={() => setFoods(previous => previous?.filter(item => item.reviewId !== food.reviewId) ?? null)} aria-label={t(`Remove estimated food ${index + 1}`, `إزالة الطعام المقدّر ${index + 1}`)} className="rounded-lg p-2 text-[var(--muted)] hover:bg-red-50 hover:text-red-700 disabled:opacity-40 dark:hover:bg-red-950/30"><Trash2 size={16} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">{t('Food name (English)', 'اسم الطعام بالإنجليزية')}<input value={food.label} lang="en" dir="ltr" maxLength={100} disabled={added} onChange={event => updateFood(food.reviewId, { label: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs font-semibold">{t('Food name (Arabic)', 'اسم الطعام بالعربية')}<input value={food.labelAr} lang="ar" dir="rtl" maxLength={100} disabled={added} onChange={event => updateFood(food.reviewId, { labelAr: event.target.value })} className={fieldClass} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">{t('Portion (g)', 'الكمية (غ)')}<input type="number" inputMode="decimal" min="0.1" max="5000" step="0.1" disabled={added} value={Number.isFinite(food.estimatedGrams) ? food.estimatedGrams : ''} onChange={event => updateFood(food.reviewId, { estimatedGrams: event.target.value === '' ? NaN : Number(event.target.value) })} className={fieldClass} /></label>
              {nutrientKeys.map(key => <label key={key} className="text-xs font-semibold">{nutrientLabels[key]}<input type="number" inputMode="decimal" min="0" max={key === 'calories' ? 1000 : 100} step="0.1" disabled={added} value={Number.isFinite(food.per100g[key]) ? food.per100g[key] : ''} onChange={event => updateFood(food.reviewId, { per100g: { ...food.per100g, [key]: event.target.value === '' ? NaN : Number(event.target.value) } })} className={fieldClass} /></label>)}
            </div>
            <p className="rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">{t('For this portion', 'لهذه الكمية')}: {format(portion.calories)} {t('kcal', 'سعرة')} · {t('Protein', 'البروتين')} {format(portion.protein)} {t('g', 'غ')} · {t('Carbs', 'الكارب')} {format(portion.carbs)} {t('g', 'غ')} · {t('Fat', 'الدهون')} {format(portion.fat)} {t('g', 'غ')}</p>
          </article>;
        })}
        {invalidReview && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('Enter both food names (1–100 characters), portions from 0.1–5,000 g, calories from 0–1,000 per 100 g, and macros from 0–100 g per 100 g.', 'أدخل الاسمين (١–١٠٠ حرف)، والكمية من ٠٫١ إلى ٥٬٠٠٠ غ، والسعرات من ٠ إلى ١٬٠٠٠ لكل ١٠٠ غ، والمغذيات من ٠ إلى ١٠٠ غ لكل ١٠٠ غ.')}</p>}
        {tooMany && !added && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t(`A meal can contain up to 50 foods. Remove estimates to fit the ${remainingSlots} remaining spaces.`, `يمكن أن تحتوي الوجبة على ٥٠ طعاماً كحد أقصى. احذف بعض التقديرات لتناسب الأماكن المتبقية وعددها ${remainingSlots}.`)}</p>}
        <button type="button" disabled={added || invalidReview || tooMany} onClick={addReviewed} className="inline-flex items-center gap-2 rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45 dark:text-[#173b25]"><Check size={16} />{added ? t('Foods added to your plate', 'تمت إضافة الأطعمة إلى وجبتك') : t('Add reviewed foods', 'إضافة الأطعمة بعد المراجعة')}</button>
        <p role="status" className="text-xs text-[var(--muted)]">{added ? t('Review your plate below, then choose Save meal to keep it on this device.', 'راجع مكونات وجبتك أدناه، ثم اختر حفظ الوجبة للاحتفاظ بها على هذا الجهاز.') : t('Adding estimates only puts them on your plate. Save the meal below when you are ready.', 'إضافة التقديرات تضعها في مكونات وجبتك فقط. احفظ الوجبة أدناه عندما تنتهي.')}</p>
      </section>}
    </section>
  );
}
