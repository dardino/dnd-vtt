import Konva from 'konva';
import { tokenCenterPx, type GridConfig, type TokenState } from '@dnd-vtt/shared';

/** Colori del tema usati dal disegno dei token. */
export interface TokenColors {
  readonly text: string;
  readonly surface: string;
  readonly accent: string;
  readonly danger: string;
  readonly ok: string;
}

/** Ritaglio del ritratto dentro il token, in coordinate normalizzate. */
export interface TokenPortraitRef {
  readonly url: string;
  readonly focusX: number;
  readonly focusY: number;
  readonly zoom: number;
}

export interface TokenRenderParams {
  readonly layer: Konva.Layer;
  readonly tokens: readonly TokenState[];
  readonly grid: GridConfig;
  readonly colors: TokenColors;
  readonly selectedTokenId: string | null;
  readonly stageScale: number;
  readonly draggable: boolean;
  readonly images: ReadonlyMap<string, HTMLImageElement>;
  readonly actorPortraits: Readonly<Record<string, TokenPortraitRef>>;
  readonly tokenPortraits: Readonly<Record<string, TokenPortraitRef>>;
}

/** Nodo creato per un token, restituito per collegare gli handler di input. */
export interface TokenNode {
  readonly token: TokenState;
  readonly group: Konva.Group;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Disegna i token sul layer Konva. Il componente conserva stage, input,
 * calcolo della visione e orchestrazione: qui arriva solo ciò che serve al
 * disegno (token, griglia, ritratti e stile). I nodi restituiti permettono al
 * componente di collegare selezione e trascinamento senza duplicare il render.
 */
export class TokenRenderer {
  public render(params: TokenRenderParams): readonly TokenNode[] {
    const { layer, tokens, selectedTokenId } = params;
    layer.destroyChildren();
    const nodes: TokenNode[] = [];
    for (const token of tokens) {
      if (!token.visible && selectedTokenId !== token.id) {
        continue;
      }
      const group = this.buildToken(token, params, selectedTokenId === token.id);
      layer.add(group);
      nodes.push({ token, group });
    }
    layer.draw();
    return nodes;
  }

  private buildToken(token: TokenState, params: TokenRenderParams, selected: boolean): Konva.Group {
    const { grid, colors, stageScale, draggable } = params;
    const center = tokenCenterPx(grid, token);
    const footprint = grid.cellSizePx * token.size;
    const cornerRadius = grid.type === 'hex' ? footprint / 2 : 6;
    const strokeWidth = (selected ? 2.5 : 1.25) / Math.max(stageScale, 0.2);
    const opacity = token.visible ? 1 : 0.45;
    const stroke = selected ? colors.accent : colors.text;
    const group = new Konva.Group({
      x: center.x,
      y: center.y,
      draggable,
    });

    const portrait = token.actorId === undefined
      ? params.tokenPortraits[token.id]
      : params.actorPortraits[token.actorId];
    const portraitImage = portrait === undefined ? undefined : params.images.get(portrait.url);
    if (portrait !== undefined && portraitImage !== undefined) {
      const clip = new Konva.Group({
        opacity,
        clipFunc: (context) => {
          context.beginPath();
          if (grid.type === 'hex') {
            context.arc(0, 0, footprint / 2, 0, Math.PI * 2, false);
          } else {
            context.roundRect(-footprint / 2, -footprint / 2, footprint, footprint, 6);
          }
          context.closePath();
        },
      });
      const naturalWidth = portraitImage.naturalWidth;
      const naturalHeight = portraitImage.naturalHeight;
      const baseScale = Math.max(footprint / naturalWidth, footprint / naturalHeight);
      const imageScale = baseScale * portrait.zoom;
      const imageWidth = naturalWidth * imageScale;
      const imageHeight = naturalHeight * imageScale;
      clip.add(new Konva.Image({
        image: portraitImage,
        x: -portrait.focusX * imageWidth,
        y: -portrait.focusY * imageHeight,
        width: imageWidth,
        height: imageHeight,
        listening: false,
      }));
      group.add(clip);
      group.add(new Konva.Rect({
        x: -footprint / 2,
        y: -footprint / 2,
        width: footprint,
        height: footprint,
        cornerRadius,
        fillEnabled: false,
        stroke,
        strokeWidth,
        opacity,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowBlur: 6,
      }));
    } else {
      group.add(new Konva.Rect({
        x: -footprint / 2,
        y: -footprint / 2,
        width: footprint,
        height: footprint,
        cornerRadius,
        fill: token.owner === 'players' ? colors.ok : colors.surface,
        stroke,
        strokeWidth,
        opacity,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowBlur: 6,
      }));
    }

    this.addHpBar(group, token, colors, footprint, stageScale);
    this.addLabel(group, token, colors, footprint, stageScale);
    return group;
  }

  private addHpBar(
    group: Konva.Group,
    token: TokenState,
    colors: TokenColors,
    footprint: number,
    stageScale: number,
  ): void {
    const barWidth = footprint * 0.8;
    const barHeight = Math.max(3, 5 / Math.max(stageScale, 0.2));
    const ratio = token.hp.max > 0 ? clamp(token.hp.current / token.hp.max, 0, 1) : 0;
    group.add(new Konva.Rect({
      x: -barWidth / 2,
      y: -footprint / 2 - barHeight - 2,
      width: barWidth,
      height: barHeight,
      fill: colors.danger,
      cornerRadius: barHeight / 2,
    }));
    group.add(new Konva.Rect({
      x: -barWidth / 2,
      y: -footprint / 2 - barHeight - 2,
      width: barWidth * ratio,
      height: barHeight,
      fill: colors.ok,
      cornerRadius: barHeight / 2,
    }));
  }

  private addLabel(
    group: Konva.Group,
    token: TokenState,
    colors: TokenColors,
    footprint: number,
    stageScale: number,
  ): void {
    const fontSize = Math.max(10, 12 / Math.max(stageScale, 0.15));
    const labelWidth = footprint * 4;
    const longestWord = Math.max(1, ...token.label.split(/\s+/).map((word) => word.length));
    const labelFontSize = Math.min(fontSize, labelWidth / (longestWord * 0.62));
    group.add(new Konva.Text({
      x: -footprint * 2,
      y: footprint / 2 + 2,
      width: labelWidth,
      align: 'center',
      text: token.label,
      fontSize: labelFontSize,
      fontFamily: 'system-ui, sans-serif',
      fill: colors.text,
      wrap: 'word',
      listening: false,
    }));
  }
}
