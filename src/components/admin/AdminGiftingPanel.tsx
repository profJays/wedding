import React from 'react';
import { Check, Gift, Loader2 } from 'lucide-react';
import { SiteContentData } from '../../types';

interface AdminGiftingPanelProps {
  draftContent: SiteContentData;
  setDraftContent: React.Dispatch<React.SetStateAction<SiteContentData>>;
  savingContent: boolean;
  onSave: (next: SiteContentData) => Promise<void>;
}

export const AdminGiftingPanel: React.FC<AdminGiftingPanelProps> = ({
  draftContent,
  setDraftContent,
  savingContent,
  onSave
}) => {
  const isEnabled = draftContent.giftingEnabled !== false;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draftContent);
        }}
        className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#07543E]/10 pb-4">
          <div className="flex items-start gap-3">
            <Gift className="w-5 h-5 text-[#07543E] mt-1 shrink-0" />
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Gifting &amp; Support Settings
              </h2>
              <p className="text-xs sm:text-sm text-[#262820]/75 mt-1">
                Displayed directly after the Wedding Photo Puzzle and before Guest Q&amp;A. Disabling hides both the section and its header/footer navigation links.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            onClick={() =>
              setDraftContent((d) => ({
                ...d,
                giftingEnabled: !(d.giftingEnabled !== false)
              }))
            }
            className={`inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg border text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors shrink-0 ${
              isEnabled
                ? 'bg-[#07543E] text-white border-[#07543E]'
                : 'bg-white text-[#262820]/75 border-[#07543E]/25'
            }`}
          >
            <span>{isEnabled ? 'Gifting Enabled' : 'Gifting Hidden'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form Fields */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label
                htmlFor="gifting-heading-input"
                className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
              >
                Section Heading
              </label>
              <input
                id="gifting-heading-input"
                type="text"
                maxLength={120}
                value={draftContent.giftingHeading ?? ''}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, giftingHeading: e.target.value }))
                }
                placeholder="Gifting & Support"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="gifting-intro-input"
                className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
              >
                Introductory Message
              </label>
              <textarea
                id="gifting-intro-input"
                rows={3}
                maxLength={600}
                value={draftContent.giftingIntro ?? ''}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, giftingIntro: e.target.value }))
                }
                placeholder="Your presence, prayers, and warm wishes mean the world to us..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#07543E]/20 bg-white leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="gifting-account-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Account Name
                </label>
                <input
                  id="gifting-account-name"
                  type="text"
                  maxLength={120}
                  value={draftContent.giftingAccountName ?? ''}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, giftingAccountName: e.target.value }))
                  }
                  placeholder="Joseph John"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="gifting-bank-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Bank Name
                </label>
                <input
                  id="gifting-bank-name"
                  type="text"
                  maxLength={120}
                  value={draftContent.giftingBankName ?? ''}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, giftingBankName: e.target.value }))
                  }
                  placeholder="Opay"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="gifting-account-number"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
                >
                  Account Number
                </label>
                <input
                  id="gifting-account-number"
                  type="text"
                  maxLength={40}
                  value={draftContent.giftingAccountNumber ?? ''}
                  onChange={(e) =>
                    setDraftContent((d) => ({ ...d, giftingAccountNumber: e.target.value }))
                  }
                  placeholder="8065013009"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-lg border border-[#07543E]/20 bg-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gifting-closing-input"
                className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
              >
                Closing Note
              </label>
              <input
                id="gifting-closing-input"
                type="text"
                maxLength={300}
                value={draftContent.giftingClosing ?? ''}
                onChange={(e) =>
                  setDraftContent((d) => ({ ...d, giftingClosing: e.target.value }))
                }
                placeholder="Thank you for celebrating with us."
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingContent}
                className="inline-flex items-center justify-center gap-2 px-6 min-h-[46px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {savingContent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 text-[#F3E5AB]" />
                )}
                <span>Save Gifting Settings</span>
              </button>
            </div>
          </div>

          {/* Live Mini Preview */}
          <div className="lg:col-span-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737746]">
              Live Card Preview
            </p>
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#063F33] to-[#052D24] border border-[#C5A04A]/45 text-[#FAF7F0] space-y-4">
              <div className="text-center space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#F3E5AB] font-semibold">
                  Love &amp; Blessings
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#FAF7F0]">
                  {draftContent.giftingHeading || 'Gifting & Support'}
                </h3>
                <p className="text-xs text-[#FAF7F0]/80 leading-relaxed">
                  {draftContent.giftingIntro ||
                    'Your presence, prayers, and warm wishes mean the world to us.'}
                </p>
              </div>

              <div className="divide-y divide-[#C5A04A]/20 rounded-xl bg-[#04271F]/80 border border-[#C5A04A]/30">
                {[
                  { label: 'Account Name', value: draftContent.giftingAccountName || 'Joseph John' },
                  { label: 'Bank Name', value: draftContent.giftingBankName || 'Opay' },
                  {
                    label: 'Account Number',
                    value: draftContent.giftingAccountNumber || '8065013009',
                    mono: true
                  }
                ].map((row) => (
                  <div
                    key={row.label}
                    className="px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-[#F3E5AB]/85">
                        {row.label}
                      </p>
                      <p
                        className={`text-sm font-semibold text-white truncate ${
                          row.mono ? 'font-mono tracking-wider' : ''
                        }`}
                      >
                        {row.value}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded border border-[#C5A04A]/45 text-[11px] text-[#F3E5AB] shrink-0">
                      Copy
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-center font-serif italic text-sm text-[#F3E5AB]/90">
                {draftContent.giftingClosing || 'Thank you for celebrating with us.'}
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
