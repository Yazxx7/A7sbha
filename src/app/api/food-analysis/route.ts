import 'server-only';
import { createFoodAnalysisHandlers } from '@/lib/analysis.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const handlers = createFoodAnalysisHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
