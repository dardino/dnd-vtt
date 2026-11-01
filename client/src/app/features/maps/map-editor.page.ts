import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  type OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  newId,
  sizeCells,
  type Actor,
  type AmbientLight,
  type GridConfig,
  type Light,
  type Map,
  type MapDocument,
  type MapSpawn,
  type PlayerStart,
  type SrdMonster,
  type Terrain,
  type WallKind,
  type WallSegment,
} from '@dnd-vtt/shared';
import { httpMessage } from '../../core/http-error';
import { ActorService } from '../../core/actor.service';
import { AssetService } from '../../core/asset.service';
import { MapService } from '../../core/map.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import {
  MapEditorCanvasComponent,
  type EditorMapImage,
  type EditorSelection,
  type EditorTool,
  type WallsDrawnEvent,
} from './map-editor-canvas.component';

const TOOL_LABELS: Array<{ tool: EditorTool; label: string; hint: string }> = [
  { tool: 'select', label: 'Seleziona', hint: 'Seleziona e sposta elementi' },
  { tool: 'wall', label: 'Muro', hint: 'Disegna muri sui lati della griglia' },
  { tool: 'freehand', label: 'Tratto', hint: 'Traccia libero, rasterizzato a edge' },
  { tool: 'door', label: 'Porta', hint: 'Trasforma un lato in porta' },
  { tool: 'window', label: 'Finestra', hint: 'Blocca il movimento, non la vista' },
  { tool: 'lowWall', label: 'Muro basso', hint: 'Si vede sopra, blocca il movimento' },
  { tool: 'eraser', label: 'Gomma', hint: 'Rimuove un lato' },
  { tool: 'light', label: 'Luce', hint: 'Aggiunge una luce statica' },
  { tool: 'spawn', label: 'Mostro', hint: 'Aggiunge uno spawn SRD o attore' },
  { tool: 'start', label: 'Partenza', hint: 'Aggiunge un punto di partenza PG' },
];

@Component({
  selector: 'app-map-editor-page',
  imports: [Button, Dialog, RouterLink, MapEditorCanvasComponent],
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
  public readonly version = signal(1);
  public readonly dirty = signal(false);
  public readonly leaveConfirm = signal(false);
  public readonly image = signal<EditorMapImage | null>(null);
  public readonly tool = signal<EditorTool>('select');
  public readonly selected = signal<EditorSelection | null>(null);
  public readonly showGrid = signal(true);

  public readonly spawnCell = signal<{ x: number; y: number } | null>(null);
  public readonly spawnSearch = signal('');
  public readonly spawnTab = signal<'srd' | 'actors'>('srd');
  public readonly actors = signal<Actor[]>([]);

  private history: MapDocument[] = [];
  private redoStack: MapDocument[] = [];
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
    return this.actors()
      .filter((actor) => actor.kind !== 'pc')
      .filter((actor) => query === '' || actor.name.toLowerCase().includes(query))
      .slice(0, 80);
  });

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
      await Promise.all([this.catalogService.load(), this.loadActors(map.campaignId)]);
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
    this.actors.set([]);
  }

  private async loadImage(map: Map): Promise<void> {
    if (map.imageAssetId === null) {
      this.image.set(null);
      return;
    }
    try {
      const asset = await this.assets.get(map.imageAssetId);
      this.image.set({ url: asset.url, width: map.widthPx, height: map.heightPx });
    } catch {
      this.image.set(null);
    }
  }

  private async loadActors(campaignId: string): Promise<void> {
    try {
      this.actors.set(await this.actorsApi.listByCampaign(campaignId));
    } catch {
      this.actors.set([]);
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
    this.updateDoc((doc) => {
      const cols = Math.ceil((doc.widthPx - doc.grid.offsetX) / doc.grid.cellSizePx);
      const rows = Math.ceil((doc.heightPx - doc.grid.offsetY) / doc.grid.cellSizePx);
      for (const wall of event.walls) {
        const inBounds = wall.a.x >= 0 && wall.a.x <= cols && wall.a.y >= 0 && wall.a.y <= rows
          && wall.b.x >= 0 && wall.b.x <= cols && wall.b.y >= 0 && wall.b.y <= rows;
        if (!inBounds) {
          continue;
        }
        doc.terrain.walls.push({
          ...wall,
          id: wall.id || newId(),
          ...(wall.kind === 'door' ? { door: wall.door ?? 'closed' } : {}),
        });
      }
    });
  }

  public onWallRemoved(id: string): void {
    this.updateDoc((doc) => {
      doc.terrain.walls = doc.terrain.walls.filter((wall) => wall.id !== id);
    });
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
    this.updateDoc((doc) => {
      doc.terrain.lights.push(light);
    });
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
    this.updateDoc((doc) => {
      doc.playerStarts.push(start);
    });
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
    this.updateDoc((doc) => {
      doc.spawns.push(spawn);
    });
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
    this.updateDoc((doc) => {
      doc.spawns.push(spawn);
    });
    this.spawnCell.set(null);
    this.selected.set({ type: 'spawn', id: spawn.id });
    this.tool.set('select');
  }

  public moveElement(event: { selection: EditorSelection; cell: { x: number; y: number } }): void {
    if (!this.inBounds(event.cell)) {
      return;
    }
    this.updateDoc((doc) => {
      if (event.selection.type === 'spawn') {
        const spawn = doc.spawns.find((entry) => entry.id === event.selection.id);
        if (spawn !== undefined) {
          spawn.x = event.cell.x;
          spawn.y = event.cell.y;
        }
      } else if (event.selection.type === 'start') {
        const start = doc.playerStarts.find((entry) => entry.id === event.selection.id);
        if (start !== undefined) {
          start.x = event.cell.x;
          start.y = event.cell.y;
        }
      } else if (event.selection.type === 'light') {
        const light = doc.terrain.lights.find((entry) => entry.id === event.selection.id);
        if (light !== undefined) {
          light.x = event.cell.x;
          light.y = event.cell.y;
        }
      }
    });
  }

  public updateWall(kind: WallKind, door?: WallSegment['door']): void {
    const wall = this.selectedWall();
    if (wall === null) {
      return;
    }
    this.updateDoc((doc) => {
      const target = doc.terrain.walls.find((entry) => entry.id === wall.id);
      if (target === undefined) {
        return;
      }
      target.kind = kind;
      if (kind === 'door') {
        target.door = door ?? target.door ?? 'closed';
      } else {
        delete target.door;
      }
    });
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
    const value = (event.target as HTMLSelectElement).value as WallSegment['door'];
    this.updateDoc((doc) => {
      const target = doc.terrain.walls.find((entry) => entry.id === this.selectedWall()?.id);
      if (target !== undefined) {
        target.door = value;
      }
    });
  }

  public updateLightField(field: keyof Light, event: Event): void {
    const light = this.selectedLight();
    if (light === null) {
      return;
    }
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    this.updateDoc((doc) => {
      const entry = doc.terrain.lights.find((item) => item.id === light.id);
      if (entry !== undefined) {
        Object.assign(entry, { [field]: value });
      }
    });
  }

  public updateSpawnField(field: keyof MapSpawn, event: Event): void {
    const spawn = this.selectedSpawn();
    if (spawn === null) {
      return;
    }
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    this.updateDoc((doc) => {
      const entry = doc.spawns.find((item) => item.id === spawn.id);
      if (entry !== undefined) {
        Object.assign(entry, { [field]: value });
      }
    });
  }

  public updateStartLabel(event: Event): void {
    const start = this.selectedStart();
    if (start === null) {
      return;
    }
    const label = (event.target as HTMLInputElement).value;
    this.updateDoc((doc) => {
      const entry = doc.playerStarts.find((item) => item.id === start.id);
      if (entry !== undefined) {
        entry.label = label;
      }
    });
  }

  public updateMapField(field: 'name' | 'fogBase' | 'notes', event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    this.updateDoc((doc) => {
      Object.assign(doc, { [field]: target.value });
    });
  }

  public updateGridField(field: keyof GridConfig, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    this.updateDoc((doc) => {
      Object.assign(doc.grid, { [field]: value });
      const maxSight = Math.max(
        1,
        Math.round((Math.max(doc.widthPx, doc.heightPx) / doc.grid.cellSizePx) * doc.grid.feetPerCell),
      );
      doc.terrain.visionLimitFeet = Math.min(doc.terrain.visionLimitFeet, maxSight);
    });
  }

  public updateTerrainField(field: keyof Terrain | 'showDoorIcons', event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.fieldValue(target);
    this.updateDoc((doc) => {
      if (field === 'showDoorIcons') {
        doc.showDoorIcons = Boolean(value);
        return;
      }
      Object.assign(doc.terrain, { [field]: value });
    });
  }

  public updateVisionLimit(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Math.max(1, Math.min(this.maxSightFeet(), Math.round(raw)));
    this.updateDoc((doc) => {
      doc.terrain.visionLimitFeet = value;
    });
  }

  public setAmbient(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AmbientLight;
    this.updateDoc((doc) => {
      doc.terrain.ambientLight = value;
    });
  }

  public removeSelected(): void {
    const selection = this.selected();
    if (selection === null) {
      return;
    }
    this.updateDoc((doc) => {
      if (selection.type === 'wall') {
        doc.terrain.walls = doc.terrain.walls.filter((wall) => wall.id !== selection.id);
      } else if (selection.type === 'light') {
        doc.terrain.lights = doc.terrain.lights.filter((light) => light.id !== selection.id);
      } else if (selection.type === 'spawn') {
        doc.spawns = doc.spawns.filter((spawn) => spawn.id !== selection.id);
      } else {
        doc.playerStarts = doc.playerStarts.filter((start) => start.id !== selection.id);
      }
    });
    this.selected.set(null);
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
    if (view === undefined) {
      return;
    }
    this.updateDoc((doc) => {
      doc.startView = view;
    });
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
      this.image.set({ url: asset.url, width: asset.width, height: asset.height });
      this.updateDoc((doc) => {
        doc.imageAssetId = asset.id;
        doc.widthPx = asset.width;
        doc.heightPx = asset.height;
        const maxSight = Math.max(
          1,
          Math.round(
            (Math.max(asset.width, asset.height) / doc.grid.cellSizePx)
            * doc.grid.feetPerCell,
          ),
        );
        doc.terrain.visionLimitFeet = Math.min(doc.terrain.visionLimitFeet, maxSight);
      });
    } catch (error) {
      this.error.set(messageFor(error));
    }
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
    const previous = this.history.pop();
    if (doc === null || previous === undefined) {
      return;
    }
    this.redoStack.push(doc);
    this.doc.set(previous);
    this.dirty.set(true);
  }

  public redo(): void {
    const doc = this.doc();
    const next = this.redoStack.pop();
    if (doc === null || next === undefined) {
      return;
    }
    this.history.push(doc);
    this.doc.set(next);
    this.dirty.set(true);
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

  private updateDoc(mutator: (doc: MapDocument) => void): void {
    const current = this.doc();
    if (current === null) {
      return;
    }
    const next = structuredClone(current);
    mutator(next);
    this.history.push(current);
    if (this.history.length > 50) {
      this.history.shift();
    }
    this.redoStack = [];
    this.doc.set(next);
    this.dirty.set(true);
  }
}

const toDocument = (map: Map): MapDocument => ({
  name: map.name,
  imageAssetId: map.imageAssetId,
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
