'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, Flame, LoaderCircle, Minus, Plus, Search, Text, Trash2, Upload, X } from 'lucide-react';
import { searchFoods } from '@/lib/foods';
import { getMealItemFood } from '@/lib/meal-items';
import { itemNutrients, sumNutrients } from '@/lib/nutrition';
import type { Food, Locale, Meal, MealItem, MealType } from '@/lib/types';
import PhotoAnalysisPanel from './photo-analysis-panel';

type MealEditorProps = {
  locale: Locale;
  date: string;
  initialType?: MealType;
  editing?: Meal | null;
  onClose: () => void;
  onSave: (meal: Meal) => void;
};

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const categories: Array<Food['category'] | 'all'> = ['all', 'protein', 'grains', 'fruit', 'vegetables', 'dairy', 'fats', 'dishes'];
const mealNames = {
  en: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' },
  ar: { breakfast: 'الفطور', lunch: 'الغداء', dinner: 'العشاء', snack: 'الوجبات الخفيفة' },
};
const categoryNames = {
  en: { all: 'All foods', protein: 'Protein', grains: 'Grains', fruit: 'Fruit', vegetables: 'Vegetables', dairy: 'Dairy', fats: 'Fats & nuts', dishes: 'Dishes' },
  ar: { all: 'كل الأطعمة', protein: 'البروتين', grains: 'الحبوب', fruit: 'الفواكه', vegetables: 'الخضروات', dairy: 'الألبان', fats: 'الدهون والمكسرات', dishes: 'الأطباق' },
};

/** Prepare a local attachment; sending it for analysis is a separate, explicit action. */
async function preparePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const original = new window.Image();
    await new Promise<void>((resolve, reject) => {
      original.onload = () => resolve();
      original.onerror = () => reject(new Error('decode'));
      original.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(original.naturalWidth, original.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(original.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(original.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    let quality = 0.85;
    for (let attempt = 0; attempt < 8; attempt++) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(original, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('encode');
      // Include base64 overhead: the storage adapter limits photo URLs to 400,000 characters.
      if (blob.size <= 290 * 1024) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read'));
          reader.readAsDataURL(blob);
        });
      }
      if (quality > 0.5) quality -= 0.15;
      else {
        canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
        canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
      }
    }
    throw new Error('size');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function MealEditor({ locale, date, initialType = 'breakfast', editing, onClose, onSave }: MealEditorProps) {
  const ar = locale === 'ar';
  const t = (english: string, arabic: string) => ar ? arabic : english;
  const titleId = useId();
  const searchId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  onCloseRef.current = onClose;
  const [type, setType] = useState<MealType>(editing?.type ?? initialType);
  const [name, setName] = useState(editing?.name ?? '');
  const [items, setItems] = useState<MealItem[]>(() => editing?.items.map(item => ({ ...item })) ?? []);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Food['category'] | 'all'>('all');
  const [tab, setTab] = useState<'foods' | 'photo' | 'description'>('foods');
  const [photo, setPhoto] = useState<string | undefined>(editing?.photo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [analysisRetryAfterUntil, setAnalysisRetryAfterUntil] = useState(0);
  const [added, setAdded] = useState('');
  const visibleFoods = searchFoods(query, category);
  const totals = sumNutrients(items.filter(item => getMealItemFood(item) && Number.isFinite(item.grams) && item.grams >= 0.1 && item.grams <= 5000).map(itemNutrients));
  const number = (value: number) => Math.round(value).toLocaleString(ar ? 'ar' : 'en');

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mounted.current = true;
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      mounted.current = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  function addFood(food: Food) {
    if (itemsRef.current.length >= 50) {
      setError(t('A meal can contain up to 50 foods.', 'يمكن أن تحتوي الوجبة على ٥٠ طعاماً كحد أقصى.'));
      return;
    }
    const nextItems = [...itemsRef.current, { id: crypto.randomUUID(), foodId: food.id, grams: food.servingGrams }];
    itemsRef.current = nextItems;
    setItems(nextItems);
    setError('');
    setAdded(t(`${food.name} added to your meal.`, `تمت إضافة ${food.nameAr} إلى وجبتك.`));
  }

  function addReviewedFoods(reviewedItems: MealItem[]): boolean {
    if (itemsRef.current.length + reviewedItems.length > 50) {
      setError(t('A meal can contain up to 50 foods. Remove a food before adding more.', 'يمكن أن تحتوي الوجبة على ٥٠ طعاماً كحد أقصى. احذف طعاماً قبل إضافة المزيد.'));
      return false;
    }
    const nextItems = [...itemsRef.current, ...reviewedItems];
    itemsRef.current = nextItems;
    setItems(nextItems);
    setError('');
    setAdded(t('Reviewed food estimates added to your plate.', 'تمت إضافة تقديرات الطعام بعد مراجعتها إلى وجبتك.'));
    return true;
  }

  function updateGrams(id: string, grams: number) {
    setItems(previous => previous.map(item => item.id === id ? { ...item, grams } : item));
    setError('');
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setPhotoError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError(t('Choose a JPG, PNG, or WebP image.', 'اختر صورة بصيغة JPG أو PNG أو WebP.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError(t('This image is too large. Choose an image under 5 MB.', 'الصورة كبيرة جداً. اختر صورة أقل من ٥ ميغابايت.'));
      return;
    }
    setBusy(true);
    busyRef.current = true;
    try {
      const prepared = await preparePhoto(file);
      if (mounted.current) setPhoto(prepared);
    } catch {
      if (mounted.current) setPhotoError(t('We couldn’t open this image. Please choose another photo.', 'تعذر فتح هذه الصورة. يرجى اختيار صورة أخرى.'));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function save() {
    if (busy) return;
    if (!items.length) {
      setError(t('Add at least one food to calculate and save your meal.', 'أضف طعاماً واحداً على الأقل لحساب وجبتك وحفظها.'));
      setTab('foods');
      return;
    }
    if (items.length > 50 || items.some(item => !getMealItemFood(item) || !Number.isFinite(item.grams) || item.grams < 0.1 || item.grams > 5000)) {
      setError(t('Enter a portion between 0.1 and 5,000 grams for every food.', 'أدخل كمية بين ٠٫١ و٥٬٠٠٠ غرام لكل طعام.'));
      return;
    }
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      type,
      name: name.trim(),
      date: editing?.date ?? date,
      items,
      ...(photo ? { photo } : {}),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    });
  }

  const fieldClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/15';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} dir={ar ? 'rtl' : 'ltr'} className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl outline-none">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-7">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--green)]">{t('A little balance, every day', 'توازن بسيط، كل يوم')}</div>
            <h2 id={titleId} className="text-2xl font-bold tracking-tight">{editing ? t('Edit your meal', 'تعديل وجبتك') : t('Add a meal', 'أضف وجبة')}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t('Build your plate. We’ll take care of the numbers.', 'اختر مكونات طبقك، ونحن نحسب لك القيم الغذائية.')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('Close meal editor', 'إغلاق محرر الوجبة')} className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--soft)] hover:text-[var(--ink)] disabled:opacity-40"><X size={20} /></button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">{t('Meal type', 'نوع الوجبة')}
              <select value={type} onChange={event => setType(event.target.value as MealType)} className={`${fieldClass} mt-2`}>
                {mealTypes.map(mealType => <option value={mealType} key={mealType}>{mealNames[locale][mealType]}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">{t('Meal name (optional)', 'اسم الوجبة (اختياري)')}
              <input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder={t('e.g. My favorite breakfast', 'مثلاً: فطوري المفضل')} className={`${fieldClass} mt-2`} />
            </label>
          </div>

          <div className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label={t('Add food options', 'خيارات إضافة الطعام')}>
            <button type="button" role="tab" id={`${titleId}-foods-tab`} aria-selected={tab === 'foods'} aria-controls={`${titleId}-foods`} onClick={() => setTab('foods')} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === 'foods' ? 'border-[var(--green)] text-[var(--green)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}><Search size={16} />{t('Search foods', 'ابحث عن طعام')}</button>
            <button type="button" role="tab" id={`${titleId}-photo-tab`} aria-selected={tab === 'photo'} aria-controls={`${titleId}-photo`} onClick={() => setTab('photo')} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === 'photo' ? 'border-[var(--green)] text-[var(--green)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}><Camera size={16} />{t('Food photo', 'صورة الطعام')}{photo && <Check size={14} />}</button>
            <button type="button" role="tab" id={`${titleId}-description-tab`} aria-selected={tab === 'description'} aria-controls={`${titleId}-description`} onClick={() => setTab('description')} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === 'description' ? 'border-[var(--green)] text-[var(--green)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}><Text size={16} />{t('Meal description', 'وصف الوجبة')}</button>
          </div>

          {tab === 'foods' ? (
            <div role="tabpanel" id={`${titleId}-foods`} aria-labelledby={`${titleId}-foods-tab`} className="pt-5">
              <label htmlFor={searchId} className="sr-only">{t('Search foods in Arabic or English', 'ابحث عن طعام بالعربية أو الإنجليزية')}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-4 top-3.5 text-[var(--muted)]" size={18} />
                <input id={searchId} ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search in English or Arabic…', 'ابحث بالعربية أو الإنجليزية…')} className={`${fieldClass} ps-11`} />
                {query && <button type="button" aria-label={t('Clear search', 'مسح البحث')} onClick={() => { setQuery(''); searchRef.current?.focus(); }} className="absolute end-3 top-3 rounded p-0.5 text-[var(--muted)]"><X size={18} /></button>}
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label={t('Food category', 'تصنيف الطعام')}>
                {categories.map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${category === value ? 'border-[var(--green)] bg-[var(--green)] text-white dark:text-[#173b25]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--green)] hover:text-[var(--green)]'}`}>{categoryNames[locale][value]}</button>)}
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-[var(--border)] p-2">
                {!visibleFoods.length && <div className="px-6 py-9 text-center"><Search className="mx-auto mb-3 text-[var(--muted)]" size={26} /><p className="font-semibold">{t('No foods found', 'لم نجد أطعمة')}</p><p className="mt-1 text-sm text-[var(--muted)]">{t('Try a different name or choose All foods.', 'جرّب اسماً آخر أو اختر كل الأطعمة.')}</p></div>}
                {visibleFoods.map(food => (
                  <div key={food.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[var(--soft)] sm:px-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-2xl" aria-hidden="true">{food.emoji}</div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{ar ? food.nameAr : food.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]" lang={ar ? 'en' : 'ar'}>{ar ? food.name : food.nameAr}</p></div>
                    <div className="text-end"><p className="text-sm font-semibold">{number(food.per100g.calories * food.servingGrams / 100)} <span className="text-xs font-normal text-[var(--muted)]">{t('kcal', 'سعرة')}</span></p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{number(food.servingGrams)} {t('g / serving', 'غ / حصة')}</p></div>
                    <button type="button" onClick={() => addFood(food)} aria-label={t(`Add ${food.name}`, `إضافة ${food.nameAr}`)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--green)] transition hover:bg-[var(--green)] hover:text-white dark:hover:text-[#173b25]"><Plus size={17} /></button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{t('Sample nutrition data. Values vary by brand and preparation; adjust portions in grams below.', 'بيانات غذائية نموذجية. تختلف القيم حسب العلامة التجارية وطريقة التحضير؛ عدّل الكميات بالغرام أدناه.')}</p>
              <p role="status" aria-live="polite" className="sr-only">{added}</p>
            </div>
          ) : tab === 'photo' ? (
            <div role="tabpanel" id={`${titleId}-photo`} aria-labelledby={`${titleId}-photo-tab`} className="pt-5">
              <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('Upload a food photo', 'تحميل صورة الطعام')} className="hidden" disabled={busy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} />
              {photo ? <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--canvas)]"><img src={photo} alt={t('Your uploaded meal photo', 'صورة وجبتك المرفوعة')} className="mx-auto h-48 w-full object-contain" /><button type="button" aria-label={t('Remove food photo', 'إزالة صورة الطعام')} disabled={busy} onClick={() => setPhoto(undefined)} className="absolute end-3 top-3 rounded-full bg-[var(--surface)] p-2 text-[var(--ink)] shadow-sm"><Trash2 size={17} /></button><button type="button" disabled={busy} onClick={() => uploadRef.current?.click()} className="w-full border-t border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--green)]">{t('Choose another photo', 'اختر صورة أخرى')}</button></div> : <button type="button" disabled={busy} onClick={() => uploadRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--canvas)] px-5 py-8 transition hover:border-[var(--green)] disabled:opacity-60"><span className="mb-1 rounded-2xl bg-[var(--soft)] p-3 text-[var(--green)]">{busy ? <LoaderCircle className="animate-spin" size={26} /> : <Upload size={26} />}</span><span className="font-semibold">{busy ? t('Preparing your photo…', 'جارٍ تجهيز الصورة…') : t('Upload a food photo', 'حمّل صورة طعامك')}</span><span className="text-xs text-[var(--muted)]">{t('JPG, PNG or WebP · up to 5 MB', 'JPG أو PNG أو WebP · حتى ٥ ميغابايت')}</span></button>}
              {busy && photo && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{t('Preparing your photo…', 'جارٍ تجهيز الصورة…')}</p>}
              {photoError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{photoError}</p>}
              <PhotoAnalysisPanel key="photo" mode="photo" locale={locale} photo={photo} preparing={busy} remainingSlots={Math.max(0, 50 - items.length)} retryAfterUntil={analysisRetryAfterUntil} onRetryAfter={setAnalysisRetryAfterUntil} onAdd={addReviewedFoods} />
            </div>
          ) : (
            <div role="tabpanel" id={`${titleId}-description`} aria-labelledby={`${titleId}-description-tab`} className="pt-1">
              <PhotoAnalysisPanel key="description" mode="description" locale={locale} preparing={false} remainingSlots={Math.max(0, 50 - items.length)} retryAfterUntil={analysisRetryAfterUntil} onRetryAfter={setAnalysisRetryAfterUntil} onAdd={addReviewedFoods} />
            </div>
          )}

          <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-bold">{t('Your plate', 'مكونات وجبتك')} <span className="ms-1 font-normal text-[var(--muted)]">({number(items.length)})</span></h3><span className="text-xs text-[var(--muted)]">{t('Adjust your portions', 'عدّل الكميات')}</span></div>
          <div className="mt-3 space-y-3">
            {!items.length && <div className="rounded-2xl bg-[var(--canvas)] px-5 py-6 text-center text-sm text-[var(--muted)]">{t('Your plate is empty. Find a food above to get started.', 'وجبتك فارغة. ابحث عن طعام أعلاه للبدء.')}</div>}
            {items.map(item => {
              const food = getMealItemFood(item);
              if (!food) return null;
              const nutrition = Number.isFinite(item.grams) && item.grams >= 0.1 && item.grams <= 5000 ? itemNutrients(item) : null;
              return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-3 sm:px-4">
                <span className="text-2xl" aria-hidden="true">{food.emoji}</span><div className="min-w-[100px] flex-1"><p className="text-sm font-semibold">{ar ? food.nameAr : food.name}</p>{item.estimatedFood && <p className="mt-0.5 text-xs font-medium text-[var(--green)]">{t('AI estimate · reviewed', 'تقدير بالذكاء الاصطناعي · تمت مراجعته')}</p>}<p className="mt-0.5 text-xs text-[var(--muted)]">{number(nutrition?.calories ?? 0)} {t('kcal', 'سعرة')} · {t('for this portion', 'لهذه الكمية')}</p></div>
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-1">
                  <button type="button" aria-label={t(`Decrease ${food.name} portion`, `تقليل كمية ${food.nameAr}`)} onClick={() => updateGrams(item.id, Math.max(1, item.grams - 10))} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--soft)]"><Minus size={14} /></button>
                  <label className="flex items-center gap-1"><span className="sr-only">{t(`${food.name} portion in grams`, `كمية ${food.nameAr} بالغرام`)}</span><input type="number" aria-label={t(`${food.name} portion in grams`, `كمية ${food.nameAr} بالغرام`)} inputMode="decimal" min="0.1" max="5000" step="0.1" value={item.grams || ''} onChange={event => updateGrams(item.id, event.target.value === '' ? 0 : Number(event.target.value))} className="w-14 bg-transparent text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--green)]" /><span className="text-xs text-[var(--muted)]">{t('g', 'غ')}</span></label>
                  <button type="button" aria-label={t(`Increase ${food.name} portion`, `زيادة كمية ${food.nameAr}`)} onClick={() => updateGrams(item.id, Math.min(5000, item.grams + 10))} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--soft)]"><Plus size={14} /></button>
                </div>
                <button type="button" aria-label={t(`Remove ${food.name}`, `إزالة ${food.nameAr}`)} onClick={() => { setItems(previous => previous.filter(value => value.id !== item.id)); setError(''); }} className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 size={15} /></button>
              </div>;
            })}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-[var(--soft)] px-3 py-4 text-center sm:px-5">
            <div><p className="flex items-center justify-center gap-1 text-lg font-bold text-[var(--green)]"><Flame size={15} />{number(totals.calories)}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{t('Calories', 'السعرات')}</p></div>
            <div><p className="text-lg font-bold">{number(totals.protein)}<span className="ms-0.5 text-xs font-normal text-[var(--muted)]">{t('g', 'غ')}</span></p><p className="mt-1 text-[11px] text-[var(--muted)]">{t('Protein', 'البروتين')}</p></div>
            <div><p className="text-lg font-bold">{number(totals.carbs)}<span className="ms-0.5 text-xs font-normal text-[var(--muted)]">{t('g', 'غ')}</span></p><p className="mt-1 text-[11px] text-[var(--muted)]">{t('Carbs', 'الكارب')}</p></div>
            <div><p className="text-lg font-bold">{number(totals.fat)}<span className="ms-0.5 text-xs font-normal text-[var(--muted)]">{t('g', 'غ')}</span></p><p className="mt-1 text-[11px] text-[var(--muted)]">{t('Fats', 'الدهون')}</p></div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:px-7">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--soft)] disabled:opacity-40">{t('Cancel', 'إلغاء')}</button>
          <button type="button" disabled={busy} onClick={save} className="flex items-center gap-2 rounded-xl bg-[var(--green)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 dark:text-[#173b25]">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}{editing ? t('Save changes', 'حفظ التعديلات') : t('Save meal', 'حفظ الوجبة')}</button>
        </footer>
      </div>
    </div>
  );
}
