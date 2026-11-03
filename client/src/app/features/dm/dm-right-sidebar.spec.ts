import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import {
  defaultBackgroundTransform,
  type Campaign,
  type Display,
  type Scene,
  type TokenState,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { CampaignShellStore } from './campaign-shell.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DEFAULT_SECTIONS, DmLayoutStore, type SidebarSectionId } from './dm-layout.store';
import { DmRightSidebar } from './dm-right-sidebar';
import { DmUiStore } from './dm-ui.store';
import type { ScreenSummary } from './regia-summary';
import { RegiaStore } from './regia.store';
import { SceneTokensStore } from './scene-tokens.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const TOKEN_ID = '0190f000-0000-7000-8000-000000000003';

const campaign = (): Campaign => ({
  id: CAMPAIGN_ID,
  name: 'La Valle',
  description: '',
  activeSceneId: SCENE_ID,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const scene = (): Scene => ({
  id: SCENE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Cripta',
  imageAssetId: null,
  widthPx: 1400,
  heightPx: 1000,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  backgroundTransform: defaultBackgroundTransform,
});

const token = (overrides: Partial<TokenState> = {}): TokenState => ({
  id: TOKEN_ID,
  label: 'Goblin',
  x: 0,
  y: 0,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
  ...overrides,
});

const summary = (): ScreenSummary => ({
  display: {
    id: '0190f000-0000-7000-8000-000000000004',
    campaignId: CAMPAIGN_ID,
    code: 'ABCD1234',
    label: 'Schermo giocatori',
    compositionVersion: 1,
    viewportWidth: 1920,
    viewportHeight: 1080,
    createdAt: '2026-11-03T10:00:00.000Z',
    lastSeenAt: '2026-11-03T10:00:00.000Z',
    revokedAt: null,
  } satisfies Display,
  state: null,
});

describe('DmRightSidebar', () => {
  const rightOpen = signal(true);
  const sections = signal<Record<SidebarSectionId, boolean>>({ ...DEFAULT_SECTIONS });
  const tokens = signal<TokenState[]>([token()]);
  const selectedTokenId = signal<string | null>(null);
  const screens = signal<ScreenSummary[]>([summary()]);
  const activeCampaign = signal<Campaign | null>(campaign());
  const activeScene = signal<Scene | null>(scene());

  const toggleRight = vi.fn(() => rightOpen.update((open) => !open));
  const toggleSection = vi.fn((section: SidebarSectionId): boolean => {
    const opening = !sections()[section];
    sections.update((state) => ({ ...state, [section]: opening }));
    return opening;
  });
  const persistActive = vi.fn();
  const center = vi.fn();
  const changeTokenHp = vi.fn().mockResolvedValue(undefined);
  const toggleVisibility = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const loadScreens = vi.fn().mockResolvedValue(undefined);
  const openScreenDialog = vi.fn();

  beforeEach(() => {
    rightOpen.set(true);
    sections.set({ ...DEFAULT_SECTIONS });
    tokens.set([token()]);
    selectedTokenId.set(null);
    screens.set([summary()]);
    activeCampaign.set(campaign());
    activeScene.set(scene());
    toggleRight.mockClear();
    toggleSection.mockClear();
    persistActive.mockClear();
    center.mockClear();
    changeTokenHp.mockClear();
    toggleVisibility.mockClear();
    remove.mockClear();
    loadScreens.mockClear();
    openScreenDialog.mockClear();

    TestBed.configureTestingModule({
      imports: [DmRightSidebar],
      providers: [
        {
          provide: DmLayoutStore,
          useValue: { rightOpen, sections, toggleRight, toggleSection, persistActive },
        },
        { provide: DmUiStore, useValue: { selectedTokenId } },
        {
          provide: SceneTokensStore,
          useValue: { tokens, center, changeTokenHp, toggleVisibility, remove },
        },
        { provide: CampaignShellStore, useValue: { activeCampaign } },
        { provide: DmCampaignStore, useValue: { activeScene } },
        {
          provide: RegiaStore,
          useValue: {
            screens,
            projectionLabel: (item: ScreenSummary) => `Proiezione ${item.display.code}`,
            lastSeen: () => 'ora',
            loadScreens,
            openScreenDialog,
          },
        },
        { provide: AuthService, useValue: { sessions: vi.fn().mockResolvedValue([]) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
  });

  const create = (): { root: HTMLElement; fixture: ComponentFixture<DmRightSidebar> } => {
    const fixture = TestBed.createComponent(DmRightSidebar);
    fixture.detectChanges();
    return { root: fixture.nativeElement as HTMLElement, fixture };
  };

  const sectionTrigger = (root: HTMLElement, label: string): HTMLButtonElement => {
    const trigger = [...root.querySelectorAll<HTMLButtonElement>('.accordion__trigger')]
      .find((candidate) => candidate.textContent?.includes(label));
    if (trigger === undefined) {
      throw new Error(`Sezione "${label}" non trovata`);
    }
    return trigger;
  };

  it('mostra il pannello aperto e lo collassa con persistenza', () => {
    const { root, fixture } = create();

    expect(root.querySelector('.dm-panel--right')?.getAttribute('aria-label')).toBe('Token in mappa');
    expect(root.querySelectorAll('.accordion')).toHaveLength(3);
    expect(sectionTrigger(root, 'In mappa').textContent).toContain('1');

    root.querySelector<HTMLButtonElement>('.panel-toggle')?.click();
    fixture.detectChanges();

    expect(toggleRight).toHaveBeenCalledTimes(1);
    expect(persistActive).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.dm-panel--right')?.classList.contains('is-collapsed')).toBe(true);
    expect(root.querySelectorAll('.accordion')).toHaveLength(0);
  });

  it('apre le sezioni e ricarica gli schermi solo alla loro apertura', () => {
    sections.update((state) => ({ ...state, screens: false, tokens: false }));
    const { root, fixture } = create();

    sectionTrigger(root, 'In mappa').click();
    expect(toggleSection).toHaveBeenCalledWith('tokens');
    expect(persistActive).toHaveBeenCalled();
    expect(loadScreens).not.toHaveBeenCalled();

    fixture.detectChanges();
    sectionTrigger(root, 'Schermi').click();
    expect(toggleSection).toHaveBeenCalledWith('screens');
    expect(loadScreens).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it('centra, modifica PF, visibilità e rimozione dei token con la scena attiva', () => {
    const item = token();
    const { root } = create();

    root.querySelector<HTMLButtonElement>('.token-row__name')?.click();
    expect(center).toHaveBeenCalledWith(item);

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.token-row__icon')];
    buttons[0]?.click();
    expect(changeTokenHp).toHaveBeenCalledWith(SCENE_ID, item, -5);

    buttons[2]?.click();
    expect(toggleVisibility).toHaveBeenCalledWith(SCENE_ID, item);

    buttons[3]?.click();
    expect(remove).toHaveBeenCalledWith(SCENE_ID, item);
  });

  it('elenca gli schermi e apre il dialogo di regia', () => {
    const item = summary();
    const { root } = create();

    const row = root.querySelector<HTMLButtonElement>('.screen-row');
    expect(row).not.toBeNull();
    row?.click();

    expect(openScreenDialog).toHaveBeenCalledWith(item);
  });

  it('mostra la sezione dispositivi con il placeholder del defer', () => {
    const { root } = create();

    expect(sectionTrigger(root, 'Dispositivi').getAttribute('aria-expanded')).toBe('true');
    expect(root.textContent).toContain('Caricamento dispositivi.');
  });
});
