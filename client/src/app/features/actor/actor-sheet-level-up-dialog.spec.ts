import { TestBed } from '@angular/core/testing';
import type { LevelUpPreview, PcStatblock } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActorSheetLevelUpDialog,
  type LevelUpFormState,
} from './actor-sheet-level-up-dialog';

const form = (overrides: Partial<LevelUpFormState> = {}): LevelUpFormState => ({
  hpMethod: 'average',
  hpRoll: 6,
  subclass: '',
  asiPrimary: 'str',
  asiSecondary: 'con',
  asiSplit: false,
  feat: '',
  ...overrides,
});

const character = (): PcStatblock => ({
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
});

const preview = (): LevelUpPreview => ({
  level: 2,
  hpMax: 26,
  hpGain: 6,
  features: [],
  slots: [],
  abilityIncreases: [],
});

describe('ActorSheetLevelUpDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [ActorSheetLevelUpDialog] });
  });

  const create = (options: {
    open?: boolean;
    stats?: PcStatblock | null;
    currentXp?: number;
    abilities?: readonly { key: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; label: string }[];
    subclasses?: readonly { id: string; name: string }[];
    needsSubclass?: boolean;
    isAsi?: boolean;
    feats?: readonly { id: string; name: string }[];
    state?: LevelUpFormState;
    result?: LevelUpPreview | null;
    error?: string | null;
    busy?: boolean;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetLevelUpDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('character', options.stats === undefined ? character() : options.stats);
    fixture.componentRef.setInput('currentXp', options.currentXp ?? 100);
    fixture.componentRef.setInput('abilities', options.abilities ?? [
      { key: 'str', label: 'Forza' },
      { key: 'dex', label: 'Destrezza' },
      { key: 'con', label: 'Costituzione' },
    ]);
    fixture.componentRef.setInput('subclasses', options.subclasses ?? []);
    fixture.componentRef.setInput('needsSubclass', options.needsSubclass ?? false);
    fixture.componentRef.setInput('isAsi', options.isAsi ?? false);
    fixture.componentRef.setInput('feats', options.feats ?? []);
    fixture.componentRef.setInput('preview', options.result ?? null);
    fixture.componentRef.setInput('error', options.error ?? null);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.componentRef.setInput('form', options.state ?? form());
    fixture.detectChanges();
    return fixture;
  };

  const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement => {
    const button = Array.from(root.querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === text);
    if (button === undefined) {
      throw new Error(`bottone non trovato: ${text}`);
    }
    return button;
  };

  it('mostra livello, XP e i punti ferita medi', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Livello 1');
    expect(root.textContent).toContain('2');
    expect(root.textContent).toContain('XP 100');
    expect(root.textContent).toContain('Media (6)');
    expect(root.querySelector('input[type="number"]')).toBeNull();
  });

  it('emette formChange quando cambia il metodo dei punti ferita', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const changes: LevelUpFormState[] = [];
    fixture.componentInstance.formChange.subscribe((state) => changes.push(state));

    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = 'roll';
    select.dispatchEvent(new Event('change'));

    expect(changes).toEqual([form({ hpMethod: 'roll' })]);
  });

  it('mostra il tiro del dado quando il metodo è roll', () => {
    const fixture = create({ state: form({ hpMethod: 'roll', hpRoll: 7 }) });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Tiro d10');
    expect((root.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('7');
  });

  it('emette formChange per talento e aumento di caratteristica', () => {
    const fixture = create({
      isAsi: true,
      feats: [{ id: 'great-weapon', name: 'Maestro d’armi' }],
    });
    const root = fixture.nativeElement as HTMLElement;
    const changes: LevelUpFormState[] = [];
    fixture.componentInstance.formChange.subscribe((state) => changes.push(state));

    const featSelect = root.querySelectorAll('select')[1] as HTMLSelectElement;
    featSelect.value = 'great-weapon';
    featSelect.dispatchEvent(new Event('change'));

    const abilitySelects = root.querySelectorAll('select');
    const primary = abilitySelects[2] as HTMLSelectElement;
    primary.value = 'dex';
    primary.dispatchEvent(new Event('change'));

    const split = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
    split.checked = true;
    split.dispatchEvent(new Event('change'));

    expect(changes).toEqual([
      form({ feat: 'great-weapon' }),
      form({ asiPrimary: 'dex' }),
      form({ asiSplit: true }),
    ]);
  });

  it('emette previewRequest e confirmRequest', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    let previews = 0;
    let confirms = 0;
    fixture.componentInstance.previewRequest.subscribe(() => {
      previews += 1;
    });
    fixture.componentInstance.confirmRequest.subscribe(() => {
      confirms += 1;
    });

    buttonByText(root, 'Anteprima').click();
    buttonByText(root, 'Conferma level-up').click();

    expect(previews).toBe(1);
    expect(confirms).toBe(1);
  });

  it('mostra anteprima ed errore', () => {
    const fixture = create({ result: preview(), error: 'Errore di anteprima' });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Anteprima');
    expect(root.textContent).toContain('HP massimi 26');
    expect(root.textContent).toContain('+6');
    expect(root.textContent).toContain('Privilegi: 0');
    expect(root.textContent).toContain('slot: 0');
    expect(root.textContent).toContain('Errore di anteprima');
  });

  it('disabilita le azioni e mostra l’applicazione quando busy', () => {
    const fixture = create({ busy: true });
    const root = fixture.nativeElement as HTMLElement;
    let emitted = 0;
    fixture.componentInstance.previewRequest.subscribe(() => {
      emitted += 1;
    });
    fixture.componentInstance.confirmRequest.subscribe(() => {
      emitted += 1;
    });

    const previewButton = buttonByText(root, 'Anteprima');
    const confirmButton = buttonByText(root, 'Applicazione…');

    expect(previewButton.disabled).toBe(true);
    expect(confirmButton.disabled).toBe(true);
    previewButton.click();
    confirmButton.click();
    expect(emitted).toBe(0);
  });

  it('non mostra il form senza personaggio', () => {
    const fixture = create({ stats: null });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Sali di livello');
    expect(root.querySelector('.levelup')).toBeNull();
  });
});
