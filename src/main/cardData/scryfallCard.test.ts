// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { type ScryfallCard, toRelatedParts } from './scryfallCard';

const card = (parts: ScryfallCard['all_parts']): ScryfallCard => ({
  object: 'card',
  id: 'self',
  name: 'Queen Marchesa',
  lang: 'en',
  set: 'cn2',
  set_name: 'Conspiracy: Take the Crown',
  collector_number: '78',
  layout: 'normal',
  all_parts: parts,
});

describe('toRelatedParts', () => {
  it('keeps tokens, emblems and known designations, nothing else', () => {
    const parts = toRelatedParts(
      card([
        { id: 'self', component: 'combo_piece', name: 'Queen Marchesa' },
        { id: 'a', component: 'token', name: 'Assassin', type_line: 'Token' },
        {
          id: 'm',
          component: 'combo_piece',
          name: 'The Monarch',
          type_line: 'Card',
        },
        {
          id: 'e',
          component: 'combo_piece',
          name: 'Some Emblem',
          type_line: 'Emblem — Some',
        },
        {
          id: 'c',
          component: 'combo_piece',
          name: 'Innistrad Checklist',
          type_line: 'Card',
        },
        {
          id: 'r',
          component: 'combo_piece',
          name: 'Energy Reserve',
          type_line: 'Card',
        },
        {
          id: 'v',
          component: 'combo_piece',
          name: 'On an Adventure',
          type_line: 'Card',
        },
        {
          id: 'd',
          component: 'combo_piece',
          name: 'Day // Night',
          type_line: 'Card // Card',
        },
        {
          id: 'i',
          component: 'combo_piece',
          name: 'Undercity // The Initiative',
          type_line: 'Dungeon — Undercity // Card',
        },
        {
          id: 'g',
          component: 'combo_piece',
          name: 'The Ring // The Ring Tempts You',
          type_line: 'Emblem // Card',
        },
        {
          id: 'k',
          component: 'combo_piece',
          name: 'Other Card',
          type_line: 'Sorcery',
        },
        {
          id: 'b',
          component: 'meld_part',
          name: 'Bruna',
          type_line: 'Legendary Creature',
        },
        { id: 'a', component: 'token', name: 'Assassin', type_line: 'Token' },
      ])
    );
    expect(parts.map((p) => [p.part_id, p.component])).toEqual([
      ['a', 'token'],
      ['m', 'combo_piece'],
      ['e', 'combo_piece'],
      ['d', 'combo_piece'],
      ['i', 'combo_piece'],
      ['g', 'combo_piece'],
    ]);
    expect(parts[0]).toEqual({
      printing_id: 'self',
      part_id: 'a',
      component: 'token',
      name: 'Assassin',
      type_line: 'Token',
    });
  });

  it('has nothing for a card with no parts', () => {
    expect(toRelatedParts(card(undefined))).toEqual([]);
  });
});
