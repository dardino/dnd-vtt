import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  type OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormField, type FieldState } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  newId,
  sizeCells,
  backgroundLayer,
  constraintsLayer,
  defaultBackgroundTransform,
  defaultTerrain,
  elementsLayer,
  graphicsLayer,
  isFootprintPlaceable,
  isImageGraphic,
  isPolygonGraphic,
  isTextGraphic,
  lightsOf,
  spawnsOf,
  startsOf,
  wallsOf,
  type Actor,
  type Asset,
  type BackgroundTransform,
  type BlockedArea,
  type CellPoint,
  type GridConfig,
  type ImageGraphic,
  type Light,
  type Map,
  type MapDocument,
  type MapElement,
  type MapGraphic,
  type MapLayerKind,
  type MapLayers,
  type MapSpawn,
  type PlayerStart,
  type PolygonGraphic,
  type SrdMonster,
  type Terrain,
  type TextGraphic,
  type WallKind,
  type WallSegment,
} from '@dnd-vtt/shared';
import { httpMessage } from '../../core/api/http-error';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService, type MapDerivatives } from '../../core/services/map.service';
import { readResource } from '../../core/api/read-resource';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { Button } from '../../components/button/button';
import { SidebarSection } from '../../components/sidebar-section/sidebar-section';
import { Dialog } from '../../components/dialog/dialog';
import {
  type MapRenderAssets,
  type MapRenderGraphicAsset,
  type MapRenderImage,
} from './map-image-renderer';
import { loadRenderImage, renderImageSource } from './map-render-assets';
import { MapRenderService } from './map-render.service';
import {
  MapEditorCanvasComponent,
  type AreaDrawnEvent,
  type EditorGraphic,
  type EditorLayerFlag,
  type EditorMapImage,
  type EditorSelection,
  type EditorTool,
  type WallsDrawnEvent,
} from './map-editor-canvas.component';
import { MapAreaInspectorComponent } from './map-area-inspector.component';
import {
  MapLootDialogComponent,
  type LootDialogPayload,
} from './map-loot-dialog.component';
import {
  MapLayerPanelComponent,
  type LayerOpacityCommit,
} from './map-layer-panel.component';
import {
  arrayInsert,
  arrayRemove,
  moveGraphicZ as graphicZCommand,
  nextGraphicZIndex,
  removeGraphic as removeGraphicCommand,
  replaceBackground,
  replaceFields,
  replaceLayer,
  type GraphicZDirection,
  type MapCommand,
} from './map-command';
import { sortedGraphics } from './map-graphics-renderer';
import {
  GRAPHIC_POLYGON_MAX_VERTICES,
  translatePolygonPoints,
  validateGraphicField,
} from './map-graphic-fields';
import {
  MapGraphicInspectorComponent,
  type GraphicField,
} from './map-graphic-inspector.component';
import { MapHistory } from './map-history';
import {
  MAP_CELL_SIZE_MAX_PX,
  MAP_CELL_SIZE_MIN_PX,
  MAP_FEET_PER_CELL_MIN,
  createMapPropertiesForm,
  createMapPropertiesModel,
  mapPropertiesFromDocument,
  sameMapProperties,
  type MapPropertiesFormModel,
} from './map-properties.form';
import { hexAlphaToRgba, rgbaAlphaPercent, rgbaToHex } from './map-color';

type MapGridField = Exclude<keyof GridConfig, 'hexOffset'>;
type MapTerrainField = 'ambientLight' | 'visionEnabled' | 'showDoorIcons';
type MapTextField = 'name' | 'fogBase' | 'notes' | 'backgroundColor';

type MapEditorSection
  = | 'layers'
    | 'properties'
    | 'wall'
    | 'light'
    | 'spawn'
    | 'start'
    | 'loot'
    | 'content';

const PLACEMENT_ERROR = 'Impossibile piazzare qui: la cella è occupata da un muro.';

const DEFAULT_EDITOR_SECTIONS: Record<MapEditorSection, boolean> = {
  layers: true,
  properties: true,
  wall: true,
  light: true,
  spawn: true,
  start: true,
  loot: true,
  content: true,
};

/** Elemento loot del layer elements: forma condivisa con il documento v2. */
type LootElement = Extract<MapElement, { type: 'loot' }>;

const TOOL_LABELS: Array<{ tool: EditorTool; icon: string; label: string; hint: string }> = [
  { tool: 'select', icon: 'arrow_selector_tool', label: 'Seleziona', hint: 'Seleziona e sposta elementi' },
  { tool: 'wall', icon: 'wall_art', label: 'Muro', hint: 'Disegna muri sui lati della griglia' },
  { tool: 'freehand', icon: 'draw', label: 'Tratto', hint: 'Traccia libero, rasterizzato a edge' },
  { tool: 'door', icon: 'door_front', label: 'Porta', hint: 'Trasforma un lato in porta' },
  { tool: 'window', icon: 'window', label: 'Finestra', hint: 'Blocca il movimento, non la vista' },
  { tool: 'lowWall', icon: 'fence', label: 'Muro basso', hint: 'Si vede sopra, blocca il movimento' },
  { tool: 'eraser', icon: 'ink_eraser', label: 'Gomma', hint: 'Rimuove un lato' },
  { tool: 'areaRect', icon: 'check_box_outline_blank', label: 'Area rettangolo', hint: 'Blocca una zona rettangolare' },
  { tool: 'areaPolygon', icon: 'pentagon', label: 'Area poligono', hint: 'Blocca una zona poligonale' },
  { tool: 'graphicPolygon', icon: 'pentagon', label: 'Poligono', hint: 'Disegna un poligono decorativo sulla griglia' },
  { tool: 'graphicText', icon: 'title', label: 'Testo', hint: 'Aggiunge un testo decorativo alla mappa' },
  { tool: 'light', icon: 'lightbulb', label: 'Luce', hint: 'Aggiunge una luce statica' },
  { tool: 'spawn', icon: 'pets', label: 'Mostro', hint: 'Aggiunge uno spawn SRD o attore' },
  { tool: 'start', icon: 'flag', label: 'Partenza', hint: 'Aggiunge un punto di partenza PG' },
  { tool: 'loot', icon: 'inventory_2', label: 'Oggetti', hint: 'Aggiunge un oggetto del catalogo SRD' },
];

/** Strumenti ammessi per ciascun layer, nell'ordine canonico della toolbar. */
const LAYER_TOOLS: Record<MapLayerKind, readonly EditorTool[]> = {
  background: ['select'],
  graphics: ['select', 'graphicPolygon', 'graphicText'],
  constraints: [
    'select',
    'wall',
    'freehand',
    'door',
    'window',
    'lowWall',
    'eraser',
    'areaRect',
    'areaPolygon',
  ],
  elements: ['select', 'light', 'spawn', 'start', 'loot'],
};

/** Stato dei layer logici quando il documento non è ancora caricato. */
const DEFAULT_LAYER_FLAGS: Record<MapLayerKind, EditorLayerFlag> = {
  background: { visible: true, locked: false, opacity: 1 },
  graphics: { visible: true, locked: false, opacity: 1 },
  constraints: { visible: true, locked: false, opacity: 1 },
  elements: { visible: true, locked: false, opacity: 1 },
};

@Component({
  selector: 'app-map-editor-page',
  imports: [
    Button,
    Dialog,
    FormField,
    RouterLink,
    MapEditorCanvasComponent,
    MapAreaInspectorComponent,
    MapGraphicInspectorComponent,
    MapLayerPanelComponent,
    MapLootDialogComponent,
    SidebarSection,
  ],
  templateUrl: './map-editor.page.html',
  styleUrl: './map-editor.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEditorPage implements OnInit, OnDestroy {
  public readonly mapId = input.required<string>();

  private readonly mapsApi = inject(MapService);
  private readonly assets = inject(AssetService);
  private readonly actorsApi = inject(ActorService);
  private readonly catalogService = inject(SrdCatalogService);
  private readonly router = inject(Router);
  /** Facoltativo: le spec legacy della pagina non forniscono il renderer. */
  private readonly renderer = inject(MapRenderService, { optional: true });

  private readonly canvas = viewChild(MapEditorCanvasComponent);
  private readonly backgroundInput = viewChild<ElementRef<HTMLInputElement>>('backgroundInput');

  public readonly loading = signal(true);
  public readonly saving = signal(false);
  public readonly error = signal<string | null>(null);
  /** Avviso non bloccante: i derivati mancano ma il documento è stato salvato. */
  public readonly warning = signal<string | null>(null);
  public readonly doc = signal<MapDocument | null>(null);
  private readonly propertiesModel = createMapPropertiesModel();
  public readonly version = signal(1);
  public readonly dirty = signal(false);
  public readonly leaveConfirm = signal(false);
  public readonly image = signal<EditorMapImage | null>(null);
  public readonly tool = signal<EditorTool>('select');
  public readonly selected = signal<EditorSelection | null>(null);
  public readonly showGrid = signal(true);
  public readonly activeLayer = signal<MapLayerKind>('background');

  /** Il layer attivo è protetto: nessun comando di contenuto deve passare. */
  public readonly activeLayerLocked = computed(() => {
    const doc = this.doc();
    if (doc === null) {
      return false;
    }
    return doc.layers.find((layer) => layer.kind === this.activeLayer())?.locked ?? false;
  });

  public readonly hasBackground = computed(() => {
    const doc = this.doc();
    return doc !== null && backgroundLayer(doc).imageAssetId !== null;
  });

  /** Layer background corrente: asset e trasformazione vivono qui in v2. */
  public readonly background = computed(() => {
    const doc = this.doc();
    return doc === null ? null : backgroundLayer(doc);
  });

  public readonly backgroundAssetId = computed(() => this.background()?.imageAssetId ?? null);

  public readonly backgroundTransform = computed(
    (): BackgroundTransform => this.background()?.imageTransform ?? defaultBackgroundTransform,
  );

  public readonly walls = computed<WallSegment[]>(() => {
    const doc = this.doc();
    return doc === null ? [] : wallsOf(doc);
  });

  public readonly lights = computed<Light[]>(() => {
    const doc = this.doc();
    return doc === null ? [] : lightsOf(doc);
  });

  public readonly spawns = computed<MapSpawn[]>(() => {
    const doc = this.doc();
    return doc === null ? [] : spawnsOf(doc);
  });

  public readonly starts = computed<PlayerStart[]>(() => {
    const doc = this.doc();
    return doc === null ? [] : startsOf(doc);
  });

  /** Loot del layer elements, nell'ordine del documento (reattivo a undo/redo). */
  public readonly loots = computed<LootElement[]>(() => {
    const doc = this.doc();
    if (doc === null) {
      return [];
    }
    return elementsLayer(doc).items.filter(
      (item): item is LootElement => item.type === 'loot',
    );
  });

  /** Stato visibilità/lock/opacità di ogni layer logico, come lo consuma il canvas. */
  public readonly layerFlags = computed<Partial<Record<MapLayerKind, EditorLayerFlag>>>(() => {
    const doc = this.doc();
    if (doc === null) {
      return DEFAULT_LAYER_FLAGS;
    }
    const flags: Partial<Record<MapLayerKind, EditorLayerFlag>> = {};
    for (const layer of doc.layers) {
      flags[layer.kind] = {
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
      };
    }
    return flags;
  });

  private readonly graphicImages = signal<Record<string, EditorMapImage>>({});
  private readonly requestedGraphicAssets = new Set<string>();

  /**
   * Grafiche del documento risolte con le immagini degli asset. Le richieste
   * partono da un effect: il computed resta puro e il canvas riceve sempre
   * `image: null` finché l'asset non è disponibile.
   */
  public readonly graphics = computed<EditorGraphic[]>(() => {
    const doc = this.doc();
    if (doc === null) {
      return [];
    }
    const images = this.graphicImages();
    return graphicsLayer(doc).items.map((item) => ({
      item,
      image: isImageGraphic(item) ? images[item.assetId] ?? null : null,
    }));
  });

  public readonly selectedGraphic = computed<MapGraphic | null>(() => {
    const selection = this.selected();
    if (selection?.type !== 'graphic') {
      return null;
    }
    const doc = this.doc();
    return doc === null
      ? null
      : graphicsLayer(doc).items.find((item) => item.id === selection.id) ?? null;
  });

  /** Aree bloccate del layer constraints: i muri restano nel terreno del canvas. */
  public readonly blockedAreas = computed<BlockedArea[]>(() => {
    const doc = this.doc();
    if (doc === null) {
      return [];
    }
    return constraintsLayer(doc).items.filter((item): item is BlockedArea => 'shape' in item);
  });

  /** Terreno derivato per il canvas: in v2 è una proiezione dei layer. */
  public readonly canvasTerrain = computed<Terrain>(() => {
    const doc = this.doc();
    if (doc === null) {
      return {
        ambientLight: 'dark',
        visionLimitFeet: 120,
        visionEnabled: true,
        walls: [],
        lights: [],
      };
    }
    return {
      ambientLight: doc.ambientLight,
      visionLimitFeet: doc.visionLimitFeet,
      visionEnabled: doc.visionEnabled,
      walls: wallsOf(doc),
      lights: lightsOf(doc),
    };
  });

  public readonly spawnCell = signal<{ x: number; y: number } | null>(null);
  public readonly lootCell = signal<{ x: number; y: number } | null>(null);
  public readonly spawnSearch = signal('');
  public readonly spawnTab = signal<'srd' | 'actors'>('srd');

  private readonly campaignId = signal<string | undefined>(undefined);
  private readonly actorList = readResource<Actor[], string>({
    params: () => this.campaignId(),
    loader: (campaignId) => this.actorsApi.listByCampaign(campaignId),
    errorMessage: 'Impossibile caricare gli attori della campagna',
  });

  public readonly actors = this.actorList.value;

  private readonly history = new MapHistory();
  /** Ultimo DTO completo ricevuto dal server, usato come base per i derivati. */
  private loadedMap: Map | null = null;
  private backgroundAsset: {
    assetId: string;
    url: string;
    width: number;
    height: number;
  } | null = null;

  private unloadHandler = (event: BeforeUnloadEvent): void => {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };

  /** Toolbar filtrata: solo gli strumenti pertinenti al layer attivo. */
  public readonly tools = computed(() => {
    const allowed = LAYER_TOOLS[this.activeLayer()];
    return TOOL_LABELS.filter((entry) => allowed.includes(entry.tool));
  });

  public readonly isHex = computed(() => this.doc()?.grid.type === 'hex');
  public readonly maxSightFeet = computed(() => {
    const doc = this.doc();
    if (doc === null) {
      return 120;
    }
    const cells = Math.max(doc.widthPx, doc.heightPx) / doc.grid.cellSizePx;
    return Math.max(1, Math.round(cells * doc.grid.feetPerCell));
  });

  public readonly propertiesForm = createMapPropertiesForm(this.propertiesModel, this.maxSightFeet);

  public readonly backgroundColorHex = computed(() =>
    rgbaToHex(this.propertiesForm.backgroundColor().value()));

  public readonly backgroundColorAlpha = computed(() =>
    rgbaAlphaPercent(this.propertiesForm.backgroundColor().value()));

  public readonly sections = signal({ ...DEFAULT_EDITOR_SECTIONS });

  public toggleSection(section: MapEditorSection): void {
    this.sections.update((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  private readonly propertiesFields = this.propertiesForm as unknown as Record<
    keyof MapPropertiesFormModel,
    () => FieldState<unknown>
  >;

  public readonly selectedWall = computed(() => {
    const selection = this.selected();
    return selection?.type === 'wall'
      ? this.walls().find((wall) => wall.id === selection.id) ?? null
      : null;
  });

  public readonly selectedLight = computed(() => {
    const selection = this.selected();
    return selection?.type === 'light'
      ? this.lights().find((light) => light.id === selection.id) ?? null
      : null;
  });

  public readonly selectedSpawn = computed(() => {
    const selection = this.selected();
    return selection?.type === 'spawn'
      ? this.spawns().find((spawn) => spawn.id === selection.id) ?? null
      : null;
  });

  public readonly selectedStart = computed(() => {
    const selection = this.selected();
    return selection?.type === 'start'
      ? this.starts().find((start) => start.id === selection.id) ?? null
      : null;
  });

  public readonly selectedLoot = computed<LootElement | null>(() => {
    const selection = this.selected();
    if (selection?.type !== 'loot') {
      return null;
    }
    const doc = this.doc();
    if (doc === null) {
      return null;
    }
    return elementsLayer(doc).items.find(
      (item): item is LootElement => item.type === 'loot' && item.id === selection.id,
    ) ?? null;
  });

  public readonly selectedArea = computed(() => {
    const selection = this.selected();
    return selection?.type === 'area'
      ? this.blockedAreas().find((area) => area.id === selection.id) ?? null
      : null;
  });

  /**
   * Inspector filtrato: ogni sezione appartiene al layer attivo. Poligoni e
   * testi sono grafiche a tutti gli effetti e usano lo stesso inspector.
   */
  public readonly inspectorGraphic = computed<MapGraphic | null>(() => {
    const graphic = this.activeLayer() === 'graphics' ? this.selectedGraphic() : null;
    return graphic;
  });

  public readonly inspectorArea = computed(() =>
    this.activeLayer() === 'constraints' ? this.selectedArea() : null);

  public readonly inspectorWall = computed(() =>
    this.activeLayer() === 'constraints' ? this.selectedWall() : null);

  public readonly inspectorLight = computed(() =>
    this.activeLayer() === 'elements' ? this.selectedLight() : null);

  public readonly inspectorSpawn = computed(() =>
    this.activeLayer() === 'elements' ? this.selectedSpawn() : null);

  public readonly inspectorStart = computed(() =>
    this.activeLayer() === 'elements' ? this.selectedStart() : null);

  public readonly inspectorLoot = computed(() =>
    this.activeLayer() === 'elements' ? this.selectedLoot() : null);

  public readonly filteredMonsters = computed(() => {
    const query = this.spawnSearch().trim().toLowerCase();
    const monsters = this.catalogService.catalog()?.monsters ?? [];
    return monsters
      .filter((monster) => query === '' || monster.name.toLowerCase().includes(query))
      .slice(0, 80);
  });

  public readonly filteredActors = computed(() => {
    const query = this.spawnSearch().trim().toLowerCase();
    return (this.actors() ?? [])
      .filter((actor) => actor.kind !== 'pc')
      .filter((actor) => query === '' || actor.name.toLowerCase().includes(query))
      .slice(0, 80);
  });

  public constructor() {
    effect(() => {
      const doc = this.doc();
      if (doc === null) {
        return;
      }
      const next = mapPropertiesFromDocument(doc);
      const current = untracked(() => this.propertiesForm().value());
      if (!sameMapProperties(current, next)) {
        this.propertiesForm().reset(next);
      }
    });
    effect(() => {
      const doc = this.doc();
      if (doc === null) {
        return;
      }
      const assetIds = [
        ...new Set(
          graphicsLayer(doc).items.flatMap((item) => (isImageGraphic(item) ? [item.assetId] : [])),
        ),
      ];
      untracked(() => {
        for (const assetId of assetIds) {
          void this.loadGraphicImage(assetId);
        }
      });
    });
  }

  public ngOnInit(): void {
    window.addEventListener('beforeunload', this.unloadHandler);
    void this.load();
  }

  public ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.unloadHandler);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const map = await this.mapsApi.get(this.mapId());
      this.applyMap(map);
      await this.loadImage(map);
      await this.catalogService.load();
      this.error.set(null);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.loading.set(false);
    }
  }

  private applyMap(map: Map): void {
    const document = toDocument(map);
    const maxSight = Math.max(
      1,
      Math.round(
        (Math.max(document.widthPx, document.heightPx) / document.grid.cellSizePx)
        * document.grid.feetPerCell,
      ),
    );
    document.visionLimitFeet = Math.min(document.visionLimitFeet, maxSight);
    this.doc.set(document);
    this.version.set(map.version);
    this.dirty.set(false);
    this.loadedMap = map;
    this.campaignId.set(map.campaignId);
  }

  private async loadImage(map: Map): Promise<void> {
    const imageAssetId = backgroundLayer(map).imageAssetId;
    if (imageAssetId === null) {
      this.backgroundAsset = null;
      this.image.set({ url: '', width: map.widthPx, height: map.heightPx });
      return;
    }
    try {
      const asset = await this.assets.get(imageAssetId);
      this.backgroundAsset = {
        assetId: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      };
      this.image.set({ url: asset.url, width: map.widthPx, height: map.heightPx });
    } catch {
      this.backgroundAsset = null;
      this.image.set({ url: '', width: map.widthPx, height: map.heightPx });
    }
  }

  /** Riallinea l'anteprima (stato UI separato) al documento dopo undo/redo. */
  private syncImageFromDoc(): void {
    const doc = this.doc();
    if (doc === null) {
      this.backgroundAsset = null;
      this.image.set(null);
      return;
    }
    const imageAssetId = backgroundLayer(doc).imageAssetId;
    if (imageAssetId === null) {
      this.backgroundAsset = null;
      this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
      return;
    }
    if (this.backgroundAsset?.assetId === imageAssetId) {
      this.image.set({
        url: this.backgroundAsset.url,
        width: doc.widthPx,
        height: doc.heightPx,
      });
      return;
    }
    this.backgroundAsset = null;
    this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
    void this.reloadBackgroundImage(imageAssetId);
  }

  private async reloadBackgroundImage(assetId: string): Promise<void> {
    try {
      const asset = await this.assets.get(assetId);
      const doc = this.doc();
      if (doc === null || backgroundLayer(doc).imageAssetId !== assetId) {
        return;
      }
      this.backgroundAsset = {
        assetId: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      };
      this.image.set({ url: asset.url, width: doc.widthPx, height: doc.heightPx });
    } catch {
      const doc = this.doc();
      if (doc === null || backgroundLayer(doc).imageAssetId !== assetId) {
        return;
      }
      this.backgroundAsset = null;
      this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
    }
  }

  private async loadGraphicImage(assetId: string): Promise<void> {
    if (this.requestedGraphicAssets.has(assetId)) {
      return;
    }
    this.requestedGraphicAssets.add(assetId);
    try {
      const asset: Asset | undefined = await this.assets.get(assetId);
      if (asset === undefined) {
        return;
      }
      this.graphicImages.update((current) => ({
        ...current,
        [assetId]: { url: asset.url, width: asset.width, height: asset.height },
      }));
    } catch {
      // Asset mancante: la grafica resta senza immagine ma non blocca il render.
    }
  }

  public setTool(tool: EditorTool): void {
    /** Con il layer attivo protetto resta attivabile solo la selezione neutra. */
    if (tool !== 'select' && this.activeLayerLocked()) {
      return;
    }
    if (!this.tools().some((entry) => entry.tool === tool)) {
      return;
    }
    if (this.isHex() && [
      'wall',
      'freehand',
      'door',
      'window',
      'lowWall',
      'eraser',
      'areaRect',
      'areaPolygon',
      'light',
    ].includes(tool)) {
      this.error.set('Le mappe esagonali usano la fog manuale: muri e luci saranno disponibili in una fase successiva.');
      return;
    }
    this.tool.set(tool);
  }

  /** Cambia layer attivo e riporta la toolbar alla selezione neutra. */
  public setActiveLayer(kind: MapLayerKind): void {
    this.activeLayer.set(kind);
    this.tool.set('select');
    this.selected.set(null);
  }

  public setLayerVisible(kind: MapLayerKind, visible: boolean): void {
    this.applyLayerVisibility(kind, visible);
  }

  /** Senza `locked` commuta lo stato corrente; il pannello passa il valore target. */
  public toggleLayerLock(kind: MapLayerKind, locked?: boolean): void {
    if (locked !== undefined) {
      this.applyLayerLock(kind, locked);
      return;
    }
    const layer = this.layerOf(kind);
    if (layer === null) {
      return;
    }
    this.applyLayerLock(kind, !layer.locked);
  }

  public commitLayerOpacity(kind: MapLayerKind, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.applyLayerOpacity(kind, value);
  }

  /** Output del pannello layer (opacità già numerica). */
  public setLayerOpacity(event: LayerOpacityCommit): void {
    this.applyLayerOpacity(event.kind, event.opacity);
  }

  private applyLayerVisibility(kind: MapLayerKind, visible: boolean): void {
    const layer = this.layerOf(kind);
    if (layer === null || layer.visible === visible) {
      return;
    }
    this.execute(replaceLayer(kind, { visible: layer.visible }, { visible }));
  }

  private applyLayerLock(kind: MapLayerKind, locked: boolean): void {
    const layer = this.layerOf(kind);
    if (layer === null || layer.locked === locked) {
      return;
    }
    this.execute(replaceLayer(kind, { locked: layer.locked }, { locked }));
  }

  private applyLayerOpacity(kind: MapLayerKind, raw: number): void {
    if (!Number.isFinite(raw)) {
      return;
    }
    const layer = this.layerOf(kind);
    if (layer === null) {
      return;
    }
    const opacity = Math.min(1, Math.max(0, raw));
    if (layer.opacity === opacity) {
      return;
    }
    this.execute(replaceLayer(kind, { opacity: layer.opacity }, { opacity }));
  }

  private layerOf(kind: MapLayerKind): MapLayers[number] | null {
    const doc = this.doc();
    if (doc === null) {
      return null;
    }
    return doc.layers.find((layer) => layer.kind === kind) ?? null;
  }

  /** Il contenuto è protetto se il layer attivo o quello che lo possiede è bloccato. */
  private contentLocked(owner: MapLayerKind): boolean {
    if (this.activeLayerLocked()) {
      return true;
    }
    const layer = this.layerOf(owner);
    if (layer?.locked === true) {
      return true;
    }
    // Una grafica invisibile non è modificabile: l'utente non vedrebbe l'effetto.
    return owner === 'graphics' && layer?.visible === false;
  }

  /** Il footprint è piazzabile rispetto ai muri del documento. */
  private isPlaceable(cell: { x: number; y: number }, size: number): boolean {
    const doc = this.doc();
    if (doc === null) {
      return false;
    }
    return isFootprintPlaceable(cell, size, {
      ...defaultTerrain,
      walls: wallsOf(doc),
    });
  }

  public select(selection: EditorSelection | null): void {
    const current = this.selected();
    if (
      current === selection
      || (current !== null && selection !== null
        && current.type === selection.type && current.id === selection.id)
    ) {
      return;
    }
    this.selected.set(selection);
  }

  public onWallsDrawn(event: WallsDrawnEvent): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const cols = Math.ceil((doc.widthPx - doc.grid.offsetX) / doc.grid.cellSizePx);
    const rows = Math.ceil((doc.heightPx - doc.grid.offsetY) / doc.grid.cellSizePx);
    const walls = event.walls
      .filter((wall) => wall.a.x >= 0 && wall.a.x <= cols && wall.a.y >= 0 && wall.a.y <= rows
        && wall.b.x >= 0 && wall.b.x <= cols && wall.b.y >= 0 && wall.b.y <= rows)
      .map<WallSegment>((wall) => ({
        ...wall,
        id: wall.id || newId(),
        ...(wall.kind === 'door' ? { door: wall.door ?? 'closed' } : {}),
      }));
    if (walls.length === 0) {
      return;
    }
    this.execute(arrayInsert('wall', walls));
  }

  public onWallRemoved(id: string): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const doc = this.doc();
    const items = doc === null ? [] : constraintsLayer(doc).items;
    const index = items.findIndex((item) => item.id === id);
    const wall = items[index];
    if (wall !== undefined && 'a' in wall && 'b' in wall && 'kind' in wall) {
      this.execute(arrayRemove('wall', wall, index));
    }
    if (this.selected()?.type === 'wall' && this.selected()?.id === id) {
      this.selected.set(null);
    }
  }

  /** Aggiunge un'area disegnata o già composta e la seleziona. */
  public addArea(area: BlockedArea): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    this.execute(arrayInsert('area', [area]));
    this.selected.set({ type: 'area', id: area.id });
  }

  /** Il canvas emette solo la geometria: l'id nasce qui, come per i muri. */
  public onAreaDrawn(event: AreaDrawnEvent): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const points = event.points;
    if (event.shape === 'rect' && points.length < 2) {
      return;
    }
    if (event.shape === 'polygon' && points.length < 3) {
      return;
    }
    const id = newId();
    const area: BlockedArea = event.shape === 'rect'
      ? { id, shape: 'rect', points: [points[0], points[1]] as BlockedArea['points'] }
      : { id, shape: 'polygon', points: points.map((point) => ({ ...point })) };
    this.addArea(area);
  }

  public onAreaRemoved(event: { id: string }): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const doc = this.doc();
    const items = doc === null ? [] : constraintsLayer(doc).items;
    const index = items.findIndex((item) => item.id === event.id);
    const area = items[index];
    if (area !== undefined && 'shape' in area) {
      this.execute(arrayRemove('area', area, index));
    }
    if (this.selected()?.type === 'area' && this.selected()?.id === event.id) {
      this.selected.set(null);
    }
  }

  public updateAreaLabel(value: string): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const area = this.selectedArea();
    if (area === null) {
      return;
    }
    const label = value.trim();
    if (label === (area.label ?? '')) {
      return;
    }
    const before: Partial<BlockedArea> = area.label === undefined ? {} : { label: area.label };
    const after: Partial<BlockedArea> = label === '' ? {} : { label };
    this.execute(replaceFields('area', area.id, before, after));
  }

  public placeLight(cell: { x: number; y: number }): void {
    if (this.contentLocked('elements')) {
      return;
    }
    if (this.isHex() || !this.inBounds(cell)) {
      return;
    }
    const light: Light = {
      id: newId(),
      x: cell.x,
      y: cell.y,
      brightFeet: 20,
      dimFeet: 40,
      color: '#ffcc80',
      enabled: true,
      shape: 'circle',
      angle: 60,
    };
    this.execute(arrayInsert('light', [light]));
    this.selected.set({ type: 'light', id: light.id });
    this.tool.set('select');
  }

  public placeStart(cell: { x: number; y: number }): void {
    if (this.contentLocked('elements')) {
      return;
    }
    if (!this.inBounds(cell) || this.starts().length >= 12) {
      return;
    }
    if (!this.isPlaceable(cell, 1)) {
      return;
    }
    const start: PlayerStart = {
      id: newId(),
      x: cell.x,
      y: cell.y,
      label: `PG ${this.starts().length + 1}`,
    };
    this.execute(arrayInsert('start', [start]));
    this.selected.set({ type: 'start', id: start.id });
    this.tool.set('select');
  }

  public requestSpawn(cell: { x: number; y: number }): void {
    if (this.contentLocked('elements')) {
      return;
    }
    if (!this.inBounds(cell) || !this.isPlaceable(cell, 1)) {
      return;
    }
    this.spawnCell.set(cell);
    this.spawnSearch.set('');
    this.spawnTab.set('srd');
  }

  public addSrdSpawn(monster: SrdMonster): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const cell = this.spawnCell();
    if (cell === null) {
      return;
    }
    const size = sizeCells(monster.size);
    if (!this.isPlaceable(cell, size)) {
      this.error.set(PLACEMENT_ERROR);
      return;
    }
    const spawn: MapSpawn = {
      id: newId(),
      kind: 'monster',
      x: cell.x,
      y: cell.y,
      source: { type: 'srd', monsterId: monster.id },
      label: monster.name,
      size,
      hidden: false,
      quantity: 1,
    };
    this.execute(arrayInsert('spawn', [spawn]));
    this.spawnCell.set(null);
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  public addActorSpawn(actor: Actor): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const cell = this.spawnCell();
    if (cell === null) {
      return;
    }
    const size = sizeCells(actor.statblock.size);
    if (!this.isPlaceable(cell, size)) {
      this.error.set(PLACEMENT_ERROR);
      return;
    }
    const spawn: MapSpawn = {
      id: newId(),
      kind: actor.kind === 'pc' ? 'npc' : actor.kind,
      x: cell.x,
      y: cell.y,
      source: { type: 'actor', actorId: actor.id },
      label: actor.name,
      size,
      hidden: false,
      quantity: 1,
    };
    this.execute(arrayInsert('spawn', [spawn]));
    this.spawnCell.set(null);
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  /** Apre il selettore loot sulla cella richiesta dal canvas o dal test. */
  public requestLoot(cell: { x: number; y: number }): void {
    const elements = this.layerOf('elements');
    if (
      this.contentLocked('elements')
      || elements?.visible === false
      || !this.inBounds(cell)
    ) {
      return;
    }
    this.lootCell.set({ x: cell.x, y: cell.y });
  }

  /** Chiusura senza conferma: nessuna modifica al documento. */
  public closeLoot(): void {
    this.lootCell.set(null);
  }

  public confirmLoot(payload: LootDialogPayload): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const cell = this.lootCell();
    if (cell === null) {
      return;
    }
    if (
      !Number.isInteger(payload.quantity)
      || payload.quantity < 1
      || payload.quantity > 999
    ) {
      return;
    }
    const loot: LootElement = {
      id: newId(),
      type: 'loot',
      itemId: payload.itemId,
      x: cell.x,
      y: cell.y,
      quantity: payload.quantity,
      visible: payload.visible,
    };
    this.execute(arrayInsert('loot', [loot]));
    this.selected.set({ type: 'loot', id: loot.id });
    this.tool.set('select');
    this.lootCell.set(null);
  }

  /** Quantità e visibilità del loot selezionato, con history e validazione. */
  public updateLootField(field: 'quantity' | 'visible', value: number | boolean): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const loot = this.selectedLoot();
    if (loot === null) {
      return;
    }
    if (field === 'quantity') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 999) {
        return;
      }
      if (loot.quantity === value) {
        return;
      }
      this.execute(replaceFields('loot', loot.id, { quantity: loot.quantity }, { quantity: value }));
      return;
    }
    const visible = Boolean(value);
    if (loot.visible === visible) {
      return;
    }
    this.execute(replaceFields('loot', loot.id, { visible: loot.visible }, { visible }));
  }

  public onLootQuantityChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const loot = this.selectedLoot();
    if (loot === null) {
      return;
    }
    const raw = input.value;
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(value) || value < 1 || value > 999) {
      input.value = String(loot.quantity);
      return;
    }
    this.updateLootField('quantity', value);
  }

  public onLootVisibleChange(event: Event): void {
    this.updateLootField('visible', (event.target as HTMLInputElement).checked);
  }

  /** Nome leggibile dell'oggetto: il catalogo può non essere ancora caricato. */
  public lootItemName(loot: LootElement): string {
    return this.catalogService.catalog()?.items.find((item) => item.id === loot.itemId)?.name
      ?? loot.itemId;
  }

  public moveElement(event: { selection: EditorSelection; cell: { x: number; y: number } }): void {
    if (this.contentLocked('elements') || !this.inBounds(event.cell)) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const after = { x: event.cell.x, y: event.cell.y };
    if (event.selection.type === 'spawn') {
      const spawn = this.spawns().find((entry) => entry.id === event.selection.id);
      if (spawn !== undefined && this.isPlaceable(event.cell, spawn.size)) {
        this.execute(replaceFields('spawn', spawn.id, { x: spawn.x, y: spawn.y }, after));
      }
    } else if (event.selection.type === 'start') {
      const start = this.starts().find((entry) => entry.id === event.selection.id);
      if (start !== undefined && this.isPlaceable(event.cell, 1)) {
        this.execute(replaceFields('start', start.id, { x: start.x, y: start.y }, after));
      }
    } else if (event.selection.type === 'light') {
      const light = this.lights().find((entry) => entry.id === event.selection.id);
      if (light !== undefined) {
        this.execute(replaceFields('light', light.id, { x: light.x, y: light.y }, after));
      }
    }
  }

  /**
   * Aggiunge una grafica per ogni file caricato. Gli upload sono atomici: se
   * uno fallisce non entra nulla in documento, dirty o history.
   */
  public async addGraphic(event: Event): Promise<void> {
    if (this.contentLocked('graphics')) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) {
      return;
    }
    try {
      const assets = await Promise.all(files.map((file) => this.assets.upload(file)));
      const doc = this.doc();
      if (doc === null || this.contentLocked('graphics')) {
        return;
      }
      const items = graphicsLayer(doc).items;
      let z = items.reduce((max, item) => Math.max(max, item.z), -1) + 1;
      const graphics = assets.map<MapGraphic>((asset) => {
        const graphic: MapGraphic = {
          kind: 'image',
          id: newId(),
          assetId: asset.id,
          x: doc.widthPx / 2,
          y: doc.heightPx / 2,
          scale: 1,
          rotation: 0,
          flipH: false,
          flipV: false,
          opacity: 1,
          z,
        };
        z += 1;
        return graphic;
      });
      this.execute(arrayInsert('graphic', graphics));
      const last = graphics[graphics.length - 1];
      if (last !== undefined) {
        this.selected.set({ type: 'graphic', id: last.id });
      }
      this.tool.set('select');
    } catch (error) {
      this.error.set(messageFor(error));
    }
  }

  /** Poligono disegnato dal canvas: default dello schema, selezione e history. */
  public addGraphicPolygon(points: CellPoint[]): void {
    if (
      this.contentLocked('graphics')
      || points.length < 3
      || points.length > GRAPHIC_POLYGON_MAX_VERTICES
    ) {
      return;
    }
    if (points.some((point) => !Number.isInteger(point.x) || !Number.isInteger(point.y))) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const polygon: PolygonGraphic = {
      kind: 'polygon',
      id: newId(),
      points: points.map((point) => ({ x: point.x, y: point.y })),
      fill: '#4ea1ff',
      opacity: 0.35,
      z: this.nextGraphicZ(doc),
    };
    this.execute(arrayInsert('graphic', [polygon]));
    this.selected.set({ type: 'graphic', id: polygon.id });
    this.tool.set('select');
  }

  /** Testo richiesto dal canvas: coordinate intere, default leggibili. */
  public addGraphicText(point: CellPoint): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const text: TextGraphic = {
      kind: 'text',
      id: newId(),
      text: 'Testo',
      fontFamily: 'sans',
      fontSize: 24,
      color: '#ffffff',
      x: point.x,
      y: point.y,
      opacity: 1,
      z: this.nextGraphicZ(doc),
    };
    this.execute(arrayInsert('graphic', [text]));
    this.selected.set({ type: 'graphic', id: text.id });
    this.tool.set('select');
  }

  /** Sposta un poligono di celle intere, clampando senza deformare la forma. */
  public translateGraphic(event: { id: string; dx: number; dy: number }): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    if (!Number.isFinite(event.dx) || !Number.isFinite(event.dy)) {
      return;
    }
    const doc = this.doc();
    const graphic = doc === null
      ? undefined
      : graphicsLayer(doc).items.find((item) => item.id === event.id);
    if (doc === null || graphic === undefined || !isPolygonGraphic(graphic)) {
      return;
    }
    // Con offset la cella massima va calcolata sullo spazio pixel residuo;
    // senza offset resta il comportamento storico.
    const maxCell = (sizePx: number, offsetPx: number): number =>
      offsetPx === 0
        ? Math.ceil(sizePx / doc.grid.cellSizePx)
        : Math.floor((sizePx - offsetPx) / doc.grid.cellSizePx);
    const points = translatePolygonPoints(
      graphic.points,
      Math.round(event.dx),
      Math.round(event.dy),
      {
        maxX: maxCell(doc.widthPx, doc.grid.offsetX),
        maxY: maxCell(doc.heightPx, doc.grid.offsetY),
      },
    );
    const unchanged = points.every((point, index) => {
      const current = graphic.points[index];
      return current !== undefined && current.x === point.x && current.y === point.y;
    });
    if (unchanged) {
      return;
    }
    this.execute(replaceFields(
      'graphic',
      graphic.id,
      { points: graphic.points },
      { points },
    ));
  }

  /** Aggiorna un campo della grafica selezionata, validando per variante. */
  public updateGraphicField(field: GraphicField, value: number | string): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    const graphic = this.inspectorGraphic();
    if (graphic === null) {
      return;
    }
    const validated = validateGraphicField(graphic, field, value);
    if (validated === null) {
      return;
    }
    const current = (graphic as unknown as Record<string, unknown>)[field];
    if (current === validated) {
      return;
    }
    this.execute(replaceFields(
      'graphic',
      graphic.id,
      { [field]: current } as Partial<MapGraphic>,
      { [field]: validated } as Partial<MapGraphic>,
    ));
  }

  /** Prossimo `z` libero: in cima allo stack esistente. */
  private nextGraphicZ(doc: MapDocument): number {
    return graphicsLayer(doc).items.reduce((max, item) => Math.max(max, item.z), -1) + 1;
  }

  /** Trascinamento dal canvas: coordinate mondo del centro, senza snap. */
  public moveGraphic(event: { id: string; x: number; y: number }): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    const doc = this.doc();
    if (doc === null || !Number.isFinite(event.x) || !Number.isFinite(event.y)) {
      return;
    }
    const graphic = graphicsLayer(doc).items.find((item) => item.id === event.id);
    if (graphic === undefined || isPolygonGraphic(graphic)) {
      return;
    }
    // I testi richiedono coordinate intere per schema; le immagini ammettono
    // float e mantengono il posizionamento continuo del canvas.
    const round = isTextGraphic(graphic)
      ? (value: number): number => Math.round(value)
      : (value: number): number => value;
    const x = round(Math.min(doc.widthPx, Math.max(0, round(event.x))));
    const y = round(Math.min(doc.heightPx, Math.max(0, round(event.y))));
    if (graphic.x === x && graphic.y === y) {
      return;
    }
    this.execute(replaceFields(
      'graphic',
      graphic.id,
      { x: graphic.x, y: graphic.y },
      { x, y },
    ));
  }

  public flipGraphic(axis: 'h' | 'v'): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    const graphic = this.inspectorGraphic();
    if (graphic === null || !isImageGraphic(graphic)) {
      return;
    }
    const field = axis === 'h' ? 'flipH' : 'flipV';
    const before: Partial<ImageGraphic> = {};
    const after: Partial<ImageGraphic> = {};
    before[field] = graphic[field];
    after[field] = !graphic[field];
    this.execute(replaceFields('graphic', graphic.id, before, after));
  }

  public moveGraphicZ(direction: GraphicZDirection): void {
    if (this.contentLocked('graphics')) {
      return;
    }
    const graphic = this.selectedGraphic();
    const doc = this.doc();
    if (graphic === null || doc === null) {
      return;
    }
    const ordered = sortedGraphics(graphicsLayer(doc).items);
    const index = ordered.findIndex((item) => item.id === graphic.id);
    if (index < 0 || nextGraphicZIndex(index, ordered.length, direction) === index) {
      return;
    }
    this.execute(graphicZCommand(graphic.id, direction));
  }

  public moveWall(event: { id: string; dx: number; dy: number }): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const doc = this.doc();
    const wall = this.walls().find((entry) => entry.id === event.id);
    if (doc === null || wall === undefined) {
      return;
    }
    const cols = Math.ceil((doc.widthPx - doc.grid.offsetX) / doc.grid.cellSizePx);
    const rows = Math.ceil((doc.heightPx - doc.grid.offsetY) / doc.grid.cellSizePx);
    const inside = (point: { x: number; y: number }): boolean =>
      point.x >= 0 && point.y >= 0 && point.x <= cols && point.y <= rows;
    const a = { x: wall.a.x + event.dx, y: wall.a.y + event.dy };
    const b = { x: wall.b.x + event.dx, y: wall.b.y + event.dy };
    if (!inside(a) || !inside(b)) {
      return;
    }
    this.execute(replaceFields('wall', wall.id, { a: wall.a, b: wall.b }, { a, b }));
  }

  public updateWall(kind: WallKind, door?: WallSegment['door']): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const wall = this.selectedWall();
    if (wall === null) {
      return;
    }
    const before: Partial<WallSegment> = { kind: wall.kind };
    if (wall.door !== undefined) {
      before.door = wall.door;
    }
    const after: Partial<WallSegment> = { kind };
    if (kind === 'door') {
      after.door = door ?? wall.door ?? 'closed';
    }
    this.execute(replaceFields('wall', wall.id, before, after));
  }

  public updateWallKind(event: Event): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    this.updateWall((event.target as HTMLSelectElement).value as WallKind);
  }

  public spawnSourceLabel(spawn: MapSpawn): string {
    return spawn.source.type === 'srd'
      ? `SRD · ${spawn.source.monsterId}`
      : 'Attore della campagna';
  }

  public updateDoor(event: Event): void {
    if (this.contentLocked('constraints')) {
      return;
    }
    const wall = this.selectedWall();
    if (wall === null) {
      return;
    }
    const value = (event.target as HTMLSelectElement).value as WallSegment['door'];
    if (value === undefined) {
      return;
    }
    const before: Partial<WallSegment> = wall.door === undefined ? {} : { door: wall.door };
    this.execute(replaceFields('wall', wall.id, before, { door: value }));
  }

  public updateLightField(field: keyof Light, event: Event): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const light = this.selectedLight();
    if (light === null) {
      return;
    }
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    const { before, after } = fieldPatch(light, field, value);
    this.execute(replaceFields('light', light.id, before, after));
  }

  public updateSpawnField(field: keyof MapSpawn, event: Event): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const spawn = this.selectedSpawn();
    if (spawn === null) {
      return;
    }
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    const { before, after } = fieldPatch(spawn, field, value);
    this.execute(replaceFields('spawn', spawn.id, before, after));
  }

  public updateStartLabel(event: Event): void {
    if (this.contentLocked('elements')) {
      return;
    }
    const start = this.selectedStart();
    if (start === null) {
      return;
    }
    const label = (event.target as HTMLInputElement).value;
    const { before, after } = fieldPatch(start, 'label', label);
    this.execute(replaceFields('start', start.id, before, after));
  }

  /** Commit del campo dal form: il template usa `[formField]` e chiama questo metodo al change. */
  public commitMapField(field: MapTextField): void {
    const state = this.propertiesFields[field]();
    if (!state.valid()) {
      return;
    }
    const value = field === 'name' ? String(state.value()).trim() : String(state.value());
    this.applyMapField(field, value);
  }

  public setBackgroundColorHex(event: Event): void {
    const hex = (event.target as HTMLInputElement).value;
    this.updateBackgroundColor(hex, this.backgroundColorAlpha());
  }

  public setBackgroundColorAlpha(event: Event): void {
    const alpha = Number((event.target as HTMLInputElement).value);
    this.updateBackgroundColor(this.backgroundColorHex(), alpha);
  }

  private updateBackgroundColor(hex: string, alphaPercent: number): void {
    this.propertiesForm.backgroundColor().value.set(hexAlphaToRgba(hex, alphaPercent));
    this.commitMapField('backgroundColor');
  }

  public commitGridField(field: MapGridField): void {
    const modelField = field === 'type' ? 'gridType' : field;
    const state = this.propertiesFields[modelField]();
    if (!state.valid()) {
      return;
    }
    this.applyGridField(field, state.value() as string | number | boolean);
  }

  public commitTerrainField(field: MapTerrainField): void {
    const state = this.propertiesFields[field]();
    if (!state.valid()) {
      return;
    }
    this.applyTerrainField(field, state.value() as string | number | boolean);
  }

  public commitVisionLimit(): void {
    if (!this.propertiesFields.visionLimitFeet().valid()) {
      return;
    }
    const raw = Number(this.propertiesFields.visionLimitFeet().value());
    this.applyVisionLimit(raw);
  }

  /** `aria-invalid` solo dopo il blur, come i form signal del wizard. */
  public fieldInvalid(field: keyof MapPropertiesFormModel): boolean | null {
    const state = this.propertiesFields[field]();
    return state.touched() ? state.invalid() : null;
  }

  /** Primo errore visibile dopo il blur, da mostrare con `role="alert"`. */
  public fieldError(field: keyof MapPropertiesFormModel): string | null {
    const state = this.propertiesFields[field]();
    if (!state.touched()) {
      return null;
    }
    return state.errors()[0]?.message ?? 'Valore non valido.';
  }

  private applyMapField(field: MapTextField, rawValue: string): void {
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const value = field === 'name' ? rawValue.trim() : rawValue;
    if (field === 'name' && value === '') {
      return;
    }
    const { before, after } = fieldPatch(doc, field, value);
    this.execute(replaceFields('map', before, after));
  }

  private applyGridField(field: MapGridField, rawValue: string | number | boolean): void {
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const value = normalizeGridValue(field, rawValue);
    if (value === null) {
      return;
    }
    const { before, after } = fieldPatch(doc.grid, field, value);
    const gridCommand = replaceFields('grid', before, after);
    const nextGrid = { ...doc.grid, [field]: value };
    const maxSight = Math.max(
      1,
      Math.round(
        (Math.max(doc.widthPx, doc.heightPx) / nextGrid.cellSizePx) * nextGrid.feetPerCell,
      ),
    );
    const nextVision = Math.min(doc.visionLimitFeet, maxSight);
    if (nextVision === doc.visionLimitFeet) {
      this.execute(gridCommand);
      return;
    }
    const visionCommand = replaceFields(
      'map',
      { visionLimitFeet: doc.visionLimitFeet },
      { visionLimitFeet: nextVision },
    );
    this.execute({
      label: gridCommand.label,
      bytes: gridCommand.bytes + visionCommand.bytes,
      apply: (next) => {
        gridCommand.apply(next);
        visionCommand.apply(next);
      },
      invert: (next) => {
        visionCommand.invert(next);
        gridCommand.invert(next);
      },
    });
  }

  private applyTerrainField(field: MapTerrainField, value: string | number | boolean): void {
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const normalized = field === 'showDoorIcons' ? Boolean(value) : value;
    const { before, after } = fieldPatch(doc, field, normalized);
    this.execute(replaceFields('map', before, after));
  }

  private applyVisionLimit(raw: number): void {
    const doc = this.doc();
    if (doc === null || !Number.isFinite(raw)) {
      return;
    }
    const value = Math.max(1, Math.min(this.maxSightFeet(), Math.round(raw)));
    this.execute(replaceFields(
      'map',
      { visionLimitFeet: doc.visionLimitFeet },
      { visionLimitFeet: value },
    ));
  }

  public removeSelected(): void {
    const selection = this.selected();
    if (selection === null) {
      return;
    }
    const owner: MapLayerKind = selection.type === 'wall' || selection.type === 'area'
      ? 'constraints'
      : selection.type === 'graphic' ? 'graphics' : 'elements';
    if (this.contentLocked(owner)) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const command = this.removeCommand(doc, selection);
    if (command !== null) {
      this.execute(command);
    }
    this.selected.set(null);
  }

  private removeCommand(doc: MapDocument, selection: EditorSelection): MapCommand | null {
    if (selection.type === 'wall' || selection.type === 'area') {
      const items = constraintsLayer(doc).items;
      const index = items.findIndex((item) => item.id === selection.id);
      const item = items[index];
      if (item === undefined) {
        return null;
      }
      if (selection.type === 'area') {
        return 'shape' in item ? arrayRemove('area', item, index) : null;
      }
      return 'a' in item && 'b' in item && 'kind' in item
        ? arrayRemove('wall', item, index)
        : null;
    }
    if (selection.type === 'graphic') {
      const items = graphicsLayer(doc).items;
      const index = items.findIndex((item) => item.id === selection.id);
      const graphic = items[index];
      return graphic === undefined ? null : removeGraphicCommand(graphic, index);
    }
    const items = elementsLayer(doc).items;
    const index = items.findIndex((item) => item.id === selection.id);
    const item = items[index];
    if (item === undefined || !('type' in item)) {
      return null;
    }
    if (selection.type === 'light' && item.type === 'light') {
      return arrayRemove('light', item, index);
    }
    if (selection.type === 'spawn' && item.type === 'spawn') {
      return arrayRemove('spawn', item, index);
    }
    if (selection.type === 'start' && item.type === 'start') {
      return arrayRemove('start', item, index);
    }
    if (selection.type === 'loot' && item.type === 'loot') {
      return arrayRemove('loot', item, index);
    }
    return null;
  }

  public selectLight(light: Light): void {
    this.selected.set({ type: 'light', id: light.id });
    this.tool.set('select');
  }

  public selectSpawn(spawn: MapSpawn): void {
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  public selectStart(start: PlayerStart): void {
    this.selected.set({ type: 'start', id: start.id });
    this.tool.set('select');
  }

  public selectLoot(loot: LootElement): void {
    this.selected.set({ type: 'loot', id: loot.id });
    this.tool.set('select');
  }

  public captureStartView(): void {
    const view = this.canvas()?.currentView();
    const doc = this.doc();
    if (view === undefined || doc === null) {
      return;
    }
    const before: Partial<MapDocument> = doc.startView === undefined
      ? {}
      : { startView: doc.startView };
    this.execute(replaceFields('map', before, { startView: view }));
  }

  public openBackgroundPicker(): void {
    this.backgroundInput()?.nativeElement.click();
  }

  public async replaceBackground(event: Event): Promise<void> {
    if (this.contentLocked('background')) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) {
      return;
    }
    try {
      const asset = await this.assets.upload(file);
      const doc = this.doc();
      if (doc === null) {
        return;
      }
      const current = backgroundLayer(doc);
      this.backgroundAsset = {
        assetId: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      };
      this.execute(replaceBackground(
        {
          imageAssetId: current.imageAssetId,
          backgroundTransform: current.imageTransform,
        },
        {
          imageAssetId: asset.id,
          backgroundTransform: coverTransform(
            doc.widthPx,
            doc.heightPx,
            asset.width,
            asset.height,
          ),
        },
      ));
      this.image.set({ url: asset.url, width: doc.widthPx, height: doc.heightPx });
    } catch (error) {
      this.error.set(messageFor(error));
    }
  }

  public removeBackground(): void {
    if (this.contentLocked('background')) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const current = backgroundLayer(doc);
    if (current.imageAssetId === null) {
      return;
    }
    this.backgroundAsset = null;
    this.execute(replaceBackground(
      {
        imageAssetId: current.imageAssetId,
        backgroundTransform: current.imageTransform,
      },
      {
        imageAssetId: null,
        backgroundTransform: { ...defaultBackgroundTransform },
      },
    ));
    this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
  }

  public async fitBackgroundCover(): Promise<void> {
    if (this.contentLocked('background')) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const initial = backgroundLayer(doc);
    if (initial.imageAssetId === null) {
      return;
    }
    const assetId = initial.imageAssetId;
    let size = this.backgroundAsset;
    if (size === null || size.assetId !== assetId) {
      try {
        const asset = await this.assets.get(assetId);
        this.backgroundAsset = {
          assetId: asset.id,
          url: asset.url,
          width: asset.width,
          height: asset.height,
        };
        this.image.set({ url: asset.url, width: doc.widthPx, height: doc.heightPx });
        size = this.backgroundAsset;
      } catch (error) {
        this.error.set(messageFor(error));
        return;
      }
    }
    const current = this.doc();
    if (current === null || size === null) {
      return;
    }
    const currentBackground = backgroundLayer(current);
    if (currentBackground.imageAssetId !== assetId) {
      return;
    }
    const transform = coverTransform(current.widthPx, current.heightPx, size.width, size.height);
    if (
      currentBackground.imageTransform.x === transform.x
      && currentBackground.imageTransform.y === transform.y
      && currentBackground.imageTransform.scale === transform.scale
    ) {
      return;
    }
    this.execute(replaceBackground(
      {
        imageAssetId: currentBackground.imageAssetId,
        backgroundTransform: currentBackground.imageTransform,
      },
      {
        imageAssetId: currentBackground.imageAssetId,
        backgroundTransform: transform,
      },
    ));
  }

  public async save(): Promise<void> {
    const doc = this.doc();
    if (doc === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const { derivatives, warning } = await this.prepareDerivatives(doc);
      this.warning.set(warning);
      const updated = await this.mapsApi.save(this.mapId(), this.version(), doc, derivatives);
      this.version.set(updated.version);
      this.dirty.set(false);
      this.error.set(null);
      this.loadedMap = updated;
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Genera e carica thumbnail e composito. Non lancia: un errore del renderer
   * produce un avviso e il PUT prosegue senza i derivati mancanti.
   */
  private async prepareDerivatives(
    doc: MapDocument,
  ): Promise<{ derivatives: MapDerivatives; warning: string | null }> {
    const derivatives: MapDerivatives = {};
    const map = this.loadedMap;
    if (this.renderer === null || map === null) {
      return { derivatives, warning: null };
    }
    try {
      const assets = await this.renderAssets(doc);
      const outcome = await this.renderer.renderAndUpload(map, doc, assets);
      if (outcome.thumbAssetId !== null) {
        derivatives.thumbAssetId = outcome.thumbAssetId;
      }
      if (outcome.compositeAssetId !== null) {
        derivatives.compositeAssetId = outcome.compositeAssetId;
      }
      const warning = outcome.warnings.length > 0 ? outcome.warnings.join(' ') : null;
      return { derivatives, warning };
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      return {
        derivatives,
        warning: detail === '' ? 'Anteprima non disponibile' : `Anteprima non disponibile: ${detail}`,
      };
    }
  }

  /** Risolve le immagini di sfondo e grafiche per il render fuori schermo. */
  private async renderAssets(doc: MapDocument): Promise<MapRenderAssets> {
    const background = await this.backgroundRenderImage(doc);
    const cached = this.graphicImages();
    const graphics: MapRenderGraphicAsset[] = [];
    for (const item of graphicsLayer(doc).items) {
      if (!isImageGraphic(item)) {
        graphics.push({ item, image: null });
        continue;
      }
      const meta = cached[item.assetId] ?? await this.assetRenderSource(item.assetId);
      const image = meta === null || meta === undefined ? null : await loadRenderImage(meta);
      graphics.push({ item, image });
    }
    return { background, graphics };
  }

  private async backgroundRenderImage(doc: MapDocument): Promise<MapRenderImage | null> {
    const layer = backgroundLayer(doc);
    if (!layer.visible || layer.imageAssetId === null) {
      return null;
    }
    const assetId = layer.imageAssetId;
    const meta = this.backgroundAsset?.assetId === assetId
      ? this.backgroundAsset
      : await this.assetRenderSource(assetId);
    return meta === null ? null : loadRenderImage(meta);
  }

  private async assetRenderSource(assetId: string): Promise<{
    url: string;
    width: number;
    height: number;
  } | null> {
    try {
      const asset: Asset | null | undefined = await this.assets.get(assetId);
      return renderImageSource(asset);
    } catch {
      return null;
    }
  }

  public async back(): Promise<void> {
    if (this.dirty()) {
      this.leaveConfirm.set(true);
      return;
    }
    await this.router.navigate(['/maps']);
  }

  public cancelLeave(): void {
    this.leaveConfirm.set(false);
  }

  public async confirmLeave(): Promise<void> {
    this.leaveConfirm.set(false);
    await this.router.navigate(['/maps']);
  }

  public onSpawnSearch(event: Event): void {
    this.spawnSearch.set((event.target as HTMLInputElement).value);
  }

  public undo(): void {
    const doc = this.doc();
    const next = doc === null ? null : this.history.undo(doc);
    if (next === null) {
      return;
    }
    this.doc.set(next);
    this.dirty.set(true);
    this.syncImageFromDoc();
  }

  public redo(): void {
    const doc = this.doc();
    const next = doc === null ? null : this.history.redo(doc);
    if (next === null) {
      return;
    }
    this.doc.set(next);
    this.dirty.set(true);
    this.syncImageFromDoc();
  }

  private fieldValue(
    target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    fallback = 0,
  ): string | number | boolean {
    if (target.type === 'checkbox' && target instanceof HTMLInputElement) {
      return target.checked;
    }
    if (target.type === 'number') {
      const value = Number(target.value);
      return Number.isFinite(value) ? value : fallback;
    }
    return target.value;
  }

  private inBounds(cell: { x: number; y: number }): boolean {
    const doc = this.doc();
    if (doc === null || cell.x < 0 || cell.y < 0) {
      return false;
    }
    const cols = Math.ceil((doc.widthPx - doc.grid.offsetX) / doc.grid.cellSizePx);
    const rows = Math.ceil((doc.heightPx - doc.grid.offsetY) / doc.grid.cellSizePx);
    return cell.x < cols && cell.y < rows;
  }

  private execute(command: MapCommand): void {
    const current = this.doc();
    if (current === null) {
      return;
    }
    this.doc.set(this.history.execute(current, command));
    this.dirty.set(true);
  }
}

/**
 * Estrae i campi toccati da un elemento: i valori `undefined` non entrano nel
 * patch, così l'inversione ripristina l'assenza del campo opzionale.
 */
/**
 * Normalizza i valori della griglia provenienti dal form o dagli eventi legacy.
 * Restituisce `null` per input non numerici, cosi non entrano nella history.
 */
const normalizeGridValue = (
  field: MapGridField,
  rawValue: string | number | boolean,
): string | number | null => {
  if (field === 'type' || field === 'diagonalRule') {
    return String(rawValue);
  }
  const number = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(number)) {
    return null;
  }
  if (field === 'cellSizePx') {
    return Math.min(MAP_CELL_SIZE_MAX_PX, Math.max(MAP_CELL_SIZE_MIN_PX, Math.round(number)));
  }
  if (field === 'feetPerCell') {
    return Math.max(MAP_FEET_PER_CELL_MIN, number);
  }
  return number;
};

const fieldPatch = <T extends object>(
  source: T,
  field: keyof T,
  value: unknown,
): { before: Partial<T>; after: Partial<T> } => {
  const after = { [field]: value } as Partial<T>;
  const before = source[field] === undefined ? {} : ({ [field]: source[field] } as Partial<T>);
  return { before, after };
};

/** Cover centrato: la scala riempie la scena e il ritaglio resta simmetrico. */
const coverTransform = (
  sceneWidth: number,
  sceneHeight: number,
  assetWidth: number,
  assetHeight: number,
): BackgroundTransform => {
  const scale = Math.max(sceneWidth / assetWidth, sceneHeight / assetHeight);
  return {
    x: (sceneWidth - assetWidth * scale) / 2,
    y: (sceneHeight - assetHeight * scale) / 2,
    scale,
  };
};

const toDocument = (map: Map): MapDocument => ({
  schemaVersion: 2,
  name: map.name,
  backgroundColor: map.backgroundColor,
  widthPx: map.widthPx,
  heightPx: map.heightPx,
  grid: structuredClone(map.grid),
  layers: structuredClone(map.layers),
  ambientLight: map.ambientLight,
  visionLimitFeet: map.visionLimitFeet,
  visionEnabled: map.visionEnabled,
  ...(map.startView === undefined ? {} : { startView: map.startView }),
  fogBase: map.fogBase,
  showDoorIcons: map.showDoorIcons,
  notes: map.notes,
});

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita.',
  useServerMessage: true,
  byStatus: {
    401: 'Serve la password DM: accedi dalla console.',
    403: 'Serve la password DM: accedi dalla console.',
  },
});
