export default class CardModel {
  uuid;

  scryfallId;

  name;

  setCode;

  number;

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
    keywords,
    life,
    loyalty,
    key,
  }) {
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
