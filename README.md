# Albo Pretorio Watcher

Servizio moderno (Node.js + TypeScript) che:
- visita le pagine “Albo Pretorio” dei comuni (portali jCityGov/Liferay)
- rileva le nuove pubblicazioni, apre il “Dettaglio” per arricchire i dati (allegati, ecc.)
- genera un breve riepilogo con OpenRouter (modello configurabile)
- invia aggiornamenti formattati in Markdown su un gruppo/canale Telegram

Prima integrazione: Comune di Ariano Irpino.

## Caratteristiche
- Compatibile con il portale “trasparenza-valutazione-merito” (jCityGov/Liferay)
- Estrazione di: Anno/Numero, Categoria/Tipo atto, Oggetto, Periodo pubblicazione, Link Dettaglio, Allegati
- Riepilogo AI con OpenRouter (modello impostabile con `OPENROUTER_MODEL`)
- Notifiche Telegram in MarkdownV2 con suddivisione automatica dei messaggi lunghi
- Stato idempotente su Netlify KV (predefinito) o file JSON locale
- Pronto per Netlify Scheduled Functions; eseguibile anche da CLI

## Requisiti
- Node.js 18+

## Configurazione (env)
1. Copia `.env.example` in `.env`
2. Imposta le variabili minime:
   - `OPENROUTER_API_KEY` (chiave OpenRouter)
   - `TELEGRAM_BOT_TOKEN` (token bot Telegram)
   - `TELEGRAM_CHAT_ID` (ID del gruppo/canale destinazione)
   - Facoltative: `MUNICIPALITY_URL`, `OPENROUTER_MODEL`, `TIMEZONE`, `STATE_BACKEND`, ecc.

Vedi sezione “Telegram: come creare il bot e ottenere i token/ID”.

## Avvio rapido (locale)
1. Installa dipendenze:
   ```bash
   npm install
   ```
2. Esegui in modalità prova (non invia messaggi):
   ```bash
   DRY_RUN=1 npm run scan
   ```
3. Esecuzione reale (invio messaggi se entro l’orario consentito):
   ```bash
   npm run scan
   ```

Nota orari: per impostazione predefinita, il servizio invia notifiche solo tra le 08:00 e le 20:00 (fuso `Europe/Rome`). Fuori fascia, non invia e non avanza lo stato (così le novità saranno notificate alla prima esecuzione utile).

## Telegram: come creare il bot e ottenere i token/ID

Di seguito i passaggi per configurare un bot e ottenere `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

1) Creare un bot con BotFather
- Apri Telegram e cerca “@BotFather”
- Avvia la chat e invia `/newbot`
- Scegli un nome (es. “Albo Pretorio Ariano”) e uno username univoco terminante in `bot` (es. `albo_ariano_bot`)
- BotFather risponderà con il `token` del bot (stringa tipo `123456:ABC-...`)
- Copia il token nel tuo `.env` come `TELEGRAM_BOT_TOKEN`

2) Impostare la privacy del bot (facoltativo, consigliato per gruppi)
- In BotFather invia `/setprivacy`
- Seleziona il tuo bot
- Scegli `Disable` per permettere al bot di leggere tutti i messaggi del gruppo (non indispensabile per inviare, ma utile in certi casi)

3) Aggiungere il bot al gruppo o canale
- Crea (o apri) il gruppo/canale dove vuoi ricevere gli avvisi
- Aggiungi il bot come membro; per i canali, rendilo Amministratore con permesso di “Pubblicare messaggi”

4) Ottenere il `TELEGRAM_CHAT_ID`
Hai due modalità principali:

Metodo A — via getUpdates (universale)
- Invia un messaggio nel gruppo/canale dove è presente il bot (es. “ping”)
- Apri nel browser o via curl:
  ```
  https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
  ```
- Cerca nel JSON la sezione `message.chat.id` o `channel_post.chat.id`
- Per supergruppi/canali l’ID inizia tipicamente con `-100...`
- Copia il valore in `.env` come `TELEGRAM_CHAT_ID`

Metodo B — via username del gruppo/canale (se pubblico)
- Se il gruppo/canale ha uno username pubblico (es. `@mio_canale_pubblico`), puoi chiamare:
  ```
  https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getChat?chat_id=@mio_canale_pubblico
  ```
- Nel JSON, leggi il campo `id` e usalo come `TELEGRAM_CHAT_ID`

Test veloce dell’invio (opzionale)
```bash
curl -X POST \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "'$TELEGRAM_CHAT_ID'",
    "text": "Test Albo Pretorio Watcher",
    "parse_mode": "MarkdownV2"
  }'
```
Se ricevi il messaggio, bot e chat_id sono corretti.

Sicurezza: non committare mai il token nel repo, usa sempre variabili d’ambiente (locali o del provider di hosting).

## Deploy su Netlify (Scheduled Functions + KV)
1. Imposta le variabili d’ambiente nel pannello Netlify:
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (facoltativa, default `anthropic/claude-3.5-sonnet`)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `MUNICIPALITY_URL` (facoltativa)
   - `STATE_BACKEND=netlify-kv` (predefinito)
   - `TIMEZONE=Europe/Rome`
2. Le Scheduled Functions sono configurate in `netlify.toml` per eseguire la funzione `scan` ogni ora (cron `0 * * * *`).
3. Lo stato è gestito tramite Netlify KV usando `@netlify/blobs` (nessuna configurazione extra). Il codice collega automaticamente il contesto nella funzione con `connectLambda`.

## Personalizzazione
- Modello OpenRouter: `OPENROUTER_MODEL` (es. `anthropic/claude-3.5-sonnet`)
- URL del Comune: `MUNICIPALITY_URL`
- Fuso orario e orari silenziosi: `TIMEZONE` e la logica 08:00–20:00 in `src/run/scan.ts`
- Rate limiting e User-Agent: `RATE_LIMIT_RPS`, `USER_AGENT`

## Note tecniche
- Il parser è ottimizzato per portali jCityGov e tollera piccoli cambi HTML
- Formattazione Telegram in MarkdownV2 con escaping e suddivisione messaggi lunghi
- CLI pronta: `npm run scan` / `DRY_RUN=1 npm run scan`

## Licenza
MIT
