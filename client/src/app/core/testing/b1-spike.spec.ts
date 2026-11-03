import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  resource,
  signal,
} from '@angular/core';
import { DeferBlockState, TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form, validateStandardSchema } from '@angular/forms/signals';
import { diceRollRequestSchema } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';

@Component({
  selector: 'app-resource-probe',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ResourceProbe {
  public readonly id = signal('scene-1');
  public readonly calls: string[] = [];
  public readonly data = resource({
    params: () => this.id(),
    loader: ({ params }) => {
      this.calls.push(params);
      return Promise.resolve(`payload:${params}`);
    },
  });
}

@Component({
  selector: 'app-standard-schema-probe',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StandardSchemaProbe {
  public readonly model = signal({ formula: '' });
  public readonly probeForm = form(this.model, (path) => {
    validateStandardSchema(path.formula, diceRollRequestSchema.shape.formula);
  });
}

@Component({
  selector: 'app-heavy-probe',
  template: '<p data-testid="heavy">pesante</p>',
})
class HeavyProbe {}

@Component({
  selector: 'app-defer-probe',
  imports: [HeavyProbe],
  template: `
    @defer (on immediate) {
      <app-heavy-probe />
    } @placeholder {
      <p data-testid="placeholder">placeholder</p>
    }
  `,
})
class DeferProbe {}

describe('spike B1 — Signal Forms, resource() e @defer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('validateStandardSchema accetta lo schema Zod condiviso', () => {
    const fixture = TestBed.createComponent(StandardSchemaProbe);
    fixture.detectChanges();
    const probe = fixture.componentInstance.probeForm.formula();

    expect(probe.valid()).toBe(false);
    probe.value.set('1d20+5');
    expect(probe.valid()).toBe(true);
    expect(probe.errors()).toEqual([]);
  });

  it('resource() espone status/value e ricarica al cambio params', async () => {
    const fixture: ComponentFixture<ResourceProbe> = TestBed.createComponent(ResourceProbe);
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.data.status()).toBe('resolved');
    expect(fixture.componentInstance.data.value()).toBe('payload:scene-1');

    fixture.componentInstance.id.set('scene-2');
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.data.value()).toBe('payload:scene-2');
    expect(fixture.componentInstance.calls).toEqual(['scene-1', 'scene-2']);
  });

  it('@defer è disponibile e il blocco può essere renderizzato', async () => {
    const fixture = TestBed.createComponent(DeferProbe);
    fixture.detectChanges();

    const blocks = await fixture.getDeferBlocks();
    expect(blocks).toHaveLength(1);
    await blocks[0]?.render(DeferBlockState.Complete);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="heavy"]')).not.toBeNull();
  });
});
