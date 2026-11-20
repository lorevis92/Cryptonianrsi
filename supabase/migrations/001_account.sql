-- ─────────────────────────────────────────────────────────────────────────────
-- Cryptonian RSI · account utente (Supabase)
-- Da eseguire una volta in Supabase > SQL Editor. Si può rieseguire: non duplica nulla.
--
-- Regole:
--  - RLS attiva su ogni tabella; nessun accesso per "anon" (chi non ha fatto il login).
--  - Ogni utente vede e modifica solo le proprie righe (auth.uid() = user_id).
--  - Le colonne delicate (piano, chat Telegram) le scrive solo il server con la service role:
--    all'utente diamo il permesso di UPDATE solo sulle colonne che può davvero cambiare.
-- ─────────────────────────────────────────────────────────────────────────────

-- Profilo ───────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text check (name is null or char_length(name) <= 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 200),
  plan        text not null default 'free' check (plan in ('free', 'pro', 'cryptonian')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Impostazioni sincronizzate tra i dispositivi ───────────────────────────────────
create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  favorites  text[] not null default '{}' check (cardinality(favorites) <= 100 and pg_column_size(favorites) < 4000),
  risk       jsonb not null default '{}'::jsonb check (jsonb_typeof(risk) = 'object' and pg_column_size(risk) < 2000),
  indicator  jsonb not null default '{}'::jsonb check (jsonb_typeof(indicator) = 'object' and pg_column_size(indicator) < 2000),
  updated_at timestamptz not null default now()
);

-- Notifiche Telegram ────────────────────────────────────────────────────────────
create table if not exists public.alert_subscriptions (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  symbols          jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(symbols) = 'array' and jsonb_array_length(symbols) <= 20),
  rule             jsonb not null default '{"tfs":["3m","5m"],"lower":20,"upper":80}'::jsonb
                   check (jsonb_typeof(rule) = 'object' and pg_column_size(rule) < 1000),
  telegram_chat_id bigint unique,          -- scritto solo dal server (webhook del bot)
  telegram_name    text,                   -- scritto solo dal server
  updated_at       timestamptz not null default now()
);
create index if not exists alert_subscriptions_linked on public.alert_subscriptions (user_id) where telegram_chat_id is not null;

-- updated_at automatico ─────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();
drop trigger if exists alert_subscriptions_touch on public.alert_subscriptions;
create trigger alert_subscriptions_touch before update on public.alert_subscriptions for each row execute function public.touch_updated_at();

-- Righe create in automatico alla registrazione ─────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 60))
    on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.alert_subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Permessi: niente per anon; per gli utenti solo ciò che serve ─────────────────────
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.alert_subscriptions enable row level security;

revoke all on public.profiles, public.user_settings, public.alert_subscriptions from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (name, avatar_path) on public.profiles to authenticated;           -- il piano no: lo cambia il server

grant select on public.user_settings to authenticated;
grant update (favorites, risk, indicator) on public.user_settings to authenticated;

grant select on public.alert_subscriptions to authenticated;
grant update (symbols, rule) on public.alert_subscriptions to authenticated;      -- la chat Telegram no

-- Il server (service role) deve poter fare tutto: con l'accesso automatico spento va concesso esplicitamente
grant all on public.profiles, public.user_settings, public.alert_subscriptions to service_role;

-- Regole RLS: solo le proprie righe ───────────────────────────────────────────────
drop policy if exists "profilo: leggo il mio" on public.profiles;
create policy "profilo: leggo il mio" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profilo: modifico il mio" on public.profiles;
create policy "profilo: modifico il mio" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "impostazioni: leggo le mie" on public.user_settings;
create policy "impostazioni: leggo le mie" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "impostazioni: modifico le mie" on public.user_settings;
create policy "impostazioni: modifico le mie" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "notifiche: leggo le mie" on public.alert_subscriptions;
create policy "notifiche: leggo le mie" on public.alert_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "notifiche: modifico le mie" on public.alert_subscriptions;
create policy "notifiche: modifico le mie" on public.alert_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Foto profilo: bucket privato, ogni utente solo nella sua cartella <uid>/ ───────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/jpeg'];

drop policy if exists "avatar: leggo il mio" on storage.objects;
create policy "avatar: leggo il mio" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatar: carico il mio" on storage.objects;
create policy "avatar: carico il mio" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatar: aggiorno il mio" on storage.objects;
create policy "avatar: aggiorno il mio" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatar: cancello il mio" on storage.objects;
create policy "avatar: cancello il mio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Utenti già registrati prima di questo script (se ce ne sono): creo le righe mancanti
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
insert into public.user_settings (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.alert_subscriptions (user_id) select id from auth.users on conflict (user_id) do nothing;
