# B1 — Spike Signal Forms, `resource()` e `@defer`

Data: 3 novembre 2026 · Angular **22.2.4** · `@angular/forms` **22.2.4** · Zod **4.6.7**

## Contesto

`@angular/forms` non era una dipendenza diretta del client: l'entrypoint
`@angular/forms/signals` non era quindi disponibile. B1 lo reintroduce alla stessa versione di
`@angular/core` e verifica le API sul pacchetto installato, non solo sulla documentazione.

## API confermate (dalle typings installate)

Entrypoint: `@angular/forms/signals` → `types/signals.d.ts`, tutte le API marcate `@publicApi 22.0`.

| API | Firma / comportamento verificato |
|---|---|
| `form(model, schemaFn)` | `model` è un `WritableSignal<T>` e resta la fonte di verità: `form.field().value.set(...)` aggiorna il modello. Restituisce `FieldTree<T>`. |
| `FieldTree<T>` | È una funzione: `tree.field()` restituisce `FieldState<T>`. Le foglie si bindano al template tramite `[formField]`. |
| `required(path, { message })` | Validatore sincrono; stringa vuota ⇒ `invalid() === true`. |
| `validate(path, ctx => ...)` | Validatore custom sincrono; `ctx.value()` è un signal. Ritorna `null`/`undefined` per successo, un `{ kind, message }` o una lista per errore. |
| `validateStandardSchema(path, schema)` | Accetta `StandardSchemaV1`; verificato con `diceRollRequestSchema.shape.formula` di Zod 4.6.7 (supporto `~standard` nativo). |
| `submit(form, { action })` | `Promise<boolean>`; esegue `action` solo se il form è valido, espone `form().submitting()`. `action` ritorna `TreeValidationResult` (`undefined` = successo). |
| `FormField` (direttiva) | Selettore reale **`[formField]`**, non `[control]` (esempi vecchi/blog usano ancora `[control]`). Supporta input/textarea nativi, custom control e `ControlValueAccessor`. Va importata nei `imports` del componente standalone. |
| `FieldState` | Signal utili: `value`, `controlValue`, `errors`, `touched`, `dirty`, `valid`, `invalid`, `required`, `disabled`, `submitting`, `focusBoundControl()`, `markAsTouched()`. |
| `resource({ params, loader })` | `status()` (`idle`/`loading`/`resolved`/`error`), `value()`, `error()`, `reload()`; ricarica quando `params` cambia; `abortSignal` disponibile al loader. `@publicApi 22.0`. |
| `httpResource` | Presente in `@angular/common/http` (`@publicApi 22.0`): varianti URL/request, `parse`, `defaultValue`. Non usato nel PoC. |
| `@defer` | Supportato dal compilatore 22.2.4; `DeferBlockState` e `DeferBlockFixture` sono esportati da `@angular/core/testing`. |

## PoC su `dice-overlay`

- Il campo **Formula** usa `form(signal({ formula: '1d20' }))` con `required` + `validate` che
  riusa `parseFormula` da `@dnd-vtt/shared`: la validazione di dominio non è duplicata nel client.
- Submit tramite `submit(form, { action })`: se la formula è invalida l'azione non parte, il campo
  espone `aria-invalid`/`aria-describedby` e il messaggio tradotto da `DiceFormulaError`.
- Modificatore, modo e visibilità restano signal semplici: nessuna riscrittura dell'overlay.
- Test: `dice-overlay.component.spec.ts` (caso invalido blocca `DiceStore.roll`, caso valido invia
  `2d6+3`) e `b1-spike.spec.ts` (`validateStandardSchema`, `resource()` con cambio `params`,
  rendering esplicito di un blocco `@defer`).

## Limiti osservati

1. **Messaggi Standard Schema**: gli errori di `validateStandardSchema` arrivano dalle issue Zod
   (testo tecnico/inglese). Per la UI conviene un validatore `validate()` con messaggi di dominio
   oppure una mappatura delle issue; `dice-overlay` usa `validate()` per questo.
2. **Doppia validazione**: `required` + `parseFormula` coprono UX e dominio; aggiungere Zod sullo
   stesso campo produce messaggi duplicati. Scegliere un solo livello per campo.
3. **Template**: `[formField]` va legato alla funzione campo (`diceForm.formula`), non allo stato
   (`diceForm.formula()`); `@let` deve essere dichiarato prima dell'uso nello stesso template.
4. **`resource()` è solo lettura**: niente mutazioni; cancellazione automatica via `abortSignal` ma
   niente retry/refresh ottimistico integrato. Le mutazioni restano nei servizi/store.
5. **Bundle**: `@angular/forms` entra nel bundle iniziale se importato da componenti eager. B3 deve
   misurare prima/dopo con `ng build --stats-json`; il budget attuale (700 kB warning / 1.2 MB
   errore) non è stato modificato.
6. **Nessun adapter per `FormControl` usato**: `signals/compat` esiste ma è fuori scope; i form
   migrati in B4 devono restare nativi Signal Forms.

## Esito

**Disponibile e stabile** in Angular 22.2.4 per il perimetro del progetto. PoC verde su modello,
validazione (custom + Standard Schema), submit, direttiva `[formField]`, `resource()` e `@defer`.
Nessun blocco.

## Raccomandazione per B2–B5

- **B2**: partire da `resource()` nei servizi di lettura con `params` derivati da
  campagna/scena; mappare `status()`/`error()` su `ErrorHandler`/toast. Non usare `httpResource`
  finché non serve il parsing HTTP tipizzato: i servizi attuali hanno già `HttpClient` + Zod
  condiviso.
- **B3**: misurare il bundle con `--stats-json` prima di applicare `@defer`; iniziare da mappa e
  pannelli DM. Usare `@placeholder` con dimensioni stabili per non introdurre layout shift.
- **B4**: ordine confermato (`dice-overlay` → inspector mappa → `actor-sheet` → wizard), un campo
  per volta e un solo livello di validazione per campo; riusare i validatori di `shared`.
- **B5**: rimuovere gli handler manuali residui e aggiornare `PLAN.md` (sezione 21) allo stato
  "adottato" solo dopo B2–B4.
