import React, { useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bold,
  Check,
  Italic,
  Loader2,
  RotateCcw,
  Type
} from 'lucide-react';
import {
  AllowedFontFamilyKey,
  AllowedFontWeight,
  AllowedTextAlign,
  ElementTypographyStyle,
  SiteContentData,
  TypographyElementKey,
  TypographySectionId
} from '../../types';
import {
  ALLOWED_FONT_FAMILIES,
  TYPOGRAPHY_ELEMENT_META,
  TYPOGRAPHY_SECTIONS,
  computeContrastRatio,
  getPreviewInlineStyle,
  isValidHexColor
} from '../../utils/typography';

interface AdminTypographyPanelProps {
  draftContent: SiteContentData;
  setDraftContent: React.Dispatch<React.SetStateAction<SiteContentData>>;
  savingContent: boolean;
  onSave: (next: SiteContentData) => Promise<void>;
}

const LUXURY_SWATCHES = [
  { label: 'Emerald', hex: '#07543E' },
  { label: 'Deep Forest', hex: '#073B2B' },
  { label: 'Charcoal', hex: '#262820' },
  { label: 'Olive', hex: '#737746' },
  { label: 'Gold', hex: '#C5A04A' },
  { label: 'Soft Gold', hex: '#F3E5AB' },
  { label: 'Ivory', hex: '#FAF7F0' },
  { label: 'White', hex: '#FFFFFF' }
];

export const AdminTypographyPanel: React.FC<AdminTypographyPanelProps> = ({
  draftContent,
  setDraftContent,
  savingContent,
  onSave
}) => {
  const [selectedSectionId, setSelectedSectionId] = useState<TypographySectionId>('welcome');
  const [selectedElement, setSelectedElement] = useState<TypographyElementKey>('heading');

  const sectionMeta = useMemo(
    () =>
      TYPOGRAPHY_SECTIONS.find((s) => s.id === selectedSectionId) || TYPOGRAPHY_SECTIONS[0],
    [selectedSectionId]
  );

  const activeElementKey: TypographyElementKey = sectionMeta.applicableElements.includes(
    selectedElement
  )
    ? selectedElement
    : sectionMeta.applicableElements[0];

  const sectionStyles = draftContent.sectionTypography?.[selectedSectionId] || {};
  const elementStyle: ElementTypographyStyle = sectionStyles[activeElementKey] || {};
  const elementBounds = TYPOGRAPHY_ELEMENT_META[activeElementKey];

  const updateElementStyle = (patch: Partial<ElementTypographyStyle>) => {
    setDraftContent((prev) => {
      const currentMap = { ...(prev.sectionTypography || {}) };
      const currentSec = { ...(currentMap[selectedSectionId] || {}) };
      const merged: ElementTypographyStyle = {
        ...(currentSec[activeElementKey] || {}),
        ...patch
      };

      // Clean undefined or default properties so defaults stay untouched
      (Object.keys(merged) as Array<keyof ElementTypographyStyle>).forEach((k) => {
        const v = merged[k];
        if (v === undefined || v === '' || v === 'default') {
          delete merged[k];
        }
      });

      if (Object.keys(merged).length === 0) {
        delete currentSec[activeElementKey];
      } else {
        currentSec[activeElementKey] = merged;
      }

      if (Object.keys(currentSec).length === 0) {
        delete currentMap[selectedSectionId];
      } else {
        currentMap[selectedSectionId] = currentSec;
      }

      return {
        ...prev,
        sectionTypography: currentMap
      };
    });
  };

  const handleResetElement = () => {
    setDraftContent((prev) => {
      const currentMap = { ...(prev.sectionTypography || {}) };
      const currentSec = { ...(currentMap[selectedSectionId] || {}) };
      delete currentSec[activeElementKey];
      if (Object.keys(currentSec).length === 0) {
        delete currentMap[selectedSectionId];
      } else {
        currentMap[selectedSectionId] = currentSec;
      }
      return { ...prev, sectionTypography: currentMap };
    });
  };

  const handleResetSection = () => {
    setDraftContent((prev) => {
      const currentMap = { ...(prev.sectionTypography || {}) };
      delete currentMap[selectedSectionId];
      return { ...prev, sectionTypography: currentMap };
    });
  };

  const effectivePreviewColor =
    elementStyle.color && isValidHexColor(elementStyle.color)
      ? elementStyle.color
      : activeElementKey === 'heading' || activeElementKey === 'subheading'
      ? sectionMeta.defaultHeadingColor
      : sectionMeta.defaultBodyColor;

  const contrastRatio = computeContrastRatio(effectivePreviewColor, sectionMeta.surfaceBgHex);
  const contrastBadge =
    contrastRatio >= 4.5
      ? { label: `AA Readable (${contrastRatio}:1)`, cls: 'bg-[#07543E]/10 text-[#07543E]' }
      : contrastRatio >= 3
      ? { label: `Large Text Only (${contrastRatio}:1)`, cls: 'bg-amber-100 text-amber-950' }
      : { label: `Low Contrast (${contrastRatio}:1)`, cls: 'bg-red-100 text-red-900' };

  return (
    <div className="space-y-6">
      <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#07543E]/10 pb-4">
          <div className="flex items-start gap-3">
            <Type className="w-5 h-5 text-[#07543E] mt-1 shrink-0" />
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Section-by-Section Typography Controls
              </h2>
              <p className="text-xs sm:text-sm text-[#262820]/75 mt-1">
                Customize fonts, sizes, weights, alignment, spacing, and colors independently for any section. Unchanged sections keep the wedding website&rsquo;s default editorial styling.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingContent}
            onClick={() => void onSave(draftContent)}
            className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0"
          >
            {savingContent ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-[#F3E5AB]" />
            )}
            <span>Save Changes</span>
          </button>
        </div>

        {/* Step 1: Select Section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
            1. Choose Website Section
          </p>
          <div className="flex flex-wrap gap-2">
            {TYPOGRAPHY_SECTIONS.map((sec) => {
              const isSelected = sec.id === selectedSectionId;
              const hasOverrides = Boolean(
                draftContent.sectionTypography?.[sec.id] &&
                  Object.keys(draftContent.sectionTypography[sec.id] || {}).length > 0
              );
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={`inline-flex items-center gap-2 px-3.5 min-h-[42px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#07543E] text-white'
                      : 'bg-white border border-[#07543E]/15 text-[#262820] hover:border-[#C5A04A]'
                  }`}
                >
                  <span>{sec.label}</span>
                  {hasOverrides && (
                    <span
                      title="Has custom typography"
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-[#F3E5AB]' : 'bg-[#C5A04A]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Select Text Element */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
            2. Choose Text Element in {sectionMeta.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {sectionMeta.applicableElements.map((elKey) => {
              const isSelected = elKey === activeElementKey;
              const isCustomized = Boolean(sectionStyles[elKey]);
              return (
                <button
                  key={elKey}
                  type="button"
                  onClick={() => setSelectedElement(elKey)}
                  className={`inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#F2EBDD] border border-[#C5A04A] text-[#07543E]'
                      : 'bg-white border border-[#07543E]/15 text-[#262820]/80 hover:border-[#07543E]/35'
                  }`}
                >
                  <span>{TYPOGRAPHY_ELEMENT_META[elKey].label}</span>
                  {isCustomized && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#07543E]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Formatting Controls + Live Section Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
          {/* Controls Column */}
          <div className="lg:col-span-7 p-5 rounded-xl bg-[#FAF7F0] border border-[#07543E]/12 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#07543E]/10">
              <h3 className="font-serif text-lg font-semibold text-[#07543E]">
                {sectionMeta.label} · {elementBounds.label}
              </h3>
              <button
                type="button"
                onClick={handleResetElement}
                className="text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
              >
                Reset Element
              </button>
            </div>

            {/* Font Family & Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="typo-font-family"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Font Family
                </label>
                <select
                  id="typo-font-family"
                  value={elementStyle.fontFamily || 'default'}
                  onChange={(e) =>
                    updateElementStyle({
                      fontFamily: e.target.value as AllowedFontFamilyKey
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
                >
                  {ALLOWED_FONT_FAMILIES.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="typo-font-weight"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Font Weight
                </label>
                <select
                  id="typo-font-weight"
                  value={elementStyle.fontWeight || ''}
                  onChange={(e) =>
                    updateElementStyle({
                      fontWeight: (e.target.value || undefined) as AllowedFontWeight | undefined,
                      bold: undefined
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
                >
                  <option value="">Section Default</option>
                  <option value="400">400 — Regular</option>
                  <option value="500">500 — Medium</option>
                  <option value="600">600 — SemiBold</option>
                  <option value="700">700 — Bold</option>
                </select>
              </div>
            </div>

            {/* Bold, Italic & Alignment */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                  Style
                </span>
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={elementStyle.bold === true}
                    onClick={() =>
                      updateElementStyle({
                        bold: elementStyle.bold === true ? undefined : true
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border text-xs font-semibold cursor-pointer ${
                      elementStyle.bold === true
                        ? 'bg-[#07543E] text-white border-[#07543E]'
                        : 'bg-white border-[#07543E]/20 text-[#262820]'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" /> Bold
                  </button>

                  <button
                    type="button"
                    aria-pressed={elementStyle.italic === true}
                    onClick={() =>
                      updateElementStyle({
                        italic: elementStyle.italic === true ? undefined : true
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border text-xs font-semibold cursor-pointer ${
                      elementStyle.italic === true
                        ? 'bg-[#07543E] text-white border-[#07543E]'
                        : 'bg-white border-[#07543E]/20 text-[#262820]'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" /> Italic
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                  Alignment
                </span>
                <div className="inline-flex items-center gap-1">
                  {(
                    [
                      { key: 'default', label: 'Default', icon: null },
                      { key: 'left', label: 'Left', icon: AlignLeft },
                      { key: 'center', label: 'Center', icon: AlignCenter },
                      { key: 'right', label: 'Right', icon: AlignRight }
                    ] as Array<{
                      key: AllowedTextAlign;
                      label: string;
                      icon: typeof AlignLeft | null;
                    }>
                  ).map((opt) => {
                    const active = (elementStyle.textAlign || 'default') === opt.key;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => updateElementStyle({ textAlign: opt.key })}
                        aria-label={`Align ${opt.label}`}
                        className={`inline-flex items-center justify-center gap-1 px-2.5 min-h-[40px] rounded-lg border text-xs font-semibold cursor-pointer ${
                          active
                            ? 'bg-[#07543E] text-white border-[#07543E]'
                            : 'bg-white border-[#07543E]/20 text-[#262820]'
                        }`}
                      >
                        {Icon ? <Icon className="w-3.5 h-3.5" /> : <span>Auto</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sliders: Font Size, Line Height, Letter Spacing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="typo-size-range" className="font-semibold text-[#07543E]">
                    Size
                  </label>
                  <span className="font-mono text-[#262820]/75">
                    {typeof elementStyle.fontSizePx === 'number'
                      ? `${elementStyle.fontSizePx}px`
                      : 'Default'}
                  </span>
                </div>
                <input
                  id="typo-size-range"
                  type="range"
                  min={elementBounds.minSizePx}
                  max={elementBounds.maxSizePx}
                  step={1}
                  value={elementStyle.fontSizePx ?? elementBounds.defaultSizePx}
                  onChange={(e) =>
                    updateElementStyle({ fontSizePx: Number(e.target.value) })
                  }
                  className="w-full accent-[#07543E]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="typo-lh-range" className="font-semibold text-[#07543E]">
                    Line Height
                  </label>
                  <span className="font-mono text-[#262820]/75">
                    {typeof elementStyle.lineHeight === 'number'
                      ? elementStyle.lineHeight.toFixed(2)
                      : 'Default'}
                  </span>
                </div>
                <input
                  id="typo-lh-range"
                  type="range"
                  min={1.05}
                  max={2.2}
                  step={0.05}
                  value={elementStyle.lineHeight ?? 1.5}
                  onChange={(e) =>
                    updateElementStyle({ lineHeight: Number(e.target.value) })
                  }
                  className="w-full accent-[#07543E]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="typo-ls-range" className="font-semibold text-[#07543E]">
                    Letter Spacing
                  </label>
                  <span className="font-mono text-[#262820]/75">
                    {typeof elementStyle.letterSpacingEm === 'number'
                      ? `${elementStyle.letterSpacingEm.toFixed(2)}em`
                      : 'Default'}
                  </span>
                </div>
                <input
                  id="typo-ls-range"
                  type="range"
                  min={-0.04}
                  max={0.28}
                  step={0.01}
                  value={elementStyle.letterSpacingEm ?? 0}
                  onChange={(e) =>
                    updateElementStyle({ letterSpacingEm: Number(e.target.value) })
                  }
                  className="w-full accent-[#07543E]"
                />
              </div>
            </div>

            {/* Text Color & Contrast Guard */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#07543E]">
                  Text Color
                </label>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${contrastBadge.cls}`}>
                  {contrastRatio < 3 && <AlertTriangle className="w-3 h-3" />}
                  {contrastBadge.label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label="Choose custom text color"
                  value={effectivePreviewColor}
                  onChange={(e) =>
                    updateElementStyle({ color: e.target.value.toUpperCase() })
                  }
                  className="h-10 w-12 rounded-lg border border-[#07543E]/25 bg-white cursor-pointer"
                />

                {LUXURY_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={`${swatch.label} (${swatch.hex})`}
                    onClick={() => updateElementStyle({ color: swatch.hex })}
                    style={{ backgroundColor: swatch.hex }}
                    className={`w-8 h-8 rounded-lg border cursor-pointer ${
                      elementStyle.color?.toUpperCase() === swatch.hex
                        ? 'ring-2 ring-[#07543E] ring-offset-2 border-[#07543E]'
                        : 'border-[#07543E]/25'
                    }`}
                  />
                ))}

                {elementStyle.color && (
                  <button
                    type="button"
                    onClick={() => updateElementStyle({ color: undefined })}
                    className="px-2.5 min-h-[36px] text-xs font-semibold text-[#07543E] hover:underline cursor-pointer"
                  >
                    Use Default Color
                  </button>
                )}
              </div>
            </div>

            {/* Footer Action Row */}
            <div className="pt-3 border-t border-[#07543E]/10 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetSection}
                className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#F2EBDD] text-xs font-semibold text-[#07543E] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset {sectionMeta.label} to Default</span>
              </button>

              <button
                type="button"
                disabled={savingContent}
                onClick={() => void onSave(draftContent)}
                className="inline-flex items-center gap-1.5 px-5 min-h-[42px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {savingContent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 text-[#F3E5AB]" />
                )}
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          {/* Live Section Preview Column */}
          <div className="lg:col-span-5 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
              Live Preview ({sectionMeta.label} Section)
            </p>
            <div
              style={{ backgroundColor: sectionMeta.surfaceBgHex }}
              className="p-6 sm:p-7 rounded-2xl border border-[#C5A04A]/40 space-y-4 overflow-hidden"
            >
              <p
                style={{
                  color: sectionMeta.isDarkSurface ? '#F3E5AB' : '#737746',
                  ...getPreviewInlineStyle('label', sectionStyles.label)
                }}
                className="text-xs uppercase tracking-[0.22em] font-semibold"
              >
                {sectionMeta.label} · {draftContent.hashtag}
              </p>

              <h4
                style={{
                  color: sectionMeta.defaultHeadingColor,
                  ...getPreviewInlineStyle('heading', sectionStyles.heading)
                }}
                className="font-serif text-3xl font-semibold leading-tight"
              >
                {draftContent.coupleNames}
              </h4>

              <h5
                style={{
                  color: sectionMeta.defaultHeadingColor,
                  ...getPreviewInlineStyle('subheading', sectionStyles.subheading)
                }}
                className="font-serif text-xl font-semibold"
              >
                Celebrating Forever in Abuja
              </h5>

              <p
                style={{
                  color: sectionMeta.defaultBodyColor,
                  ...getPreviewInlineStyle('body', sectionStyles.body)
                }}
                className="font-serif text-base leading-relaxed opacity-90"
              >
                With joyful hearts we invite our beloved family and friends to celebrate the beginning of our forever together on December 11 – 12, 2026.
              </p>

              <p
                style={{
                  color: sectionMeta.isDarkSurface ? '#F3E5AB' : '#737746',
                  ...getPreviewInlineStyle('caption', sectionStyles.caption)
                }}
                className="text-xs italic"
              >
                All times in West Africa Time (Africa/Lagos)
              </p>

              {sectionMeta.applicableElements.includes('button') && (
                <div className="pt-1">
                  <span
                    style={getPreviewInlineStyle('button', sectionStyles.button)}
                    className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider ${
                      sectionMeta.isDarkSurface
                        ? 'bg-[#C5A04A] text-[#052D24]'
                        : 'bg-[#07543E] text-white'
                    }`}
                  >
                    Sample Action Button
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
