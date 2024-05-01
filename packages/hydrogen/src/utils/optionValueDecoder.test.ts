import {describe, expect, it} from 'vitest';
import { ProductOption, getOptionValueIndices, isOptionValuePresent } from './optionValueDecoder';
import type {PartialDeep} from 'type-fest';

const MOCK_PARENT_OPTIONS = [
  {
    values: ["red", "blue", "green"]
  },
  {
    values: ["small", "medium", "large"]
  },
  {
    values: ["cotton", "polyester", "wool"]
  }
] as PartialDeep<ProductOption>[] as ProductOption[];

describe('getOptionValueIndices', () => {
  it('returns an empty array when no option values are passed', () => {
    expect(getOptionValueIndices([], [])).toEqual([]);
  });

  it('returns an array of indices when option values match product option values', () => {
    expect(getOptionValueIndices(["red", "medium", "cotton"], MOCK_PARENT_OPTIONS)).toEqual([0,1,0]);
  });

  it('throws an error when an option value is not found in product options', () => {
    expect(() => getOptionValueIndices(["red", "fantastic", "cotton"], MOCK_PARENT_OPTIONS)).toThrowError(`Option value "fantastic" not found in product options`);
  });
});


describe('isOptionValuePresent', () => {
  it('returns true when option values are present in encoded option values', () => {
    const MOCK_ENCODED_OPTION_VALUES = "0:0:0,,1:1:1,,2:2:2,,";
    const MOCK_OPTION_VALUES = [
      MOCK_PARENT_OPTIONS[0].values[1],
      MOCK_PARENT_OPTIONS[1].values[1],
      MOCK_PARENT_OPTIONS[2].values[1],
    ];

    expect(isOptionValuePresent(MOCK_OPTION_VALUES, MOCK_ENCODED_OPTION_VALUES, MOCK_PARENT_OPTIONS)).toBe(true);
  });

  it('returns false when option values are not present in encoded option values', () => {
    const MOCK_ENCODED_OPTION_VALUES = "0:0:0,,1:1:1,,2:2:2,,";
    const MOCK_OPTION_VALUES = [
      MOCK_PARENT_OPTIONS[0].values[0],
      MOCK_PARENT_OPTIONS[1].values[0],
      MOCK_PARENT_OPTIONS[2].values[1],
    ];

    expect(isOptionValuePresent(MOCK_OPTION_VALUES, MOCK_ENCODED_OPTION_VALUES, MOCK_PARENT_OPTIONS)).toBe(false);
  });
});

describe('decodeOptionValues', () => {
  
});
