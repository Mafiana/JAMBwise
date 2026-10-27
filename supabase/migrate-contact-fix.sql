-- Run once in the Supabase SQL Editor. Safe to run again. No Edge Function needs deploying for this.
-- Fixes: the contact form said "Your message could not be sent" because the messages table had no abuse_key column
-- (it is used only to rate-limit spam). This adds it and refreshes the API's view of the table.

alter table public.messages add column if not exists abuse_key text;
create index if not exists messages_abuse_idx on public.messages (abuse_key, created_at desc);
notify pgrst, 'reload schema';
