import type { Metadata } from 'next';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'A7sbha — A little balance, every day',
  description: 'Track calories, protein, carbs and fats with Arabic and English food search, a local journal, and optional AI food photo and description estimates you can review.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{ __html: `try{const s=JSON.parse(localStorage.getItem('a7sbha.local.v1')||'null');const d=s?.theme==='dark';document.documentElement.classList.toggle('dark',d);document.documentElement.lang=s?.locale==='ar'?'ar':'en';document.documentElement.dir=s?.locale==='ar'?'rtl':'ltr'}catch{}` }} />{children}</body></html>;
}
