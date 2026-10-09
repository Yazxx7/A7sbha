'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { calculatePlan } from '../lib/nutrition';
import type { Goals, Locale, NutritionPlan, Profile } from '../lib/types';

type Props = {
  locale: Locale;
  profile: Profile | null;
  goals: Goals;
  onClose: () => void;
  onSave: (goals: Goals, profile: Profile | null, source: 'manual' | 'calculated') => void;
};

const copy = {
  en: {
    title: 'Make your goals your own', subtitle: 'Choose daily targets or build a plan around you.',
    manual: 'Daily targets', calculate: 'Calculate my plan', calories: 'Calories', protein: 'Protein',
    carbs: 'Carbohydrates', fat: 'Fat', waterMl: 'Water', kcal: 'kcal', grams: 'g', ml: 'ml',
    name: 'Your name (optional)', goal: 'Your goal', cut: 'Lose weight', bulk: 'Gain weight', maintain: 'Maintain weight',
    weight: 'Current weight (kg)', targetWeight: 'Target weight (kg)', height: 'Height (cm)', age: 'Age (years)',
    gender: 'Sex used for this calculation', male: 'Male', female: 'Female', activity: 'Activity level',
    sedentary: 'Mostly seated · little exercise', light: 'Light · 1–3 workouts a week', moderate: 'Moderate · 3–5 workouts a week',
    active: 'Active · 6–7 workouts a week', very_active: 'Very active · physical work or twice-daily training',
    weeklyRate: 'Target change each week (kg)', close: 'Close goal settings', cancel: 'Cancel', save: 'Save daily targets',
    apply: 'Apply calculated plan', preview: 'Your estimated daily plan', bmr: 'Resting energy', tdee: 'Daily energy use',
    duration: 'Estimated time to goal', weeks: 'weeks', maintained: 'Maintain your current weight',
    noTimeline: 'Timeline unavailable', effectiveRate: 'Estimated weekly change', kgWeek: 'kg / week',
    previewHint: 'Enter valid measurements to preview your plan.',
    manualHint: 'Daily targets help you track your food. Manual targets stay fixed until you change them, even when you log a new weight.',
    formula: 'Calculated with the Mifflin–St Jeor equation and your activity level. Estimates are a starting point; adjust using your weight trend over 2–4 weeks.',
    estimateNote: 'Timing is approximate. Your activity, consistency, and individual metabolism can change your progress.',
    adultNote: 'This calculator is for adults aged 18–100. It is not a personalized medical or pregnancy nutrition plan.',
    targetCut: 'For weight loss, enter a target below your current weight.',
    targetBulk: 'For weight gain, enter a target above your current weight.',
    invalid: 'Please enter a number between', and: 'and', rateCut: 'Use a weekly change between 0.1 and 1 kg.',
    rateBulk: 'Use a weekly change between 0.1 and 0.5 kg.', calculationError: 'These measurements cannot produce a valid plan. Check your values.',
    nameLong: 'Use 50 characters or fewer.',
  },
  ar: {
    title: 'أهداف تناسبك', subtitle: 'حدد أهدافك اليومية أو احسب خطة حسب جسمك ونشاطك.',
    manual: 'الأهداف اليومية', calculate: 'احسب خطتي', calories: 'السعرات', protein: 'البروتين',
    carbs: 'الكربوهيدرات', fat: 'الدهون', waterMl: 'الماء', kcal: 'سعرة', grams: 'غ', ml: 'مل',
    name: 'اسمك (اختياري)', goal: 'هدفك', cut: 'تنشيف وخسارة وزن', bulk: 'تضخيم وزيادة وزن', maintain: 'تثبيت الوزن',
    weight: 'الوزن الحالي (كغ)', targetWeight: 'الوزن المستهدف (كغ)', height: 'الطول (سم)', age: 'العمر (سنة)',
    gender: 'الجنس المستخدم في الحساب', male: 'ذكر', female: 'أنثى', activity: 'مستوى النشاط',
    sedentary: 'قليل الحركة · دون تمارين منتظمة', light: 'خفيف · ١–٣ تمارين أسبوعياً', moderate: 'متوسط · ٣–٥ تمارين أسبوعياً',
    active: 'نشط · ٦–٧ تمارين أسبوعياً', very_active: 'نشط جداً · عمل بدني أو تمرين مرتين يومياً',
    weeklyRate: 'التغير المستهدف أسبوعياً (كغ)', close: 'إغلاق إعدادات الأهداف', cancel: 'إلغاء', save: 'حفظ الأهداف اليومية',
    apply: 'اعتماد الخطة المحسوبة', preview: 'خطتك اليومية التقديرية', bmr: 'طاقة الجسم في الراحة', tdee: 'استهلاك الطاقة اليومي',
    duration: 'الوقت التقريبي للوصول للهدف', weeks: 'أسابيع', maintained: 'تثبيت وزنك الحالي',
    noTimeline: 'لا يمكن تقدير المدة', effectiveRate: 'التغير الأسبوعي المتوقع', kgWeek: 'كغ / أسبوع',
    previewHint: 'أدخل قياسات صحيحة لعرض خطتك.',
    manualHint: 'تساعدك الأهداف اليومية على متابعة أكلك. تظل الأهداف اليدوية ثابتة حتى تعدّلها، حتى عند تسجيل وزن جديد.',
    formula: 'الحساب بمعادلة ميفلين سانت جيور ومستوى نشاطك. هذه تقديرات أولية؛ عدّلها حسب تغير وزنك خلال أسبوعين إلى أربعة أسابيع.',
    estimateNote: 'المدة تقريبية، وقد تختلف حسب نشاطك والتزامك وطبيعة جسمك.',
    adultNote: 'هذه الحاسبة للبالغين من ١٨ إلى ١٠٠ سنة، ولا تقدم خطة طبية أو تغذية مخصصة للحمل.',
    targetCut: 'لخسارة الوزن، أدخل وزناً مستهدفاً أقل من وزنك الحالي.',
    targetBulk: 'لزيادة الوزن، أدخل وزناً مستهدفاً أعلى من وزنك الحالي.',
    invalid: 'أدخل رقماً بين', and: 'و', rateCut: 'اختر تغيراً أسبوعياً بين ٠٫١ و١ كغ.',
    rateBulk: 'اختر تغيراً أسبوعياً بين ٠٫١ و٠٫٥ كغ.', calculationError: 'تعذر حساب خطة بهذه القياسات. راجع الأرقام المدخلة.',
    nameLong: 'استخدم ٥٠ حرفاً أو أقل.',
  },
} as const;

const arabicPlanNotes: Record<string, string> = {
  'The weekly rate is limited to a gradual change for your current weight.': 'عُدّل معدل التغير الأسبوعي ليكون تدريجياً ومناسباً لوزنك الحالي.',
  'Calories are limited to a general adult minimum; the estimated timeline is adjusted to this intake.': 'عُدّلت السعرات لتراعي حداً عاماً للبالغين، وحُسبت المدة التقريبية وفق هذا المقدار.',
  'Your target falls outside the usual adult BMI range; discuss a suitable goal with a qualified professional.': 'الوزن المستهدف خارج نطاق مؤشر كتلة الجسم المعتاد للبالغين. ناقش هدفاً مناسباً مع مختص مؤهل.',
  'This intake does not produce the requested weight change; a reliable timeline cannot be estimated.': 'السعرات المحسوبة لا تحقق تغير الوزن المطلوب؛ لذلك لا يمكن تقدير مدة موثوقة.',
};

type BodyFields = Omit<Profile, 'weight' | 'targetWeight' | 'height' | 'age' | 'weeklyRate'> & {
  weight: string; targetWeight: string; height: string; age: string; weeklyRate: string;
};
type ErrorMap = Partial<Record<keyof Profile | keyof Goals | 'form', string>>;

function initialBody(profile: Profile | null): BodyFields {
  const value: Profile = profile ?? {
    name: '', goal: 'cut', weight: 75, targetWeight: 70, height: 175,
    age: 28, gender: 'male', activity: 'moderate', weeklyRate: 0.4,
  };
  return { ...value, weight: String(value.weight), targetWeight: String(value.targetWeight), height: String(value.height), age: String(value.age), weeklyRate: String(value.weeklyRate) };
}

export default function GoalsDialog({ locale, profile, goals, onClose, onSave }: Props) {
  const t = copy[locale];
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [tab, setTab] = useState<'manual' | 'calculate'>('manual');
  const [body, setBody] = useState<BodyFields>(() => initialBody(profile));
  const [manual, setManual] = useState<Record<keyof Goals, string>>(() => ({
    calories: String(goals.calories), protein: String(goals.protein), carbs: String(goals.carbs),
    fat: String(goals.fat), waterMl: String(goals.waterMl),
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState('');
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const container = dialogRef.current;
    container?.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !container) return;
      const elements = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, []);

  const evaluated = useMemo(() => {
    const errors: ErrorMap = {};
    const bounds: [keyof Pick<Profile, 'weight' | 'targetWeight' | 'height' | 'age'>, number, number][] = [
      ['weight', 30, 300], ['targetWeight', 30, 300], ['height', 120, 230], ['age', 18, 100],
    ];
    for (const [key, min, max] of bounds) {
      const value = Number(body[key]);
      if (!body[key].trim() || !Number.isFinite(value) || value < min || value > max || (key === 'age' && !Number.isInteger(value))) {
        errors[key] = `${t.invalid} ${min} ${t.and} ${max}.`;
      }
    }
    if (body.name.trim().length > 50) errors.name = t.nameLong;
    if (!errors.weight && !errors.targetWeight) {
      if (body.goal === 'cut' && Number(body.targetWeight) >= Number(body.weight)) errors.targetWeight = t.targetCut;
      if (body.goal === 'bulk' && Number(body.targetWeight) <= Number(body.weight)) errors.targetWeight = t.targetBulk;
    }
    const rate = Number(body.weeklyRate);
    if (body.goal !== 'maintain' && (!body.weeklyRate.trim() || !Number.isFinite(rate) || rate < 0.1 || rate > (body.goal === 'bulk' ? 0.5 : 1))) {
      errors.weeklyRate = body.goal === 'bulk' ? t.rateBulk : t.rateCut;
    }
    const candidate: Profile = {
      ...body, name: body.name.trim(), weight: Number(body.weight), targetWeight: body.goal === 'maintain' ? Number(body.weight) : Number(body.targetWeight),
      height: Number(body.height), age: Number(body.age), weeklyRate: body.goal === 'maintain' ? 0 : rate,
    };
    let plan: NutritionPlan | null = null;
    if (!Object.keys(errors).length) {
      try { plan = calculatePlan(candidate); } catch { errors.form = t.calculationError; }
    }
    return { errors, candidate, plan };
  }, [body, t]);

  const manualErrors = useMemo(() => {
    const errors: ErrorMap = {};
    const bounds: [keyof Goals, number, number][] = [
      ['calories', 800, 6000], ['protein', 0, 400], ['carbs', 0, 800], ['fat', 0, 250], ['waterMl', 500, 6000],
    ];
    for (const [key, min, max] of bounds) {
      const value = Number(manual[key]);
      if (!manual[key].trim() || !Number.isFinite(value) || value < min || value > max) errors[key] = `${t.invalid} ${min} ${t.and} ${max}.`;
    }
    return errors;
  }, [manual, t]);

  const errors: ErrorMap = submitted ? (tab === 'manual' ? manualErrors : evaluated.errors) : {};
  const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/20';
  const number = (value: number) => Math.round(value).toLocaleString(locale === 'ar' ? 'ar' : 'en');

  function changeGoal(goal: Profile['goal']) {
    setBody((current) => ({
      ...current, goal,
      targetWeight: String(goal === 'maintain' ? Number(current.weight) : Number(current.weight) + (goal === 'cut' ? -5 : 5)),
      weeklyRate: goal === 'maintain' ? '0' : goal === 'bulk' ? '0.25' : '0.4',
    }));
    setSaveError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setSaveError('');
    if (tab === 'manual') {
      if (Object.keys(manualErrors).length) return;
      onSave({ calories: Number(manual.calories), protein: Number(manual.protein), carbs: Number(manual.carbs), fat: Number(manual.fat), waterMl: Number(manual.waterMl) }, profile, 'manual');
      return;
    }
    if (Object.keys(evaluated.errors).length || !evaluated.plan) return;
    try {
      const plan = calculatePlan(evaluated.candidate);
      onSave({ calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, waterMl: goals.waterMl }, evaluated.candidate, 'calculated');
    } catch { setSaveError(t.calculationError); }
  }

  function fieldError(key: keyof Profile | keyof Goals) {
    return errors[key] ? <p id={`${id}-${key}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors[key]}</p> : null;
  }

  function bodyNumber(key: 'weight' | 'targetWeight' | 'height' | 'age' | 'weeklyRate', min: number, max: number, step: string) {
    return <div>
      <label htmlFor={`${id}-${key}`} className="mb-2 block text-xs font-semibold text-[var(--muted)]">{t[key]}</label>
      <input id={`${id}-${key}`} type="number" inputMode="decimal" min={min} max={max} step={step} value={body[key]}
        className={inputClass} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(event) => setBody((current) => ({ ...current, [key]: event.target.value }))} />
      {fieldError(key)}
    </div>;
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-subtitle`} dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-h-[calc(100dvh-48px)]">
      <div className="flex items-start justify-between gap-4 px-5 pt-6 sm:px-7">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--green-dark)] dark:text-[var(--green)]">{locale === 'ar' ? 'خطتك الشخصية' : 'YOUR PERSONAL PLAN'}</p>
          <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight text-[var(--ink)]">{t.title}</h2>
          <p id={`${id}-subtitle`} className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t.subtitle}</p>
        </div>
        <button type="button" aria-label={t.close} className="icon-btn shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--soft)]" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="mx-5 mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-[var(--soft)] p-1 sm:mx-7" role="group" aria-label={locale === 'ar' ? 'طريقة تحديد الأهداف' : 'Goal setting method'}>
        {(['manual', 'calculate'] as const).map((value) => <button key={value} type="button" data-initial-focus={value === 'manual' ? true : undefined}
          aria-pressed={tab === value} className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${tab === value ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
          onClick={() => { setTab(value); setSubmitted(false); setSaveError(''); }}>{t[value]}</button>)}
      </div>
      <form noValidate onSubmit={submit} className="px-5 pb-6 pt-5 sm:px-7">
        {tab === 'manual' ? <div>
          <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">{t.manualHint}</p>
          <div className="grid grid-cols-2 gap-4">
            {(['calories', 'protein', 'carbs', 'fat', 'waterMl'] as const).map((key) => <div key={key} className={key === 'calories' ? 'col-span-2' : ''}>
              <label htmlFor={`${id}-${key}`} className="mb-2 block text-xs font-semibold text-[var(--muted)]">{t[key]} <span className="font-normal">({key === 'calories' ? t.kcal : key === 'waterMl' ? t.ml : t.grams})</span></label>
              <input id={`${id}-${key}`} type="number" inputMode="decimal" step="1" value={manual[key]} className={inputClass}
                min={key === 'calories' ? 800 : key === 'waterMl' ? 500 : 0}
                max={key === 'calories' || key === 'waterMl' ? 6000 : key === 'protein' ? 400 : key === 'carbs' ? 800 : 250}
                aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
                onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))} />
              {fieldError(key)}
            </div>)}
          </div>
        </div> : <div>
          <div className="mb-5">
            <label htmlFor={`${id}-name`} className="mb-2 block text-xs font-semibold text-[var(--muted)]">{t.name}</label>
            <input id={`${id}-name`} type="text" autoComplete="given-name" maxLength={50} value={body.name} className={inputClass}
              onChange={(event) => setBody((current) => ({ ...current, name: event.target.value }))} />
            {fieldError('name')}
          </div>
          <fieldset className="mb-5"><legend className="mb-2 text-xs font-semibold text-[var(--muted)]">{t.goal}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['cut', 'bulk', 'maintain'] as const).map((goal) => <label key={goal} className={`cursor-pointer rounded-xl border px-2 py-3 text-center text-xs font-semibold transition sm:text-sm ${body.goal === goal ? 'border-[var(--green)] bg-[var(--green)]/10 text-[var(--green-dark)] dark:text-[var(--green)]' : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--soft)]'}`}>
                <input type="radio" name={`${id}-goal`} value={goal} checked={body.goal === goal} onChange={() => changeGoal(goal)} className="sr-only peer" />
                <span className="block rounded peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--green)]">{t[goal]}</span>
              </label>)}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-4">
            {bodyNumber('weight', 30, 300, '0.1')}
            {body.goal !== 'maintain' ? bodyNumber('targetWeight', 30, 300, '0.1') : <div className="flex items-end pb-3 text-sm text-[var(--muted)]">{t.maintained}</div>}
            {bodyNumber('height', 120, 230, '0.1')}
            {bodyNumber('age', 18, 100, '1')}
            <div className="col-span-2">
              <label htmlFor={`${id}-gender`} className="mb-2 block text-xs font-semibold text-[var(--muted)]">{t.gender}</label>
              <select id={`${id}-gender`} className={inputClass} value={body.gender} onChange={(event) => setBody((current) => ({ ...current, gender: event.target.value as Profile['gender'] }))}>
                <option value="male">{t.male}</option><option value="female">{t.female}</option>
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor={`${id}-activity`} className="mb-2 block text-xs font-semibold text-[var(--muted)]">{t.activity}</label>
              <select id={`${id}-activity`} className={inputClass} value={body.activity} onChange={(event) => setBody((current) => ({ ...current, activity: event.target.value as Profile['activity'] }))}>
                {(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const).map((activity) => <option key={activity} value={activity}>{t[activity]}</option>)}
              </select>
            </div>
            {body.goal !== 'maintain' && <div className="col-span-2">{bodyNumber('weeklyRate', 0.1, body.goal === 'bulk' ? 0.5 : 1, '0.05')}</div>}
          </div>
          <div className="mt-6 rounded-2xl border border-[var(--green)]/25 bg-[var(--green)]/5 p-4 sm:p-5" aria-live="polite">
            <h3 className="text-sm font-bold text-[var(--ink)]">{t.preview}</h3>
            {evaluated.plan ? <>
              <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--green-dark)] dark:text-[var(--green)]">{number(evaluated.plan.calories)} <span className="text-sm font-medium">{t.kcal}</span></p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(['protein', 'carbs', 'fat'] as const).map((key) => <div key={key} className="rounded-xl bg-[var(--surface)] p-3">
                  <p className="text-[11px] font-medium text-[var(--muted)]">{t[key]}</p>
                  <p className="mt-1 text-lg font-bold text-[var(--ink)]">{number(evaluated.plan![key])} <span className="text-xs font-normal">{t.grams}</span></p>
                </div>)}
              </div>
              <dl className="mt-4 space-y-2 text-xs text-[var(--muted)]">
                <div className="flex justify-between gap-3"><dt>{t.bmr}</dt><dd>{number(evaluated.plan.bmr)} {t.kcal}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t.tdee}</dt><dd>{number(evaluated.plan.tdee)} {t.kcal}</dd></div>
                {body.goal !== 'maintain' && <div className="flex justify-between gap-3"><dt>{t.effectiveRate}</dt><dd>{evaluated.plan.weeklyRate.toLocaleString(locale === 'ar' ? 'ar' : 'en', { maximumFractionDigits: 2 })} {t.kgWeek}</dd></div>}
                <div className="flex justify-between gap-3"><dt>{t.duration}</dt><dd>{evaluated.plan.weeksToGoal === null ? body.goal === 'maintain' ? t.maintained : t.noTimeline : `${number(evaluated.plan.weeksToGoal)} ${t.weeks}`}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">{t.formula}</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t.estimateNote}</p>
              {evaluated.plan.notes.slice(1).map((note) => <p key={note} className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{locale === 'ar' ? arabicPlanNotes[note] ?? note : note}</p>)}
            </> : <p className="mt-3 text-sm text-[var(--muted)]">{t.previewHint}</p>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">{t.adultNote}</p>
          {(errors.form || saveError) && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.form || saveError}</p>}
        </div>}
        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--border)] pt-5">
          <button type="button" onClick={onClose} className="btn-soft rounded-xl px-4 py-3 text-sm font-semibold">{t.cancel}</button>
          <button type="submit" className="btn rounded-xl bg-[var(--green-dark)] px-5 py-3 text-sm font-semibold text-white dark:bg-[var(--green)] dark:text-[#173b25]">{tab === 'manual' ? t.save : t.apply}</button>
        </div>
      </form>
    </div>
  </div>;
}
