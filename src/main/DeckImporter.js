export default class DeckImporter {
  constructor(database) {
    this.database = database;
  }

  import = (items) => {
    return items
      .map((item) => {
        const { count, name, setCode, number } = DeckImporter.ParseItem(item);
        return { count, name, setCode, number };
      })
      .map(({ count, name, setCode, number }) => {
        let query =
          'SELECT name, uuid, scryfallId, setCode, number FROM cards WHERE name = ? COLLATE NOCASE AND setCode = ? COLLATE NOCASE';
        if (number) {
          query = `${query} AND number = ?`;
        }

        const stmt = this.database.prepare(query);

        const result = stmt.get([name, setCode, number].filter(Boolean));
        return Array(Number(count)).fill(result);
      })
      .flat()
      .filter(Boolean);
  };

  static ParseItem(item) {
    const setCodeRegex = /(\(|\[)([a-zA-Z0-9]+)(\)|\])/;

    const fields = item.split(' ');
    const count = Number(fields[0]);
    let number = null;
    let setCode;
    let nameArray = [];

    let fieldIndex = 1;
    for (; fieldIndex < fields.length; fieldIndex++) {
      const found = fields[fieldIndex].match(setCodeRegex);
      if (found) {
        setCode = found[2];
        break;
      } else {
        nameArray.push(fields[fieldIndex]);
      }
    }

    const name = nameArray.join(' ');

    if (fieldIndex < fields.length) {
      const numberField = fieldIndex + 1;
      if (!Number.isNaN(fields[numberField])) {
        number = fields[numberField];
      }
    }

    return { count, name, setCode, number };
  }
}
