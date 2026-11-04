import { describe, expect, it } from 'vitest';
import { emptyMapDocumentV2 } from './map-document.js';
import { mapDocumentSchema, putMapSchema } from './map.js';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';

const document = () => emptyMapDocumentV2('Mappa', null, 1280, 720);

describe('putMapSchema e asset derivati', () => {
  it('accetta thumb e composite valorizzati', () => {
    expect(putMapSchema.safeParse({
      version: 1,
      document: document(),
      thumbAssetId: ASSET_ID,
      compositeAssetId: ASSET_ID,
    }).success).toBe(true);
  });

  it('accetta thumb e composite a null per azzerarli', () => {
    expect(putMapSchema.safeParse({
      version: 1,
      document: document(),
      thumbAssetId: null,
      compositeAssetId: null,
    }).success).toBe(true);
  });

  it('accetta un PUT senza campi derivati', () => {
    expect(putMapSchema.safeParse({ version: 1, document: document() }).success).toBe(true);
  });

  it.each(['thumbAssetId', 'compositeAssetId'] as const)(
    'rifiuta un %s che non è un uuid',
    (field) => {
      expect(putMapSchema.safeParse({
        version: 1,
        document: document(),
        [field]: 'non-un-uuid',
      }).success).toBe(false);
    },
  );
});

describe('mapDocumentSchema e campi derivati', () => {
  it.each(['thumbAssetId', 'compositeAssetId'] as const)(
    'rifiuta %s dentro il documento',
    (field) => {
      expect(mapDocumentSchema.safeParse({
        ...document(),
        [field]: ASSET_ID,
      }).success).toBe(false);
    },
  );
});
