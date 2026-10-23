-- Clears EVERYTHING on the shared scam list (all clues, reports and operations).
-- Use it once before launch to remove test data. Accounts are not touched.
-- Supabase: SQL Editor > New query > paste > Run.
truncate table public.report_indicators, public.indicator_reporters, public.reports, public.indicators restart identity;
