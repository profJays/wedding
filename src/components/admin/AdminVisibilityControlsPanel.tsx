import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal
} from 'lucide-react';
import { SiteContentData, VisibilitySettingsData } from '../../types';
import {
  DEFAULT_VISIBILITY_SETTINGS,
  areVisibilitySettingsEqual,
  cloneVisibilitySettings,
  countEnabledVisibilityControls,
  describeVisitorFlow
} from '../../utils/visibilitySettings';

interface AdminVisibilityControlsPanelProps {
  visibilitySettings: VisibilitySettingsData;
  siteContent: SiteContentData;
  onSaveVisibilitySettings: (next: VisibilitySettingsData) => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

interface ToggleItemProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  note?: string;
  onChange: (nextValue: boolean) => void;
}

const VisibilityToggleRow: React.FC<ToggleItemProps> = ({
  id,
  label,
  description,
  checked,
  note,
  onChange
}) => {
  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#07543E]/12 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:border-[#C5A04A]/50">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={id}
            className="font-serif text-lg sm:text-xl font-semibold text-[#07543E] cursor-pointer"
          >
            {label}
          </label>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider ${
              checked
                ? 'bg-[#07543E]/10 text-[#07543E]'
                : 'bg-stone-200 text-[#262820]/70'
            }`}
          >
            {checked ? (
              <>
                <Eye className="w-3 h-3" aria-hidden="true" />
                <span>Enabled</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                <span>Disabled</span>
              </>
            )}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-[#262820]/75 leading-relaxed">
          {description}
        </p>

        {note && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 mt-2 inline-block">
            {note}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end shrink-0">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${label}: ${checked ? 'Enabled' : 'Disabled'}`}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07543E] focus-visible:ring-offset-2 ${
            checked
              ? 'bg-[#07543E] border-[#07543E]'
              : 'bg-stone-300 border-stone-400/60'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transform transition-transform ${
              checked ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export const AdminVisibilityControlsPanel: React.FC<AdminVisibilityControlsPanelProps> = ({
  visibilitySettings,
  siteContent,
  onSaveVisibilitySettings,
  onNotify
}) => {
  const [draft, setDraft] = useState<VisibilitySettingsData>(() =>
    cloneVisibilitySettings(visibilitySettings)
  );
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Sync incoming Firestore changes cleanly whenever the persisted settings update
  useEffect(() => {
    setDraft(cloneVisibilitySettings(visibilitySettings));
  }, [visibilitySettings]);

  const hasUnsavedChanges = useMemo(
    () => !areVisibilitySettingsEqual(draft, visibilitySettings),
    [draft, visibilitySettings]
  );

  const summary = useMemo(() => countEnabledVisibilityControls(draft), [draft]);
  const visitorFlowPreview = useMemo(() => describeVisitorFlow(draft), [draft]);

  const setExperience = (
    key: keyof VisibilitySettingsData['experience'],
    val: boolean
  ) => {
    setLocalStatus(null);
    setDraft((prev) => ({
      ...prev,
      experience: { ...prev.experience, [key]: val }
    }));
  };

  const setSection = (
    key: keyof VisibilitySettingsData['sections'],
    val: boolean
  ) => {
    setLocalStatus(null);
    setDraft((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: val }
    }));
  };

  const setInteraction = (
    key: keyof VisibilitySettingsData['interactions'],
    val: boolean
  ) => {
    setLocalStatus(null);
    setDraft((prev) => ({
      ...prev,
      interactions: { ...prev.interactions, [key]: val }
    }));
  };

  const handleEnableAllDefaults = () => {
    setLocalStatus(null);
    setDraft(cloneVisibilitySettings(DEFAULT_VISIBILITY_SETTINGS));
  };

  const handleDiscard = () => {
    setLocalStatus(null);
    setDraft(cloneVisibilitySettings(visibilitySettings));
  };

  const handleSave = async () => {
    setSaving(true);
    setLocalStatus(null);
    try {
      await onSaveVisibilitySettings(draft);
      const msg =
        'Website visibility and experience controls saved. Changes are now live for visitors.';
      setLocalStatus({ type: 'success', text: msg });
      onNotify('success', msg);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to save visibility controls right now. Please retry.';
      setLocalStatus({ type: 'error', text: msg });
      onNotify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const mainSiteOff = !draft.experience.mainWebsite;

  return (
    <div className="space-y-6">
      {/* Header & Public Visibility Summary Bar */}
      <div className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#737746]">
              <SlidersHorizontal className="w-4 h-4 text-[#C5A04A]" aria-hidden="true" />
              <span>Live Site Controls</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
              Website Visibility &amp; Experience Controls
            </h2>
            <p className="text-xs sm:text-sm text-[#262820]/75 max-w-2xl leading-relaxed">
              Independently enable or pause major visitor experiences, homepage sections, and guest interactions. Turning any item off never deletes your RSVPs, gallery photos, music library, or saved content.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                draft.experience.mainWebsite
                  ? 'bg-[#07543E] text-white'
                  : 'bg-amber-100 text-amber-950 border border-amber-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${
                  draft.experience.mainWebsite ? 'bg-[#F3E5AB]' : 'bg-amber-600'
                }`}
              />
              <span>
                {draft.experience.mainWebsite
                  ? 'Public Website Live'
                  : 'Maintenance / Holding Screen Active'}
              </span>
            </span>

            <button
              type="button"
              onClick={handleEnableAllDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Enable All Defaults</span>
            </button>
          </div>
        </div>

        {/* Summary Metrics & Visitor Flow Preview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-[#07543E]/10">
          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/10">
            <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
              Active Controls
            </p>
            <p className="font-serif text-2xl font-semibold text-[#07543E] mt-0.5 tabular-nums">
              {summary.enabled} <span className="text-sm font-sans font-normal text-[#262820]/65">of {summary.total}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#FAF7F0] border border-[#07543E]/10">
            <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold">
              Experiences / Sections / Guest Actions
            </p>
            <p className="text-sm font-semibold text-[#07543E] mt-1.5 tabular-nums">
              {summary.experienceEnabled}/{summary.experienceTotal} · {summary.sectionsEnabled}/{summary.sectionsTotal} · {summary.interactionsEnabled}/{summary.interactionsTotal}
            </p>
          </div>

          <div className="md:col-span-2 p-3.5 rounded-lg bg-[#FAF7F0] border border-[#C5A04A]/35">
            <p className="text-[11px] uppercase tracking-wider text-[#737746] font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A04A]" aria-hidden="true" />
              <span>Current Visitor Entry Flow</span>
            </p>
            <p className="text-xs sm:text-sm font-medium text-[#07543E] mt-1 leading-snug">
              {visitorFlowPreview}
            </p>
          </div>
        </div>

        {mainSiteOff && (
          <div
            role="status"
            className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2.5 leading-relaxed"
          >
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Main Website Experience is switched OFF.</strong> Public visitors will see a graceful holding page, and guest RSVP/upload/song-suggestion writes will be paused. Your <strong>Couple Admin Dashboard (#admin)</strong> always remains open so you can re-enable the website at any time.
            </span>
          </div>
        )}

        {localStatus && (
          <div
            role="status"
            className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center gap-2 ${
              localStatus.type === 'success'
                ? 'bg-[#07543E]/8 border-[#07543E]/25 text-[#07543E]'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {localStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{localStatus.text}</span>
          </div>
        )}
      </div>

      {/* ====================================================================
          GROUP A: VISITOR EXPERIENCE CONTROLS
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
        <div className="border-b border-[#07543E]/10 pb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
            Group A · Visitor Entry &amp; Atmosphere
          </p>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] mt-0.5">
            Visitor Experience Controls
          </h3>
        </div>

        <div className="space-y-3">
          <VisibilityToggleRow
            id="vis-exp-digital-invitation"
            label="Digital Invitation"
            description="Shows the emerald and gold wax-sealed envelope invitation when guests first arrive, plus Digital Invite links in the header, hero, and footer. When turned off, visitors skip straight past the envelope."
            checked={draft.experience.digitalInvitation}
            onChange={(val) => setExperience('digitalInvitation', val)}
          />

          <VisibilityToggleRow
            id="vis-exp-challenge"
            label="Wedding Challenge"
            description="Controls only the introductory 5-question Wedding Challenge entry experience and Guest Challenge links. When turned off, visitors skip the introductory challenge without affecting the Wedding Photo Puzzle."
            checked={draft.experience.challenge}
            onChange={(val) => setExperience('challenge', val)}
          />

          <VisibilityToggleRow
            id="vis-exp-photo-puzzle"
            label="Wedding Photo Puzzle"
            description="Controls only the interactive 3×3 Wedding Photo Puzzle section on the main website and its Puzzle navigation links. Turning this off hides the puzzle without affecting the Wedding Challenge or deleting puzzle images and music tracks."
            checked={draft.experience.photoPuzzle}
            note={
              draft.experience.photoPuzzle && siteContent.puzzleEnabled === false
                ? 'Note: The Photo Puzzle is currently switched off in Site Settings as well, so it will remain hidden until re-enabled there.'
                : undefined
            }
            onChange={(val) => setExperience('photoPuzzle', val)}
          />

          <VisibilityToggleRow
            id="vis-exp-background-music"
            label="Background Music"
            description="Controls background wedding music playback and the Play/Pause toggle in the navigation bar. When turned off, music pauses immediately and audio controls are hidden without deleting your music library."
            checked={draft.experience.backgroundMusic}
            note={
              draft.experience.backgroundMusic && siteContent.musicEnabled === false
                ? 'Note: Background music is currently disabled inside the Music tab as well.'
                : undefined
            }
            onChange={(val) => setExperience('backgroundMusic', val)}
          />

          <VisibilityToggleRow
            id="vis-exp-main-website"
            label="Main Website Experience"
            description="Controls public access to the full Mary & Joseph wedding website. When turned off, visitors see a tasteful temporary maintenance page while the Couple Admin Dashboard remains accessible."
            checked={draft.experience.mainWebsite}
            onChange={(val) => setExperience('mainWebsite', val)}
          />
        </div>
      </section>

      {/* ====================================================================
          GROUP B: MAIN WEBSITE SECTION CONTROLS
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
        <div className="border-b border-[#07543E]/10 pb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
            Group B · Homepage Sections &amp; Navigation
          </p>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] mt-0.5">
            Main Website Section Controls
          </h3>
          <p className="text-xs sm:text-sm text-[#262820]/70 mt-1">
            Disabling a section hides it from the wedding website and automatically removes its navigation links from the header and footer without erasing any saved text, images, or records.
          </p>
        </div>

        <div className="space-y-3">
          <VisibilityToggleRow
            id="vis-sec-welcome"
            label="Welcome / Hero Section"
            description="Displays the couple hero banner, ceremony countdown, and the couple's welcome letter at the top of the website."
            checked={draft.sections.welcome}
            onChange={(val) => setSection('welcome', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-our-story"
            label="Our Story"
            description="Displays the couple's love story, editorial portrait, and Couple Q&A accordion."
            checked={draft.sections.ourStory}
            onChange={(val) => setSection('ourStory', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-schedule"
            label="Schedule"
            description="Displays the December 11–12 wedding schedule, venue map links, directions, attire guide, and Add to Calendar actions."
            checked={draft.sections.schedule}
            onChange={(val) => setSection('schedule', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-gifting"
            label="Gifting"
            description="Displays the Gifting & Support section and bank transfer details with one-tap copy."
            checked={draft.sections.gifting}
            note={
              draft.sections.gifting && siteContent.giftingEnabled === false
                ? 'Note: Gifting is currently switched off in the Gifting tab as well.'
                : undefined
            }
            onChange={(val) => setSection('gifting', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-qa"
            label="Q&A"
            description="Displays the searchable Guest Information & FAQ accordion."
            checked={draft.sections.qa}
            onChange={(val) => setSection('qa', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-rsvp"
            label="RSVP"
            description="Displays the RSVP section and accepts new guest RSVP submissions. Turning this off also pauses backend RSVP writes while keeping all existing RSVP records intact."
            checked={draft.sections.rsvp}
            note={
              draft.sections.rsvp && !siteContent.rsvpOpen
                ? 'Note: RSVP submissions are currently closed in Site Settings, so guests will see the RSVP-closed message until reopened there.'
                : undefined
            }
            onChange={(val) => setSection('rsvp', val)}
          />

          <VisibilityToggleRow
            id="vis-sec-gallery"
            label="Gallery"
            description="Displays the Wedding Highlights slideshow and Captured by You guest photo & video gallery. Turning this off preserves all Google Drive files and gallery items."
            checked={draft.sections.gallery}
            onChange={(val) => setSection('gallery', val)}
          />
        </div>
      </section>

      {/* ====================================================================
          GROUP C: GUEST INTERACTION CONTROLS
      ==================================================================== */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-4">
        <div className="border-b border-[#07543E]/10 pb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
            Group C · Interactive Guest Permissions
          </p>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#07543E] mt-0.5">
            Guest Interaction Controls
          </h3>
          <p className="text-xs sm:text-sm text-[#262820]/70 mt-1">
            Pause specific guest actions independently while keeping existing gallery slides, approved photos, and administrator tools fully active.
          </p>
        </div>

        <div className="space-y-3">
          <VisibilityToggleRow
            id="vis-int-guest-uploads"
            label="Guest Photo & Video Uploads"
            description="Allows guests to upload photos and videos in the Gallery section (once unlocked on the wedding day). When turned off, the upload form is hidden and guest upload endpoints reject non-admin uploads while keeping curated slideshow and approved gallery photos visible."
            checked={draft.interactions.guestUploads}
            note={
              !draft.sections.gallery && draft.interactions.guestUploads
                ? 'Gallery section is currently disabled above, so guests will not see uploads until Gallery is also enabled.'
                : undefined
            }
            onChange={(val) => setInteraction('guestUploads', val)}
          />

          <VisibilityToggleRow
            id="vis-int-song-suggestions"
            label="Song Suggestions"
            description="Allows guests who complete the photo puzzle to suggest songs for the couple's playlist. Turning this off hides the suggestion form and blocks new public song-suggestion submissions while preserving previously submitted suggestions."
            checked={draft.interactions.songSuggestions}
            note={
              !draft.experience.photoPuzzle && draft.interactions.songSuggestions
                ? 'Wedding Photo Puzzle is currently disabled above, so guests will not see song suggestions until Wedding Photo Puzzle is enabled.'
                : undefined
            }
            onChange={(val) => setInteraction('songSuggestions', val)}
          />

          <VisibilityToggleRow
            id="vis-int-puzzle-song-rewards"
            label="Puzzle Song Rewards"
            description="Allows guests who solve the 3×3 photo puzzle to choose the next celebration song from your enabled music library. Turning this off keeps the puzzle playable without the song-picker reward."
            checked={draft.interactions.puzzleSongRewards}
            note={
              !draft.experience.photoPuzzle && draft.interactions.puzzleSongRewards
                ? 'Wedding Photo Puzzle is currently disabled above, so puzzle song rewards will reappear when Wedding Photo Puzzle is enabled.'
                : undefined
            }
            onChange={(val) => setInteraction('puzzleSongRewards', val)}
          />
        </div>
      </section>

      {/* Sticky Save Action Bar */}
      <div className="sticky bottom-4 z-10 p-4 rounded-xl bg-[#FFFDF8]/95 backdrop-blur-md border border-[#C5A04A]/45 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          {hasUnsavedChanges ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-950 font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>You have unsaved visibility changes</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#07543E] font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#C5A04A] shrink-0" aria-hidden="true" />
              <span>All visibility controls are synced with live Firestore</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {hasUnsavedChanges && (
            <button
              type="button"
              disabled={saving}
              onClick={handleDiscard}
              className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-xl border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold uppercase tracking-wider text-[#262820] cursor-pointer disabled:opacity-60"
            >
              Discard
            </button>
          )}

          <button
            type="button"
            disabled={saving || !hasUnsavedChanges}
            onClick={() => void handleSave()}
            className="inline-flex items-center justify-center gap-2 px-6 min-h-[44px] rounded-xl bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-55 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-[0.14em] shadow-md cursor-pointer transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Saving Controls...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-[#C5A04A]" aria-hidden="true" />
                <span>Save Visibility Controls</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
