export default class CardModel {
  uuid;

  scryfallId;

  name;

  set;

  number;

  constructor({ uuid, scryfallId, name, set, number }) {
    this.uuid = uuid;
    this.scryfallId = scryfallId;
    this.name = name;
    this.set = set;
    this.number = number;
  }
}
