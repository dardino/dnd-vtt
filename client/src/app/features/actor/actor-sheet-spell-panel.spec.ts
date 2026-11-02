import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ActorSheetSpellPanel,
  type SpellPanelPactSlot,
  type SpellPanelSlot,
  type SpellPanelSpell,
  type SpellSlotChange,
} from './actor-sheet-spell-panel';

const slot = (level: number, used: number, max: number): SpellPanelSlot => ({ level, used, max });

const pact = (): SpellPanelPactSlot => ({ level: 2, used: 1, max: 1 });

const spell = (): SpellPanelSpell => ({
  id: 'fireball',
  name: 'Palla di fuoco',
  level: 3,
  meta: 'evocazione · 1 azione · 150 ft · V, S, M · istantanea',
  description: 'Danno di fuoco.',
});

describe('ActorSheetSpellPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetSpellPanel] });
  });

  const create = (options: {
    slots?: SpellPanelSlot[];
    pactSlots?: SpellPanelPactSlot | null;
    spells?: SpellPanelSpell[];
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetSpellPanel);
    fixture.componentRef.setInput('slots', options.slots ?? [slot(1, 2, 3)]);
    fixture.componentRef.setInput('pactSlots', options.pactSlots === undefined ? pact() : options.pactSlots);
    fixture.componentRef.setInput('spells', options.spells ?? [spell()]);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra slot, slot pact, incantesimi e metadati', () => {
    const fixture = create();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Livello 1');
    expect(text).toContain('2/3');
    expect(text).toContain('Patto livello 2');
    expect(text).toContain('1/1');
    expect(text).toContain('Palla di fuoco');
    expect(text).toContain('evocazione · 1 azione · 150 ft · V, S, M · istantanea');
    expect(text).toContain('Danno di fuoco.');
    expect(text).not.toContain('Nessuno slot.');
    expect(text).not.toContain('Nessun incantesimo.');
  });

  it('emette slotChange e pactSlotChange dai pulsanti', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const slots: SpellSlotChange[] = [];
    const pacts: number[] = [];
    fixture.componentInstance.slotChange.subscribe((change) => slots.push(change));
    fixture.componentInstance.pactSlotChange.subscribe((delta) => pacts.push(delta));

    const rows = root.querySelectorAll('.plain-list li');
    rows[0]?.querySelectorAll('button')[0]?.click();
    rows[0]?.querySelectorAll('button')[1]?.click();
    rows[1]?.querySelectorAll('button')[0]?.click();
    rows[1]?.querySelectorAll('button')[1]?.click();

    expect(slots).toEqual([
      { level: 1, delta: -1 },
      { level: 1, delta: 1 },
    ]);
    expect(pacts).toEqual([-1, 1]);
  });

  it('mostra gli stati vuoti senza slot e senza incantesimi', () => {
    const fixture = create({ slots: [], pactSlots: null, spells: [] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Nessuno slot.');
    expect(text).toContain('Nessun incantesimo.');
    expect(text).not.toContain('Patto livello');
  });
});
