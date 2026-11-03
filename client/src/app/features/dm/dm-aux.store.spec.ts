import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Actor, Campaign, CampaignExport, ImportResult, MonsterStatblock } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/actor.service';
import { AiService } from '../../core/ai.service';
import { AssetService } from '../../core/asset.service';
import { CampaignService } from '../../core/campaign.service';
import { CampaignShellStore } from './campaign-shell.store';
import { DEFAULT_MONSTER_NAME, DmAuxStore } from './dm-aux.store';
import { DmUiStore } from './dm-ui.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000002';

const campaign = (name = 'La Valle'): Campaign => ({
  id: CAMPAIGN_ID,
  name,
  description: '',
  activeSceneId: null,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const statblock = (): MonsterStatblock => ({
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
});

const actor = (name: string): Actor => ({
  id: ACTOR_ID,
  campaignId: CAMPAIGN_ID,
  kind: 'monster',
  name,
  statblock: statblock(),
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

const importResult = (): ImportResult => ({
  campaign: campaign(),
  imported: { scenes: 2, actors: 3, assets: 1 },
});

interface AiApiFake {
  status: ReturnType<typeof vi.fn>;
  parseStatblock: ReturnType<typeof vi.fn>;
}

interface CampaignApiFake {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  listScenes: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  exportCampaign: ReturnType<typeof vi.fn>;
  importCampaign: ReturnType<typeof vi.fn>;
}

describe('DmAuxStore', () => {
  let store: InstanceType<typeof DmAuxStore>;
  let ui: InstanceType<typeof DmUiStore>;
  let shell: InstanceType<typeof CampaignShellStore>;
  let aiApi: AiApiFake;
  let campaignsApi: CampaignApiFake;
  let actorsApi: { createActor: ReturnType<typeof vi.fn> };

  const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:dnd-vtt');
  const revokeObjectURL = vi.fn((_url: string) => undefined);
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    aiApi = {
      status: vi.fn().mockResolvedValue({ enabled: true, message: 'Provider pronto' }),
      parseStatblock: vi.fn().mockResolvedValue({ statblock: statblock(), source: 'regex' }),
    };
    campaignsApi = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(campaign()),
      listScenes: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
      exportCampaign: vi.fn().mockResolvedValue({ schemaVersion: 1 }),
      importCampaign: vi.fn().mockResolvedValue(importResult()),
    };
    actorsApi = { createActor: vi.fn().mockResolvedValue(actor('Goblin')) };

    originalCreate = Reflect.get<typeof URL, 'createObjectURL'>(URL, 'createObjectURL');
    originalRevoke = Reflect.get<typeof URL, 'revokeObjectURL'>(URL, 'revokeObjectURL');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    TestBed.configureTestingModule({
      providers: [
        { provide: AiService, useValue: aiApi },
        { provide: CampaignService, useValue: campaignsApi },
        { provide: ActorService, useValue: actorsApi },
        { provide: AssetService, useValue: { get: vi.fn() } },
      ],
    });
    shell = TestBed.inject(CampaignShellStore);
    ui = TestBed.inject(DmUiStore);
    store = TestBed.inject(DmAuxStore);
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.restoreAllMocks();
  });

  it('parte dai default della sezione IA ed export', () => {
    expect(store.aiEnabled()).toBe(false);
    expect(store.aiMessage()).toBe('Chat IA non configurata.');
    expect(store.aiText()).toBe('');
    expect(store.aiBusy()).toBe(false);
    expect(store.aiPreview()).toBeNull();
    expect(store.aiName()).toBe(DEFAULT_MONSTER_NAME);
    expect(store.includePrivateNotes()).toBe(false);
  });

  it('load allinea enabled e message dal provider', async () => {
    await store.load();

    expect(aiApi.status).toHaveBeenCalledTimes(1);
    expect(store.aiEnabled()).toBe(true);
    expect(store.aiMessage()).toBe('Provider pronto');
  });

  it('analyze analizza il testo trimmato e prepara la preview', async () => {
    store.setText('  Goblin  ');

    await store.analyze(CAMPAIGN_ID);

    expect(aiApi.parseStatblock).toHaveBeenCalledWith(CAMPAIGN_ID, 'Goblin');
    expect(store.aiPreview()).toEqual(statblock());
    expect(store.aiBusy()).toBe(false);
    expect(ui.statusMessage()).toBe('Statblock analizzato: controlla e crea il mostro.');
  });

  it('analyze ignora testo vuoto o richiesta in corso', async () => {
    await store.analyze(CAMPAIGN_ID);
    expect(aiApi.parseStatblock).not.toHaveBeenCalled();

    store.setText('Goblin');
    let resolveParse: ((value: unknown) => void) | undefined;
    aiApi.parseStatblock.mockReturnValue(new Promise((resolve) => {
      resolveParse = resolve;
    }));

    const first = store.analyze(CAMPAIGN_ID);
    expect(store.aiBusy()).toBe(true);
    await store.analyze(CAMPAIGN_ID);
    expect(aiApi.parseStatblock).toHaveBeenCalledTimes(1);

    resolveParse?.({ statblock: statblock(), source: 'regex' });
    await first;
    expect(store.aiBusy()).toBe(false);
  });

  it('analyze in errore imposta la notice e rilascia il busy', async () => {
    store.setText('Goblin');
    aiApi.parseStatblock.mockRejectedValue(new HttpErrorResponse({ status: 404 }));

    await store.analyze(CAMPAIGN_ID);

    expect(ui.notice()).toBe('La campagna non esiste più.');
    expect(store.aiPreview()).toBeNull();
    expect(store.aiBusy()).toBe(false);
  });

  it('createMonster crea l\'attore, lo aggiunge al party e pulisce gli input', async () => {
    store.setText('Goblin');
    await store.analyze(CAMPAIGN_ID);
    store.setName('  Goblin capo  ');

    await store.createMonster(CAMPAIGN_ID);

    expect(actorsApi.createActor).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      kind: 'monster',
      name: 'Goblin capo',
      statblock: statblock(),
    });
    expect(shell.party()).toEqual([actor('Goblin')]);
    expect(store.aiPreview()).toBeNull();
    expect(store.aiText()).toBe('');
    expect(ui.statusMessage()).toBe('Creato: Goblin');
  });

  it('createMonster usa il nome di default e non parte senza preview', async () => {
    await store.createMonster(CAMPAIGN_ID);
    expect(actorsApi.createActor).not.toHaveBeenCalled();

    store.setText('Goblin');
    await store.analyze(CAMPAIGN_ID);
    store.setName('   ');

    await store.createMonster(CAMPAIGN_ID);

    expect(actorsApi.createActor).toHaveBeenCalledWith(
      expect.objectContaining({ name: DEFAULT_MONSTER_NAME }),
    );
  });

  it('createMonster in errore imposta la notice e mantiene la preview', async () => {
    store.setText('goblin');
    await store.analyze(CAMPAIGN_ID);
    actorsApi.createActor.mockRejectedValueOnce(new HttpErrorResponse({ status: 404 }));

    await store.createMonster(CAMPAIGN_ID);

    expect(ui.notice()).toBe('La campagna non esiste più.');
    expect(store.aiBusy()).toBe(false);
    expect(store.aiPreview()).not.toBeNull();
  });

  it('export scarica il bundle con le note private richieste', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    shell.setActiveCampaign(campaign('La Valle Perduta'));
    store.setIncludePrivateNotes(true);

    await store.export(CAMPAIGN_ID);

    expect(campaignsApi.exportCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dnd-vtt');
    expect(click).toHaveBeenCalledTimes(1);
    expect(ui.statusMessage()).toBe('Campagna esportata');
  });

  it('export in errore imposta la notice', async () => {
    campaignsApi.exportCampaign.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

    await store.export(CAMPAIGN_ID);

    expect(ui.notice()).toBe('Sessione scaduta: autentica di nuovo.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('import legge il file e restituisce il risultato del server', async () => {
    const bundle = { schemaVersion: 1, campaign: campaign() } as unknown as CampaignExport;
    const text = vi.fn().mockResolvedValue(JSON.stringify(bundle));
    const file = { text } as unknown as File;

    const result = await store.import(file);

    expect(text).toHaveBeenCalledTimes(1);
    expect(campaignsApi.importCampaign).toHaveBeenCalledWith(bundle);
    expect(result).toEqual(importResult());
  });

  it('aggiorna testo, nome e note private', () => {
    store.setText('Statblock');
    store.setName('Orso');
    store.setIncludePrivateNotes(true);

    expect(store.aiText()).toBe('Statblock');
    expect(store.aiName()).toBe('Orso');
    expect(store.includePrivateNotes()).toBe(true);
  });
});
