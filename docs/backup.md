# Backup e restore

Tutto lo stato persistente del VTT sta nel volume `dnd-vtt_dnd-data` montato su
`/app/data`:

- `dnd.db` (+ `dnd.db-wal`, `dnd.db-shm`) — campagne, scene, attori, note;
- `uploads/` — mappe, ritratti, WebP e `originals/`;
- `.session-secret` — firma dei cookie DM.

Il backup corretto è **a container fermo**: SQLite in modalità WAL non va
copiato mentre il server scrive, e il tar di un DB aperto può essere incoerente.

> **Il backup contiene dati sensibili:** il database con note private del DM,
> link giocatore (token in chiaro nel DB), gli upload e `.session-secret`, il
> segreto HMAC che firma i cookie DM. Chi ottiene l'archivio può impersonare il
> DM finché il segreto resta lo stesso. Trattalo come materiale riservato:
> cifralo sempre (vedi [Cifratura del backup](#cifratura-del-backup)) e non
> condividerlo.

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

## Cifratura del backup

L'archivio contiene `.session-secret` e dati privati: **non lasciarlo mai in
chiaro**. Cifralo subito dopo la creazione e cancella il `.tar.gz` intermedio
(se il filesystem non è già cifrato, la cancellazione non è una garanzia:
cifra durante la scrittura o usa un volume temporaneo cifrato).

### 7-Zip con AES-256 (Windows, multipiattaforma)

```powershell
$a = Get-ChildItem .\backup\dnd-data-*.tar.gz |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

# -p: password (meglio prompt interattivo: -p senza valore), -mhe=on nasconde i nomi
7z a -t7z -mhe=on -m0=lzma2 -mx=9 "$($a.FullName).7z" $a.FullName

Remove-Item $a.FullName
```

Verifica che l'archivio si apra con la password e che `dnd.db` sia presente:

```powershell
7z l ".\backup\dnd-data-YYYYMMDD-HHmmss.tar.gz.7z"
```

Senza 7-Zip si può cifrare con `age` o GPG (sotto), oppure con BitLocker sul
volume che ospita `.\backup`.

### age (consigliato su Linux/macOS)

```sh
age -r age1... -o "backup/dnd-data-$stamp.tar.gz.age" "backup/dnd-data-$stamp.tar.gz"
rm "backup/dnd-data-$stamp.tar.gz"
# restore:
age -d -i ~/.config/age/keys.txt backup/dnd-data-YYYYMMDD-HHmmss.tar.gz.age | tar xzf - -C /data
```

Conserva la chiave privata **fuori** dal server e dal backup. La perdita della
chiave rende il backup inutilizzabile.

### GPG simmetrico (alternativa)

```sh
gpg --symmetric --cipher-algo AES256 --output "backup/dnd-data-$stamp.tar.gz.gpg" "backup/dnd-data-$stamp.tar.gz"
rm "backup/dnd-data-$stamp.tar.gz"
# restore:
gpg --decrypt backup/dnd-data-YYYYMMDD-HHmmss.tar.gz.gpg | tar xzf - -C /data
```

## Permessi e archiviazione

- La cartella `backup/` deve essere leggibile solo dall'utente che esegue i
  backup e dagli amministratori.
  - Linux/macOS: `chmod 700 backup` e `chmod 600 backup/*`.
  - Windows: rimuovi `Users`/`Everyone` dall'ACL e lascia solo il tuo account e
    `Administrators` (`icacls .\backup /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F" /grant:r "Administrators:(OI)(CI)F"`).
- Tieni i backup cifrati fuori dal repository Git e fuori dal volume Docker del
  server: una copia su un altro disco/NAS o in object storage cifrato.
- Ruota le password/chiavi di cifratura se sospetti una compromissione e
  considera compromesso `.session-secret` incluso nell'archivio: ruotalo
  cancellandolo dal volume e riavviando (tutte le sessioni DM decadono).
- Verifica periodicamente un restore su un'istanza di prova; un backup mai
  testato non è un backup.
- Conserva più generazioni (es. 7 giornalieri + 4 settimanali) e non eliminare
  l'ultima copia verificata.

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

Se l'archivio è cifrato (consigliato), decifralo prima in una cartella
temporanea e usa il `.tar.gz` risultante nei comandi sotto:

```powershell
7z x .\backup\dnd-data-20261101-120000.tar.gz.7z -o.\backup
```

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
