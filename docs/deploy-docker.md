# Deploy con Docker

L'immagine `ghcr.io/dardino/dnd-vtt` contiene un solo processo Fastify che serve
API, WebSocket e il client Angular compilato. Database SQLite, upload e segreto
di sessione stanno in un named volume (`/app/data`), quindi sopravvivono a
`docker compose down` e agli aggiornamenti dell'immagine.

## Prerequisiti

- Windows 10/11 con **Docker Desktop** (backend WSL2) e Docker Compose v2.
- Server su **linux/amd64** (PC/NAS) oppure **linux/arm64** (Pi 4/5, NAS recente).
  Il **Raspberry Pi 1 è ARMv6 a 32 bit** e non può eseguire l'immagine `arm64`:
  usalo solo come client display (vedi sotto).
- Almeno 1 GB di RAM libera per il container; 2 GB consigliati se tieni molte
  mappe e più display connessi.
- `docker compose version` deve rispondere (plugin Compose v2, **≥ 2.24** per
  `env_file` con `required: false`).

Verifica l'architettura del server:

```sh
uname -m        # x86_64 = amd64; aarch64 = arm64; armv6l = Pi 1, non supportato
```

## 1. Configurazione `.env`

Nella cartella del progetto (quella con `docker-compose.yml`):

```powershell
Copy-Item .env.example .env
```

Poi modifica `.env`. Per un server in LAN con IP `192.168.1.50`:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# Usa l'IP LAN (o un nome host) che i dispositivi raggiungono davvero.
PUBLIC_URL=http://192.168.1.50:3000
ALLOWED_ORIGINS=http://192.168.1.50:3000

DM_PASSWORD=cambia-questa-password
# Opzionale ma consigliata: almeno 32 caratteri.
SESSION_SECRET=

COOKIE_SECURE=auto
DATABASE_PATH=data/dnd.db
UPLOAD_DIR=data/uploads
CLIENT_DIST=client/dist/browser
LOG_LEVEL=info
```

Note:

- `DM_PASSWORD` è **obbligatoria** quando `HOST` o `PUBLIC_URL` non sono
  loopback: senza password il server non parte.
- `PUBLIC_URL` determina l'allowlist degli `Host` e il controllo `Origin`:
  se resta `localhost`, aprendo il VTT dall'IP LAN le richieste vengono
  rifiutate con `Host non consentito`.
- `SESSION_SECRET` vuota fa generare un segreto in `data/.session-secret`
  dentro il volume. Impostala solo se vuoi gestirla tu (minimo 32 caratteri).
- Non committare `.env`: è già in `.gitignore` e in `.dockerignore`.
- Se `.env` manca, Compose avvia comunque il container (`env_file` è
  opzionale), ma `createEnv` lo ferma con un errore esplicito su `DM_PASSWORD`
  o `PUBLIC_URL`: è il comportamento voluto, non un avvio silenzioso.

`docker-compose.yml` forza comunque `HOST=0.0.0.0`, `PORT=3000` e i path di
runtime: le variabili equivalenti nel `.env` non servono a cambiare il
container, ma restano utili per coerenza con l'uso da sorgente.

## 2. Avvio

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

Se il package non è ancora pubblicato o non hai effettuato il login a GHCR, puoi
compilare in locale con `docker compose up -d --build` (la prima build richiede
qualche minuto e scarica gli strumenti per le dipendenze native).

Il primo avvio dell'immagine esegue automaticamente
`node server/dist/db/migrate-cli.js` e poi `node server/dist/index.js`
(`docker-entrypoint.sh`). Le migrazioni girano a ogni avvio e sono idempotenti.

Apri `http://192.168.1.50:3000/` (console DM su `/dm`).

Per caricare la campagna demo su un volume vuoto:

```powershell
docker compose exec app node server/dist/db/seed-cli.js
```

Il seed si rifiuta di duplicare i dati se esiste già una campagna.

Per compilare l'immagine dai sorgenti invece di usare GHCR:

```powershell
docker compose build app
docker compose up -d
```

## 3. Verifica e diagnostica

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
# status: ok, db: ok, version, srdVersion

docker compose ps                 # app healthy
docker compose logs -f app
docker inspect --format '{{.State.Health.Status}}' dnd-vtt-app-1
```

Se `db` è `migration_pending`, le migrazioni non sono state applicate: guarda i
log dell'entrypoint e verifica che `server/drizzle` sia presente nell'immagine.

Healthcheck dall'interno dell'immagine:

```powershell
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => r.text()).then(console.log)"
```

## 4. Stop, riavvio e volume

```powershell
docker compose stop          # ferma senza rimuovere i container
docker compose start
docker compose down          # rimuove i container, conserva il volume
docker compose down -v       # ATTENZIONE: elimina anche dnd-data (DB e upload)
```

Il volume si chiama `dnd-vtt_dnd-data` (deriva da `name: dnd-vtt`). Contiene:

- `dnd.db`, `dnd.db-wal`, `dnd.db-shm`;
- `uploads/` (WebP serviti, thumbnail, `originals/`);
- `.session-secret`.

Su Windows usa sempre il **named volume** (già configurato): SQLite su bind
mount Windows può avere locking lento o errato.

## 5. Firewall e rete

- Apri la porta **TCP 3000** solo sul profilo **Privato** di Windows Defender
  Firewall (Regole connessioni in entrata → Nuova regola → Porta → TCP 3000).
- Non fare port forwarding sul router e non pubblicare l'app su internet: il
  progetto non è ancora "internet-ready" (vedi S7–S9 in `TODO.md`).
- Se cambi IP al server, aggiorna `PUBLIC_URL`/`ALLOWED_ORIGINS` e riavvia il
  container. Un IP statico o una prenotazione DHCP evitano sorprese.
- `docker compose ps` deve mostrare `0.0.0.0:3000->3000/tcp`.

## 6. Raspberry Pi 1 come display

Il Pi 1 non esegue il server. Può aprire `/display/:codice` in un browser kiosk,
in teoria a 720p; Angular + Konva su 700 MHz e 512 MB sono al limite.

- Verifica la versione di Chromium disponibile: se il bundle Angular non parte,
  serve hardware più recente (Pi 4/5, Zero 2 W) o un client display dedicato.
- Il display deve avere accesso di rete al server sulla porta 3000.
- Test pratico: apri il codice display dal DM, verifica fullscreen, pan/zoom e
  aggiornamento via WebSocket; se gli fps sono inaccettabili, cambia hardware.
- La validazione sul dispositivo reale è ancora aperta in `TODO.md` (D9).

## 7. Profilo TLS con Caddy (opzionale, per S7)

Serve per provare HTTPS in LAN senza modificare l'app. Non è la configurazione
predefinita e **non** completa il passo S7: il server usa ancora
`trustProxy: false`, quindi dietro Caddy il rate limit vede l'IP del proxy e
mancano HSTS e la verifica dell'IP reale.

1. Aggiungi al `.env`:

   ```dotenv
   DND_PUBLIC_HOST=dnd.lan
   PUBLIC_URL=https://dnd.lan
   ALLOWED_ORIGINS=https://dnd.lan
   COOKIE_SECURE=auto
   ```

2. Avvia con il profilo:

   ```powershell
   docker compose --profile tls up -d
   ```

   Caddy ascolta 80/443 e inoltra a `app:3000`; il certificato è emesso da una
   CA interna (`tls internal` in `deploy/Caddyfile`).

3. Esporta e installa la CA sui client che devono usare HTTPS:

   ```powershell
   docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .\caddy-root.crt
   ```

   Il file `root.crt` esiste solo dopo il primo avvio di Caddy con un
   certificato emesso: se il comando fallisce, controlla
   `docker compose logs caddy` e apri il sito HTTPS almeno una volta. Evita
   `docker compose exec caddy cat ... > file` in PowerShell: il redirect non è
   binario-safe e può corrompere il PEM (oltre a richiedere `-T` per i TTY).

   Su Windows: doppio click sul `.crt` → Installa certificato → Computer locale
   → Autorità di certificazione radice attendibili. Su telefoni/tablet importa
   lo stesso file nelle impostazioni di sicurezza.

4. `dnd.lan` deve risolvere verso l'IP del server (DNS locale o file `hosts`).

In alternativa, su una rete fidata puoi restare in HTTP sulla porta 3000.

Con il profilo TLS attivo, la mappatura `3000:3000` del servizio `app` espone
ancora HTTP diretto: se vuoi che tutto passi da Caddy, commenta quella riga in
`docker-compose.yml` (l'healthcheck e Caddy raggiungono l'app via rete interna).

## 8. Immagine, tag e visibilità

- Registry: GitHub Container Registry, `ghcr.io/dardino/dnd-vtt`.
- Tag pubblicati dalla workflow `release.yml`: `latest` (ultima `main`),
  `edge` (ultima `main`), `vX.Y.Z` (tag git), `sha-<short>`.
- Piattaforme: `linux/amd64` e `linux/arm64`.
- Dopo il primo push il package GHCR è **privato** per default: nelle
  impostazioni del package su GitHub scegli **Public** se vuoi il pull anonimo
  (coerente con il repository pubblico). Finché è privato serve un login:
  `docker login ghcr.io` con un PAT con scope `read:packages`.
- La scansione Trivy in CI è **non bloccante** finché S9 non la rende tale.
- L'immagine prodotta da questa configurazione **non è stata verificata con
  `docker build` nell'ambiente di sviluppo** (Docker non disponibile): la prima
  build va controllata su Docker Desktop prima di fidarsi della release.
