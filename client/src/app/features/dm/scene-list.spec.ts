import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Scene } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneList } from './scene-list';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const ACTIVE_ID = '0190f000-0000-7000-8000-000000000002';
const RESERVE_ID = '0190f000-0000-7000-8000-000000000003';
const MAP_ID = '0190f000-0000-7000-8000-000000000004';

const scene = (overrides: Partial<Scene> = {}): Scene => ({
  id: ACTIVE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Ingresso',
  imageAssetId: null,
  backgroundTransform: { x: 0, y: 0, scale: 1 },
  widthPx: 1920,
  heightPx: 1080,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

describe('SceneList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SceneList],
      providers: [provideRouter([])],
    });
  });

  const create = (
    scenes: readonly Scene[],
    activeSceneId: string | null = ACTIVE_ID,
  ): ComponentFixture<SceneList> => {
    const fixture = TestBed.createComponent(SceneList);
    fixture.componentRef.setInput('scenes', scenes);
    fixture.componentRef.setInput('activeSceneId', activeSceneId);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra il messaggio di vuoto senza creare la lista', () => {
    const fixture = create([]);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.scene-list')).toBeNull();
    expect(root.querySelector('p.muted')?.textContent).toContain('Nessuna scena');
  });

  it('mostra nome, risoluzione, badge attiva e pulsante per le altre scene', () => {
    const fixture = create([
      scene(),
      scene({ id: RESERVE_ID, name: 'Riserva', widthPx: 1280, heightPx: 720 }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const items = root.querySelectorAll('.scene-list__item');

    expect(items).toHaveLength(2);
    expect(items[0]?.classList.contains('is-active')).toBe(true);
    expect(items[0]?.querySelector('.badge')?.textContent).toBe('attiva');
    expect(items[0]?.querySelector('.icon-button')).toBeNull();
    expect(items[0]?.querySelector('.scene-list__info')?.textContent).toContain('1920 × 1080');
    expect(items[1]?.classList.contains('is-active')).toBe(false);
    expect(items[1]?.querySelector('.badge')).toBeNull();
    expect(items[1]?.querySelector('.scene-list__info')?.textContent).toContain('1280 × 720');
  });

  it('senza scena attiva mostra il pulsante di attivazione su tutte', () => {
    const fixture = create([scene(), scene({ id: RESERVE_ID, name: 'Riserva' })], null);
    const root = fixture.nativeElement as HTMLElement;
    const items = root.querySelectorAll('.scene-list__item');

    expect(items).toHaveLength(2);
    expect(root.querySelector('.badge')).toBeNull();
    expect(root.querySelectorAll('button[aria-label^="Attiva scena"]')).toHaveLength(2);
  });

  it('emette la scena al click sul pulsante di attivazione', () => {
    const fixture = create([scene(), scene({ id: RESERVE_ID, name: 'Riserva' })]);
    const emitted = vi.fn<(value: Scene) => void>();
    fixture.componentInstance.selectScene.subscribe(emitted);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Attiva scena Riserva"]',
    ) as HTMLButtonElement;
    button.click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]).toMatchObject({ id: RESERVE_ID, name: 'Riserva' });
  });

  it('emette openMapPicker al click su "Avvia da mappa"', () => {
    const fixture = create([scene()]);
    const emitted = vi.fn<() => void>();
    fixture.componentInstance.openMapPicker.subscribe(emitted);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'app-button button',
    ) as HTMLButtonElement;
    button.click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('disabilita "Avvia da mappa" quando busy', () => {
    const fixture = create([scene()]);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'app-button button',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('mostra il link alla mappa solo quando mapId è presente', () => {
    const fixture = create([
      scene({ id: RESERVE_ID, name: 'Riserva', mapId: MAP_ID }),
      scene({ name: 'Senza mappa', mapId: null }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const links = root.querySelectorAll('.scene-list__actions a');

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(`/maps/${MAP_ID}`);
    expect(links[0]?.getAttribute('aria-label')).toBe('Modifica mappa di Riserva');
  });
});
