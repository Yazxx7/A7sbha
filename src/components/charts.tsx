'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, Minus } from 'lucide-react';
import { formatDate, isDateKey, shiftDate } from '@/lib/dates';
import { dailyNutrients } from '@/lib/nutrition';
import type { Goals, Locale, Meal, Nutrients, WeightEntry } from '@/lib/types';

type Metric = keyof Nutrients;
const metrics: { key: Metric; en: string; ar: string }[] = [
  { key: 'calories', en: 'Calories', ar: 'السعرات' },
  { key: 'protein', en: 'Protein', ar: 'البروتين' },
  { key: 'carbs', en: 'Carbs', ar: 'الكارب' },
  { key: 'fat', en: 'Fats', ar: 'الدهون' },
];
const label = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;
const number = (value: number, locale: Locale, digits = 0) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-OM' : 'en-US', { maximumFractionDigits: digits }).format(value);
const weekday = (date: string, locale: Locale) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM' : 'en-US', { weekday: 'short' }).format(new Date(year, month - 1, day, 12));
};
const chartDate = (date: string, locale: Locale) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM' : 'en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day, 12));
};
const dayTimestamp = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export function NutritionChart({ meals, goals, date, locale, onSelectDate }: {
  meals: Meal[]; goals: Goals; date: string; locale: Locale; onSelectDate: (date: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>('calories');
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(date, index - 6);
    return { date: day, nutrients: dailyNutrients(meals, day), logged: meals.some((meal) => meal.date === day) };
  }), [date, meals]);
  const goal = goals[metric];
  const maximum = Math.max(goal, ...days.map((day) => day.nutrients[metric]), 1) * 1.15;
  const hasMeals = days.some((day) => day.logged);
  const total = days.reduce((sum, day) => sum + day.nutrients[metric], 0);
  const loggedDays = days.filter((day) => day.logged).length;
  const unit = metric === 'calories' ? label(locale, 'kcal', 'سعرة') : label(locale, 'g', 'غ');
  const currentMetric = metrics.find((item) => item.key === metric)!;

  return <section className="min-w-0 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6" aria-label={label(locale, 'Weekly nutrition progress', 'التقدم الغذائي الأسبوعي')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-[var(--ink)] sm:text-lg">{label(locale, 'Your week, at a glance', 'أسبوعك في لمحة')}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{label(locale, 'Small steps. A healthier you.', 'خطوات صغيرة لصحة أفضل.')}</p>
      </div>
      <span className="rounded-lg bg-[var(--soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted)]" dir="auto">{chartDate(days[0].date, locale)} – {chartDate(date, locale)}</span>
    </div>

    <div className="mt-5 flex gap-1 rounded-xl bg-[var(--canvas)] p-1" role="group" aria-label={label(locale, 'Chart nutrient', 'العنصر الغذائي في الرسم')}>
      {metrics.map((item) => <button key={item.key} type="button" onClick={() => setMetric(item.key)} aria-pressed={metric === item.key}
        className={`min-w-0 flex-1 rounded-lg px-1.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)] ${metric === item.key ? 'bg-[var(--surface)] text-[var(--green)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
        {label(locale, item.en, item.ar)}
      </button>)}
    </div>

    <div className="mt-5 flex items-baseline gap-2" aria-live="polite" aria-atomic="true">
      <span className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{number(total, locale, metric === 'calories' ? 0 : 1)}</span>
      <span className="text-xs text-[var(--muted)]">{unit} {label(locale, 'logged this week', 'مسجلة هذا الأسبوع')}</span>
    </div>

    <div className="mt-5 flex gap-3" dir="ltr">
      <div className="relative h-44 w-9 shrink-0 text-[10px] text-[var(--muted)]" aria-hidden="true">
        {[1, 0.5, 0].map((ratio) => <span key={ratio} className="absolute right-0" style={{ top: `${(1 - ratio) * 100}%`, transform: ratio === 0 ? 'translateY(-100%)' : 'translateY(-50%)' }}>{number(maximum * ratio, locale)}</span>)}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden="true">
          {[0, 50, 100].map((position) => <div key={position} className="absolute inset-x-0 border-t border-[var(--border)]" style={{ top: `${position}%` }} />)}
          <div className="absolute inset-x-0 border-t border-dashed border-[var(--green)] opacity-65" style={{ bottom: `${goal / maximum * 100}%` }} />
        </div>
        <div className="relative grid grid-cols-7 gap-1.5 sm:gap-3">
          {days.map((day) => {
            const value = day.nutrients[metric];
            const selected = day.date === date;
            const dayLabel = `${formatDate(day.date, locale)}: ${number(value, locale, metric === 'calories' ? 0 : 1)} ${unit}${day.logged ? '' : label(locale, ', no meals logged', '، لا توجد وجبات مسجلة')}`;
            return <button key={day.date} type="button" onClick={() => onSelectDate(day.date)} aria-label={dayLabel} aria-pressed={selected} title={dayLabel}
              className="group min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--green)]">
              <span className="flex h-44 items-end justify-center">
                {value > 0 ? <span className={`block w-full max-w-9 rounded-t-lg transition-colors duration-200 ${selected ? 'bg-[var(--green)]' : 'bg-[var(--accent)] group-hover:bg-[var(--green)]'}`} style={{ height: `${value / maximum * 100}%`, minHeight: 2 }} />
                  : <span className="mb-px h-1 w-3 rounded-full bg-[var(--border)]" />}
              </span>
              <span className={`mt-3 block text-[10px] sm:text-xs ${selected ? 'font-bold text-[var(--green)]' : 'text-[var(--muted)]'}`}>{weekday(day.date, locale)}</span>
              <span className="mt-1 block text-[9px] text-[var(--muted)] sm:text-[10px]">{number(value, locale)}</span>
            </button>;
          })}
        </div>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-[10px] text-[var(--muted)] sm:text-xs">
      <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--green)]" aria-hidden="true" />{label(locale, currentMetric.en, currentMetric.ar)}</span>
      <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-[var(--green)]" aria-hidden="true" />{label(locale, 'Daily goal', 'الهدف اليومي')}: {number(goal, locale)} {unit}</span>
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">{hasMeals ? label(locale, `${loggedDays} of 7 days logged. Select a day to view its meals.`, `سجلت وجبات في ${number(loggedDays, locale)} من ٧ أيام. اختر يوماً لعرض وجباته.`) : label(locale, 'Your progress starts with your first meal. Days without entries show 0 logged.', 'يبدأ تقدمك مع أول وجبة. الأيام بدون وجبات تعرض صفراً مسجلاً.')}</p>
  </section>;
}

export function WeightChart({ weights, target, locale }: { weights: WeightEntry[]; target?: number; locale: Locale }) {
  const chartId = useId();
  const entries = useMemo(() => {
    const byDate = new Map<string, WeightEntry>();
    weights.filter((entry) => isDateKey(entry.date) && Number.isFinite(entry.weight) && entry.weight > 0)
      .forEach((entry) => byDate.set(entry.date, entry));
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [weights]);
  const validTarget = target !== undefined && Number.isFinite(target) && target > 0 ? target : undefined;
  const latest = entries.at(-1);
  const change = entries.length > 1 ? entries[entries.length - 1].weight - entries[0].weight : 0;
  const ChangeIcon = change < 0 ? ArrowDownRight : change > 0 ? ArrowUpRight : Minus;
  const width = 600;
  const height = 190;
  const left = 43;
  const right = 12;
  const top = 18;
  const bottom = 31;
  const minimumWeight = Math.min(...entries.map((entry) => entry.weight), validTarget ?? Infinity);
  const maximumWeight = Math.max(...entries.map((entry) => entry.weight), validTarget ?? -Infinity);
  const margin = Math.max((maximumWeight - minimumWeight) * 0.25, 1);
  const minimum = minimumWeight - margin;
  const maximum = maximumWeight + margin;
  const firstTime = entries.length ? dayTimestamp(entries[0].date) : 0;
  const lastTime = entries.length ? dayTimestamp(entries[entries.length - 1].date) : 0;
  const x = (date: string) => left + (dayTimestamp(date) - firstTime) / Math.max(lastTime - firstTime, 1) * (width - left - right);
  const y = (weight: number) => top + (maximum - weight) / (maximum - minimum) * (height - top - bottom);
  const path = entries.map((entry, index) => `${index === 0 ? 'M' : 'L'} ${x(entry.date)} ${y(entry.weight)}`).join(' ');
  const area = entries.length > 1 ? `${path} L ${x(entries[entries.length - 1].date)} ${height - bottom} L ${left} ${height - bottom} Z` : '';

  return <section className="min-w-0 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6" aria-label={label(locale, 'Weight progress', 'تقدم الوزن')}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-[var(--ink)] sm:text-lg">{label(locale, 'A little closer, every day', 'أقرب لهدفك كل يوم')}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{label(locale, 'Your weight journey', 'رحلتك مع الوزن')}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--green)]" aria-hidden="true"><ChartNoAxesCombined size={18} /></span>
    </div>

    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
      <div><span className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{latest ? number(latest.weight, locale, 1) : '—'}</span><span className="ms-2 text-sm text-[var(--muted)]">{label(locale, 'kg', 'كغ')}</span>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{latest ? `${label(locale, 'Last logged', 'آخر تسجيل')}: ${formatDate(latest.date, locale)}` : label(locale, 'No weight logged yet', 'لم تسجل وزنك بعد')}</p>
      </div>
      {entries.length > 1 && <span className="flex items-center gap-1 rounded-lg bg-[var(--soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--green)]"><ChangeIcon size={14} aria-hidden="true" />{change > 0 ? '+' : ''}{number(change, locale, 1)} {label(locale, 'kg since first entry', 'كغ منذ أول تسجيل')}</span>}
    </div>

    {entries.length < 2 ? <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--canvas)] px-5 text-center">
      <ChartNoAxesCombined className="mb-3 text-[var(--green)]" size={28} aria-hidden="true" />
      <p className="text-sm font-medium text-[var(--ink)]">{label(locale, 'Every journey starts somewhere', 'كل رحلة تبدأ بخطوة')}</p>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--muted)]">{label(locale, 'Log your weight on two different days to see your real trend.', 'سجل وزنك في يومين مختلفين لعرض تغير وزنك الفعلي.')}</p>
    </div> : <>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full overflow-visible" role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`} style={{ direction: 'ltr' }}>
        <title id={`${chartId}-title`}>{label(locale, 'Recorded weight over time', 'الوزن المسجل عبر الوقت')}</title>
        <desc id={`${chartId}-desc`}>{entries.map((entry) => `${formatDate(entry.date, locale)}: ${number(entry.weight, locale, 1)} ${label(locale, 'kg', 'كغ')}`).join('; ')}{validTarget !== undefined ? `; ${label(locale, 'Goal', 'الهدف')}: ${number(validTarget, locale, 1)} ${label(locale, 'kg', 'كغ')}` : ''}</desc>
        <defs><linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity="0.14" /><stop offset="100%" stopColor="var(--green)" stopOpacity="0.01" /></linearGradient></defs>
        {[0, 0.5, 1].map((ratio) => {
          const value = minimum + (maximum - minimum) * ratio;
          return <g key={ratio}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeWidth="1" /><text x={left - 9} y={y(value) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{number(value, locale, 1)}</text></g>;
        })}
        <path d={area} fill={`url(#${chartId}-fill)`} />
        {validTarget !== undefined && <line x1={left} x2={width - right} y1={y(validTarget)} y2={y(validTarget)} stroke="var(--green)" strokeOpacity="0.65" strokeDasharray="5 5" strokeWidth="1.5" />}
        <path d={path} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {entries.map((entry) => <circle key={entry.id} cx={x(entry.date)} cy={y(entry.weight)} r="3.7" fill="var(--surface)" stroke="var(--green)" strokeWidth="2"><title>{formatDate(entry.date, locale)}: {number(entry.weight, locale, 1)} {label(locale, 'kg', 'كغ')}</title></circle>)}
        <text x={left} y={height - 6} textAnchor="start" fontSize="10" fill="var(--muted)">{chartDate(entries[0].date, locale)}</text>
        <text x={width - right} y={height - 6} textAnchor="end" fontSize="10" fill="var(--muted)">{chartDate(entries[entries.length - 1].date, locale)}</text>
      </svg>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{label(locale, 'Points show your recorded measurements, spaced by date.', 'النقاط هي قياساتك المسجلة، والمسافات بينها حسب التاريخ.')}</p>
    </>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-[11px] text-[var(--muted)]">
      <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--green)]" aria-hidden="true" />{number(entries.length, locale)} {label(locale, 'recorded days', 'أيام مسجلة')}</span>
      {validTarget !== undefined && <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-[var(--green)]" aria-hidden="true" />{label(locale, 'Goal', 'الهدف')}: {number(validTarget, locale, 1)} {label(locale, 'kg', 'كغ')}</span>}
    </div>
  </section>;
}
