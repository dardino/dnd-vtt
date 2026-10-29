# D&D VTT

Virtual tabletop locale per D&D 5e: console DM, doppio schermo, mappa con token,
fog of war, dadi e schede SRD 5.2. Il design completo è in [`PLAN.md`](./PLAN.md).

## Requisiti

- Node.js **26.0+** (`<27`), vedi `.nvmrc`
- npm 12

```powershell
nvm use 26.8.1
npm ci
Copy-Item .env.example .env   # opzionale: i default funzionano su localhost
npm run db:migrate
```

`npm run db:migrate` non è mai automatico all'avvio: se manca una migrazione il
server parte comunque e `/api/v1/health` risponde `db: 'migration_pending'`.

## Comandi

| Comando | Effetto |
|---|---|
| `npm run dev` | client su `:4200`, server su `:3000`, `shared` in watch |
| `npm run check` | lint, typecheck, test, build e `db:check` |
| `npm run test` | test unitari e API |
| `npm run test:e2e` | Playwright contro il build di produzione |
| `npm run build` | build di `shared`, `server` e `client` |
| `npm run db:generate` | genera una migrazione Drizzle dallo schema |
| `npm run db:migrate` | applica le migrazioni |
| `npm run db:seed` | inserisce una campagna di prova, una scena e un goblin |
| `npm run db:check` | verifica che schema e migrazioni non divergano |
| `npm run srd:import` | rigenera i cataloghi SRD 5.2 da Open5e (richiede rete) |

I cataloghi SRD sono **committati**: l'import serve solo quando si aggiorna la
versione dei dati. A runtime il server legge i JSON locali, senza chiamate
esterne.

Il repository installa un hook `pre-commit` che esegue `npm run check`:
nessun commit se lint, typecheck, test, build o `db:check` falliscono.

## Struttura

- `client/` - Angular 22 zoneless, Signals e `@ngrx/signals`; console DM con
  avvio su `/dm`, tema light/dark/system, wizard personaggio a 7 step, shell a
  pannelli collassabili e scena Konva con griglia, token e misura
- `shared/` - schemi Zod, tipi, derivazione della scheda (`deriveSheet`),
  validazione delle build (`validatePcBuild`), azioni di scena reversibili,
  geometria quadrata/esagonale `odd-r` e piramide di tile
- `server/` - Fastify, Drizzle/SQLite, API `/api/v1`, auth DM, upload `sharp`
  con preview e tile per mappe grandi, `action_log` e `ActionService`
- `LICENSES/SRD-5.2.md` - attribuzione CC BY 4.0

## Stato

- **Fase 1 completata**: monorepo npm + Turbo, TypeScript strict, ESLint flat,
  CI con E2E, wrapper nativi `app-button`/`app-dialog`, tema e serving con
  nonce CSP per richiesta.
- **Fase 2 completata**: schema Drizzle e migrazioni, CRUD campagne/scene/attori
  con cursore, upload originale + WebP + thumb, `action_log` con inverse e
  transazione, `PUT /scenes/:id/state` solo per recovery, auth DM con loopback
  fidato solo senza header di forwarding, allowlist `Host`, controllo `Origin`
  e rate limit. La console si apre su `/dm` con skeleton, modale di creazione o
  scelta e `lastCampaignId` in `localStorage`.
- **Fase 3a implementata**: cataloghi SRD 5.2 (12 classi, 9 specie, 4 background,
  17 talenti, 339 incantesimi, 195 oggetti, 331 mostri), schemi della scheda,
  valori derivati, validazione delle build ed endpoint di catalogo.
- **Fase 3b completata**: wizard PC a 7 step con creazione persistente,
  equipaggiamento automatico e tiri 4d6kh3 dal server; wizard mostro/NPC a 6
  step con import dal catalogo SRD; scheda console a tab con snapshot,
  `sheetVersion`, inventario, incantesimi e note del DM. I personaggi senza
  campagna sono rifiutati.
- **Fase 4 completata**: upload mappe con preview e piramide di tile oltre
  2048 px, griglia quadrata e esagonale pointy-top `odd-r`, scena Konva con
  pan, zoom, drag & drop con snap, token di dimensione variabile e misura
  distanza con la stessa geometria di `shared`. La shell ha barra del titolo,
  sidebar a sezioni accordion collassabili con stato ricordato, toolbar
  verticale, dock azioni, 10 slot riservati ai PG e statusbar; mostri e NPC
  fuori mappa vivono nell'accordion Attori e passano in “In mappa” quando
  vengono schierati. Le mappe si possono caricare, attivare e sostituire. Le azioni
  `token.*` e `grid.update` passano da `ActionService` con `ActionStore`
  ottimistico (`synced`/`pending`/`offline`/`read-only`). Due console si
  riallineano dal log azioni in attesa del WebSocket della Fase 7.

La prossima fase è la **Fase 5**: combattimento, iniziativa, dadi, level-up,
riposi e pannelli operativi.
