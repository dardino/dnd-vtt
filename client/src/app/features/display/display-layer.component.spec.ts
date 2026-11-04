import { TestBed } from '@angular/core/testing';
import { defaultGridConfig, type DisplayLayer } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { DisplayLayerComponent } from './display-layer.component';

const layer = (): DisplayLayer => ({
  id: 'layer-1',
  frame: { x: 0, y: 0, width: 1, height: 1 },
  opacity: 1,
  type: 'map',
  scene: {
    id: '0190f000-0000-7000-8000-000000000001',
    name: 'Ingresso',
    widthPx: 1280,
    heightPx: 720,
    imageUrl: null,
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
    backgroundTransform: { x: 0, y: 0, scale: 1 },
    grid: defaultGridConfig,
    tokens: [],
    fog: { base: 'revealed', ops: [], override: 'none' },
  },
});

describe('DisplayLayerComponent', () => {
  it('proietta un foglio blank con il colore della scena', () => {
    const fixture = TestBed.createComponent(DisplayLayerComponent);
    fixture.componentRef.setInput('layer', layer());

    expect(fixture.componentInstance.mapImage()).toMatchObject({
      url: '',
      width: 1280,
      height: 720,
    });
    expect(fixture.componentInstance.sceneState()?.backgroundColor)
      .toBe('rgba(255, 0, 0, 0.5)');
    fixture.destroy();
  });
});
