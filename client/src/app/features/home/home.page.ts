import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="home">
      <div class="home__copy">
        <span class="eyebrow">Fase 3 · Builder SRD</span>
        <h1>Un tavolo, due schermi,<br />una scheda che resta viva.</h1>
        <p class="muted">
          Console del master, proiezione per i giocatori e personaggi costruiti sulle regole
          SRD 5.2. I cataloghi sono locali: nessun servizio esterno a runtime.
        </p>
        <div class="home__actions">
          <a class="btn btn--primary" routerLink="/dm/campaigns/demo/actors/new/pc">Crea un personaggio</a>
          <a class="btn" href="/api/v1/srd/meta" target="_blank" rel="noreferrer">Apri i cataloghi SRD</a>
        </div>
      </div>

      <aside class="home__rail surface">
        <span class="eyebrow">Nel catalogo</span>
        <dl>
          <div><dt>Classi</dt><dd>12 + sottoclassi</dd></div>
          <div><dt>Specie</dt><dd>9</dd></div>
          <div><dt>Incantesimi</dt><dd>339</dd></div>
          <div><dt>Oggetti mundani</dt><dd>195</dd></div>
          <div><dt>Mostri</dt><dd>331</dd></div>
        </dl>
        <hr class="divider" />
        <p class="muted">
          Il wizard salva una bozza locale e valida la build con lo stesso codice del server.
        </p>
      </aside>
    </section>
  `,
  styles: `
    .home {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr);
      gap: var(--space-6);
      width: min(100%, 1200px);
      margin: 0 auto;
      padding: var(--space-7) var(--space-5);
      align-items: center;
    }

    h1 {
      margin: var(--space-2) 0 var(--space-3);
      font-size: clamp(2rem, 4vw, 3.4rem);
      font-weight: 600;
      line-height: 1.05;
      letter-spacing: -0.035em;
    }

    .home__copy p {
      max-width: 38rem;
      font-size: var(--text-lg);
    }

    .home__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-5);
    }

    .home__rail {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    dl {
      display: grid;
      gap: var(--space-2);
      margin: 0;
    }

    dl div {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }

    dt {
      color: var(--color-text-muted);
    }

    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 900px) {
      .home {
        grid-template-columns: 1fr;
        padding: var(--space-5) var(--space-4);
      }
    }
  `,
})
export class HomePage {}
