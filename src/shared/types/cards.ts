export interface SearchCardsByNameOptions {
  keyword?: string;
  setCode?: string;
}

export interface SearchCardsByNameRet {
  id: number;
  name: string;
  uuid: string;
  originalText: string;
  scryfallId: string;
  keyruneCode: string;
}

export interface CurrentSetListReturn {
  name: string;
  releaseDate: string;
  code: string;
  keyruneCode: string;
}

export interface CardRow {
  name: string;
  uuid: string;
  scryfallId: string;
  setCode: string;
  number: string;
  power: string | null;
  toughness: string | null;
  type: string;
  types: string;
  keywords: string | null;
  life: string | null;
  loyalty: string | null;
}

export interface DeckRow {
  id: number;
  name: string;
  display_card_id: string | null;
  displayScryfallId?: string;
}
