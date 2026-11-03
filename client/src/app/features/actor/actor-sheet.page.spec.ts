import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Condition, DmSheetView, PcStatblock, SheetPatch } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/actor.service';
import { AssetService } from '../../core/asset.service';
import { CampaignService } from '../../core/campaign.service';
import { PlayerService } from '../../core/player.service';
import { SceneActionService } from '../../core/scene-action.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import { ActorSheetPage } from './actor-sheet.page';

const ACTOR_ID = '0190f000-0000-7000-8000-000000000010';
const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';

const pcStatblock = (): PcStatblock => ({
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

const sheetView = (): DmSheetView => {
  const statblock = pcStatblock();
  return {
    actor: {
      id: ACTOR_ID,
      campaignId: CAMPAIGN_ID,
      kind: 'pc',
      name: 'Aria',
      statblock,
      rulesVersion: 'test',
      xp: 0,
      sheetVersion: 1,
      dmNotes: null,
      imageAssetId: null,
      portrait: null,
      hp: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    statblock,
    derived: null,
    inventory: [],
    sheetVersion: 1,
    campaign: { id: CAMPAIGN_ID, name: 'Campagna di prova' },
    dmNotes: null,
  };
};

describe('ActorSheetPage', () => {
  let current: DmSheetView;
  let getSheet: ReturnType<typeof vi.fn>;
  let patchSheet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    current = sheetView();
    getSheet = vi.fn((): Promise<DmSheetView> => Promise.resolve(current));
    patchSheet = vi.fn((_actorId: string, input: SheetPatch): Promise<DmSheetView> => {
      const hp = input.patch.hp ?? current.statblock.hp;
      current = {
        ...current,
        actor: { ...current.actor, statblock: { ...current.statblock, hp } },
        statblock: { ...current.statblock, hp },
      };
      return Promise.resolve(current);
    });
    TestBed.configureTestingModule({
      imports: [ActorSheetPage],
      providers: [
        provideRouter([]),
        { provide: ActorService, useValue: { getSheet, patchSheet } },
        { provide: AssetService, useValue: {} },
        { provide: CampaignService, useValue: { get: () => Promise.resolve({ activeSceneId: null }) } },
        { provide: PlayerService, useValue: { getLink: () => Promise.resolve(null) } },
        { provide: SceneActionService, useValue: {} },
        { provide: SrdCatalogService, useValue: {} },
      ],
    });
  });

  const create = (): ActorSheetPage => {
    const fixture = TestBed.createComponent(ActorSheetPage);
    fixture.componentRef.setInput('actorId', ACTOR_ID);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentInstance.view.set(current);
    return fixture.componentInstance;
  };

  it('applica la cura agli HP di un PG fuori mappa con patch ottimistica', async () => {
    const page = create();

    await page.onHpChange({ mode: 'heal', amount: 5 });

    expect(patchSheet).toHaveBeenCalledWith(ACTOR_ID, {
      sheetVersion: 1,
      patch: { hp: { current: 15, max: 20, temp: 0 } },
    });
    expect(page.view()?.statblock.hp.current).toBe(15);
    expect(page.error()).toBeNull();
  });

  it('mappa un 404 in un messaggio italiano senza perdere la vista', async () => {
    const page = create();
    page.notesDraft.set('annotazione del DM');
    patchSheet.mockRejectedValueOnce(new HttpErrorResponse({ status: 404 }));

    await page.saveNotes();

    expect(page.error()).toBe('Attore non trovato.');
    expect(page.view()?.statblock.hp.current).toBe(10);
  });

  it('carica le note del DM nel form della scheda', async () => {
    current = {
      ...current,
      actor: { ...current.actor, dmNotes: 'Il ponte è crollato.' },
      dmNotes: 'Il ponte è crollato.',
    };
    const page = create();

    page.ngOnInit();

    await vi.waitFor(() => expect(page.notesDraft()).toBe('Il ponte è crollato.'));
    expect(page.notesForm.notes().touched()).toBe(false);
  });

  it('salva le note tramite patchSheet e marca il campo touched', async () => {
    const page = create();
    page.notesDraft.set('Nuova nota');

    await page.saveNotes();

    expect(patchSheet).toHaveBeenCalledWith(ACTOR_ID, {
      sheetVersion: 1,
      patch: { dmNotes: 'Nuova nota' },
    });
    expect(page.notesForm.notes().touched()).toBe(true);
    expect(page.notesSaved()).toBe(true);
    expect(page.savingNotes()).toBe(false);
  });

  it('blocca il salvataggio delle note oltre 20000 caratteri', async () => {
    const page = create();
    page.notesDraft.set('x'.repeat(20001));

    await page.saveNotes();

    expect(patchSheet).not.toHaveBeenCalled();
    expect(page.notesForm.notes().errors()[0]?.message).toBe(
      'Le note non possono superare 20000 caratteri.',
    );
    expect(page.notesForm.notes().touched()).toBe(true);
    expect(page.savingNotes()).toBe(false);
  });

  it('aggiunge una condizione assente con patch alla scheda', async () => {
    const page = create();

    await page.addCondition({ name: 'prone' });

    expect(patchSheet).toHaveBeenCalledWith(ACTOR_ID, {
      sheetVersion: 1,
      patch: { conditions: [{ name: 'prone' }] },
    });
  });

  it('non aggiunge una condizione già attiva', async () => {
    const conditions: Condition[] = [{ name: 'prone' }];
    current = { ...current, statblock: { ...current.statblock, conditions } };
    const page = create();

    await page.addCondition({ name: 'prone' });

    expect(patchSheet).not.toHaveBeenCalled();
  });

  it('non mostra placeholder del dialog livello a riposo', () => {
    const fixture = TestBed.createComponent(ActorSheetPage);
    fixture.componentRef.setInput('actorId', ACTOR_ID);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.componentInstance.view.set(current);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Caricamento livello');

    fixture.destroy();
  });
});
