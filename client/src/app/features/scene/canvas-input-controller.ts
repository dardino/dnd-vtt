import type { CameraPoint, SceneCamera } from './scene-camera';

const ZOOM_STEP = 1.08;
const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

/** Risorse e callback che il controller usa per muovere la camera. */
export interface CanvasInputHost {
  /** Elemento che ospita lo stage: origine delle coordinate schermo. */
  readonly element: HTMLElement;
  readonly camera: SceneCamera;
  readonly readOnly: () => boolean;
  /** Allinea la camera alla trasformazione corrente dello stage. */
  readonly syncCamera: () => void;
  /** Applica la camera allo stage e pubblica il cambio. */
  readonly applyCamera: () => void;
  /** Inizio gesto: preview a bassa risoluzione. */
  readonly onInteractionStart: () => void;
  /** Fine gesto: pianifica tile e griglia a piena risoluzione. */
  readonly onInteractionEnd: () => void;
  /** Abilita o sospende il drag nativo dello stage durante il pan. */
  readonly setPanning: (panning: boolean) => void;
}

interface PanGesture {
  readonly pointerId: number;
  x: number;
  y: number;
}

/**
 * Gesti camera del canvas: zoom con la rotella verso il puntatore e pan con
 * tasto centrale o destro tramite pointer capture. Il drag nativo dello stage
 * resta agganciato dal componente, che inoltra gli eventi con `stageDrag*`.
 */
export class CanvasInputController {
  private attached = false;
  private pan: PanGesture | null = null;

  public constructor(private readonly host: CanvasInputHost) {}

  public get panning(): boolean {
    return this.pan !== null;
  }

  public attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    const element = this.host.element;
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerCancel);
    element.addEventListener('lostpointercapture', this.onLostPointerCapture);
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  public detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    const element = this.host.element;
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerCancel);
    element.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    element.removeEventListener('contextmenu', this.onContextMenu);
    if (this.pan !== null) {
      const { pointerId } = this.pan;
      this.pan = null;
      this.releaseCapture(pointerId);
      this.host.setPanning(false);
    }
  }

  /** Inoltro del drag nativo dello stage: preview durante il movimento. */
  public stageDragStart(): void {
    this.host.onInteractionStart();
  }

  /** Inoltro del drag nativo dello stage: la camera segue lo stage. */
  public stageDragMove(): void {
    this.host.syncCamera();
    this.host.applyCamera();
  }

  /** Inoltro del drag nativo dello stage: ripristina i dettagli a riposo. */
  public stageDragEnd(): void {
    this.host.onInteractionEnd();
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.host.readOnly()) {
      return;
    }
    const pointer = this.pointerPosition(event);
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.host.syncCamera();
    this.host.camera.zoomAt(factor, pointer);
    this.host.applyCamera();
    this.host.onInteractionStart();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.host.readOnly() || this.pan !== null) {
      return;
    }
    if (event.button !== MIDDLE_BUTTON && event.button !== RIGHT_BUTTON) {
      return;
    }
    this.host.syncCamera();
    this.pan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    this.capture(event.pointerId);
    this.host.setPanning(true);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const pan = this.pan;
    if (pan === null || pan.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - pan.x;
    const deltaY = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;
    this.host.camera.panBy(deltaX, deltaY);
    this.host.applyCamera();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.finishPan(event.pointerId, true);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.finishPan(event.pointerId, true);
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    this.finishPan(event.pointerId, false);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private finishPan(pointerId: number, release: boolean): void {
    const pan = this.pan;
    if (pan === null || pan.pointerId !== pointerId) {
      return;
    }
    this.pan = null;
    if (release) {
      this.releaseCapture(pointerId);
    }
    this.host.setPanning(false);
    this.host.onInteractionEnd();
  }

  private pointerPosition(event: MouseEvent): CameraPoint {
    const rect = this.host.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private capture(pointerId: number): void {
    this.host.element.setPointerCapture?.(pointerId);
  }

  private releaseCapture(pointerId: number): void {
    this.host.element.releasePointerCapture?.(pointerId);
  }
}
