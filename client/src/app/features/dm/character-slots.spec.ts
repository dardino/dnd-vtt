import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Actor } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorPortraitThumb } from '../scene/scene-canvas.component';
import { CharacterSlots, type CharacterSlotsDragStart } from './character-slots';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000002';

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

const portrait: ActorPortraitThumb = {
  url: 'https://example.test/aria.png',
  focusX: 0.5,
  focusY: 0.25,
  zoom: 1.5,
};

interface CreateOptions {
  readOnly?: boolean;
  portraitFor?: (actor: Actor) => ActorPortraitThumb | null;
  subtitle?: (actor: Actor) => string;
  hpRatio?: (actor: Actor) => number;
}

describe('CharacterSlots', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CharacterSlots],
      providers: [provideRouter([])],
    });
  });

  const create = (
    slots: readonly (Actor | null)[],
    options: CreateOptions = {},
  ): ComponentFixture<CharacterSlots> => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CharacterSlots);
    fixture.componentRef.setInput('slots', slots);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentRef.setInput('readOnly', options.readOnly ?? false);
    fixture.componentRef.setInput('portraitFor', options.portraitFor ?? (() => null));
    fixture.componentRef.setInput('subtitle', options.subtitle ?? ((actor: Actor) => `Sub ${actor.name}`));
    fixture.componentRef.setInput('hpRatio', options.hpRatio ?? (() => 0.5));
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<CharacterSlots>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('mostra lo slot pieno con nome, tipo, sottotitolo, PF e iniziale', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor]);
    const slot = root(fixture).querySelector('.slot');

    expect(slot?.querySelector('.slot__name')?.textContent).toBe('Aria');
    expect(slot?.querySelector('.slot__kind')?.textContent).toBe('PG');
    expect(slot?.querySelector('.slot__subtitle')?.textContent).toBe('Sub Aria');
    expect(slot?.querySelector('.slot__foot .muted')?.textContent).toContain('10/20 PF');
    expect(slot?.querySelector('.slot__portrait span')?.textContent).toBe('A');
    expect(root(fixture).querySelector('.slot--empty')).toBeNull();
  });

  it('mostra i ritratti con focus e zoom quando disponibili', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor], { portraitFor: () => portrait });
    const img = root(fixture).querySelector('.slot__portrait img') as HTMLImageElement;

    expect(img.getAttribute('src')).toBe(portrait.url);
    expect(img.style.objectPosition).toBe('50% 25%');
    expect(img.style.transform).toBe('scale(1.5)');
    expect(root(fixture).querySelector('.slot__portrait span')).toBeNull();
  });

  it('mostra lo slot vuoto come link alla creazione PG', () => {
    const fixture = create([null]);
    const empty = root(fixture).querySelector('.slot--empty') as HTMLAnchorElement;

    expect(empty.getAttribute('href')).toBe(`/dm/campaigns/${CAMPAIGN_ID}/actors/new/pc`);
    expect(empty.getAttribute('aria-label')).toBe('Slot vuoto: aggiungi attore');
    expect(empty.textContent?.trim()).toBe('+');
  });

  it('applica il ratio HP come variabile CSS', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor], { hpRatio: () => 0.25 });
    const hp = root(fixture).querySelector('.slot__hp') as HTMLElement;

    expect(hp.style.getPropertyValue('--slot-hp')).toBe('0.25');
    expect(hp.getAttribute('aria-hidden')).toBe('true');
  });

  it('emette select al click, Enter e Space (con preventDefault su Space)', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor]);
    const emitted = vi.fn<(value: Actor) => void>();
    fixture.componentInstance.selectActor.subscribe(emitted);
    const slot = root(fixture).querySelector('.slot') as HTMLElement;

    slot.click();
    slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    slot.dispatchEvent(space);

    expect(emitted).toHaveBeenCalledTimes(3);
    expect(emitted.mock.calls[0]?.[0]).toMatchObject({ id: ACTOR_ID, name: 'Aria' });
    expect(space.defaultPrevented).toBe(true);
  });

  it('emette dragStart con evento e attore e non è draggable in sola lettura', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor]);
    const emitted = vi.fn<(payload: CharacterSlotsDragStart) => void>();
    fixture.componentInstance.dragStart.subscribe(emitted);
    const slot = root(fixture).querySelector('.slot') as HTMLElement;
    const event = new Event('dragstart', { bubbles: true });

    slot.dispatchEvent(event);

    expect(slot.getAttribute('draggable')).toBe('true');
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]?.event).toBe(event);
    expect(emitted.mock.calls[0]?.[0]?.actor.id).toBe(ACTOR_ID);

    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    expect(slot.getAttribute('draggable')).toBeNull();
  });

  it('collega la Scheda e blocca la propagazione del click', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    const fixture = create([actor]);
    const emitted = vi.fn<(value: Actor) => void>();
    fixture.componentInstance.selectActor.subscribe(emitted);
    const sheet = root(fixture).querySelector('.slot__sheet') as HTMLAnchorElement;

    expect(sheet.getAttribute('href')).toBe(
      `/dm/campaigns/${CAMPAIGN_ID}/actors/${ACTOR_ID}/sheet`,
    );
    sheet.click();

    expect(emitted).not.toHaveBeenCalled();
  });

  it('espone ruolo, tabindex e aria-label della sezione', () => {
    const fixture = create([pc(ACTOR_ID, 'Aria'), null]);
    const section = root(fixture).querySelector('section.slots') as HTMLElement;
    const slot = root(fixture).querySelector('.slot') as HTMLElement;

    expect(section.getAttribute('aria-label')).toBe('Slot personaggi');
    expect(slot.getAttribute('role')).toBe('button');
    expect(slot.getAttribute('tabindex')).toBe('0');
    expect(root(fixture).querySelectorAll('.slot--empty')).toHaveLength(1);
  });
});
