export interface SearchCardsByNameOptions {
  keyword?: string;
  setCode?: string;
}

export interface SearchCardsByNameRet {
  // Scryfall id of the printing.
  id: string;
  name: string;
  typeLine: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  keyruneCode: string;
}

export interface CurrentSetListReturn {
  code: string;
  name: string;
  setType: string | null;
  releasedAt: string | null;
  keyruneCode: string;
  printingCount: number;
}

export interface PrintingFace {
  name: string;
  typeLine: string;
  manaCost?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  // Scryfall "normal" image URI; other sizes share its path.
  image?: string;
}

// One Scryfall printing, as stored in the card database.
export interface Printing {
  id: string;
  oracleId: string | null;
  name: string;
  lang: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
  layout: string;
  typeLine: string | null;
  manaCost: string | null;
  cmc: number | null;
  colors: string[];
  colorIdentity: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  keywords: string[];
  oracleText: string | null;
  rarity: string | null;
  digital: boolean;
  faces: PrintingFace[];
}
