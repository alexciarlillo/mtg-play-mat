const Abilities = {
  // evergreen
  Deathtouch: 'deathtouch',
  Defender: 'defender',
  DoubleStrike: 'double strike',
  FirstStrike: 'first strike',
  Flying: 'flying',
  Haste: 'haste',
  Hexproof: 'hexproof',
  Indestructible: 'indestructible',
  Intimidate: 'intimidate',
  Landwalk: 'landwalk',
  Lifelink: 'lifelink',
  Protection: 'protection',
  Reach: 'reach',
  Shroud: 'shroud',
  Trample: 'trample',
  Vigilance: 'vigilance',
  // other
  Shadow: 'shadow',
  Banding: 'banding',
};

export const AbilityKeywordMap = Object.entries(Abilities).reduce(
  (acc, [key, val]) => {
    acc[val] = key;
    return acc;
  },
  {}
);

export default Abilities;
