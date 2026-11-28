import React, { useState } from 'react';
import { Check, Copy, Gift } from 'lucide-react';
import { SectionTypographyElements } from '../types';
import { getSectionTypographyProps } from '../utils/typography';
import { trackGiftingAccountCopied } from '../services/analytics';

interface GiftingSectionProps {
  heading: string;
  intro: string;
  closing: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  typography?: SectionTypographyElements;
}

type CopyFieldKey = 'accountName' | 'bankName' | 'accountNumber';

async function copyTextWithFallback(text: string): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(clean);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = clean;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const GiftingSection: React.FC<GiftingSectionProps> = ({
  heading,
  intro,
  closing,
  accountName,
  bankName,
  accountNumber,
  typography
}) => {
  const [copiedField, setCopiedField] = useState<CopyFieldKey | null>(null);
  const sectionTypoProps = getSectionTypographyProps('gifting', typography);

  const handleCopy = async (field: CopyFieldKey, value: string) => {
    const ok = await copyTextWithFallback(value);
    const fieldLabelMap: Record<CopyFieldKey, 'account_name' | 'bank_name' | 'account_number'> = {
      accountName: 'account_name',
      bankName: 'bank_name',
      accountNumber: 'account_number'
    };
    trackGiftingAccountCopied(fieldLabelMap[field], ok);
    if (ok) {
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2200);
    }
  };

  const accountRows: Array<{
    key: CopyFieldKey;
    label: string;
    value: string;
    isNumeric?: boolean;
  }> = [
    { key: 'accountName', label: 'Account Name', value: accountName },
    { key: 'bankName', label: 'Bank Name', value: bankName },
    { key: 'accountNumber', label: 'Account Number', value: accountNumber, isNumeric: true }
  ];

  return (
    <section
      id="gifting"
      {...sectionTypoProps}
      className="scroll-mt-20 py-18 sm:py-24 px-4 sm:px-6 border-b border-[#C5A04A]/25 text-[#FAF7F0]"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, #0A5B47 0%, #063F33 52%, #052D24 100%)',
        ...(sectionTypoProps.style || {})
      }}
    >
      <div className="max-w-2xl mx-auto text-center">
        {/* Discreet Editorial Emblem & Kicker */}
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-[#C5A04A]/45 bg-[#073B2B]/65 text-[#F3E5AB] mb-4">
          <Gift className="w-5 h-5" aria-hidden="true" />
        </div>

        <p
          data-typo="label"
          className="text-xs sm:text-sm uppercase tracking-[0.24em] text-[#F3E5AB] font-semibold mb-2.5"
        >
          With Love &amp; Gratitude
        </p>

        <h2
          data-typo="heading"
          className="font-serif text-[34px] sm:text-5xl lg:text-[52px] font-semibold text-[#FAF7F0] text-balance leading-tight mb-5"
        >
          {heading}
        </h2>

        <div className="h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent mb-6" />

        <p
          data-typo="body"
          className="font-serif text-base sm:text-xl text-[#FAF7F0]/90 leading-relaxed max-w-xl mx-auto mb-10 whitespace-pre-line"
        >
          {intro}
        </p>

        {/* Refined Account Details Presentation */}
        <div className="rounded-2xl border border-[#C5A04A]/40 bg-[#053329]/75 backdrop-blur-xs shadow-[0_18px_46px_-18px_rgba(0,0,0,0.45)] divide-y divide-[#C5A04A]/20 text-left overflow-hidden">
          {accountRows.map((row) => {
            const isCopied = copiedField === row.key;
            return (
              <div
                key={row.key}
                className="px-5 py-5 sm:px-8 sm:py-6 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3.5 sm:gap-5"
              >
                <div className="min-w-0 space-y-1">
                  <p
                    data-typo="label"
                    className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-[#E6CE8A] font-semibold"
                  >
                    {row.label}
                  </p>
                  <p
                    data-typo="subheading"
                    className={`font-serif text-xl sm:text-2xl font-semibold text-[#FAF7F0] tracking-wide break-words ${
                      row.isNumeric ? 'tabular-nums tracking-[0.08em]' : ''
                    }`}
                  >
                    {row.value}
                  </p>
                </div>

                <button
                  type="button"
                  data-typo="button"
                  onClick={() => void handleCopy(row.key, row.value)}
                  aria-label={`Copy ${row.label}: ${row.value}`}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] min-w-[104px] rounded-xl text-xs font-semibold uppercase tracking-[0.14em] transition-all shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3E5AB] ${
                    isCopied
                      ? 'bg-[#C5A04A] text-[#052D24] border border-[#F3E5AB]'
                      : 'bg-[#FAF7F0]/10 hover:bg-[#FAF7F0]/18 active:scale-[0.98] text-[#FAF7F0] border border-[#C5A04A]/45'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#F3E5AB]" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Live Screen-Reader Announcement */}
        <span className="sr-only" aria-live="polite">
          {copiedField ? `${copiedField} copied to clipboard.` : ''}
        </span>

        {/* Warm Closing Note */}
        <p
          data-typo="caption"
          className="mt-9 font-serif italic text-lg sm:text-2xl text-[#F3E5AB]"
        >
          {closing}
        </p>
      </div>
    </section>
  );
};
