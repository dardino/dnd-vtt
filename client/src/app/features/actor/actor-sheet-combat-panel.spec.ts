import { TestBed } from '@angular/core/testing';
import type { Condition, DeathSaves, HitDice } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ActorSheetCombatPanel,
  type CombatCharacter,
} from './actor-sheet-combat-panel';

const character = (): CombatCharacter => {
  const deathSaves: DeathSaves = { successes: 1, failures: 0 };
  const hitDice: HitDice = { die: 10, total: 1, used: 0 };
  return { deathSaves, hitDice };
};

const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement => {
  const button = Array.from(root.querySelectorAll('button'))
    .find((entry) => entry.textContent?.trim() === text);
  if (button === undefined) {
    throw new Error(`bottone non trovato: ${text}`);
  }
  return button;
};

describe('ActorSheetCombatPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetCombatPanel] });
  });

  const create = (options: {
    conditions?: Condition[];
    stats?: CombatCharacter | null;
    busy?: boolean;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetCombatPanel);
    fixture.componentRef.setInput('conditions', options.conditions ?? []);
    fixture.componentRef.setInput('character', options.stats === undefined ? character() : options.stats);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra i campi PF, valori di morte, dadi vita e condizioni attive', () => {
    const fixture = create({ conditions: [{ name: 'prone' }, { name: 'poisoned' }] });
    const root = fixture.nativeElement as HTMLElement;
    const text = root.textContent ?? '';

    expect(Array.from(root.querySelectorAll('input')).map((input) => input.value))
      .toEqual(['5', '5', '0']);
    expect(text).toContain('1/3');
    expect(text).toContain('0/1 d10');
    expect(text).toContain('prone');
    expect(text).toContain('poisoned');
    expect(text).not.toContain('Nessuna condizione attiva.');
  });

  it('mostra il messaggio vuoto senza condizioni', () => {
    const fixture = create();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nessuna condizione attiva.');
  });

  it('emette hpPatch con i valori dei campi', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const changes: { mode: string; amount: number }[] = [];
    fixture.componentInstance.hpPatch.subscribe((change) => changes.push(change));

    buttonByText(root, 'Subisci').click();
    buttonByText(root, 'Cura').click();
    buttonByText(root, 'Applica temp').click();

    expect(changes).toEqual([
      { mode: 'damage', amount: 5 },
      { mode: 'heal', amount: 5 },
      { mode: 'temp', amount: 0 },
    ]);
  });

  it('separa conditionAdd dal conditionToggle dei badge', () => {
    const fixture = create({ conditions: [{ name: 'prone' }] });
    const root = fixture.nativeElement as HTMLElement;
    const added: Condition[] = [];
    const toggled: Condition[] = [];
    fixture.componentInstance.conditionAdd.subscribe((condition) => added.push(condition));
    fixture.componentInstance.conditionToggle.subscribe((condition) => toggled.push(condition));

    buttonByText(root, 'Aggiungi').click();
    buttonByText(root, 'prone ×').click();

    expect(added).toEqual([{ name: 'prone' }]);
    expect(toggled).toEqual([{ name: 'prone' }]);
  });

  it('emette deathSave, hitDice e rest', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const deathSaves: { kind: string; delta: number }[] = [];
    const hitDice: number[] = [];
    const rests: string[] = [];
    fixture.componentInstance.deathSave.subscribe((change) => deathSaves.push(change));
    fixture.componentInstance.hitDice.subscribe((delta) => hitDice.push(delta));
    fixture.componentInstance.rest.subscribe((type) => rests.push(type));

    const tracks = root.querySelectorAll('.saves-track');
    tracks[0]?.querySelectorAll('button')[3]?.click();
    tracks[1]?.querySelectorAll('button')[1]?.click();
    buttonByText(root, 'Riposo breve').click();
    buttonByText(root, 'Riposo lungo').click();

    expect(deathSaves).toEqual([{ kind: 'failures', delta: 1 }]);
    expect(hitDice).toEqual([1]);
    expect(rests).toEqual(['short', 'long']);
  });

  it('disabilita i pulsanti di PF, condizioni e riposo quando busy', () => {
    const fixture = create({ conditions: [{ name: 'prone' }], busy: true });
    const root = fixture.nativeElement as HTMLElement;
    const emitted: string[] = [];
    fixture.componentInstance.hpPatch.subscribe(() => emitted.push('hp'));
    fixture.componentInstance.conditionAdd.subscribe(() => emitted.push('condition'));

    expect(buttonByText(root, 'Subisci').disabled).toBe(true);
    expect(buttonByText(root, 'Cura').disabled).toBe(true);
    expect(buttonByText(root, 'Applica temp').disabled).toBe(true);
    expect(buttonByText(root, 'Aggiungi').disabled).toBe(true);

    buttonByText(root, 'Subisci').click();
    buttonByText(root, 'Cura').click();
    buttonByText(root, 'Applica temp').click();
    buttonByText(root, 'Aggiungi').click();

    expect(emitted).toEqual([]);
  });

  it('disabilita i pulsanti di riposo quando restBusy', () => {
    const fixture = create();
    fixture.componentRef.setInput('restBusy', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(buttonByText(root, 'Riposo breve').disabled).toBe(true);
    expect(buttonByText(root, 'Riposo lungo').disabled).toBe(true);
  });
});
