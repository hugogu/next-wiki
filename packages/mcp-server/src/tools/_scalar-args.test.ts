import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { booleanArg, numberArg } from './_scalar-args';

describe('numberArg', () => {
  const version = numberArg(z.number().int().min(1));

  it.each([
    [2, 2],
    ['2', 2],
    ['10', 10],
  ])('reads %j as %d', (input, expected) => {
    expect(version.parse(input)).toBe(expected);
  });

  it('reads a decimal string for a non-integer schema', () => {
    const threshold = numberArg(z.number().min(0).max(1));
    expect(threshold.parse('0.25')).toBe(0.25);
    expect(threshold.parse(0.25)).toBe(0.25);
  });

  it.each([
    ['empty string', ''],
    ['blank string', ' '],
    ['padded number', ' 2'],
    ['word', 'two'],
    ['trailing text', '2x'],
    ['hex', '0x10'],
    ['exponent', '1e3'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['fractional string for an integer schema', '1.5'],
    ['below the minimum', '0'],
    ['negative', '-1'],
    ['null', null],
    ['boolean', true],
    ['array', ['2']],
    ['object', { value: 2 }],
    ['missing', undefined],
  ])('keeps rejecting %s', (_label, input) => {
    expect(version.safeParse(input).success).toBe(false);
  });

  it('still enforces the range after converting', () => {
    const limit = numberArg(z.number().int().min(1).max(100));
    expect(limit.safeParse('100').success).toBe(true);
    expect(limit.safeParse('101').success).toBe(false);
  });

  it('keeps an optional argument optional', () => {
    const limit = numberArg(z.number().int().min(1)).optional();
    expect(limit.parse(undefined)).toBeUndefined();
    expect(limit.parse('5')).toBe(5);
    expect(limit.safeParse(null).success).toBe(false);
  });
});

describe('booleanArg', () => {
  const flag = booleanArg();

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ])('reads %j as %s', (input, expected) => {
    expect(flag.parse(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['yes', 'yes'],
    ['capitalised', 'True'],
    ['upper case', 'FALSE'],
    ['one', '1'],
    ['zero', '0'],
    ['number one', 1],
    ['number zero', 0],
    ['null', null],
    ['missing', undefined],
  ])('keeps rejecting %s', (_label, input) => {
    expect(flag.safeParse(input).success).toBe(false);
  });

  it('keeps an optional argument optional', () => {
    expect(booleanArg().optional().parse(undefined)).toBeUndefined();
  });
});
