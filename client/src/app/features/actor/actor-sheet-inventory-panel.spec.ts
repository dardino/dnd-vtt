import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ActorSheetInventoryPanel,
  type InventoryPanelItem,
} from './actor-sheet-inventory-panel';

const item = (
  id = 'sword',
  name = 'Spada lunga',
  range: string | null = '5 ft',
  valueGp = 15,
): InventoryPanelItem => ({ id, name, range, valueGp });

describe('ActorSheetInventoryPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetInventoryPanel] });
  });

  const create = (items: InventoryPanelItem[], currency = '12'): HTMLElement => {
    const fixture = TestBed.createComponent(ActorSheetInventoryPanel);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('currency', currency);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('mostra inventario, gittata, valore e monete', () => {
    const root = create([
      item(),
      item('bow', 'Arco lungo', '150/600 ft', 50),
    ]);
    const text = root.textContent ?? '';

    expect(text).toContain('Spada lunga');
    expect(text).toContain('5 ft');
    expect(text).toContain('15 mo');
    expect(text).toContain('Arco lungo');
    expect(text).toContain('150/600 ft');
    expect(text).toContain('50 mo');
    expect(text).toContain('Monete: 12 mo');
    expect(text).not.toContain('Nessun oggetto.');
  });

  it('mostra lo stato vuoto e le monete senza oggetti', () => {
    const root = create([], '0');
    const text = root.textContent ?? '';

    expect(text).toContain('Nessun oggetto.');
    expect(text).toContain('Monete: 0 mo');
    expect(root.querySelectorAll('button').length).toBe(0);
  });
});
