export interface CardModelProps {
  id: string;
  scryfallId?: string;
  name: string;
  setCode?: string;
  number?: string;
  power?: string | null;
  toughness?: string | null;
  type?: string;
  types?: string;
  keywords?: string[];
  life?: string | null;
  loyalty?: string | null;
  key: number | string;
}

export default class CardModel {
  id: string;

  scryfallId?: string;

  name: string;

  setCode?: string;

  number?: string;

  power?: string | null;

  toughness?: string | null;

  type?: string;

  types?: string;

  keywords: string[];

  life?: string | null;

  loyalty?: string | null;

  key: number | string;

  constructor({
    name,
    id,
    scryfallId,
    setCode,
    number,
    power,
    toughness,
    type,
    types,
    keywords = [],
    life,
    loyalty,
    key,
  }: CardModelProps) {
    this.id = id;
    this.scryfallId = scryfallId;
    this.name = name;
    this.setCode = setCode;
    this.number = number;
    this.power = power;
    this.toughness = toughness;
    this.type = type;
    this.types = types;
    this.keywords = keywords;
    this.life = life;
    this.loyalty = loyalty;
    this.key = key;
  }
}
