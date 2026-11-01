import type { Display, DisplayState, Viewport } from '@dnd-vtt/shared';

export interface ScreenSummary {
  display: Display;
  state: DisplayState | null;
}

export interface ScreenPatch {
  screenDialog: ScreenSummary | null;
  screens: ScreenSummary[];
}

/** Viewport della composizione mappa, se lo schermo ne mostra una. */
export const screenViewportOf = (summary: ScreenSummary): Viewport | null => {
  const base = summary.state?.composition.base;
  return base?.type === 'map' ? base.viewport ?? null : null;
};

/** Sostituisce il display in lista e nel dialog senza toccare lo stato proiettato. */
export const withDisplay = (
  screens: ScreenSummary[],
  dialog: ScreenSummary | null,
  display: Display,
): ScreenPatch => ({
  screenDialog: dialog === null || dialog.display.id !== display.id
    ? dialog
    : { ...dialog, display },
  screens: screens.map((item) => (item.display.id === display.id
    ? { ...item, display }
    : item)),
});

/** Aggiorna la `compositionVersion` dopo un salvataggio riuscito. */
export const withDisplayVersion = (
  screens: ScreenSummary[],
  dialog: ScreenSummary | null,
  displayId: string,
  version: number,
): ScreenPatch => ({
  screenDialog: dialog === null || dialog.display.id !== displayId
    ? dialog
    : { ...dialog, display: { ...dialog.display, compositionVersion: version } },
  screens: screens.map((item) => (item.display.id === displayId
    ? { ...item, display: { ...item.display, compositionVersion: version } }
    : item)),
});

/** Anteprima locale del viewport: aggiorna la composizione del dialog aperto. */
export const withDialogViewport = (
  screens: ScreenSummary[],
  dialog: ScreenSummary | null,
  viewport: Viewport,
): ScreenPatch | null => {
  if (dialog === null || dialog.state === null) {
    return null;
  }
  const base = dialog.state.composition.base;
  const state: DisplayState = base.type === 'map'
    ? {
      ...dialog.state,
      composition: {
        ...dialog.state.composition,
        base: { ...base, viewport },
      },
    }
    : dialog.state;
  const updated: ScreenSummary = { ...dialog, state };
  return {
    screenDialog: updated,
    screens: screens.map((item) => (item.display.id === updated.display.id ? updated : item)),
  };
};

/** Applica un viewport locale a uno stato display mappa (refresh in corso). */
export const stateWithViewport = (state: DisplayState, viewport: Viewport): DisplayState => {
  const base = state.composition.base;
  return base.type === 'map'
    ? {
      ...state,
      composition: {
        ...state.composition,
        base: { ...base, viewport },
      },
    }
    : state;
};

export const projectionLabel = (summary: ScreenSummary): string => {
  const state = summary.state;
  if (state === null) {
    return 'In attesa di proiezione';
  }
  if (state.program.blackout) {
    return 'Blackout';
  }
  const base = state.composition.base;
  const overlays = state.composition.overlays.length;
  const suffix = overlays > 0 ? ` + ${overlays} overlay` : '';
  switch (base.type) {
    case 'map':
      return `${base.scene?.name ?? 'Mappa'}${suffix}`;
    case 'actor':
      return `${base.actor?.name ?? 'Attore'}${suffix}`;
    case 'image':
      return `Immagine${suffix}`;
    case 'text':
      return `${base.title ?? 'Testo'}${suffix}`;
    case 'initiative':
      return `Iniziativa${suffix}`;
    default:
      return `Nero${suffix}`;
  }
};

export const lastSeen = (summary: ScreenSummary): string => {
  if (summary.display.lastSeenAt === null) {
    return 'mai collegato';
  }
  const seconds = Math.max(0, Math.round(
    (Date.now() - Date.parse(summary.display.lastSeenAt)) / 1000,
  ));
  if (seconds < 60) {
    return 'visto ora';
  }
  const minutes = Math.round(seconds / 60);
  return `visto ${minutes} min fa`;
};
