import { describe, expect, it } from 'vitest';
import { SceneCamera } from './scene-camera';

const camera = (
  viewport = { width: 1000, height: 600 },
  world: { width: number; height: number } | null = { width: 2000, height: 1000 },
): SceneCamera => {
  const instance = new SceneCamera();
  instance.setViewport(viewport);
  instance.setWorld(world);
  return instance;
};

describe('SceneCamera', () => {
  it('parte da scala 1 senza traslazione', () => {
    expect(new SceneCamera().state).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('adatta la mappa allo stage lasciando il margine', () => {
    const instance = camera();
    instance.fit();

    expect(instance.scale).toBeCloseTo(952 / 2000);
    expect(instance.x).toBeCloseTo(24);
    expect(instance.y).toBeCloseTo(62);
    expect(instance.worldToScreen({ x: 1000, y: 500 }).x).toBeCloseTo(500);
    expect(instance.worldToScreen({ x: 1000, y: 500 }).y).toBeCloseTo(300);
  });

  it('non scende sotto la scala minima nel fit di mappe enormi', () => {
    const instance = camera({ width: 100, height: 100 }, { width: 100_000, height: 100_000 });
    instance.fit();

    expect(instance.scale).toBe(0.01);
    expect(instance.x).toBeCloseTo(-450);
    expect(instance.y).toBeCloseTo(-450);
  });

  it('calcola i limiti di zoom rispetto alla scala di fit', () => {
    const instance = camera();

    expect(instance.fitScale()).toBeCloseTo(0.5);
    expect(instance.scaleBounds().min).toBeCloseTo(0.025);
    expect(instance.scaleBounds().max).toBeCloseTo(16);
  });

  it('usa limiti prudenti quando manca la mappa', () => {
    const instance = camera({ width: 1000, height: 600 }, null);

    expect(instance.scaleBounds()).toEqual({ min: 0.01, max: 1 });
  });

  it('ingrandisce mantenendo fermo il punto puntato', () => {
    const instance = camera({ width: 1000, height: 800 }, { width: 1000, height: 1000 });
    instance.setTransform({ scale: 1, x: 0, y: 0 });

    instance.zoomAt(2, { x: 250, y: 200 });

    expect(instance.state).toEqual({ scale: 2, x: -250, y: -200 });
    expect(instance.worldToScreen({ x: 250, y: 200 })).toEqual({ x: 250, y: 200 });
  });

  it('blocca lo zoom oltre i limiti', () => {
    const instance = camera({ width: 100, height: 100 }, { width: 2000, height: 2000 });
    instance.setTransform({ scale: 1, x: 0, y: 0 });

    instance.zoomAt(1000, { x: 50, y: 50 });
    expect(instance.scale).toBeCloseTo(1.6);

    instance.setTransform({ scale: 1, x: 0, y: 0 });
    instance.zoomAt(0.0001, { x: 50, y: 50 });
    expect(instance.scale).toBeCloseTo(0.0025);
  });

  it('ignora fattori di zoom non validi', () => {
    const instance = camera();
    instance.setTransform({ scale: 2, x: 10, y: 20 });

    instance.zoomAt(0, { x: 0, y: 0 });
    instance.zoomAt(Number.NaN, { x: 0, y: 0 });

    expect(instance.state).toEqual({ scale: 2, x: 10, y: 20 });
  });

  it('sposta la camera con un pan in pixel schermo', () => {
    const instance = camera();
    instance.setTransform({ scale: 2, x: 10, y: -5 });

    instance.panBy(15, -30);

    expect(instance.state).toEqual({ scale: 2, x: 25, y: -35 });
  });

  it('applica un viewport salvato con zoom relativo al fit', () => {
    const instance = camera();

    instance.applyViewport({ x: 100, y: 50, zoom: 2 });

    expect(instance.state).toEqual({ scale: 1, x: 400, y: 250 });
  });

  it('centra un punto mondo nello stage', () => {
    const instance = camera({ width: 800, height: 600 });
    instance.setTransform({ scale: 2, x: 0, y: 0 });

    instance.centerOn({ x: 100, y: 100 });

    expect(instance.state).toEqual({ scale: 2, x: 200, y: 100 });
  });

  it('converte fra coordinate schermo e mondo senza perdite', () => {
    const instance = camera();
    instance.setTransform({ scale: 2, x: 10, y: -5 });

    const world = instance.screenToWorld({ x: 110, y: 95 });
    expect(world).toEqual({ x: 50, y: 50 });
    expect(instance.worldToScreen(world)).toEqual({ x: 110, y: 95 });
  });
});
