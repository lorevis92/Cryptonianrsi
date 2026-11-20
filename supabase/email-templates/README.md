# Email di Cryptonian RSI (Supabase Auth)

Modelli HTML nello stile dell'app (nero e oro), in italiano, con tabelle e stili in linea per funzionare
su Gmail, Apple Mail, Outlook e i client del telefono. Larghezza massima 560 px.

Dove incollarli: **Supabase → Authentication → Emails → Templates**. Per ogni modello: scrivi l'oggetto,
incolla tutto il file nel campo "Message body" (scheda Source) e salva.

| Modello in Supabase | File | Oggetto |
|---|---|---|
| Confirm signup | `conferma-registrazione.html` | Conferma la tua email · Cryptonian RSI |
| Reset password | `reimposta-password.html` | Scegli una nuova password · Cryptonian RSI |
| Change email address | `cambio-email.html` | Conferma il nuovo indirizzo · Cryptonian RSI |
| Invite user | `invito.html` | Sei invitato su Cryptonian RSI |

Variabili di Supabase usate: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`
(il Site URL deve essere l'indirizzo pubblico dell'app, così i link a /privacy e /termini funzionano).
Il modello "Magic Link" non serve più: l'app non usa più l'accesso con link.

Con le impostazioni attuali ("Confirm email" e "Secure email change" spenti) Supabase NON manda né la conferma
della registrazione né quella del cambio email: servono solo **Reset password** e, se inviti utenti, **Invite user**.
Gli altri due modelli restano qui pronti nel caso un giorno si riattivi la conferma.
