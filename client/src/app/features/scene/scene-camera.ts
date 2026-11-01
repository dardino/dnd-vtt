/** Trasformazione della camera in pixel schermo: scala e traslazione. */
export interface CameraState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Punto in coordinate schermo o mondo, a seconda del contesto. */
export interface CameraPoint {
  readonly x: number;
  readonly y: number;
}

/** Dimensioni in pixel dello stage o dell'immagine mappa. */
export interface CameraSize {
  readonly width: number;
  readonly height: number;
}

/** Limiti di zoom calcolati rispetto alla scala di fit della mappa. */
export interface CameraZoomBounds {
  readonly min: number;
  readonly max: number;
}

/** Viewport salvato, con zoom relativo alla scala di fit. */
export interface SavedCameraView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

// Lo zoom è sempre relativo al fit: un'immagine piccola su uno schermo grande
// produce un fitScale alto e non deve esaurire il margine di ingrandimento.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const MIN_SCALE = 0.01;
const VIEW_PADDING = 48;
const FALLBACK_FIT = 0.0001;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Stato e matematica della camera della scena, indipendente da Konva.
 *
 * Il componente aggiorna dimensioni di stage e mappa con `setViewport` e
 * `setWorld`, poi usa i metodi di trasformazione per fit, zoom, pan e
 * conversioni. Non conosce lo stage: applicare la camera ai layer resta
 * responsabilità del chiamante.
 */
export class SceneCamera {
  private viewport: CameraSize = { width: 1, height: 1 };
  private world: CameraSize | null = null;
  private transform: CameraState = { scale: 1, x: 0, y: 0 };

  public get state(): CameraState {
    return { ...this.transform };
  }

  public get scale(): number {
    return this.transform.scale;
  }

  public get x(): number {
    return this.transform.x;
  }

  public get y(): number {
    return this.transform.y;
  }

  public setViewport(viewport: CameraSize): void {
    this.viewport = {
      width: Math.max(1, viewport.width),
      height: Math.max(1, viewport.height),
    };
  }

  public setWorld(world: CameraSize | null): void {
    this.world = world === null
      ? null
      : { width: Math.max(1, world.width), height: Math.max(1, world.height) };
  }

  /** Sincronizza lo stato quando lo stage viene mosso dal drag nativo. */
  public setTransform(transform: CameraState): void {
    this.transform = { ...transform };
  }

  /** Scala che mostra l'intera mappa nello spazio disponibile. */
  public fitScale(): number {
    const world = this.world;
    if (world === null) {
      return 1;
    }
    return Math.min(this.viewport.width / world.width, this.viewport.height / world.height);
  }

  public scaleBounds(): CameraZoomBounds {
    if (this.world === null) {
      return { min: MIN_SCALE, max: 1 };
    }
    const fit = Math.max(this.fitScale(), FALLBACK_FIT);
    return { min: fit * MIN_ZOOM, max: fit * MAX_ZOOM };
  }

  /** Centra la mappa nello stage lasciando `VIEW_PADDING` di margine. */
  public fit(): void {
    const world = this.world;
    if (world === null) {
      return;
    }
    const width = Math.max(1, this.viewport.width - VIEW_PADDING);
    const height = Math.max(1, this.viewport.height - VIEW_PADDING);
    const scale = Math.max(Math.min(width / world.width, height / world.height), MIN_SCALE);
    this.transform = {
      scale,
      x: (this.viewport.width - world.width * scale) / 2,
      y: (this.viewport.height - world.height * scale) / 2,
    };
  }

  /** Applica un viewport salvato: `zoom` è un multiplo della scala di fit. */
  public applyViewport(view: SavedCameraView): void {
    const bounds = this.scaleBounds();
    const scale = clamp(this.fitScale() * view.zoom, bounds.min, bounds.max);
    this.transform = {
      scale,
      x: this.viewport.width / 2 - view.x * scale,
      y: this.viewport.height / 2 - view.y * scale,
    };
  }

  /** Zoom verso il centro dello stage. */
  public zoomBy(factor: number): void {
    this.zoomAt(factor, { x: this.viewport.width / 2, y: this.viewport.height / 2 });
  }

  /** Zoom mantenendo fermo il punto schermo indicato. */
  public zoomAt(factor: number, anchor: CameraPoint): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    const bounds = this.scaleBounds();
    const oldScale = this.transform.scale;
    const newScale = clamp(oldScale * factor, bounds.min, bounds.max);
    const world = this.screenToWorld(anchor);
    this.transform = {
      scale: newScale,
      x: anchor.x - world.x * newScale,
      y: anchor.y - world.y * newScale,
    };
  }

  /** Sposta la camera di un delta in pixel schermo. */
  public panBy(deltaX: number, deltaY: number): void {
    this.transform = {
      ...this.transform,
      x: this.transform.x + deltaX,
      y: this.transform.y + deltaY,
    };
  }

  /** Porta il punto mondo al centro dello stage. */
  public centerOn(point: CameraPoint): void {
    this.transform = {
      ...this.transform,
      x: this.viewport.width / 2 - point.x * this.transform.scale,
      y: this.viewport.height / 2 - point.y * this.transform.scale,
    };
  }

  public screenToWorld(point: CameraPoint): CameraPoint {
    return {
      x: (point.x - this.transform.x) / this.transform.scale,
      y: (point.y - this.transform.y) / this.transform.scale,
    };
  }

  public worldToScreen(point: CameraPoint): CameraPoint {
    return {
      x: point.x * this.transform.scale + this.transform.x,
      y: point.y * this.transform.scale + this.transform.y,
    };
  }
}
