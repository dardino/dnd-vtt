import { Injectable, inject } from '@angular/core';
import type { Map, MapDocument } from '@dnd-vtt/shared';
import { AssetService } from '../../core/services/asset.service';
import {
  mapDrawCommands,
  mapRenderSize,
  type MapDrawCommand,
  type MapRenderAssets,
  type MapRenderImage,
  type MapRenderVariant,
} from './map-image-renderer';

const COMPOSITE_MAX_SIDE = 4096;
const THUMBNAIL_MAX_SIDE = 640;
const WEBP_MIME = 'image/webp';

/** Riferimenti ai derivati prodotti dal render, `null` per le fasi fallite. */
export interface MapRenderOutcome {
  thumbAssetId: string | null;
  compositeAssetId: string | null;
  warnings: string[];
}

const imageSource = (imageId: string, assets: MapRenderAssets): MapRenderImage | null => {
  if (imageId === 'background') {
    return assets.background;
  }
  return assets.graphics.find((entry) => entry.item.id === imageId)?.image ?? null;
};

const drawCommand = (
  ctx: CanvasRenderingContext2D,
  command: MapDrawCommand,
  assets: MapRenderAssets,
  docWidth: number,
  docHeight: number,
): void => {
  switch (command.kind) {
    case 'background':
      ctx.fillStyle = command.color;
      ctx.fillRect(0, 0, docWidth, docHeight);
      return;
    case 'image': {
      const image = imageSource(command.imageId, assets);
      if (image === null) {
        return;
      }
      ctx.save();
      ctx.globalAlpha = command.opacity;
      ctx.translate(command.x, command.y);
      ctx.rotate((command.rotation * Math.PI) / 180);
      ctx.scale(command.scaleX, command.scaleY);
      ctx.translate(-command.offsetX, -command.offsetY);
      ctx.drawImage(image.source, 0, 0, command.width, command.height);
      ctx.restore();
      return;
    }
    case 'rect':
      ctx.fillStyle = command.fill;
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = command.strokeWidth;
      ctx.fillRect(command.x, command.y, command.width, command.height);
      ctx.strokeRect(command.x, command.y, command.width, command.height);
      return;
    case 'polygon': {
      const [firstX, firstY, ...rest] = command.points;
      if (firstX === undefined || firstY === undefined) {
        return;
      }
      ctx.save();
      ctx.globalAlpha = command.opacity;
      ctx.beginPath();
      ctx.moveTo(firstX, firstY);
      for (let index = 0; index < rest.length; index += 2) {
        const x = rest[index];
        const y = rest[index + 1];
        if (x !== undefined && y !== undefined) {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = command.fill;
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = command.strokeWidth;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'text':
      ctx.save();
      ctx.globalAlpha = command.opacity;
      ctx.font = command.font;
      ctx.textBaseline = 'top';
      ctx.fillStyle = command.color;
      ctx.fillText(command.text, command.x, command.y);
      ctx.restore();
      return;
    case 'line': {
      const [firstX, firstY, ...rest] = command.points;
      if (firstX === undefined || firstY === undefined) {
        return;
      }
      ctx.beginPath();
      ctx.moveTo(firstX, firstY);
      for (let index = 0; index < rest.length; index += 2) {
        const x = rest[index];
        const y = rest[index + 1];
        if (x !== undefined && y !== undefined) {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = command.strokeWidth;
      ctx.stroke();
      return;
    }
    case 'marker':
      ctx.beginPath();
      ctx.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
      ctx.fillStyle = command.fill;
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = command.strokeWidth;
      ctx.fill();
      ctx.stroke();
      return;
  }
};

const renderCanvas = async (
  doc: MapDocument,
  assets: MapRenderAssets,
  variant: MapRenderVariant,
  maxSide: number,
): Promise<Blob> => {
  const size = mapRenderSize(doc, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('contesto 2D non disponibile');
  }
  ctx.save();
  ctx.scale(size.scale, size.scale);
  for (const command of mapDrawCommands(doc, assets, { variant })) {
    drawCommand(ctx, command, assets, doc.widthPx, doc.heightPx);
  }
  ctx.restore();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('codifica WebP non disponibile'));
        return;
      }
      resolve(blob);
    }, WEBP_MIME);
  });
};

/**
 * Genera composito e thumbnail nel browser e li carica come asset. Ogni fase è
 * isolata: un errore produce un warning e `null`, mai un throw verso il chiamante.
 */
@Injectable({ providedIn: 'root' })
export class MapRenderService {
  private readonly assets = inject(AssetService);

  public async renderAndUpload(
    map: Map,
    doc: MapDocument,
    assets: MapRenderAssets,
  ): Promise<MapRenderOutcome> {
    const warnings: string[] = [];
    const thumbAssetId = await this.renderPhase(
      map,
      doc,
      assets,
      'thumbnail',
      THUMBNAIL_MAX_SIDE,
      'Thumbnail',
      warnings,
    );
    const compositeAssetId = await this.renderPhase(
      map,
      doc,
      assets,
      'composite',
      COMPOSITE_MAX_SIDE,
      'Composito',
      warnings,
    );
    return { thumbAssetId, compositeAssetId, warnings };
  }

  private async renderPhase(
    map: Map,
    doc: MapDocument,
    assets: MapRenderAssets,
    variant: MapRenderVariant,
    maxSide: number,
    label: string,
    warnings: string[],
  ): Promise<string | null> {
    try {
      const blob = await renderCanvas(doc, assets, variant, maxSide);
      const file = new File([blob], `${map.id}-${variant}.webp`, { type: WEBP_MIME });
      const asset = await this.assets.upload(file);
      return asset.id;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'errore sconosciuto';
      warnings.push(`${label} non generato: ${detail}`);
      return null;
    }
  }
}
