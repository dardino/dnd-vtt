# D&D VTT

Virtual tabletop locale per D&D 5e: console DM, doppio schermo, mappa con token,
fog of war, dadi e schede SRD 5.2. Il design completo è in [`PLAN.md`](./PLAN.md).

## Requisiti

- Node.js **24.15+** (`<25`), vedi `.nvmrc`
- npm 12

```powershell
nvm use 24.20.0
npm ci
```

## Comandi

| Comando | Effetto |
|---|---|
| `npm run check` | lint, typecheck, test e build di tutti i workspace |
| `npm run test` | test unitari e API |
| `npm run build` | build di `shared` e `server` |
| `npm run dev` | server in watch (client in arrivo con la Fase 4) |
| `npm run srd:import` | rigenera i cataloghi SRD 5.2 da Open5e (richiede rete) |

I cataloghi SRD sono **committati**: l'import serve solo quando si aggiorna la
versione dei dati. A runtime il server legge i JSON locali, senza chiamate
esterne.

## Struttura

- `shared/` — schemi Zod, tipi, derivazione della scheda (`deriveSheet`) e
  validazione delle build (`validatePcBuild`)
- `server/` — Fastify, cataloghi SRD versionati, API `/api/v1/srd/:version/*`
- `LICENSES/SRD-5.2.md` — attribuzione CC BY 4.0

## Stato

Implementata la **Fase 3a**: cataloghi SRD 5.2 (12 classi, 9 specie, 4 background,
17 talenti, 339 incantesimi, 195 oggetti, 331 mostri), schemi della scheda,
valori derivati, validazione delle build ed endpoint di catalogo.
La **Fase 3b** (wizard a 7 step, scheda console, mostri/NPC) è il prossimo passo.
