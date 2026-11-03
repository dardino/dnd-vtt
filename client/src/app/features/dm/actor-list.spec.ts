import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Actor, TokenState } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorList, type ActorListDragStart } from './actor-list';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000002';
const OTHER_ID = '0190f000-0000-7000-8000-000000000003';

const monster = (id: string, name: string): Actor => ({
  id,
  campaignId: CAMPAIGN_ID,
  kind: 'monster',
  name,
  statblock: {
    kind: 'monster',
    size: 'small',
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    hp: { current: 7, max: 7, temp: 0 },
    speed: { walk: 30 },
    senses: {},
    languages: ['common'],
    conditions: [],
    creatureType: 'humanoid',
    cr: '1/4',
    tags: [],
    ac: 15,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    reactions: [],
  },
  rulesVersion: null,
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId: null,
  portrait: null,
  hp: { current: 7, max: 7, temp: 0 },
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
});

const token = (id: string, actorId: string): TokenState => ({
  id,
  actorId,
  label: 'Goblin',
  x: 0,
  y: 0,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
  owner: 'dm',
});

interface CreateOptions {
  tokens?: readonly TokenState[];
  canAdd?: boolean;
  readOnly?: boolean;
  subtitle?: (actor: Actor) => string;
}

describe('ActorList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ActorList],
      providers: [provideRouter([])],
    });
  });

  const create = (
    actors: readonly Actor[],
    options: CreateOptions = {},
  ): ComponentFixture<ActorList> => {
    const fixture = TestBed.createComponent(ActorList);
    fixture.componentRef.setInput('actors', actors);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentRef.setInput('tokens', options.tokens ?? []);
    fixture.componentRef.setInput('canAdd', options.canAdd ?? true);
    fixture.componentRef.setInput('readOnly', options.readOnly ?? false);
    fixture.componentRef.setInput(
      'subtitle',
      options.subtitle ?? ((actor: Actor) => `Sub ${actor.name}`),
    );
    fixture.detectChanges();
    return fixture;
  };

  it('mostra il messaggio di vuoto senza creare la lista', () => {
    const fixture = create([]);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.available-actors')).toBeNull();
    expect(root.querySelector('p.muted')?.textContent).toContain('Nessun mostro o NPC disponibile');
  });

  it('mostra nome, sottotitolo, HP e conteggio token per attore', () => {
    const subtitle = vi.fn((actor: Actor) => `Sottotitolo ${actor.name}`);
    const fixture = create([monster(ACTOR_ID, 'Goblin')], {
      tokens: [token('t1', ACTOR_ID), token('t2', ACTOR_ID), token('t3', OTHER_ID)],
      subtitle,
    });
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.available-actor');

    expect(items).toHaveLength(1);
    expect(items[0]?.querySelector('.available-actor__name')?.textContent).toBe('Goblin');
    expect(items[0]?.querySelector('.available-actor__meta')?.textContent).toContain(
      'Sottotitolo Goblin',
    );
    expect(items[0]?.querySelector('.available-actor__meta')?.textContent).toContain('7/7 PF');
    expect(items[0]?.querySelector('.available-actor__meta')?.textContent).toContain(
      '2 in mappa',
    );
    expect(subtitle).toHaveBeenCalledWith(expect.objectContaining({ id: ACTOR_ID }));
  });

  it('emette addActor al click sul pulsante +', () => {
    const fixture = create([monster(ACTOR_ID, 'Goblin')]);
    const emitted = vi.fn<(actor: Actor) => void>();
    fixture.componentInstance.addActor.subscribe(emitted);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button.icon-button',
    ) as HTMLButtonElement;

    button.click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]).toMatchObject({ id: ACTOR_ID, name: 'Goblin' });
  });

  it('emette dragStart con evento e attore', () => {
    const fixture = create([monster(ACTOR_ID, 'Goblin')]);
    const emitted = vi.fn<(payload: ActorListDragStart) => void>();
    fixture.componentInstance.dragStart.subscribe(emitted);
    const item = (fixture.nativeElement as HTMLElement).querySelector(
      '.available-actor',
    ) as HTMLElement;
    const event = new Event('dragstart', { bubbles: true });

    item.dispatchEvent(event);

    expect(emitted).toHaveBeenCalledTimes(1);
    const payload = emitted.mock.calls[0]?.[0];
    expect(payload?.event).toBe(event);
    expect(payload?.actor.id).toBe(ACTOR_ID);
  });

  it('disabilita il pulsante + con canAdd=false o readOnly', () => {
    const fixture = create([monster(ACTOR_ID, 'Goblin')], { canAdd: false });
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button.icon-button') as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    fixture.componentRef.setInput('canAdd', true);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    expect(button.disabled).toBe(true);
    expect(root.querySelector('.available-actor')?.getAttribute('draggable')).toBeNull();
  });

  it('costruisce il link "Crea mostro o NPC" con la campagna', () => {
    const fixture = create([]);
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.dm-link-button');

    expect(link?.getAttribute('href')).toBe(
      `/dm/campaigns/${CAMPAIGN_ID}/actors/new/monster`,
    );
    expect(link?.textContent).toContain('Crea mostro o NPC');
  });
});
