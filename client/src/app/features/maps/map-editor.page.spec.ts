import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { emptyMapDocument } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActorService } from '../../core/actor.service';
import { AssetService } from '../../core/asset.service';
import { MapService } from '../../core/map.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const rename = (page: MapEditorPage, value: string): void => {
  const input = document.createElement('input');
  input.value = value;
  page.updateMapField('name', { target: input } as unknown as Event);
};

describe('MapEditorPage history', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: {} },
        { provide: AssetService, useValue: {} },
        { provide: ActorService, useValue: {} },
        { provide: SrdCatalogService, useValue: {} },
        { provide: Router, useValue: {} },
      ],
    });
  });

  it('mantiene undo e redo invariati con la history limitata', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Iniziale', null, 700, 700));

    rename(page, 'Uno');
    rename(page, 'Due');

    page.undo();
    expect(page.doc()?.name).toBe('Uno');
    page.undo();
    expect(page.doc()?.name).toBe('Iniziale');
    page.redo();
    expect(page.doc()?.name).toBe('Uno');
    page.redo();
    expect(page.doc()?.name).toBe('Due');

    page.undo();
    rename(page, 'Tre');
    page.redo();
    expect(page.doc()?.name).toBe('Tre');

    fixture.destroy();
  });
});
