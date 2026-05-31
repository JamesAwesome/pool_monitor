import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChemAuth } from './useChemAuth';

describe('useChemAuth', () => {
  beforeEach(() => localStorage.clear());

  it('starts locked when nothing is persisted', () => {
    const { result } = renderHook(() => useChemAuth());
    expect(result.current.unlocked).toBe(false);
    expect(result.current.authHeader).toBeNull();
  });

  it('unlock() persists the base64 credential and exposes the header', () => {
    const { result } = renderHook(() => useChemAuth());
    act(() => result.current.unlock('alice', 's3cret'));
    expect(result.current.unlocked).toBe(true);
    const expected = `Basic ${btoa('alice:s3cret')}`;
    expect(result.current.authHeader).toBe(expected);
    expect(localStorage.getItem('pool-dashboard-chem-auth')).toBe(btoa('alice:s3cret'));
  });

  it('seeds unlocked from a persisted credential on mount', () => {
    localStorage.setItem('pool-dashboard-chem-auth', btoa('bob:pw'));
    const { result } = renderHook(() => useChemAuth());
    expect(result.current.unlocked).toBe(true);
    expect(result.current.authHeader).toBe(`Basic ${btoa('bob:pw')}`);
  });

  it('lock() clears the persisted credential', () => {
    localStorage.setItem('pool-dashboard-chem-auth', btoa('bob:pw'));
    const { result } = renderHook(() => useChemAuth());
    act(() => result.current.lock());
    expect(result.current.unlocked).toBe(false);
    expect(localStorage.getItem('pool-dashboard-chem-auth')).toBeNull();
  });
});
