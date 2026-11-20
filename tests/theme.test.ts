import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, DEFAULT_STEPS, PRESETS, resolveHome, resolveMarketing, resolveTheme, slotOf } from '../src/shared/theme';
import { validateSettings } from '../src/shared/validate';
import type { Settings } from '../src/shared/types';

const base = JSON.parse(readFileSync('public/data/settings.json', 'utf8')) as Settings;

describe('theme defaults and resolvers', () => {
  it('old settings (no appearance blocks) still validate and resolve to defaults', () => {
    expect(validateSettings(base)).toEqual([]);
    expect(resolveTheme(base).glass.enabled).toBe(true);
    expect(resolveTheme(base).bg.mode).toBe('gradient');
    expect(resolveHome(base).steps).toEqual(DEFAULT_STEPS);
    expect(resolveMarketing(base).stickyCta).toBe(true);
    expect(resolveMarketing(base).freeShipping.enabled).toBe(false);
  });
  it('partial theme overrides merge over defaults', () => {
    const t = resolveTheme({ theme: { radius: 24, glass: { blur: 8 }, colors: { primary: '#FF0000' } } });
    expect(t.radius).toBe(24);
    expect(t.glass.blur).toBe(8);
    expect(t.glass.opacity).toBe(0.66);
    expect(t.colors.primary).toBe('#FF0000');
    expect(t.colors.accentInk).toBe('#1F5D73');
  });
  it('keeps the saved section order and appends missing sections', () => {
    const ids = resolveHome({ home: { sections: [{ id: 'faq', show: true }, { id: 'hero', show: false }] } }).sections;
    expect(ids[0]!.id).toBe('faq');
    expect(ids[1]!.show).toBe(false);
    expect(ids.length).toBeGreaterThan(10);
    expect(resolveHome({ home: { sections: [{ id: 'hero', show: true }, { id: 'hero', show: false }] } }).sections.filter((x) => x.id === 'hero')).toHaveLength(1);
  });
  it('image slots default: hero/categories/banners on, covers off', () => {
    expect(slotOf(base, 'hero').show).toBe(true);
    expect(slotOf(base, 'shop').show).toBe(false);
    expect(slotOf({ images: { shop: { show: true, image: 'https://x.com/a.jpg' } } }, 'shop').image).toBe('https://x.com/a.jpg');
  });
  it('every preset has readable button and body text', () => {
    PRESETS.forEach((p) => {
      expect(contrast(p.colors.accentInk, '#FFFFFF') >= 4.5).toBe(true);
      expect(contrast(p.colors.text, p.colors.bg) >= 4.5).toBe(true);
    });
  });
});

describe('appearance validation', () => {
  const ok = { ...base, theme: { glass: { enabled: true, blur: 12, opacity: 0.7 } }, home: { promo: { enabled: true, title: 'a', text: '', endsAt: '2030-01-01T00:00:00Z', link: '#/shop' } }, marketing: { freeShipping: { enabled: true, threshold: 500000 } } };
  it('accepts valid blocks', () => expect(validateSettings(ok)).toEqual([]));
  it('rejects out-of-range, unsafe or malformed values', () => {
    expect(validateSettings({ ...base, theme: { glass: { blur: 99 } } }).length).toBe(1);
    expect(validateSettings({ ...base, theme: { colors: { primary: 'red' } } }).length).toBe(1);
    expect(validateSettings({ ...base, images: { nope: { show: true, image: '' } } }).length).toBe(1);
    expect(validateSettings({ ...base, images: { hero: { show: true, image: 'javascript:x' } } }).length).toBe(1);
    expect(validateSettings({ ...base, home: { promo: { enabled: true, title: '', text: '', endsAt: '', link: 'javascript:x' } } }).length).toBe(1);
    expect(validateSettings({ ...base, marketing: { freeShipping: { enabled: true, threshold: -1 } } }).length).toBe(1);
  });
});
