import type React from 'react';
import {
  AllowedFontFamilyKey,
  AllowedFontWeight,
  AllowedTextAlign,
  ElementTypographyStyle,
  SectionTypographyElements,
  SectionTypographyMap,
  TypographyElementKey,
  TypographySectionId
} from '../types';

export interface TypographySectionMeta {
  id: TypographySectionId;
  label: string;
  surfaceBgHex: string;
  isDarkSurface?: boolean;
  defaultHeadingColor: string;
  defaultBodyColor: string;
  applicableElements: TypographyElementKey[];
}

export const TYPOGRAPHY_SECTIONS: TypographySectionMeta[] = [
  {
    id: 'welcome',
    label: 'Welcome',
    surfaceBgHex: '#FAF7F0',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption']
  },
  {
    id: 'story',
    label: 'Our Story',
    surfaceBgHex: '#F2EBDD',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'schedule',
    label: 'Schedule',
    surfaceBgHex: '#FAF7F0',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    surfaceBgHex: '#FFFDF8',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'gifting',
    label: 'Gifting',
    surfaceBgHex: '#063F33',
    isDarkSurface: true,
    defaultHeadingColor: '#FAF7F0',
    defaultBodyColor: '#FAF7F0',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'faq',
    label: 'Q&A',
    surfaceBgHex: '#F2EBDD',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'rsvp',
    label: 'RSVP',
    surfaceBgHex: '#FAF7F0',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'gallery',
    label: 'Gallery',
    surfaceBgHex: '#F2EBDD',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'subheading', 'body', 'label', 'caption', 'button']
  },
  {
    id: 'footer',
    label: 'Footer',
    surfaceBgHex: '#FAF7F0',
    defaultHeadingColor: '#07543E',
    defaultBodyColor: '#262820',
    applicableElements: ['heading', 'body', 'caption', 'button']
  }
];

export const TYPOGRAPHY_ELEMENT_META: Record<
  TypographyElementKey,
  {
    label: string;
    minSizePx: number;
    maxSizePx: number;
    defaultSizePx: number;
  }
> = {
  heading: { label: 'Main Section Heading', minSizePx: 22, maxSizePx: 68, defaultSizePx: 46 },
  subheading: { label: 'Subheadings', minSizePx: 16, maxSizePx: 40, defaultSizePx: 24 },
  body: { label: 'Body Paragraphs', minSizePx: 14, maxSizePx: 24, defaultSizePx: 17 },
  label: { label: 'Labels & Kickers', minSizePx: 10, maxSizePx: 18, defaultSizePx: 13 },
  caption: { label: 'Captions & Notes', minSizePx: 11, maxSizePx: 18, defaultSizePx: 14 },
  button: { label: 'Buttons & Links', minSizePx: 11, maxSizePx: 18, defaultSizePx: 13 }
};

export const ALLOWED_FONT_FAMILIES: Array<{
  key: AllowedFontFamilyKey;
  label: string;
  cssValue: string;
}> = [
  { key: 'default', label: 'Section Default', cssValue: '' },
  {
    key: 'cormorant',
    label: 'Cormorant Garamond (Luxury Serif)',
    cssValue: "'Cormorant Garamond', Georgia, Cambria, serif"
  },
  {
    key: 'playfair',
    label: 'Playfair Display (Editorial Serif)',
    cssValue: "'Playfair Display', Georgia, serif"
  },
  {
    key: 'lora',
    label: 'Lora (Classic Book Serif)',
    cssValue: "'Lora', Georgia, serif"
  },
  {
    key: 'jakarta',
    label: 'Plus Jakarta Sans (Modern Sans)',
    cssValue: "'Plus Jakarta Sans', system-ui, sans-serif"
  },
  {
    key: 'dm-sans',
    label: 'DM Sans (Clean Geometric)',
    cssValue: "'DM Sans', system-ui, sans-serif"
  },
  {
    key: 'pinyon',
    label: 'Pinyon Script (Calligraphy)',
    cssValue: "'Pinyon Script', cursive"
  }
];

const FONT_FAMILY_CSS_MAP: Record<AllowedFontFamilyKey, string> = ALLOWED_FONT_FAMILIES.reduce(
  (acc, item) => {
    acc[item.key] = item.cssValue;
    return acc;
  },
  {} as Record<AllowedFontFamilyKey, string>
);

const ALLOWED_SECTION_IDS = new Set<TypographySectionId>(
  TYPOGRAPHY_SECTIONS.map((s) => s.id)
);
const ALLOWED_ELEMENT_KEYS = new Set<TypographyElementKey>([
  'heading',
  'subheading',
  'body',
  'label',
  'caption',
  'button'
]);
const ALLOWED_WEIGHTS = new Set<AllowedFontWeight>(['400', '500', '600', '700']);
const ALLOWED_ALIGNS = new Set<AllowedTextAlign>(['default', 'left', 'center', 'right']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampNumber(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim());
}

export function sanitizeElementTypography(
  elementKey: TypographyElementKey,
  raw: unknown
): ElementTypographyStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const bounds = TYPOGRAPHY_ELEMENT_META[elementKey];
  const out: ElementTypographyStyle = {};

  if (
    typeof input.fontFamily === 'string' &&
    input.fontFamily !== 'default' &&
    input.fontFamily in FONT_FAMILY_CSS_MAP
  ) {
    out.fontFamily = input.fontFamily as AllowedFontFamilyKey;
  }

  if (typeof input.fontSizePx === 'number' && Number.isFinite(input.fontSizePx)) {
    out.fontSizePx = Math.round(clampNumber(input.fontSizePx, bounds.minSizePx, bounds.maxSizePx));
  }

  if (typeof input.fontWeight === 'string' && ALLOWED_WEIGHTS.has(input.fontWeight as AllowedFontWeight)) {
    out.fontWeight = input.fontWeight as AllowedFontWeight;
  }

  if (typeof input.bold === 'boolean') {
    out.bold = input.bold;
  }

  if (typeof input.italic === 'boolean') {
    out.italic = input.italic;
  }

  if (
    typeof input.textAlign === 'string' &&
    input.textAlign !== 'default' &&
    ALLOWED_ALIGNS.has(input.textAlign as AllowedTextAlign)
  ) {
    out.textAlign = input.textAlign as AllowedTextAlign;
  }

  if (typeof input.lineHeight === 'number' && Number.isFinite(input.lineHeight)) {
    out.lineHeight = Math.round(clampNumber(input.lineHeight, 1.05, 2.3) * 100) / 100;
  }

  if (typeof input.letterSpacingEm === 'number' && Number.isFinite(input.letterSpacingEm)) {
    out.letterSpacingEm = Math.round(clampNumber(input.letterSpacingEm, -0.04, 0.32) * 100) / 100;
  }

  if (isValidHexColor(input.color)) {
    out.color = input.color.trim().toUpperCase();
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeSectionTypographyMap(raw: unknown): SectionTypographyMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: SectionTypographyMap = {};

  for (const [secKey, secValue] of Object.entries(input)) {
    if (!ALLOWED_SECTION_IDS.has(secKey as TypographySectionId)) continue;
    if (!secValue || typeof secValue !== 'object' || Array.isArray(secValue)) continue;
    const cleanSection: SectionTypographyElements = {};

    for (const [elKey, elValue] of Object.entries(secValue as Record<string, unknown>)) {
      if (!ALLOWED_ELEMENT_KEYS.has(elKey as TypographyElementKey)) continue;
      const sanitizedEl = sanitizeElementTypography(elKey as TypographyElementKey, elValue);
      if (sanitizedEl) {
        cleanSection[elKey as TypographyElementKey] = sanitizedEl;
      }
    }

    if (Object.keys(cleanSection).length > 0) {
      result[secKey as TypographySectionId] = cleanSection;
    }
  }

  return result;
}

export function getSectionTypographyProps(
  sectionId: TypographySectionId,
  sectionConfig?: SectionTypographyElements
): Record<string, unknown> & { style?: React.CSSProperties } {
  const attrs: Record<string, unknown> = {
    'data-typo-section': sectionId
  };

  if (!sectionConfig) return attrs;

  const cssVars: Record<string, string> = {};

  (['heading', 'subheading', 'body', 'label', 'caption', 'button'] as TypographyElementKey[]).forEach(
    (elKey) => {
      const clean = sanitizeElementTypography(elKey, sectionConfig[elKey]);
      if (!clean) return;

      if (clean.fontFamily && clean.fontFamily !== 'default') {
        const cssFont = FONT_FAMILY_CSS_MAP[clean.fontFamily];
        if (cssFont) {
          cssVars[`--t-${elKey}-font`] = cssFont;
          attrs[`data-t-${elKey}-font`] = '1';
        }
      }

      if (typeof clean.fontSizePx === 'number') {
        // Keep large desktop sizes safely responsive on small phones
        const responsiveValue =
          clean.fontSizePx > 26
            ? `clamp(${Math.max(20, Math.round(clean.fontSizePx * 0.72))}px, 5vw, ${clean.fontSizePx}px)`
            : `${clean.fontSizePx}px`;
        cssVars[`--t-${elKey}-size`] = responsiveValue;
        attrs[`data-t-${elKey}-size`] = '1';
      }

      const resolvedWeight =
        clean.bold === true
          ? '700'
          : clean.fontWeight
          ? clean.fontWeight
          : clean.bold === false
          ? '400'
          : undefined;
      if (resolvedWeight) {
        cssVars[`--t-${elKey}-weight`] = resolvedWeight;
        attrs[`data-t-${elKey}-weight`] = '1';
      }

      if (typeof clean.italic === 'boolean') {
        cssVars[`--t-${elKey}-style`] = clean.italic ? 'italic' : 'normal';
        attrs[`data-t-${elKey}-style`] = '1';
      }

      if (clean.textAlign && clean.textAlign !== 'default') {
        cssVars[`--t-${elKey}-align`] = clean.textAlign;
        attrs[`data-t-${elKey}-align`] = '1';
      }

      if (typeof clean.lineHeight === 'number') {
        cssVars[`--t-${elKey}-lh`] = String(clean.lineHeight);
        attrs[`data-t-${elKey}-lh`] = '1';
      }

      if (typeof clean.letterSpacingEm === 'number') {
        cssVars[`--t-${elKey}-ls`] = `${clean.letterSpacingEm}em`;
        attrs[`data-t-${elKey}-ls`] = '1';
      }

      if (clean.color && isValidHexColor(clean.color)) {
        cssVars[`--t-${elKey}-color`] = clean.color;
        attrs[`data-t-${elKey}-color`] = '1';
      }
    }
  );

  if (Object.keys(cssVars).length > 0) {
    attrs.style = cssVars as React.CSSProperties;
  }

  return attrs;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeContrastRatio(fgHex: string, bgHex: string): number {
  if (!isValidHexColor(fgHex) || !isValidHexColor(bgHex)) return 7;
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function getPreviewInlineStyle(
  elementKey: TypographyElementKey,
  style?: ElementTypographyStyle
): React.CSSProperties {
  const clean = sanitizeElementTypography(elementKey, style);
  if (!clean) return {};
  const css: React.CSSProperties = {};
  if (clean.fontFamily && clean.fontFamily !== 'default') {
    css.fontFamily = FONT_FAMILY_CSS_MAP[clean.fontFamily];
  }
  if (typeof clean.fontSizePx === 'number') {
    css.fontSize = `${clean.fontSizePx}px`;
  }
  if (clean.bold === true) {
    css.fontWeight = 700;
  } else if (clean.fontWeight) {
    css.fontWeight = Number(clean.fontWeight);
  } else if (clean.bold === false) {
    css.fontWeight = 400;
  }
  if (typeof clean.italic === 'boolean') {
    css.fontStyle = clean.italic ? 'italic' : 'normal';
  }
  if (clean.textAlign && clean.textAlign !== 'default') {
    css.textAlign = clean.textAlign;
  }
  if (typeof clean.lineHeight === 'number') {
    css.lineHeight = clean.lineHeight;
  }
  if (typeof clean.letterSpacingEm === 'number') {
    css.letterSpacing = `${clean.letterSpacingEm}em`;
  }
  if (clean.color) {
    css.color = clean.color;
  }
  return css;
}
