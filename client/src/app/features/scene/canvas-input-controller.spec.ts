import { describe, expect, it } from 'vitest';
import { CanvasInputController } from './canvas-input-controller';
import { SceneCamera } from './scene-camera';

interface Recorder {
  sync: number;
  apply: number;
  start: number;
  end: number;
  panning: boolean[];
}

interface Harness {
  readonly element: HTMLDivElement;
  readonly controller: CanvasInputController;
  readonly camera: SceneCamera;
  readonly calls: Recorder;
  readonly captured: number[];
  readonly released: number[];
  readonly state: { readOnly: boolean };
}

const HOST_RECT: DOMRect = {
  x: 100,
  y: 50,
  left: 100,
  top: 50,
  right: 1100,
  bottom: 650,
  width: 1000,
  height: 600,
  toJSON: () => ({}),
};

const createHarness = (): Harness => {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => HOST_RECT;
  const captured: number[] = [];
  const released: number[] = [];
  element.setPointerCapture = (pointerId: number): void => {
    captured.push(pointerId);
  };
  element.releasePointerCapture = (pointerId: number): void => {
    released.push(pointerId);
  };
  const camera = new SceneCamera();
  camera.setViewport({ width: 1000, height: 600 });
  camera.setWorld({ width: 2000, height: 1000 });
  const calls: Recorder = { sync: 0, apply: 0, start: 0, end: 0, panning: [] };
  const state = { readOnly: false };
  const controller = new CanvasInputController({
    element,
    camera,
    readOnly: () => state.readOnly,
    syncCamera: () => {
      calls.sync += 1;
    },
    applyCamera: () => {
      calls.apply += 1;
    },
    onInteractionStart: () => {
      calls.start += 1;
    },
    onInteractionEnd: () => {
      calls.end += 1;
    },
    setPanning: (panning) => {
      calls.panning.push(panning);
    },
  });
  controller.attach();
  return { element, controller, camera, calls, captured, released, state };
};

const dispatchWheel = (
  element: HTMLElement,
  init: { clientX: number; clientY: number; deltaY: number },
): WheelEvent => {
  const event = new Event('wheel', { cancelable: true }) as WheelEvent;
  Object.assign(event, init);
  element.dispatchEvent(event);
  return event;
};

const dispatchPointer = (
  element: HTMLElement,
  type: string,
  init: { pointerId: number; clientX: number; clientY: number; button?: number },
): PointerEvent => {
  const event = new Event(type, { cancelable: true }) as PointerEvent;
  Object.assign(event, { button: 0, ...init });
  element.dispatchEvent(event);
  return event;
};

describe('CanvasInputController', () => {
  it('zooma verso il puntatore con la rotella', () => {
    const harness = createHarness();
    const anchor = { x: 300, y: 200 };
    const world = harness.camera.screenToWorld(anchor);

    dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: -100 });

    expect(harness.camera.scale).toBeCloseTo(1.08);
    const screen = harness.camera.worldToScreen(world);
    expect(screen.x).toBeCloseTo(anchor.x);
    expect(screen.y).toBeCloseTo(anchor.y);
    expect(harness.calls).toMatchObject({ sync: 1, apply: 1, start: 1 });
  });

  it('ignora la rotella in sola lettura ma blocca lo scroll', () => {
    const harness = createHarness();
    harness.state.readOnly = true;
    const before = harness.camera.state;

    const event = dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: -100 });

    expect(event.defaultPrevented).toBe(true);
    expect(harness.camera.state).toEqual(before);
    expect(harness.calls.apply).toBe(0);
  });

  it('rispetta i limiti di zoom della camera', () => {
    const harness = createHarness();
    const max = harness.camera.scaleBounds().max;
    harness.camera.setTransform({ scale: max, x: 0, y: 0 });

    dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: -100 });

    expect(harness.camera.scale).toBeCloseTo(max);
    expect(harness.camera.state).toEqual({ scale: max, x: 0, y: 0 });
  });

  it('pan con tasto centrale usando il pointer capture', () => {
    const harness = createHarness();

    dispatchPointer(harness.element, 'pointerdown', {
      pointerId: 7,
      clientX: 500,
      clientY: 400,
      button: 1,
    });

    expect(harness.captured).toEqual([7]);
    expect(harness.calls.panning).toEqual([true]);
    expect(harness.calls.sync).toBe(1);

    dispatchPointer(harness.element, 'pointermove', { pointerId: 7, clientX: 515, clientY: 370 });
    expect(harness.camera.state).toEqual({ scale: 1, x: 15, y: -30 });

    dispatchPointer(harness.element, 'pointermove', { pointerId: 7, clientX: 520, clientY: 360 });
    expect(harness.camera.state).toEqual({ scale: 1, x: 20, y: -40 });

    dispatchPointer(harness.element, 'pointerup', { pointerId: 7, clientX: 520, clientY: 360 });

    expect(harness.released).toEqual([7]);
    expect(harness.calls.panning).toEqual([true, false]);
    expect(harness.calls.end).toBe(1);
    expect(harness.controller.panning).toBe(false);
  });

  it('pan con tasto destro e blocco del menu contestuale', () => {
    const harness = createHarness();
    const menu = new Event('contextmenu', { cancelable: true });

    harness.element.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    dispatchPointer(harness.element, 'pointerdown', {
      pointerId: 2,
      clientX: 200,
      clientY: 200,
      button: 2,
    });
    dispatchPointer(harness.element, 'pointermove', { pointerId: 2, clientX: 190, clientY: 215 });
    dispatchPointer(harness.element, 'pointerup', { pointerId: 2, clientX: 190, clientY: 215 });

    expect(harness.camera.state).toEqual({ scale: 1, x: -10, y: 15 });
  });

  it('ignora tasti non dedicati al pan e movimenti senza gesto', () => {
    const harness = createHarness();

    dispatchPointer(harness.element, 'pointerdown', {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      button: 0,
    });
    dispatchPointer(harness.element, 'pointermove', { pointerId: 1, clientX: 50, clientY: 50 });

    expect(harness.captured).toEqual([]);
    expect(harness.calls.panning).toEqual([]);
    expect(harness.camera.state).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('detach rimuove i listener e chiude il pan attivo', () => {
    const harness = createHarness();
    dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: -100 });
    expect(harness.calls.apply).toBe(1);

    dispatchPointer(harness.element, 'pointerdown', {
      pointerId: 9,
      clientX: 300,
      clientY: 300,
      button: 1,
    });
    harness.controller.detach();

    expect(harness.released).toEqual([9]);
    expect(harness.calls.panning).toEqual([true, false]);
    expect(harness.controller.panning).toBe(false);

    dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: 100 });
    dispatchPointer(harness.element, 'pointermove', { pointerId: 9, clientX: 400, clientY: 400 });

    expect(harness.calls.apply).toBe(1);
  });

  it('non duplica i listener quando attach è chiamato due volte', () => {
    const harness = createHarness();
    harness.controller.attach();

    dispatchWheel(harness.element, { clientX: 400, clientY: 250, deltaY: -100 });

    expect(harness.calls.apply).toBe(1);
  });

  it('inoltra il drag nativo dello stage alla camera', () => {
    const harness = createHarness();

    harness.controller.stageDragStart();
    harness.controller.stageDragMove();
    harness.controller.stageDragEnd();

    expect(harness.calls).toMatchObject({ sync: 1, apply: 1, start: 1, end: 1 });
  });
});
