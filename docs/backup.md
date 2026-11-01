# Backup e restore

Tutto lo stato persistente del VTT sta nel volume `dnd-vtt_dnd-data` montato su
`/app/data`:

- `dnd.db` (+ `dnd.db-wal`, `dnd.db-shm`) — campagne, scene, attori, note;
- `uploads/` — mappe, ritratti, WebP e `originals/`;
- `.session-secret` — firma dei cookie DM.

Il backup corretto è **a container fermo**: SQLite in modalità WAL non va
copiato mentre il server scrive, e il tar di un DB aperto può essere incoerente.

> Il backup contiene note private del DM, link giocatore e il segreto di
> sessione: trattalo come materiale sensibile. Conservalo cifrato (BitLocker,
> 7-Zip con password, volume cifrato) e non condividerlo.

## Backup (Windows PowerShell)

```powershell
# Dalla cartella che contiene docker-compose.yml
docker compose stop app

New-Item -ItemType Directory -Force backup | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

docker run --rm `
  -v dnd-vtt_dnd-data:/data `
  -v "${PWD}\backup:/backup" `
  alpine:3.20 `
  tar czf "/backup/dnd-data-$stamp.tar.gz" -C /data .

docker compose start app
```

Il file finisce in `.\backup\dnd-data-YYYYMMDD-HHmmss.tar.gz`. Verifica che non
sia vuoto e che contenga `dnd.db`:

```powershell
$a = Get-ChildItem .\backup\dnd-data-*.tar.gz |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
tar tzf $a.FullName | Select-String 'dnd.db|uploads/|\.session-secret'
```

Su Linux/macOS lo stesso comando funziona con `$(date +%Y%m%d-%H%M%S)` e
`"$PWD/backup:/backup"`.

## Backup del solo database SQLite

Se ti serve solo il DB (senza upload), ferma comunque il container e copia i tre
file insieme:

```powershell
docker compose stop app
docker run --rm `
  -v dnd-vtt_dnd-data:/data `
  -v "${PWD}\backup:/backup" `
  alpine:3.20 `
  sh -c 'tar czf /backup/dnd-db.tar.gz -C /data dnd.db dnd.db-wal dnd.db-shm || tar czf /backup/dnd-db.tar.gz -C /data dnd.db'
docker compose start app
```

Il comando copia anche `dnd.db-wal` e `dnd.db-shm` quando esistono. Non copiare
mai il solo `dnd.db` a container acceso: se i file WAL non ci sono, alla
chiusura SQLite ha già consolidato il database; se ci sono, vanno inclusi
nell'archivio.

## Restore

1. Ferma tutto e conserva il volume attuale (nel dubbio, fai prima un backup):

   ```powershell
   docker compose down
   docker volume rm dnd-vtt_dnd-data
   docker volume create dnd-vtt_dnd-data
   ```

2. Estrai l'archivio nel volume e riallinea i permessi all'utente `node`
   (UID/GID 1000) dell'immagine:

   ```powershell
   # Sostituisci con il percorso esatto del backup scelto (deve stare in .\backup).
   $archive = '.\backup\dnd-data-20261101-120000.tar.gz'
   if (-not (Test-Path $archive)) { throw "Backup non trovato: $archive" }

   docker run --rm `
     -v dnd-vtt_dnd-data:/data `
     -v "${PWD}\backup:/backup" `
     alpine:3.20 `
     sh -c "tar xzf '/backup/$(Split-Path $archive -Leaf)' -C /data && chown -R 1000:1000 /data"
   ```

3. Riavvia e verifica:

   ```powershell
   docker compose up -d
   docker compose ps
   Invoke-RestMethod http://localhost:3000/api/v1/health
   ```

Il ripristino di `.session-secret` mantiene validi i cookie DM emessi prima del
backup. Se il file è compromesso, cancellalo dal volume e riavvia: il server ne
genera uno nuovo e tutte le sessioni DM decadono (i link giocatore restano nel
DB e continuano a funzionare).

## Frequenza consigliata

- Prima di ogni upgrade dell'immagine (obbligatorio, vedi `docs/upgrade.md`).
- Prima di import/export massivi o modifiche manuali al DB.
- Periodicamente a campagna attiva; conserva più generazioni e almeno una copia
  fuori dal disco del server.
