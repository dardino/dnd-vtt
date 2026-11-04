import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Actor, MapSummary, PlayerStart } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrepareSceneDialog } from './prepare-scene-dialog';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000002';
const MAP_ID = '0190f000-0000-7000-8000-000000000003';

const pc = (id: string, name: string): Actor => ({
  id,
  campaignId: CAMPAIGN_ID,
  kind: 'pc',
  name,
  statblock: {
    kind: 'pc',
    size: 'medium',
    abilities: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 },
    hp: { current: 10, max: 20, temp: 0 },
    speed: { walk: 30 },
    senses: {},
    languages: ['common'],
    conditions: [],
    rulesVersion: 'test',
    class: { id: 'fighter', level: 1 },
    species: { id: 'human' },
    background: { id: 'soldier' },
    abilityGeneration: {
      method: 'pointBuy',
      base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
    },
    abilityIncreases: [],
    proficiencies: {
      saves: ['str', 'con'],
      skills: ['athletics', 'perception'],
      expertise: [],
      tools: [],
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple', 'martial'],
    },
    feats: [],
    weaponMasteries: [],
    resources: [],
    spells: {
      cantrips: [],
      known: [],
      prepared: [],
      alwaysPrepared: [],
      spellbook: [],
      slots: [],
    },
    hitDice: { die: 10, total: 1, used: 0 },
    hpRolls: [],
    deathSaves: { successes: 0, failures: 0 },
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    overrides: {},
    snapshot: { features: [], spells: [], items: [] },
  },
  rulesVersion: 'test',
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId: null,
  portrait: null,
  hp: { current: 10, max: 20, temp: 0 },
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
});

const map = (): MapSummary => ({
  id: MAP_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Ingresso',
  imageAssetId: null,
  imageUrl: null,
  thumbUrl: null,
  backgroundColor: 'rgba(255, 255, 255, 1)',
  widthPx: 1920,
  heightPx: 1080,
  grid: {
    type: 'square',
    cellSizePx: 70,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  },
  fogBase: 'hidden',
  version: 1,
  walls: 0,
  lights: 0,
  spawns: 0,
  playerStarts: 1,
  updatedAt: '2026-11-03T10:00:00.000Z',
});

const START_ID = 'start-1';

const starts = (): PlayerStart[] => [{ id: START_ID, x: 100, y: 200, label: 'Porta' }];

describe('PrepareSceneDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [PrepareSceneDialog] });
  });

  const create = (options: {
    open?: boolean;
    map?: MapSummary | null;
    name?: string;
    assignments?: Readonly<Record<string, string>>;
    partyPcs?: readonly Actor[];
    startOptions?: readonly PlayerStart[];
    busy?: boolean;
  } = {}): ComponentFixture<PrepareSceneDialog> => {
    const fixture = TestBed.createComponent(PrepareSceneDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('map', options.map === undefined ? map() : options.map);
    fixture.componentRef.setInput('name', options.name ?? 'Ingresso');
    fixture.componentRef.setInput('assignments', options.assignments ?? {});
    fixture.componentRef.setInput('partyPcs', options.partyPcs ?? [pc(ACTOR_ID, 'Aria')]);
    fixture.componentRef.setInput('startOptions', options.startOptions ?? starts());
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<PrepareSceneDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('apre e chiude il dialog in base a open', () => {
    expect(rootOf(create()).querySelector('dialog')?.open).toBe(true);
    expect(rootOf(create({ open: false })).querySelector('dialog')?.open).toBe(false);
  });

  it('mostra mappa, nome e select per i PG', () => {
    const root = rootOf(create({ assignments: { [ACTOR_ID]: START_ID } }));
    const select = root.querySelector('select') as HTMLSelectElement;
    const selected = select.querySelector(`option[value="${START_ID}"]`);

    expect(root.querySelector('.dialog__title')?.textContent).toBe('Prepara scena');
    expect(root.textContent).toContain('Ingresso · 1920 × 1080 px');
    expect((root.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Ingresso');
    expect(selected?.textContent).toContain('Porta (100, 200)');
    expect(root.textContent).toContain('Aria');
  });

  it('mostra l’avviso quando la mappa non ha partenze', () => {
    const root = rootOf(create({ startOptions: [] }));

    expect(root.textContent).toContain('La mappa non ha punti di partenza');
    expect(root.querySelector('select')).toBeNull();
  });

  it('emette nameChange e assignmentChange', () => {
    const fixture = create();
    const names = vi.fn<(value: string) => void>();
    const assignments = vi.fn();
    fixture.componentInstance.nameChange.subscribe(names);
    fixture.componentInstance.assignmentChange.subscribe(assignments);

    const input = rootOf(fixture).querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'Cripta';
    input.dispatchEvent(new Event('input'));

    const select = rootOf(fixture).querySelector('select') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(names).toHaveBeenCalledWith('Cripta');
    expect(assignments).toHaveBeenCalledWith({ actorId: ACTOR_ID, startId: '' });
  });

  it('emette start quando non è busy', () => {
    const fixture = create();
    const started = vi.fn();
    fixture.componentInstance.start.subscribe(started);
    const start = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Avvia scena');

    start?.click();

    expect(started).toHaveBeenCalledTimes(1);
  });

  it('emette start e dismiss, con Avvia scena disabilitato se busy', () => {
    const fixture = create({ busy: true });
    const started = vi.fn();
    const dismissed = vi.fn();
    fixture.componentInstance.start.subscribe(started);
    fixture.componentInstance.dismiss.subscribe(dismissed);

    const start = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Avvio…') as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    start.click();
    const cancel = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Annulla');
    cancel?.click();

    expect(started).not.toHaveBeenCalled();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });
});
