import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { ActionLogEntry, DiceRoll, InitiativeState } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActionStore } from '../../core/stores/action.store';
import { DiceStore } from '../../core/stores/dice.store';
import { DmDock, type DockTab, type DockValueChange } from './dm-dock';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';

const initiative = (overrides: Partial<InitiativeState> = {}): InitiativeState => ({
  active: true,
  round: 2,
  turnIndex: 1,
  entries: [
    {
      id: 'e1',
      tokenId: 't1',
      label: 'Goblin',
      value: 18,
      tiebreak: 2,
      hidden: false,
      defeated: false,
    },
    {
      id: 'e2',
      tokenId: 't2',
      label: 'Eroe',
      value: 12,
      tiebreak: 1,
      hidden: false,
      defeated: false,
    },
  ],
  ...overrides,
});

const action = (overrides: Partial<ActionLogEntry> = {}): ActionLogEntry => ({
  id: '0190f000-0000-7000-8000-000000000010',
  sceneId: SCENE_ID,
  actorId: null,
  clientId: 'client-1',
  origin: 'dm',
  type: 'initiative.next',
  label: 'Prossimo turno',
  payload: { type: 'initiative.next' },
  inverse: { type: 'initiative.next' },
  status: 'applied',
  stateVersion: 4,
  createdAt: '2026-11-03T10:00:00.000Z',
  undoneAt: null,
  ...overrides,
});

const roll = (overrides: Partial<DiceRoll> = {}): DiceRoll => ({
  id: '0190f000-0000-7000-8000-000000000020',
  campaignId: CAMPAIGN_ID,
  sceneId: SCENE_ID,
  actorId: null,
  tokenId: null,
  origin: 'dm',
  formula: '1d20+3',
  mode: 'normal',
  dice: [{ sides: 20, value: 15, dropped: false }],
  modifier: 3,
  total: 18,
  visibility: 'dm',
  label: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  ...overrides,
});

@Component({
  selector: 'app-dm-dock-host',
  imports: [DmDock],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dm-dock
      [open]="open()"
      [tab]="tab()"
      [initiative]="initiative()"
      [tokenHp]="tokenHp"
      (tabChange)="tab.set($event)"
      (toggle)="record('toggle')"
      (rollInitiative)="record('rollInitiative')"
      (nextTurn)="record('nextTurn')"
      (sort)="record('sort')"
      (end)="record('end')"
      (updateValue)="value = $event"
      (openDice)="record('openDice')"
      (redoBatch)="record('redoBatch')"
      (undoThrough)="record('undoThrough:' + $event)"
    />
  `,
})
class HostComponent {
  public readonly open = signal(true);
  public readonly tab = signal<DockTab>('initiative');
  public readonly initiative = signal<InitiativeState | null>(null);
  public readonly events = signal<string[]>([]);
  public value: DockValueChange | null = null;

  public readonly tokenHp = (tokenId: string): string =>
    tokenId === 't1' ? '7/10' : '—';

  public record(event: string): void {
    this.events.update((values) => [...values, event]);
  }
}

describe('DmDock', () => {
  let rolls: WritableSignal<DiceRoll[]>;
  let history: WritableSignal<ActionLogEntry[]>;

  beforeEach(() => {
    rolls = signal<DiceRoll[]>([]);
    history = signal<ActionLogEntry[]>([]);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        { provide: DiceStore, useValue: { rolls } },
        { provide: ActionStore, useValue: { history } },
      ],
    });
  });

  const create = (): {
    root: HTMLElement;
    host: HostComponent;
    fixture: ComponentFixture<HostComponent>;
  } => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      root: fixture.nativeElement as HTMLElement,
      host: fixture.componentInstance,
      fixture,
    };
  };

  const button = (root: HTMLElement, label: string): HTMLButtonElement => {
    const element = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.trim() === label);
    if (element === undefined) {
      throw new Error(`Pulsante "${label}" non trovato`);
    }
    return element;
  };

  it('mostra le tab, il conteggio azioni e cambia tab attiva', () => {
    history.set([action()]);
    const { root, host, fixture } = create();
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.dock__tab')];

    expect(tabs).toHaveLength(3);
    expect(tabs[2]?.textContent).toBe('Azioni (1)');
    expect(tabs[0]?.classList.contains('is-active')).toBe(true);

    button(root, 'Log dadi').click();
    fixture.detectChanges();
    expect(host.tab()).toBe('dice');
    expect(root.querySelectorAll('.dock__tab')[1]?.classList.contains('is-active')).toBe(true);

    button(root, 'Azioni (1)').click();
    fixture.detectChanges();
    expect(host.tab()).toBe('actions');
    expect(root.querySelectorAll('.dock__tab')[2]?.classList.contains('is-active')).toBe(true);
  });

  it('mostra hint di round/turno solo con iniziativa attiva', () => {
    const { root, host, fixture } = create();

    expect(root.querySelector('.dock__hint')?.textContent?.trim()).toBe('');

    host.initiative.set(initiative());
    fixture.detectChanges();
    expect(root.querySelector('.dock__hint')?.textContent).toContain('Round 2 · turno 2/2');

    host.initiative.set(initiative({ active: false }));
    fixture.detectChanges();
    expect(root.querySelector('.dock__hint')?.textContent?.trim()).toBe('');
  });

  it('mostra lista vuota o piena con PF e riga corrente', () => {
    const { root, host, fixture } = create();

    expect(root.textContent).toContain('Nessuna iniziativa: tira per i token in mappa.');
    expect(root.querySelector('.initiative__list')).toBeNull();

    host.initiative.set(initiative());
    fixture.detectChanges();
    const rows = root.querySelectorAll('.initiative__row');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.initiative__label')?.textContent).toBe('Goblin');
    expect(rows[0]?.querySelector<HTMLInputElement>('.initiative__value')?.value).toBe('18');
    expect(rows[0]?.textContent).toContain('des 2');
    expect(rows[0]?.querySelector('.initiative__hp')?.textContent).toBe('7/10');
    expect(rows[0]?.classList.contains('is-current')).toBe(false);
    expect(rows[1]?.classList.contains('is-current')).toBe(true);
    expect(rows[1]?.querySelector('.initiative__hp')?.textContent).toBe('—');
    expect(rows[0]?.querySelector('input')?.getAttribute('aria-label')).toBe('Iniziativa di Goblin');
  });

  it('emette updateValue con id ed evento al cambio del valore', () => {
    const { root, host, fixture } = create();
    host.initiative.set(initiative());
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>('.initiative__value');
    if (input === null) {
      throw new Error('Input iniziativa non trovato');
    }

    input.value = '21';
    input.dispatchEvent(new Event('change'));

    expect(host.value?.id).toBe('e1');
    expect((host.value?.event.target as HTMLInputElement).value).toBe('21');
  });

  it('emette i comandi di iniziativa e li nasconde se inattiva', () => {
    const { root, host, fixture } = create();
    host.initiative.set(initiative());
    fixture.detectChanges();

    for (const label of ['Tira iniziativa', 'Prossimo turno', 'Ordina', 'Termina']) {
      button(root, label).click();
    }
    fixture.detectChanges();
    expect(host.events()).toEqual(['rollInitiative', 'nextTurn', 'sort', 'end']);

    host.initiative.set(initiative({ active: false }));
    fixture.detectChanges();
    expect(() => button(root, 'Prossimo turno')).toThrow();
    expect(() => button(root, 'Ordina')).toThrow();
    expect(() => button(root, 'Termina')).toThrow();
  });

  it('mostra il log dadi e apre il dialogo dal pulsante', () => {
    rolls.set([roll()]);
    const { root, host, fixture } = create();

    host.tab.set('dice');
    fixture.detectChanges();
    const items = root.querySelectorAll('.dice-log .action-history li');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('1d20+3 → 18');
    expect(items[0]?.textContent).toContain('dm · dm');

    button(root, 'Tira dadi').click();
    expect(host.events()).toEqual(['openDice']);

    rolls.set([]);
    fixture.detectChanges();
    expect(root.textContent).toContain('Nessun tiro registrato.');
  });

  it('mostra history, undo e redo', () => {
    history.set([
      action({ id: '0190f000-0000-7000-8000-000000000010', label: 'Danno', status: 'applied' }),
      action({ id: '0190f000-0000-7000-8000-000000000011', label: 'Fog', status: 'undone' }),
    ]);
    const { root, host, fixture } = create();
    host.tab.set('actions');
    fixture.detectChanges();

    const items = root.querySelectorAll('.actions-dock .action-history li');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Danno');
    expect(items[0]?.textContent).toContain('dm · v4');
    expect(items[0]?.querySelector('.badge')).toBeNull();
    expect(items[1]?.querySelector('.badge')?.textContent).toBe('annullata');

    button(root, 'Annulla fino a qui').click();
    button(root, 'Ripeti ultimo batch').click();
    fixture.detectChanges();

    expect(host.events()).toEqual([
      'undoThrough:0190f000-0000-7000-8000-000000000010',
      'redoBatch',
    ]);

    history.set([action({ status: 'applied' })]);
    fixture.detectChanges();
    expect(button(root, 'Ripeti ultimo batch').disabled).toBe(true);
  });

  it('collassa ed espande il dock', () => {
    const { root, host, fixture } = create();

    expect(root.querySelector('.initiative')).not.toBeNull();
    expect(button(root, 'Riduci').getAttribute('type')).toBe('button');
    button(root, 'Riduci').click();

    host.open.set(false);
    fixture.detectChanges();
    expect(root.querySelector('.initiative')).toBeNull();
    button(root, 'Espandi').click();
    fixture.detectChanges();

    expect(host.events()).toEqual(['toggle', 'toggle']);
  });
});
