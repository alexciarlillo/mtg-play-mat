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
