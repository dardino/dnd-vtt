import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required, validate, type FieldTree } from '@angular/forms/signals';
import type { LevelUpPreview, PcStatblock } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActorSheetLevelUpDialog,
  type LevelUpFormState,
} from './actor-sheet-level-up-dialog';

const formState = (overrides: Partial<LevelUpFormState> = {}): LevelUpFormState => ({
  hpMethod: 'average',
  hpRoll: 6,
  subclass: '',
  asiPrimary: 'str',
  asiSecondary: 'con',
  asiSplit: false,
  feat: '',
  ...overrides,
});

const createField = (
  state: LevelUpFormState,
  options: { die?: number } = {},
): FieldTree<LevelUpFormState> => TestBed.runInInjectionContext(() =>
  form(signal(state), (path) => {
    validate(path.hpRoll, ({ value, valueOf }) => {
      if (valueOf(path.hpMethod) !== 'roll') {
        return null;
      }
      const die = options.die ?? 10;
      if (value() < 1) {
        return { kind: 'min', message: 'Il tiro deve essere almeno 1.' };
      }
      if (value() > die) {
        return {
          kind: 'max',
          message: `Il tiro non può superare il dado vita (d${die}).`,
        };
      }
      return null;
    });
    required(path.subclass, { message: 'Scegli una sottoclasse.' });
  }));

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
    field?: FieldTree<LevelUpFormState>;
    result?: LevelUpPreview | null;
    error?: string | null;
    busy?: boolean;
  } = {}) => {
    const field = options.field ?? createField(options.state ?? formState());
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
    fixture.componentRef.setInput('form', field);
    fixture.detectChanges();
    return { fixture, field };
  };

  const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement => {
    const button = Array.from(root.querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === text);
    if (button === undefined) {
      throw new Error(`bottone non trovato: ${text}`);
    }
    return button;
  };

  it('mostra livello, XP e i punti ferita medi con il valore iniziale del form', () => {
    const { fixture, field } = create();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Livello 1');
    expect(root.textContent).toContain('2');
    expect(root.textContent).toContain('XP 100');
    expect(root.textContent).toContain('Media (6)');
    expect(root.querySelector('input[type="number"]')).toBeNull();
    expect(field.hpMethod().value()).toBe('average');
    expect(field.hpMethod().dirty()).toBe(false);
  });

  it('aggiorna il form al cambio del metodo dei punti ferita', () => {
    const { fixture, field } = create();
    const root = fixture.nativeElement as HTMLElement;

    const select = root.querySelector('#level-up-hp-method') as HTMLSelectElement;
    select.value = 'roll';
    select.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(field.hpMethod().value()).toBe('roll');
    expect(field.hpMethod().dirty()).toBe(true);
    const input = root.querySelector('#level-up-hp-roll') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('6');
  });

  it('mostra e aggiorna il tiro del dado quando il metodo è roll', () => {
    const { fixture, field } = create({ state: formState({ hpMethod: 'roll', hpRoll: 7 }) });
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('#level-up-hp-roll') as HTMLInputElement;

    expect(root.textContent).toContain('Tiro d10');
    expect(input.value).toBe('7');

    input.value = '9';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(field.hpRoll().value()).toBe(9);
    expect(field.hpRoll().dirty()).toBe(true);
  });

  it('mostra l errore del tiro solo dopo touched e aggiorna la a11y', () => {
    const { fixture } = create({ state: formState({ hpMethod: 'roll', hpRoll: 12 }) });
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('#level-up-hp-roll') as HTMLInputElement;

    expect(root.textContent).not.toContain('Il tiro non può superare il dado vita');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBeNull();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(root.textContent).toContain('Il tiro non può superare il dado vita (d10).');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('level-up-hp-roll-error');

    const alert = root.querySelector('#level-up-hp-roll-error');
    expect(alert?.getAttribute('role')).toBe('alert');
  });

  it('richiede la sottoclasse quando serve e segnala l errore dopo touched', () => {
    const { fixture } = create({
      needsSubclass: true,
      subclasses: [{ id: 'battle-master', name: 'Maestro di battaglia' }],
    });
    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('#level-up-subclass') as HTMLSelectElement;

    expect(select.value).toBe('');
    expect(root.textContent).not.toContain('Scegli una sottoclasse.');
    expect(select.hasAttribute('aria-invalid')).toBe(false);

    select.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(root.textContent).toContain('Scegli una sottoclasse.');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe('level-up-subclass-error');
  });

  it('aggiorna talento e aumento di caratteristica tramite il form', () => {
    const { fixture, field } = create({
      isAsi: true,
      feats: [{ id: 'great-weapon', name: 'Maestro d’armi' }],
    });
    const root = fixture.nativeElement as HTMLElement;

    const primary = root.querySelector('#level-up-asi-primary') as HTMLSelectElement;
    primary.value = 'dex';
    primary.dispatchEvent(new Event('input'));

    const split = root.querySelector('#level-up-asi-split') as HTMLInputElement;
    split.checked = true;
    split.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const secondary = root.querySelector('#level-up-asi-secondary') as HTMLSelectElement;
    secondary.value = 'str';
    secondary.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const featSelect = root.querySelector('#level-up-feat') as HTMLSelectElement;
    featSelect.value = 'great-weapon';
    featSelect.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(field.asiPrimary().value()).toBe('dex');
    expect(field.asiSplit().value()).toBe(true);
    expect(field.asiSecondary().value()).toBe('str');
    expect(field.feat().value()).toBe('great-weapon');
    expect(field.feat().dirty()).toBe(true);
  });

  it('emette previewRequest e confirmRequest', () => {
    const { fixture } = create();
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
    const { fixture } = create({ result: preview(), error: 'Errore di anteprima' });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Anteprima');
    expect(root.textContent).toContain('HP massimi 26');
    expect(root.textContent).toContain('+6');
    expect(root.textContent).toContain('Privilegi: 0');
    expect(root.textContent).toContain('slot: 0');
    expect(root.textContent).toContain('Errore di anteprima');
  });

  it('disabilita le azioni e mostra l’applicazione quando busy', () => {
    const { fixture } = create({ busy: true });
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
    const { fixture } = create({ stats: null });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Sali di livello');
    expect(root.querySelector('.levelup')).toBeNull();
  });
});
