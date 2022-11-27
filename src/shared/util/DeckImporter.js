import fs from 'fs';

export default class DeckImporter {
  constructor({ cardDb }) {
    this.cardDb = cardDb;
  }

  importFromFile = ({ filePath }) => {
    const contents = fs.readFileSync(filePath).toString();
    return this.importFromString({ string: contents });
  };

  importFromString = ({ string }) => {
    const lines = string.split('\n');

    return lines
      .map((line) => {
        const { count, name, setCode, number } = DeckImporter.ParseLine(line);
        return { count, name, setCode, number };
      })
      .map(({ count, name, setCode, number }) => {
        const result = this.cardDb.getCard({ name, setCode, number });
        return Array(Number(count)).fill(result);
      })
      .flat()
      .filter(Boolean);
  };

  static ParseLine(line) {
    const setCodeRegex = /(\(|\[)([a-zA-Z0-9]+)(\)|\])/;

    const fields = line.split(' ');
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
