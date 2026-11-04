import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  MAP_CELL_SIZE_MAX_PX,
  MAP_CELL_SIZE_MIN_PX,
  MAP_NAME_MAX_LENGTH,
  MAP_NOTES_MAX_LENGTH,
  createMapPropertiesForm,
  emptyMapProperties,
  type MapPropertiesFormModel,
} from './map-properties.form';

const createForm = (overrides: Partial<MapPropertiesFormModel> = {}) => {
  const model = signal({ ...emptyMapProperties(), ...overrides });
  const maxSight = signal(120);
  const form = TestBed.runInInjectionContext(() =>
    createMapPropertiesForm(model, maxSight));
  return { form, model, maxSight };
};

describe('map properties form', () => {
  it('richiede un nome non vuoto e entro il limite', () => {
    const { form } = createForm({ name: '' });
    expect(form.name().invalid()).toBe(true);
    expect(form.name().errors()[0]?.message).toContain('Inserisci il nome');

    form.name().value.set('   ');
    expect(form.name().invalid()).toBe(true);

    form.name().value.set('Cripta');
    expect(form.name().valid()).toBe(true);

    form.name().value.set('a'.repeat(MAP_NAME_MAX_LENGTH + 1));
    expect(form.name().invalid()).toBe(true);
  });

  it('valida il colore di sfondo rgba', () => {
    const { form } = createForm();

    expect(form.backgroundColor().valid()).toBe(true);
    form.backgroundColor().value.set('rgba(255, 0, 0, 0.5)');
    expect(form.backgroundColor().valid()).toBe(true);

    form.backgroundColor().value.set('#ff0000');
    expect(form.backgroundColor().invalid()).toBe(true);
  });

  it('limita le note e la dimensione della cella', () => {
    const { form } = createForm();
    form.notes().value.set('a'.repeat(MAP_NOTES_MAX_LENGTH + 1));
    expect(form.notes().invalid()).toBe(true);

    form.cellSizePx().value.set(MAP_CELL_SIZE_MIN_PX - 1);
    expect(form.cellSizePx().invalid()).toBe(true);
    form.cellSizePx().value.set(MAP_CELL_SIZE_MAX_PX + 1);
    expect(form.cellSizePx().invalid()).toBe(true);
    form.cellSizePx().value.set(70);
    expect(form.cellSizePx().valid()).toBe(true);
  });

  it('valida piedi per cella, vista e offset finiti', () => {
    const { form, maxSight } = createForm();

    form.feetPerCell().value.set(0.4);
    expect(form.feetPerCell().invalid()).toBe(true);
    form.feetPerCell().value.set(5);
    expect(form.feetPerCell().valid()).toBe(true);

    form.visionLimitFeet().value.set(0);
    expect(form.visionLimitFeet().invalid()).toBe(true);
    maxSight.set(60);
    form.visionLimitFeet().value.set(61);
    expect(form.visionLimitFeet().invalid()).toBe(true);
    form.visionLimitFeet().value.set(60);
    expect(form.visionLimitFeet().valid()).toBe(true);

    form.offsetX().value.set(Number.NaN);
    expect(form.offsetX().invalid()).toBe(true);
    form.offsetX().value.set(10);
    expect(form.offsetX().valid()).toBe(true);
  });

  it('disabilita la visione automatica fuori dalla griglia quadrata', () => {
    const { form } = createForm();
    expect(form.visionEnabled().disabled()).toBe(false);

    form.gridType().value.set('hex');
    expect(form.visionEnabled().disabled()).toBe(true);
  });
});
