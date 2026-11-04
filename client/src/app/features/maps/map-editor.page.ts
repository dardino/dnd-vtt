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
  defaultBackgroundTransform,
  type Actor,
  type BackgroundTransform,
  type GridConfig,
  type Light,
  type Map,
  type MapDocument,
  type MapSpawn,
  type PlayerStart,
  type SrdMonster,
  type WallKind,
  type WallSegment,
} from '@dnd-vtt/shared';
import { httpMessage } from '../../core/api/http-error';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { readResource } from '../../core/api/read-resource';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import {
  MapEditorCanvasComponent,
  type EditorMapImage,
  type EditorSelection,
  type EditorTool,
  type WallsDrawnEvent,
} from './map-editor-canvas.component';
import {
  arrayInsert,
  arrayRemove,
  replaceBackground,
  replaceFields,
  type MapCommand,
} from './map-command';
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

const TOOL_LABELS: Array<{ tool: EditorTool; icon: string; label: string; hint: string }> = [
  { tool: 'select', icon: 'arrow_selector_tool', label: 'Seleziona', hint: 'Seleziona e sposta elementi' },
  { tool: 'wall', icon: 'wall_art', label: 'Muro', hint: 'Disegna muri sui lati della griglia' },
  { tool: 'freehand', icon: 'draw', label: 'Tratto', hint: 'Traccia libero, rasterizzato a edge' },
  { tool: 'door', icon: 'door_front', label: 'Porta', hint: 'Trasforma un lato in porta' },
  { tool: 'window', icon: 'window', label: 'Finestra', hint: 'Blocca il movimento, non la vista' },
  { tool: 'lowWall', icon: 'fence', label: 'Muro basso', hint: 'Si vede sopra, blocca il movimento' },
  { tool: 'eraser', icon: 'ink_eraser', label: 'Gomma', hint: 'Rimuove un lato' },
  { tool: 'light', icon: 'lightbulb', label: 'Luce', hint: 'Aggiunge una luce statica' },
  { tool: 'spawn', icon: 'pets', label: 'Mostro', hint: 'Aggiunge uno spawn SRD o attore' },
  { tool: 'start', icon: 'flag', label: 'Partenza', hint: 'Aggiunge un punto di partenza PG' },
];

@Component({
  selector: 'app-map-editor-page',
  imports: [Button, Dialog, FormField, RouterLink, MapEditorCanvasComponent],
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

  private readonly canvas = viewChild(MapEditorCanvasComponent);
  private readonly backgroundInput = viewChild<ElementRef<HTMLInputElement>>('backgroundInput');

  public readonly loading = signal(true);
  public readonly saving = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly doc = signal<MapDocument | null>(null);
  private readonly propertiesModel = createMapPropertiesModel();
  public readonly version = signal(1);
  public readonly dirty = signal(false);
  public readonly leaveConfirm = signal(false);
  public readonly image = signal<EditorMapImage | null>(null);
  public readonly tool = signal<EditorTool>('select');
  public readonly selected = signal<EditorSelection | null>(null);
  public readonly showGrid = signal(true);
  public readonly hasBackground = computed(() => {
    const doc = this.doc();
    return doc !== null && doc.imageAssetId !== null;
  });

  public readonly spawnCell = signal<{ x: number; y: number } | null>(null);
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

  public readonly tools = TOOL_LABELS;
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

  private readonly propertiesFields = this.propertiesForm as unknown as Record<
    keyof MapPropertiesFormModel,
    () => FieldState<unknown>
  >;

  public readonly selectedWall = computed(() => {
    const selection = this.selected();
    const doc = this.doc();
    return selection?.type === 'wall' && doc !== null
      ? doc.terrain.walls.find((wall) => wall.id === selection.id) ?? null
      : null;
  });

  public readonly selectedLight = computed(() => {
    const selection = this.selected();
    const doc = this.doc();
    return selection?.type === 'light' && doc !== null
      ? doc.terrain.lights.find((light) => light.id === selection.id) ?? null
      : null;
  });

  public readonly selectedSpawn = computed(() => {
    const selection = this.selected();
    const doc = this.doc();
    return selection?.type === 'spawn' && doc !== null
      ? doc.spawns.find((spawn) => spawn.id === selection.id) ?? null
      : null;
  });

  public readonly selectedStart = computed(() => {
    const selection = this.selected();
    const doc = this.doc();
    return selection?.type === 'start' && doc !== null
      ? doc.playerStarts.find((start) => start.id === selection.id) ?? null
      : null;
  });

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
    document.terrain.visionLimitFeet = Math.min(document.terrain.visionLimitFeet, maxSight);
    this.doc.set(document);
    this.version.set(map.version);
    this.dirty.set(false);
    this.campaignId.set(map.campaignId);
  }

  private async loadImage(map: Map): Promise<void> {
    if (map.imageAssetId === null) {
      this.backgroundAsset = null;
      this.image.set({ url: '', width: map.widthPx, height: map.heightPx });
      return;
    }
    try {
      const asset = await this.assets.get(map.imageAssetId);
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
    if (doc.imageAssetId === null) {
      this.backgroundAsset = null;
      this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
      return;
    }
    if (this.backgroundAsset?.assetId === doc.imageAssetId) {
      this.image.set({
        url: this.backgroundAsset.url,
        width: doc.widthPx,
        height: doc.heightPx,
      });
      return;
    }
    this.backgroundAsset = null;
    this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
    void this.reloadBackgroundImage(doc.imageAssetId);
  }

  private async reloadBackgroundImage(assetId: string): Promise<void> {
    try {
      const asset = await this.assets.get(assetId);
      const doc = this.doc();
      if (doc === null || doc.imageAssetId !== assetId) {
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
      if (doc === null || doc.imageAssetId !== assetId) {
        return;
      }
      this.backgroundAsset = null;
      this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
    }
  }

  public setTool(tool: EditorTool): void {
    if (this.isHex() && ['wall', 'freehand', 'door', 'window', 'lowWall', 'eraser', 'light'].includes(tool)) {
      this.error.set('Le mappe esagonali usano la fog manuale: muri e luci saranno disponibili in una fase successiva.');
      return;
    }
    this.tool.set(tool);
  }

  public select(selection: EditorSelection | null): void {
    this.selected.set(selection);
  }

  public onWallsDrawn(event: WallsDrawnEvent): void {
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
    const doc = this.doc();
    const index = doc?.terrain.walls.findIndex((wall) => wall.id === id) ?? -1;
    const wall = doc?.terrain.walls[index];
    if (wall !== undefined) {
      this.execute(arrayRemove('wall', wall, index));
    }
    if (this.selected()?.type === 'wall' && this.selected()?.id === id) {
      this.selected.set(null);
    }
  }

  public placeLight(cell: { x: number; y: number }): void {
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
    if (!this.inBounds(cell) || (this.doc()?.playerStarts.length ?? 0) >= 12) {
      return;
    }
    const start: PlayerStart = {
      id: newId(),
      x: cell.x,
      y: cell.y,
      label: `PG ${(this.doc()?.playerStarts.length ?? 0) + 1}`,
    };
    this.execute(arrayInsert('start', [start]));
    this.selected.set({ type: 'start', id: start.id });
    this.tool.set('select');
  }

  public requestSpawn(cell: { x: number; y: number }): void {
    if (!this.inBounds(cell)) {
      return;
    }
    this.spawnCell.set(cell);
    this.spawnSearch.set('');
    this.spawnTab.set('srd');
  }

  public addSrdSpawn(monster: SrdMonster): void {
    const cell = this.spawnCell();
    if (cell === null) {
      return;
    }
    const spawn: MapSpawn = {
      id: newId(),
      kind: 'monster',
      x: cell.x,
      y: cell.y,
      source: { type: 'srd', monsterId: monster.id },
      label: monster.name,
      size: sizeCells(monster.size),
      hidden: false,
      quantity: 1,
    };
    this.execute(arrayInsert('spawn', [spawn]));
    this.spawnCell.set(null);
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  public addActorSpawn(actor: Actor): void {
    const cell = this.spawnCell();
    if (cell === null) {
      return;
    }
    const spawn: MapSpawn = {
      id: newId(),
      kind: actor.kind === 'pc' ? 'npc' : actor.kind,
      x: cell.x,
      y: cell.y,
      source: { type: 'actor', actorId: actor.id },
      label: actor.name,
      size: sizeCells(actor.statblock.size),
      hidden: false,
      quantity: 1,
    };
    this.execute(arrayInsert('spawn', [spawn]));
    this.spawnCell.set(null);
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  public moveElement(event: { selection: EditorSelection; cell: { x: number; y: number } }): void {
    if (!this.inBounds(event.cell)) {
      return;
    }
    const doc = this.doc();
    if (doc === null) {
      return;
    }
    const after = { x: event.cell.x, y: event.cell.y };
    if (event.selection.type === 'spawn') {
      const spawn = doc.spawns.find((entry) => entry.id === event.selection.id);
      if (spawn !== undefined) {
        this.execute(replaceFields('spawn', spawn.id, { x: spawn.x, y: spawn.y }, after));
      }
    } else if (event.selection.type === 'start') {
      const start = doc.playerStarts.find((entry) => entry.id === event.selection.id);
      if (start !== undefined) {
        this.execute(replaceFields('start', start.id, { x: start.x, y: start.y }, after));
      }
    } else if (event.selection.type === 'light') {
      const light = doc.terrain.lights.find((entry) => entry.id === event.selection.id);
      if (light !== undefined) {
        this.execute(replaceFields('light', light.id, { x: light.x, y: light.y }, after));
      }
    }
  }

  public updateWall(kind: WallKind, door?: WallSegment['door']): void {
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
    this.updateWall((event.target as HTMLSelectElement).value as WallKind);
  }

  public spawnSourceLabel(spawn: MapSpawn): string {
    return spawn.source.type === 'srd'
      ? `SRD · ${spawn.source.monsterId}`
      : 'Attore della campagna';
  }

  public updateDoor(event: Event): void {
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
    const nextVision = Math.min(doc.terrain.visionLimitFeet, maxSight);
    if (nextVision === doc.terrain.visionLimitFeet) {
      this.execute(gridCommand);
      return;
    }
    const visionCommand = replaceFields(
      'terrain',
      { visionLimitFeet: doc.terrain.visionLimitFeet },
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
    if (field === 'showDoorIcons') {
      const { before, after } = fieldPatch(doc, 'showDoorIcons', Boolean(value));
      this.execute(replaceFields('map', before, after));
      return;
    }
    const { before, after } = fieldPatch(doc.terrain, field, value);
    this.execute(replaceFields('terrain', before, after));
  }

  private applyVisionLimit(raw: number): void {
    const doc = this.doc();
    if (doc === null || !Number.isFinite(raw)) {
      return;
    }
    const value = Math.max(1, Math.min(this.maxSightFeet(), Math.round(raw)));
    this.execute(replaceFields(
      'terrain',
      { visionLimitFeet: doc.terrain.visionLimitFeet },
      { visionLimitFeet: value },
    ));
  }

  public removeSelected(): void {
    const selection = this.selected();
    const doc = this.doc();
    if (selection === null || doc === null) {
      return;
    }
    const command = this.removeCommand(doc, selection);
    if (command !== null) {
      this.execute(command);
    }
    this.selected.set(null);
  }

  private removeCommand(doc: MapDocument, selection: EditorSelection): MapCommand | null {
    if (selection.type === 'wall') {
      const index = doc.terrain.walls.findIndex((wall) => wall.id === selection.id);
      const wall = doc.terrain.walls[index];
      return wall === undefined ? null : arrayRemove('wall', wall, index);
    }
    if (selection.type === 'light') {
      const index = doc.terrain.lights.findIndex((light) => light.id === selection.id);
      const light = doc.terrain.lights[index];
      return light === undefined ? null : arrayRemove('light', light, index);
    }
    if (selection.type === 'spawn') {
      const index = doc.spawns.findIndex((spawn) => spawn.id === selection.id);
      const spawn = doc.spawns[index];
      return spawn === undefined ? null : arrayRemove('spawn', spawn, index);
    }
    const index = doc.playerStarts.findIndex((start) => start.id === selection.id);
    const start = doc.playerStarts[index];
    return start === undefined ? null : arrayRemove('start', start, index);
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
      this.backgroundAsset = {
        assetId: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      };
      this.execute(replaceBackground(
        {
          imageAssetId: doc.imageAssetId,
          backgroundTransform: doc.backgroundTransform,
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
    const doc = this.doc();
    if (doc === null || doc.imageAssetId === null) {
      return;
    }
    this.backgroundAsset = null;
    this.execute(replaceBackground(
      {
        imageAssetId: doc.imageAssetId,
        backgroundTransform: doc.backgroundTransform,
      },
      {
        imageAssetId: null,
        backgroundTransform: { ...defaultBackgroundTransform },
      },
    ));
    this.image.set({ url: '', width: doc.widthPx, height: doc.heightPx });
  }

  public async fitBackgroundCover(): Promise<void> {
    const doc = this.doc();
    if (doc === null || doc.imageAssetId === null) {
      return;
    }
    const assetId = doc.imageAssetId;
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
    if (current === null || current.imageAssetId !== assetId || size === null) {
      return;
    }
    const transform = coverTransform(current.widthPx, current.heightPx, size.width, size.height);
    if (
      current.backgroundTransform.x === transform.x
      && current.backgroundTransform.y === transform.y
      && current.backgroundTransform.scale === transform.scale
    ) {
      return;
    }
    this.execute(replaceBackground(
      {
        imageAssetId: current.imageAssetId,
        backgroundTransform: current.backgroundTransform,
      },
      {
        imageAssetId: current.imageAssetId,
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
      const updated = await this.mapsApi.save(this.mapId(), this.version(), doc);
      this.version.set(updated.version);
      this.dirty.set(false);
      this.error.set(null);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.saving.set(false);
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
  name: map.name,
  imageAssetId: map.imageAssetId,
  backgroundTransform: map.backgroundTransform,
  backgroundColor: map.backgroundColor,
  widthPx: map.widthPx,
  heightPx: map.heightPx,
  grid: map.grid,
  terrain: map.terrain,
  spawns: map.spawns,
  playerStarts: map.playerStarts,
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
