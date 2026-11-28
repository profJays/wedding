import React, { useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Send, Loader2 } from 'lucide-react';
import { submitGuestRsvp } from '../services/weddingRepository';
import { SectionTypographyElements } from '../types';
import { getSectionTypographyProps } from '../utils/typography';
import { trackRsvpFormOpened, trackRsvpSubmitted } from '../services/analytics';

interface RsvpSectionProps {
  coupleNames: string;
  rsvpOpen: boolean;
  maxGuestsPerRsvp: number;
  contactName: string;
  contactPhone: string;
  typography?: SectionTypographyElements;
}

export const RsvpSection: React.FC<RsvpSectionProps> = ({
  coupleNames,
  rsvpOpen,
  maxGuestsPerRsvp,
  contactName,
  contactPhone,
  typography
}) => {
  const sectionTypoProps = getSectionTypographyProps('rsvp', typography);
  const [fullName, setFullName] = useState('');
  const [attending, setAttending] = useState<'yes' | 'no' | ''>('');
  const [guestCount, setGuestCount] = useState(1);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<{
    fullName: string;
    attending: boolean;
    guestCount: number;
  } | null>(null);
  const formOpenedTrackedRef = useRef(false);

  const handleFormInteraction = () => {
    if (!formOpenedTrackedRef.current) {
      formOpenedTrackedRef.current = true;
      trackRsvpFormOpened();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    handleFormInteraction();

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setError('Please enter your full name.');
      trackRsvpSubmitted(false);
      return;
    }
    if (!attending) {
      setError('Please select whether you will be attending or unable to attend.');
      trackRsvpSubmitted(false);
      return;
    }

    const isAttending = attending === 'yes';
    const finalCount = isAttending
      ? Math.max(1, Math.min(maxGuestsPerRsvp, guestCount))
      : 0;

    setSubmitting(true);
    try {
      await submitGuestRsvp({
        fullName: trimmedName,
        attending: isAttending,
        guestCount: finalCount,
        message,
        maxGuestsAllowed: maxGuestsPerRsvp
      });

      trackRsvpSubmitted(true);
      setSubmittedRecord({
        fullName: trimmedName,
        attending: isAttending,
        guestCount: finalCount
      });
    } catch (err) {
      trackRsvpSubmitted(false);
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'DUPLICATE_OR_CLOSED_RSVP') {
        setError(
          `An RSVP for "${trimmedName}" has already been recorded (or RSVPs are currently closed). If you need to update an existing response, please reach out to ${contactName || 'our Maid of Honour'} on ${contactPhone || '+2348031234567'}.`
        );
      } else {
        setError(msg || 'We could not save your RSVP right now. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="rsvp"
      {...sectionTypoProps}
      className="scroll-mt-20 py-16 sm:py-24 px-4 sm:px-6 bg-[#FAF7F0] border-b border-[#07543E]/10"
    >
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10 sm:mb-12">
          <p
            data-typo="label"
            className="text-xs sm:text-sm uppercase tracking-[0.22em] text-[#737746] font-semibold mb-2"
          >
            RSVP
          </p>
          <h2
            data-typo="heading"
            className="font-serif text-[34px] sm:text-5xl font-semibold text-[#07543E] text-balance leading-tight mb-3"
          >
            Kindly Respond
          </h2>
          <p
            data-typo="body"
            className="text-base sm:text-lg text-[#262820]/80 max-w-lg mx-auto leading-relaxed"
          >
            Let {coupleNames} know if you will join the celebration in Abuja.
          </p>
          <div className="mt-6 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#C5A04A] to-transparent" />
        </div>

        {!rsvpOpen ? (
          <div className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 text-center space-y-2.5">
            <p className="font-serif text-2xl sm:text-3xl text-[#07543E]">
              RSVP Submissions Are Currently Paused
            </p>
            <p className="text-base text-[#262820]/80">
              Please contact {contactName || 'Victoria'} on {contactPhone || '+2348031234567'} for guest list assistance.
            </p>
          </div>
        ) : submittedRecord ? (
          <div className="p-6 sm:p-10 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/45 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#07543E]/10 text-[#07543E] flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-3xl font-semibold text-[#07543E]">
              Thank You, {submittedRecord.fullName}
            </h3>
            <p className="text-base text-[#262820]/80 max-w-md mx-auto leading-relaxed">
              {submittedRecord.attending
                ? `Your RSVP has been recorded (${submittedRecord.guestCount} ${
                    submittedRecord.guestCount === 1 ? 'guest' : 'guests'
                  }). We look forward to celebrating with you!`
                : 'Your response has been recorded. We will miss having you with us and appreciate your warm wishes.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setSubmittedRecord(null);
                  setFullName('');
                  setAttending('');
                  setGuestCount(1);
                  setMessage('');
                }}
                className="min-h-[44px] inline-flex items-center text-sm font-semibold text-[#07543E] underline underline-offset-4 cursor-pointer"
              >
                Submit an RSVP for another guest
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onFocus={handleFormInteraction}
            noValidate
            className="p-5 min-[360px]:p-6 sm:p-10 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-6"
          >
            {error && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm flex items-start gap-2.5 leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label
                htmlFor="rsvp-full-name"
                className="block text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-[#07543E] mb-2"
              >
                Full Name <span className="text-red-700">*</span>
              </label>
              <input
                id="rsvp-full-name"
                type="text"
                required
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 min-h-[48px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white text-[#262820] placeholder-[#262820]/45 focus:outline-none focus:border-[#07543E] focus:ring-2 focus:ring-[#07543E]/15"
              />
            </div>

            {/* Attendance Response */}
            <fieldset>
              <legend className="block text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-[#07543E] mb-2.5">
                Will you be joining us? <span className="text-red-700">*</span>
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAttending('yes');
                    if (guestCount < 1) setGuestCount(1);
                  }}
                  aria-pressed={attending === 'yes'}
                  className={`px-4 py-3.5 min-h-[48px] rounded-lg border text-sm sm:text-base font-medium text-left transition-colors cursor-pointer ${
                    attending === 'yes'
                      ? 'bg-[#07543E] text-white border-[#07543E]'
                      : 'bg-white text-[#262820] border-[#07543E]/20 hover:border-[#C5A04A]'
                  }`}
                >
                  Attending — wouldn&apos;t miss it
                </button>

                <button
                  type="button"
                  onClick={() => setAttending('no')}
                  aria-pressed={attending === 'no'}
                  className={`px-4 py-3.5 min-h-[48px] rounded-lg border text-sm sm:text-base font-medium text-left transition-colors cursor-pointer ${
                    attending === 'no'
                      ? 'bg-[#073B2B] text-white border-[#073B2B]'
                      : 'bg-white text-[#262820] border-[#07543E]/20 hover:border-[#C5A04A]'
                  }`}
                >
                  Unable to attend
                </button>
              </div>
            </fieldset>

            {/* Number of Guests (only shown when attending AND admin allows >1 guest, or displays confirmed seat = 1) */}
            {attending === 'yes' && (
              <div>
                <label
                  htmlFor="rsvp-guest-count"
                  className="block text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-[#07543E] mb-2"
                >
                  Number of Guests
                </label>
                {maxGuestsPerRsvp > 1 ? (
                  <select
                    id="rsvp-guest-count"
                    value={guestCount}
                    onChange={(e) => setGuestCount(Number(e.target.value))}
                    className="w-full px-4 py-3 min-h-[48px] text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white text-[#262820] focus:outline-none focus:border-[#07543E]"
                  >
                    {Array.from({ length: maxGuestsPerRsvp }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'Guest (Just me)' : 'Guests'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="px-4 py-3 min-h-[48px] flex items-center text-sm sm:text-base rounded-lg border border-[#07543E]/15 bg-[#FAF7F0] text-[#262820]/80">
                    1 Guest (Individual invitation seat)
                  </p>
                )}
              </div>
            )}

            {/* Optional Message */}
            <div>
              <label
                htmlFor="rsvp-message"
                className="block text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-[#07543E] mb-2"
              >
                Message to the Couple <span className="font-normal text-[#262820]/55">(Optional)</span>
              </label>
              <textarea
                id="rsvp-message"
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share a warm note, blessing, or dietary note for Mary & Joseph..."
                className="w-full px-4 py-3 text-base sm:text-sm rounded-lg border border-[#07543E]/20 bg-white text-[#262820] placeholder-[#262820]/45 focus:outline-none focus:border-[#07543E] focus:ring-2 focus:ring-[#07543E]/15"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-sm font-semibold uppercase tracking-[0.16em] transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recording RSVP...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-[#C5A04A]" />
                  <span>Submit RSVP</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
