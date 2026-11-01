# Upgrade dell'immagine

L'immagine esegue le migrazioni Drizzle all'avvio tramite `docker-entrypoint.sh`.
Le migrazioni sono **solo in avanti**: un rollback a una versione precedente può
trovare uno schema più nuovo di quello che conosce. Per questo il backup è
obbligatorio prima di ogni upgrade.

## Procedura

Dalla cartella del progetto:

```powershell
# 1. Backup a container fermo (vedi docs/backup.md)
docker compose stop app
New-Item -ItemType Directory -Force backup | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
docker run --rm -v dnd-vtt_dnd-data:/data -v "${PWD}\backup:/backup" alpine:3.20 `
  tar czf "/backup/dnd-data-pre-upgrade-$stamp.tar.gz" -C /data .
docker compose start app
$archive = ".\backup\dnd-data-pre-upgrade-$stamp.tar.gz"
Get-Item $archive | Select-Object FullName, Length

# 2. Scarica la nuova immagine
docker compose pull app

# 3. Ricrea il container (riesegue l'entrypoint con le migrazioni)
docker compose up -d app

# 4. Verifica
docker compose ps
Invoke-RestMethod http://localhost:3000/api/v1/health
docker compose logs --tail=100 app
```

Conserva `$archive`: è il percorso esatto da passare al restore se il rollback
non basta.

Se usi il profilo TLS, aggiorna anche Caddy:

```powershell
docker compose --profile tls pull
docker compose --profile tls up -d
```

## Cosa succede alle migrazioni

- L'entrypoint esegue `node server/dist/db/migrate-cli.js` prima del server.
  Se la migrazione fallisce, il container termina e non espone un'app a metà
  schema: `docker compose ps` lo mostra in restart/exit.
- `migrate-cli` è idempotente: a ogni riavvio applica solo le migrazioni
  mancanti.
- Il server da solo **non** applica DDL (controlla e segnala
  `db: 'migration_pending'` su `/api/v1/health`), quindi non avviare
  `node server/dist/index.js` bypassando l'entrypoint.
- Se hai bisogno di fermare le migrazioni automatiche per un intervento
  manuale: `SKIP_MIGRATIONS=true` come variabile d'ambiente del container. Non
  è il percorso normale e non va lasciato attivo.

## Rollback

1. Individua la versione precedente tra i tag GHCR (`vX.Y.Z`) o nella cronologia
   delle release.
2. Nel `docker-compose.yml` sostituisci:

   ```yaml
   image: ghcr.io/dardino/dnd-vtt:latest
   ```

   con il tag stabile, per esempio:

   ```yaml
   image: ghcr.io/dardino/dnd-vtt:v0.1.0
   ```

3. Pull e riavvio:

   ```powershell
   docker compose pull app
   docker compose up -d app
   ```

4. Se la versione precedente non parte o segnala migrazioni incompatibili
   (`db: 'migration_pending'`, errori di colonne mancanti), **ferma il
   container e ripristina il backup** creato al passo 1. Usa il percorso salvato
   in `$archive`, non il file più recente:

   ```powershell
   # Se hai riaperto la shell, reimposta il percorso salvato al passo 1:
   # $archive = '.\backup\dnd-data-pre-upgrade-20261101-120000.tar.gz'
   if (-not $archive -or -not (Test-Path $archive)) {
     throw 'Imposta $archive con il backup creato al passo 1'
   }
   docker compose down
   docker volume rm dnd-vtt_dnd-data
   docker volume create dnd-vtt_dnd-data
   docker run --rm `
     -v dnd-vtt_dnd-data:/data `
     -v "${PWD}\backup:/backup" `
     alpine:3.20 `
     sh -c "tar xzf '/backup/$(Split-Path $archive -Leaf)' -C /data && chown -R 1000:1000 /data"
   docker compose up -d
   ```

Non tentare di "tornare indietro" cancellando le righe da
`__drizzle_migrations`: il DB non viene de-migrato automaticamente.

## Dopo l'upgrade

- Rileggi `README.md` e `TODO.md` per breaking change o nuovi passi di
  configurazione (variabili d'ambiente, firewall, profilo TLS).
- Se l'upgrade introduce nuove variabili, aggiungile al `.env` prima del
  riavvio: i default restano validi, ma le variabili mancanti non vengono
  inventate.
- Conserva il backup pre-upgrade almeno fino a quando la campagna successiva
  è stata giocata senza errori.
