# D&D VTT

Virtual tabletop locale per D&D 5e: console DM, doppio schermo, mappa con token,
fog of war, dadi e schede SRD 5.2. Il design completo è in [`PLAN.md`](./PLAN.md).

## Requisiti

- Node.js **24.15+** (`<25`), vedi `.nvmrc`
- npm 12

```powershell
nvm use 24.20.0
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
  avvio su `/dm`, tema light/dark/system e wizard personaggio a 7 step
- `shared/` - schemi Zod, tipi, derivazione della scheda (`deriveSheet`),
  validazione delle build (`validatePcBuild`) e azioni di scena reversibili
- `server/` - Fastify, Drizzle/SQLite, API `/api/v1`, auth DM, upload `sharp`,
  `action_log` e `ActionService`
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

La prossima fase è la **Fase 4**: scene, upload mappe, griglia quadrata ed
esagonale, Konva, token e shell completa della console.
