import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  Loader2,
  Music,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  GalleryItem,
  MusicTrack,
  SiteContentData,
  SongSuggestion,
  SongSuggestionStatus
} from '../../types';
import {
  createMusicTrackAdmin,
  deleteMusicTrackAdmin,
  deleteSongSuggestionAdmin,
  updateMusicTrackAdmin,
  updateSongSuggestionStatusAdmin,
  uploadGalleryMediaFiles
} from '../../services/weddingRepository';
import {
  AUDIO_FILE_INPUT_ACCEPT,
  createSelectedAudioEntry,
  formatFileSize
} from '../../utils/uploadValidation';

interface AdminMusicLibraryPanelProps {
  draftContent: SiteContentData;
  onToggleGlobalMusic: (enabled: boolean) => Promise<void>;
  onSyncDefaultSongToSiteContent: (track: {
    title: string;
    artist: string;
    fileUrl: string;
    driveFileId: string;
    fileName: string;
  }) => Promise<void>;
  musicTracks: MusicTrack[];
  songSuggestions: SongSuggestion[];
  existingAudioGalleryItems: GalleryItem[];
  coupleNames: string;
  maxAudioBytes: number;
  onRefreshData: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onNeedsDriveReconnect: () => void;
}

const SUGGESTION_STATUS_OPTIONS: Array<{ value: SongSuggestionStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'added', label: 'Added to music library' },
  { value: 'declined', label: 'Declined' }
];

function formatDateWAt(date: Date | null): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos'
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export const AdminMusicLibraryPanel: React.FC<AdminMusicLibraryPanelProps> = ({
  draftContent,
  onToggleGlobalMusic,
  onSyncDefaultSongToSiteContent,
  musicTracks,
  songSuggestions,
  existingAudioGalleryItems,
  coupleNames,
  maxAudioBytes,
  onRefreshData,
  onNotify,
  onNeedsDriveReconnect
}) => {
  // Add-song form state
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [newDriveFileId, setNewDriveFileId] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newStorageProvider, setNewStorageProvider] = useState<
    'google_drive' | 'local_server' | 'site_asset'
  >('google_drive');
  const [newEnabled, setNewEnabled] = useState(true);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [linkedSuggestionId, setLinkedSuggestionId] = useState<string | null>(null);
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTrack, setSavingTrack] = useState(false);
  const addFormRef = useRef<HTMLDivElement | null>(null);
  const addAudioInputRef = useRef<HTMLInputElement | null>(null);

  // Per-track edit / replace / delete states
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetTrackRef = useRef<MusicTrack | null>(null);

  // Guest suggestions filter & delete
  const [suggestionFilter, setSuggestionFilter] = useState<'all' | SongSuggestionStatus>('all');
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [confirmDeleteSuggestionId, setConfirmDeleteSuggestionId] = useState<string | null>(null);

  const filteredSuggestions = useMemo(() => {
    if (suggestionFilter === 'all') return songSuggestions;
    return songSuggestions.filter((s) => s.status === suggestionFilter);
  }, [songSuggestions, suggestionFilter]);

  const newSuggestionsCount = useMemo(
    () => songSuggestions.filter((s) => s.status === 'new').length,
    [songSuggestions]
  );

  const uploadSingleAudioFile = async (
    file: File,
    captionLabel: string,
    onProgress: (pct: number) => void
  ): Promise<{
    fileUrl: string;
    driveFileId: string;
    fileName: string;
    storageProvider: 'google_drive' | 'local_server';
  } | null> => {
    const entry = createSelectedAudioEntry(file, maxAudioBytes);
    if (!entry.isValid || entry.mediaType !== 'audio') {
      setFormError(
        entry.validationError || 'Please select an MP3, M4A, or AAC audio file up to 50 MB.'
      );
      return null;
    }

    const outcome = await uploadGalleryMediaFiles({
      entries: [{ id: entry.id, file }],
      guestName: coupleNames,
      caption: captionLabel || file.name,
      category: 'admin_music',
      isAdmin: true,
      forceStatus: 'hidden',
      onProgress
    });

    if (outcome.needsDriveReconnect) {
      onNeedsDriveReconnect();
    }

    if (outcome.createdItems.length > 0) {
      const created = outcome.createdItems[0];
      return {
        fileUrl: created.fileUrl,
        driveFileId: created.driveFileId,
        fileName: file.name,
        storageProvider: created.storageProvider === 'local_server' ? 'local_server' : 'google_drive'
      };
    }

    const errMsg =
      outcome.results[0]?.errorMessage ||
      outcome.globalError ||
      'Could not upload the audio file. Please try again.';
    setFormError(errMsg);
    return null;
  };

  const handleUploadNewTrackAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (addAudioInputRef.current) addAudioInputRef.current.value = '';
    if (!file || uploadingAudio) return;

    setFormError(null);
    setUploadingAudio(true);
    setUploadProgress(0);

    try {
      const uploaded = await uploadSingleAudioFile(
        file,
        newTitle.trim() ? `${newTitle.trim()} - ${newArtist.trim() || 'Wedding'}` : file.name,
        setUploadProgress
      );
      if (uploaded) {
        setNewFileUrl(uploaded.fileUrl);
        setNewDriveFileId(uploaded.driveFileId);
        setNewFileName(uploaded.fileName);
        setNewStorageProvider(uploaded.storageProvider);
        if (!newTitle.trim()) {
          setNewTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 120));
        }
        onNotify('success', `Audio file "${file.name}" uploaded. Click "Add Song to Library" to publish.`);
      }
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleAddTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTrack || uploadingAudio) return;
    setFormError(null);

    const cleanTitle = newTitle.trim();
    const cleanArtist = newArtist.trim();
    if (!cleanTitle) {
      setFormError('Please enter a song title.');
      return;
    }
    if (!cleanArtist) {
      setFormError('Please enter an artist name.');
      return;
    }
    if (!newFileUrl.trim() || newFileUrl.trim().startsWith('blob:')) {
      setFormError('Please upload an authorized audio file (MP3, M4A, AAC) or choose an existing uploaded audio file.');
      return;
    }

    setSavingTrack(true);
    try {
      const shouldBeDefault = newIsDefault || musicTracks.length === 0;
      const nextOrder =
        musicTracks.length > 0 ? Math.max(...musicTracks.map((t) => t.order)) + 1 : 0;

      // Clear existing default flag if this track becomes the default
      if (shouldBeDefault) {
        const currentDefaults = musicTracks.filter((t) => t.isDefault);
        for (const prev of currentDefaults) {
          await updateMusicTrackAdmin(prev.id, {
            title: prev.title,
            artist: prev.artist,
            fileUrl: prev.fileUrl,
            driveFileId: prev.driveFileId,
            fileName: prev.fileName,
            storageProvider: prev.storageProvider,
            enabled: prev.enabled,
            isDefault: false,
            order: prev.order
          });
        }
      }

      const created = await createMusicTrackAdmin({
        title: cleanTitle,
        artist: cleanArtist,
        fileUrl: newFileUrl.trim(),
        driveFileId: newDriveFileId,
        fileName: newFileName,
        storageProvider: newStorageProvider,
        enabled: newEnabled,
        isDefault: shouldBeDefault,
        order: nextOrder
      });

      if (shouldBeDefault) {
        await onSyncDefaultSongToSiteContent({
          title: created.title,
          artist: created.artist,
          fileUrl: created.fileUrl,
          driveFileId: created.driveFileId,
          fileName: created.fileName
        });
      }

      if (linkedSuggestionId) {
        await updateSongSuggestionStatusAdmin(linkedSuggestionId, 'added').catch(() => undefined);
      }

      setNewTitle('');
      setNewArtist('');
      setNewFileUrl('');
      setNewDriveFileId('');
      setNewFileName('');
      setNewEnabled(true);
      setNewIsDefault(false);
      setLinkedSuggestionId(null);
      setShowAudioPicker(false);

      await onRefreshData();
      onNotify('success', `"${created.title}" added to the wedding music library.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to add song to the library.');
    } finally {
      setSavingTrack(false);
    }
  };

  const handleImportLegacyTrack = async () => {
    if (!draftContent.musicAudioUrl) return;
    setSavingTrack(true);
    try {
      await createMusicTrackAdmin({
        title: draftContent.musicTitle || 'Perfect',
        artist: draftContent.musicArtist || 'Ed Sheeran',
        fileUrl: draftContent.musicAudioUrl,
        driveFileId: draftContent.musicAudioFileId || '',
        fileName: draftContent.musicAudioFileName || '',
        storageProvider: draftContent.musicAudioFileId ? 'google_drive' : 'site_asset',
        enabled: true,
        isDefault: true,
        order: 0
      });
      await onRefreshData();
      onNotify('success', 'Your existing wedding song has been imported into the Music Library.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not import existing track.');
    } finally {
      setSavingTrack(false);
    }
  };

  const handleSaveTrackEdit = async (track: MusicTrack) => {
    const cleanTitle = editTitle.trim();
    const cleanArtist = editArtist.trim();
    if (!cleanTitle || !cleanArtist) return;

    setBusyTrackId(track.id);
    try {
      await updateMusicTrackAdmin(track.id, {
        title: cleanTitle,
        artist: cleanArtist,
        fileUrl: track.fileUrl,
        driveFileId: track.driveFileId,
        fileName: track.fileName,
        storageProvider: track.storageProvider,
        enabled: track.enabled,
        isDefault: track.isDefault,
        order: track.order
      });
      if (track.isDefault) {
        await onSyncDefaultSongToSiteContent({
          title: cleanTitle,
          artist: cleanArtist,
          fileUrl: track.fileUrl,
          driveFileId: track.driveFileId,
          fileName: track.fileName
        });
      }
      setEditingTrackId(null);
      await onRefreshData();
      onNotify('success', `Updated "${cleanTitle}".`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not update song.');
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleToggleTrackEnabled = async (track: MusicTrack) => {
    setBusyTrackId(track.id);
    try {
      await updateMusicTrackAdmin(track.id, {
        title: track.title,
        artist: track.artist,
        fileUrl: track.fileUrl,
        driveFileId: track.driveFileId,
        fileName: track.fileName,
        storageProvider: track.storageProvider,
        enabled: !track.enabled,
        isDefault: track.isDefault,
        order: track.order
      });
      await onRefreshData();
      onNotify(
        'success',
        !track.enabled
          ? `"${track.title}" enabled and available for puzzle winners.`
          : `"${track.title}" disabled and hidden from guests.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not update song status.');
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleSetDefaultTrack = async (track: MusicTrack) => {
    setBusyTrackId(track.id);
    try {
      for (const item of musicTracks) {
        const shouldBeDefault = item.id === track.id;
        if (item.isDefault !== shouldBeDefault) {
          await updateMusicTrackAdmin(item.id, {
            title: item.title,
            artist: item.artist,
            fileUrl: item.fileUrl,
            driveFileId: item.driveFileId,
            fileName: item.fileName,
            storageProvider: item.storageProvider,
            enabled: shouldBeDefault ? true : item.enabled,
            isDefault: shouldBeDefault,
            order: item.order
          });
        }
      }
      await onSyncDefaultSongToSiteContent({
        title: track.title,
        artist: track.artist,
        fileUrl: track.fileUrl,
        driveFileId: track.driveFileId,
        fileName: track.fileName
      });
      await onRefreshData();
      onNotify('success', `"${track.title}" set as the default opening wedding song.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not set default song.');
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleReorderTrack = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= musicTracks.length) return;
    const current = musicTracks[index];
    const swapWith = musicTracks[targetIdx];
    setBusyTrackId(current.id);
    try {
      await Promise.all([
        updateMusicTrackAdmin(current.id, {
          title: current.title,
          artist: current.artist,
          fileUrl: current.fileUrl,
          driveFileId: current.driveFileId,
          fileName: current.fileName,
          storageProvider: current.storageProvider,
          enabled: current.enabled,
          isDefault: current.isDefault,
          order: targetIdx
        }),
        updateMusicTrackAdmin(swapWith.id, {
          title: swapWith.title,
          artist: swapWith.artist,
          fileUrl: swapWith.fileUrl,
          driveFileId: swapWith.driveFileId,
          fileName: swapWith.fileName,
          storageProvider: swapWith.storageProvider,
          enabled: swapWith.enabled,
          isDefault: swapWith.isDefault,
          order: index
        })
      ]);
      await onRefreshData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not reorder songs.');
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleReplaceTrackAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetTrack = replaceTargetTrackRef.current;
    if (replaceInputRef.current) replaceInputRef.current.value = '';
    if (!file || !targetTrack || replacingTrackId) return;

    setReplacingTrackId(targetTrack.id);
    setReplaceProgress(0);
    setFormError(null);
    try {
      const uploaded = await uploadSingleAudioFile(
        file,
        `${targetTrack.title} - ${targetTrack.artist}`,
        setReplaceProgress
      );
      if (uploaded) {
        await updateMusicTrackAdmin(targetTrack.id, {
          title: targetTrack.title,
          artist: targetTrack.artist,
          fileUrl: uploaded.fileUrl,
          driveFileId: uploaded.driveFileId,
          fileName: uploaded.fileName,
          storageProvider: uploaded.storageProvider,
          enabled: targetTrack.enabled,
          isDefault: targetTrack.isDefault,
          order: targetTrack.order
        });
        if (targetTrack.isDefault) {
          await onSyncDefaultSongToSiteContent({
            title: targetTrack.title,
            artist: targetTrack.artist,
            fileUrl: uploaded.fileUrl,
            driveFileId: uploaded.driveFileId,
            fileName: uploaded.fileName
          });
        }
        await onRefreshData();
        onNotify('success', `Audio file replaced for "${targetTrack.title}".`);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not replace audio file.');
    } finally {
      setReplacingTrackId(null);
      replaceTargetTrackRef.current = null;
    }
  };

  const handleDeleteTrack = async (track: MusicTrack) => {
    setBusyTrackId(track.id);
    try {
      await deleteMusicTrackAdmin(track.id);
      setConfirmDeleteTrackId(null);
      await onRefreshData();
      onNotify('success', `"${track.title}" removed from the music library.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not delete song.');
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleUseSuggestionToAdd = (suggestion: SongSuggestion) => {
    setNewTitle(suggestion.title);
    setNewArtist(suggestion.artist || '');
    setNewFileUrl('');
    setNewDriveFileId('');
    setNewFileName('');
    setLinkedSuggestionId(suggestion.id);
    setFormError(null);
    addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      {/* Hidden input for replacing audio of an existing track */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={AUDIO_FILE_INPUT_ACCEPT}
        onChange={(e) => void handleReplaceTrackAudioFile(e)}
        className="sr-only"
      />

      {/* Global Music Header & Toggle */}
      <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#C5A04A]/40 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Music className="w-5 h-5 text-[#07543E] mt-1 shrink-0" />
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#07543E]">
                Music Library &amp; Song Suggestions
              </h2>
              <p className="text-xs sm:text-sm text-[#262820]/75 mt-1 leading-relaxed">
                Manage songs available for website playback and the puzzle completion reward, and review private guest song requests separately below.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            disabled={togglingGlobal}
            aria-checked={draftContent.musicEnabled !== false}
            onClick={async () => {
              setTogglingGlobal(true);
              try {
                await onToggleGlobalMusic(!(draftContent.musicEnabled !== false));
              } finally {
                setTogglingGlobal(false);
              }
            }}
            className={`inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg border text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors shrink-0 ${
              draftContent.musicEnabled !== false
                ? 'bg-[#07543E] text-white border-[#07543E]'
                : 'bg-white text-[#262820]/75 border-[#07543E]/25'
            }`}
          >
            {togglingGlobal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {draftContent.musicEnabled !== false
                ? 'Website Music Enabled'
                : 'Website Music Disabled'}
            </span>
          </button>
        </div>

        {musicTracks.length === 0 && draftContent.musicAudioUrl && (
          <div className="p-4 rounded-xl bg-[#F2EBDD]/80 border border-[#C5A04A]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-[#262820]/85">
              <p className="font-semibold text-[#07543E]">
                Existing default song detected: {draftContent.musicTitle || 'Perfect'} —{' '}
                {draftContent.musicArtist || 'Ed Sheeran'}
              </p>
              <p className="text-xs text-[#262820]/70 mt-0.5">
                Import it into the multi-song library so you can manage it alongside additional puzzle-reward tracks.
              </p>
            </div>
            <button
              type="button"
              disabled={savingTrack}
              onClick={() => void handleImportLegacyTrack()}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] text-white text-xs font-semibold uppercase tracking-wider cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-[#F3E5AB]" />
              <span>Import Existing Song</span>
            </button>
          </div>
        )}
      </section>

      {/* ====================================================================
          AREA A: AVAILABLE SONGS (ADMIN-CONTROLLED MUSIC LIBRARY)
      ==================================================================== */}
      <section
        ref={addFormRef}
        className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-6"
      >
        <div className="border-b border-[#07543E]/10 pb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
            Area A · Admin-Curated Library
          </p>
          <h3 className="font-serif text-2xl font-semibold text-[#07543E] mt-0.5">
            Available Songs ({musicTracks.length})
          </h3>
          <p className="text-xs sm:text-sm text-[#262820]/75 mt-1">
            Only enabled songs with an authorized audio file appear in the guest puzzle reward song picker.
          </p>
        </div>

        {/* Add New Song Form */}
        <form
          onSubmit={(e) => void handleAddTrackSubmit(e)}
          className="p-5 rounded-xl bg-[#FAF7F0] border border-[#C5A04A]/35 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-serif text-lg font-semibold text-[#07543E]">
              Add a Song to the Library
            </h4>
            {linkedSuggestionId && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#07543E]/10 border border-[#07543E]/25 text-xs text-[#07543E]">
                <Sparkles className="w-3.5 h-3.5 text-[#C5A04A]" />
                <span>Pre-filled from guest suggestion — upload/select audio to publish</span>
                <button
                  type="button"
                  onClick={() => setLinkedSuggestionId(null)}
                  aria-label="Clear suggestion link"
                  className="p-0.5 hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="lib-song-title"
                className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
              >
                Song Title <span className="text-red-700">*</span>
              </label>
              <input
                id="lib-song-title"
                type="text"
                maxLength={120}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Perfect"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>

            <div>
              <label
                htmlFor="lib-song-artist"
                className="block text-xs font-semibold uppercase tracking-wider text-[#07543E] mb-1.5"
              >
                Artist Name <span className="text-red-700">*</span>
              </label>
              <input
                id="lib-song-artist"
                type="text"
                maxLength={120}
                value={newArtist}
                onChange={(e) => setNewArtist(e.target.value)}
                placeholder="e.g. Ed Sheeran"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-[#07543E]/20 bg-white"
              />
            </div>
          </div>

          {/* Audio Upload or Existing Picker */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <label
                htmlFor="lib-song-audio-upload"
                className={`inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold uppercase tracking-wider ${
                  uploadingAudio ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                }`}
              >
                {uploadingAudio ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 text-[#C5A04A]" />
                )}
                <span>
                  {uploadingAudio ? `Uploading (${uploadProgress}%)...` : 'Upload Audio File'}
                </span>
              </label>
              <input
                ref={addAudioInputRef}
                id="lib-song-audio-upload"
                type="file"
                accept={AUDIO_FILE_INPUT_ACCEPT}
                disabled={uploadingAudio}
                onChange={(e) => void handleUploadNewTrackAudio(e)}
                className="sr-only"
              />

              <button
                type="button"
                onClick={() => setShowAudioPicker((prev) => !prev)}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-[#07543E]/25 bg-white hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                <Music className="w-4 h-4 text-[#C5A04A]" />
                <span>
                  {showAudioPicker
                    ? 'Hide Existing Audio'
                    : `Choose Uploaded Audio (${existingAudioGalleryItems.length})`}
                </span>
              </button>

              {newFileUrl && (
                <span className="text-xs font-medium text-[#07543E] inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#C5A04A]" />
                  <span className="truncate max-w-[240px]">
                    {newFileName || 'Audio file ready'}
                  </span>
                </span>
              )}
            </div>

            {showAudioPicker && (
              <div className="p-3.5 rounded-lg bg-white border border-[#07543E]/15 max-h-52 overflow-y-auto divide-y divide-[#07543E]/10">
                {existingAudioGalleryItems.length === 0 ? (
                  <p className="text-xs text-[#262820]/65 py-2">
                    No audio files uploaded to Google Drive yet. Click &ldquo;Upload Audio File&rdquo; above.
                  </p>
                ) : (
                  existingAudioGalleryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setNewFileUrl(item.fileUrl);
                        setNewDriveFileId(item.driveFileId);
                        setNewFileName(item.title);
                        setNewStorageProvider(
                          item.storageProvider === 'local_server' ? 'local_server' : 'google_drive'
                        );
                        setShowAudioPicker(false);
                      }}
                      className="w-full py-2.5 px-2 text-left flex items-center justify-between gap-2 hover:bg-[#FAF7F0] rounded cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#07543E] truncate">{item.title}</p>
                        <p className="text-xs text-[#262820]/65">
                          {formatFileSize(item.sizeBytes)} · {item.mimeType}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#C5A04A] shrink-0">Select</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {newFileUrl && (
              <audio
                key={newFileUrl}
                controls
                preload="metadata"
                src={newFileUrl}
                className="w-full h-10"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#07543E]/10">
            <div className="flex flex-wrap items-center gap-5 text-xs sm:text-sm text-[#262820]">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEnabled}
                  onChange={(e) => setNewEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#07543E]"
                />
                <span>Enabled for guests</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsDefault || musicTracks.length === 0}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                  className="w-4 h-4 accent-[#07543E]"
                />
                <span>Set as default opening song</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingTrack || uploadingAudio}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg bg-[#07543E] hover:bg-[#073B2B] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              {savingTrack ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 text-[#F3E5AB]" />
              )}
              <span>Add Song to Library</span>
            </button>
          </div>
        </form>

        {/* Songs List */}
        {musicTracks.length === 0 ? (
          <div className="p-6 rounded-xl bg-white border border-dashed border-[#07543E]/20 text-center text-sm text-[#262820]/70">
            No songs in the library yet. Upload an authorized MP3, M4A, or AAC track above to start building your wedding playlist.
          </div>
        ) : (
          <div className="space-y-3">
            {musicTracks.map((track, idx) => {
              const isEditing = editingTrackId === track.id;
              const isBusy = busyTrackId === track.id || replacingTrackId === track.id;

              return (
                <article
                  key={track.id}
                  className={`p-4 sm:p-5 rounded-xl border transition-colors ${
                    track.enabled
                      ? 'bg-white border-[#07543E]/15'
                      : 'bg-[#F2EBDD]/45 border-[#07543E]/10 opacity-85'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="text"
                            maxLength={120}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            aria-label="Edit song title"
                            className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-[#07543E]/25 bg-white"
                          />
                          <input
                            type="text"
                            maxLength={120}
                            value={editArtist}
                            onChange={(e) => setEditArtist(e.target.value)}
                            aria-label="Edit artist name"
                            className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-[#07543E]/25 bg-white"
                          />
                          <div className="sm:col-span-2 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSaveTrackEdit(track)}
                              className="inline-flex items-center gap-1 px-3.5 min-h-[40px] rounded-lg bg-[#07543E] text-white text-xs font-semibold cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTrackId(null)}
                              className="inline-flex items-center gap-1 px-3.5 min-h-[40px] rounded-lg border border-[#07543E]/20 text-xs font-semibold text-[#262820] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-serif text-lg sm:text-xl font-semibold text-[#07543E]">
                              {track.title}
                            </h4>
                            {track.isDefault && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#07543E] text-[#F3E5AB] text-[11px] font-semibold">
                                <Star className="w-3 h-3 fill-current" /> Default
                              </span>
                            )}
                            {!track.enabled && (
                              <span className="px-2 py-0.5 rounded bg-stone-200 text-[#262820] text-[11px] font-semibold">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#262820]/75">
                            {track.artist}
                            {track.fileName ? ` · ${track.fileName}` : ''}
                          </p>
                        </div>
                      )}

                      <audio
                        key={track.fileUrl}
                        controls
                        preload="metadata"
                        src={track.fileUrl}
                        className="w-full max-w-md h-9"
                      />
                    </div>

                    {/* Track Controls */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0 || isBusy}
                        onClick={() => void handleReorderTrack(idx, -1)}
                        aria-label={`Move ${track.title} up`}
                        className="w-10 h-10 rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] disabled:opacity-40 flex items-center justify-center text-[#07543E] cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === musicTracks.length - 1 || isBusy}
                        onClick={() => void handleReorderTrack(idx, 1)}
                        aria-label={`Move ${track.title} down`}
                        className="w-10 h-10 rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] disabled:opacity-40 flex items-center justify-center text-[#07543E] cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      {!track.isDefault && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleSetDefaultTrack(track)}
                          className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-lg border border-[#C5A04A]/60 bg-[#FAF7F0] hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 text-[#C5A04A]" />
                          <span>Set Default</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleTrackEnabled(track)}
                        className="px-3 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer"
                      >
                        {track.enabled ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingTrackId(track.id);
                          setEditTitle(track.title);
                          setEditArtist(track.artist);
                        }}
                        className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          replaceTargetTrackRef.current = track;
                          replaceInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-lg border border-[#07543E]/20 bg-white hover:bg-[#FAF7F0] text-xs font-semibold text-[#07543E] cursor-pointer"
                      >
                        {replacingTrackId === track.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-[#C5A04A]" />
                        )}
                        <span>
                          {replacingTrackId === track.id
                            ? `Replacing (${replaceProgress}%)`
                            : 'Replace Audio'}
                        </span>
                      </button>

                      {confirmDeleteTrackId === track.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteTrack(track)}
                            className="px-3 min-h-[40px] rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTrackId(null)}
                            className="px-2.5 min-h-[40px] rounded-lg border border-[#07543E]/20 text-xs text-[#262820] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteTrackId(track.id)}
                          aria-label={`Delete ${track.title}`}
                          className="w-10 h-10 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ====================================================================
          AREA B: PRIVATE GUEST SONG SUGGESTIONS
      ==================================================================== */}
      <section className="p-6 sm:p-8 rounded-xl bg-[#FFFDF8] border border-[#07543E]/15 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#07543E]/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#737746] font-semibold">
              Area B · Private Guest Requests (Admin Only)
            </p>
            <h3 className="font-serif text-2xl font-semibold text-[#07543E] mt-0.5">
              Guest Song Suggestions ({songSuggestions.length})
              {newSuggestionsCount > 0 && (
                <span className="ml-2 text-xs font-sans font-semibold text-[#C5A04A] align-middle">
                  · {newSuggestionsCount} new
                </span>
              )}
            </h3>
            <p className="text-xs sm:text-sm text-[#262820]/75 mt-1">
              Guests can submit requests after completing the puzzle, but cannot view this list or publish tracks. Use &ldquo;Use to Add Song&rdquo; to pre-fill Area A and upload an authorized audio file.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'new', 'reviewed', 'added', 'declined'] as const).map((statusKey) => (
              <button
                key={statusKey}
                type="button"
                onClick={() => setSuggestionFilter(statusKey)}
                className={`px-3 min-h-[38px] rounded-lg text-xs font-semibold capitalize cursor-pointer transition-colors ${
                  suggestionFilter === statusKey
                    ? 'bg-[#07543E] text-white'
                    : 'bg-white border border-[#07543E]/15 text-[#262820] hover:border-[#C5A04A]'
                }`}
              >
                {statusKey === 'added' ? 'Added' : statusKey}
              </button>
            ))}
          </div>
        </div>

        {filteredSuggestions.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#FAF7F0] border border-dashed border-[#07543E]/15 text-center text-sm text-[#262820]/70">
            No guest song suggestions match this filter yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#07543E]/12 bg-white">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F2EBDD]/70 text-xs uppercase tracking-wider text-[#07543E] border-b border-[#07543E]/12">
                  <th className="py-3 px-4 font-semibold">Song Title</th>
                  <th className="py-3 px-4 font-semibold">Artist</th>
                  <th className="py-3 px-4 font-semibold">Submitted</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#07543E]/10">
                {filteredSuggestions.map((sugg) => {
                  const isBusy = busySuggestionId === sugg.id;
                  return (
                    <tr key={sugg.id} className="hover:bg-[#FAF7F0]/60">
                      <td className="py-3.5 px-4 font-medium text-[#07543E]">{sugg.title}</td>
                      <td className="py-3.5 px-4 text-[#262820]/80">{sugg.artist || '—'}</td>
                      <td className="py-3.5 px-4 text-xs text-[#262820]/70 whitespace-nowrap">
                        {formatDateWAt(sugg.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Status for ${sugg.title}`}
                          value={sugg.status}
                          disabled={isBusy}
                          onChange={async (e) => {
                            const nextStatus = e.target.value as SongSuggestionStatus;
                            setBusySuggestionId(sugg.id);
                            try {
                              await updateSongSuggestionStatusAdmin(sugg.id, nextStatus);
                              await onRefreshData();
                            } catch (err) {
                              onNotify(
                                'error',
                                err instanceof Error ? err.message : 'Unable to update status.'
                              );
                            } finally {
                              setBusySuggestionId(null);
                            }
                          }}
                          className="px-2.5 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg border border-[#07543E]/20 bg-[#FAF7F0] text-[#07543E]"
                        >
                          {SUGGESTION_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUseSuggestionToAdd(sugg)}
                            className="inline-flex items-center gap-1 px-3 min-h-[38px] rounded-lg border border-[#C5A04A]/60 bg-[#FAF7F0] hover:bg-[#F2EBDD] text-[#07543E] text-xs font-semibold cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#C5A04A]" />
                            <span>Use to Add Song</span>
                          </button>

                          {confirmDeleteSuggestionId === sugg.id ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBusySuggestionId(sugg.id);
                                try {
                                  await deleteSongSuggestionAdmin(sugg.id);
                                  setConfirmDeleteSuggestionId(null);
                                  await onRefreshData();
                                } catch (err) {
                                  onNotify(
                                    'error',
                                    err instanceof Error
                                      ? err.message
                                      : 'Unable to delete suggestion.'
                                  );
                                } finally {
                                  setBusySuggestionId(null);
                                }
                              }}
                              className="px-2.5 min-h-[38px] rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteSuggestionId(sugg.id)}
                              aria-label={`Delete suggestion ${sugg.title}`}
                              className="w-9 h-9 rounded-lg text-red-600 hover:bg-red-50 inline-flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
