-- ─────────────────────────────────────────────────────────────────────────────
-- Prova delle regole RLS. Da eseguire in Supabase > SQL Editor DOPO 001_account.sql.
-- Crea due utenti finti, prova a leggere e modificare i dati dell'altro e alla fine annulla tutto
-- (ROLLBACK): non lascia niente nel database. Ogni riga del risultato deve dire "OK".
-- ─────────────────────────────────────────────────────────────────────────────
begin;

create temporary table esito (prova text, risultato text) on commit drop;
grant all on esito to authenticated, anon;

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-0000-0000-00000000000a', 'a@prova.test', '{"full_name":"Utente A"}', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-00000000000b', 'b@prova.test', '{"full_name":"Utente B"}', 'authenticated', 'authenticated');
update public.alert_subscriptions set telegram_chat_id = 111 where user_id = '00000000-0000-0000-0000-00000000000b';

-- Da qui sono l'utente A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into esito select 'A vede solo il proprio profilo', case when (select count(*) from public.profiles) = 1 then 'OK' else 'ERRORE' end;
insert into esito select 'A non vede le impostazioni di B', case when not exists (select 1 from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000b') then 'OK' else 'ERRORE' end;
insert into esito select 'A non vede la chat Telegram di B', case when not exists (select 1 from public.alert_subscriptions where telegram_chat_id = 111) then 'OK' else 'ERRORE' end;

with u as (update public.profiles set name = 'hack' where id = '00000000-0000-0000-0000-00000000000b' returning 1)
insert into esito select 'A non modifica il profilo di B', case when (select count(*) from u) = 0 then 'OK' else 'ERRORE' end;

with u as (update public.user_settings set favorites = '{BTCUSDT}' where user_id = '00000000-0000-0000-0000-00000000000a' returning 1)
insert into esito select 'A modifica i propri preferiti', case when (select count(*) from u) = 1 then 'OK' else 'ERRORE' end;

-- Colonne riservate al server: devono dare errore di permesso
do $$ begin
  begin update public.profiles set plan = 'cryptonian' where id = '00000000-0000-0000-0000-00000000000a';
        insert into esito values ('A non si cambia il piano da sé', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('A non si cambia il piano da sé', 'OK'); end;
  begin update public.alert_subscriptions set telegram_chat_id = 111 where user_id = '00000000-0000-0000-0000-00000000000a';
        insert into esito values ('A non si prende la chat Telegram di un altro', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('A non si prende la chat Telegram di un altro', 'OK'); end;
  begin insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000cc');
        insert into esito values ('A non crea profili', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('A non crea profili', 'OK'); end;
  begin delete from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000b';
        insert into esito values ('A non cancella dati altrui', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('A non cancella dati altrui', 'OK'); end;
end $$;

-- Senza login (anon): nessun accesso
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.profiles limit 1; insert into esito values ('Senza login non si legge niente', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('Senza login non si legge niente', 'OK'); end;
  begin perform 1 from public.alert_subscriptions limit 1; insert into esito values ('Senza login niente notifiche', 'ERRORE');
  exception when insufficient_privilege then insert into esito values ('Senza login niente notifiche', 'OK'); end;
end $$;

reset role;
select * from esito;
rollback;
