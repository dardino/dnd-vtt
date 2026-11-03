import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { DOCK_TABS, type DockTab } from './dm-dock';

export type SidebarSectionId = 'campaign' | 'scenes' | 'grid' | 'fog' | 'scenography' | 'actors' | 'ai' | 'screens' | 'devices' | 'tokens';

export const DEFAULT_SECTIONS: Record<SidebarSectionId, boolean> = {
  campaign: true,
  scenes: true,
  grid: true,
  fog: true,
  scenography: true,
  actors: true,
  ai: true,
  screens: true,
  devices: true,
  tokens: true,
};

export const PANEL_STORAGE_PREFIX = 'dnd-vtt:panels:';

const SIDEBAR_SECTION_IDS = Object.keys(DEFAULT_SECTIONS) as SidebarSectionId[];
const DEFAULT_DOCK_TAB: DockTab = 'initiative';
export interface DmLayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  dockOpen: boolean;
  dockTab: DockTab;
  sections: Record<SidebarSectionId, boolean>;
}

interface StoredLayout {
  left?: unknown;
  right?: unknown;
  dock?: unknown;
  tab?: unknown;
  sections?: Record<string, unknown>;
}

/** Stato iniziale dei pannelli della console: tutto aperto, dock su iniziativa. */
export const defaultDmLayout = (): DmLayoutState => ({
  leftOpen: true,
  rightOpen: true,
  dockOpen: true,
  dockTab: DEFAULT_DOCK_TAB,
  sections: { ...DEFAULT_SECTIONS },
});

const isDockTab = (value: unknown): value is DockTab =>
  typeof value === 'string' && DOCK_TABS.includes(value as DockTab);

/**
 * Stato dei pannelli della console DM (sidebar, dock e accordion). Le
 * preferenze sono salvate per campagna in `localStorage` con la stessa chiave
 * e lo stesso formato usato prima dello split; il tab del dock è incluso, così
 * cambiare scena non riporta il dock alla tab iniziale.
 */
export const DmLayoutStore = signalStore(
  { providedIn: 'root' },
  withState(defaultDmLayout),
  withMethods((store) => {
    const storageKey = (campaignId: string): string =>
      `${PANEL_STORAGE_PREFIX}${campaignId}`;

    return {
      toggleLeft(): void {
        patchState(store, { leftOpen: !store.leftOpen() });
      },

      toggleRight(): void {
        patchState(store, { rightOpen: !store.rightOpen() });
      },

      toggleDock(): void {
        patchState(store, { dockOpen: !store.dockOpen() });
      },

      /** Inverte la sezione e ritorna `true` se è stata aperta. */
      toggleSection(section: SidebarSectionId): boolean {
        const opening = !store.sections()[section];
        patchState(store, {
          sections: { ...store.sections(), [section]: opening },
        });
        return opening;
      },

      /** Selezionare una tab riapre il dock, come nella console pre-split. */
      setDockTab(tab: DockTab): void {
        patchState(store, { dockTab: tab, dockOpen: true });
      },

      /**
       * Riporta i pannelli ai default e applica le preferenze salvate per la
       * campagna. Payload assente, corrotto o con campi non booleani lascia i
       * default: la console non deve mai bloccarsi per una preferenza invalida.
       */
      restore(campaignId: string): void {
        patchState(store, defaultDmLayout());
        let stored: string | null;
        try {
          stored = localStorage.getItem(storageKey(campaignId));
        } catch {
          return;
        }
        if (stored === null) {
          return;
        }
        try {
          const parsed = JSON.parse(stored) as StoredLayout | null;
          if (parsed === null || typeof parsed !== 'object') {
            return;
          }
          const sections = { ...DEFAULT_SECTIONS };
          for (const key of SIDEBAR_SECTION_IDS) {
            const value = parsed.sections?.[key];
            if (typeof value === 'boolean') {
              sections[key] = value;
            }
          }
          patchState(store, {
            leftOpen: typeof parsed.left === 'boolean' ? parsed.left : true,
            rightOpen: typeof parsed.right === 'boolean' ? parsed.right : true,
            dockOpen: typeof parsed.dock === 'boolean' ? parsed.dock : true,
            dockTab: isDockTab(parsed.tab) ? parsed.tab : DEFAULT_DOCK_TAB,
            sections,
          });
        } catch {
          // Preferenza corrotta: si resta sui default senza bloccare la console.
        }
      },

      persist(campaignId: string): void {
        try {
          localStorage.setItem(
            storageKey(campaignId),
            JSON.stringify({
              left: store.leftOpen(),
              right: store.rightOpen(),
              dock: store.dockOpen(),
              tab: store.dockTab(),
              sections: store.sections(),
            }),
          );
        } catch {
          // localStorage può essere disabilitato: i pannelli valgono per la sessione.
        }
      },
    };
  }),
);
