-- ─────────────────────────────────────────────────────────────────────────────
-- Cryptonian RSI · stato di un'email per i messaggi del login
-- Da eseguire una volta in Supabase > SQL Editor (dopo 001_account.sql). Si può rieseguire.
--
-- Dice solo se esiste un account con quell'email, se ha una password e con quali provider entra.
-- La può chiamare SOLO il server (service role), che la usa da /api/auth-check con un limite
-- di 10 richieste ogni 15 minuti per indirizzo IP: nessuno può provare in massa quali email sono registrate.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_email_status(p_email text)
returns table (found boolean, has_password boolean, providers text[])
language sql stable security definer set search_path = '' as $$
  select true,
         coalesce(u.encrypted_password, '') <> '',
         coalesce(array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers')), '{}')
  from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  limit 1
$$;

revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;
