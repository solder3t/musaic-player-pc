import { useEffect, useMemo, useRef, useState } from 'react'
import FolderSettings from '../settings/FolderSettings'
import AudioOutputSelect from '../settings/AudioOutputSelect'
import ChannelRoutingPanel from '../settings/ChannelRoutingPanel'
import DelayCompensationPanel from '../settings/DelayCompensationPanel'
import ConfirmActionModal from '../settings/ConfirmActionModal'
import BitPerfectModeWarningModal from '../settings/BitPerfectModeWarningModal'
import LocalApiPairingModal from '../settings/LocalApiPairingModal'
import KeybindSettings from '../settings/KeybindSettings'
import SettingsTransferWizard from '../settings/SettingsTransferWizard'
import ImportedListeningDataCard from '../settings/ImportedListeningDataCard'
import SettingsSegmentedControl, { type SettingsSegmentedOption } from '../settings/SettingsSegmentedControl'
import { renderPairingQrSvg } from '../../utils/pairingQr'
import { usePresence } from '../../hooks/usePresence'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import {
  DEFAULT_UI_SCALE_PERCENT,
  DEFAULT_JUMP_TO_PLAYING_DESTINATION,
  MAX_UI_SCALE_PERCENT,
  MIN_UI_SCALE_PERCENT,
  UI_SCALE_STEP_PERCENT,
  useUIStore,
  type HomeGreetingTextMode,
  type JumpToPlayingDestination,
  type TransportInfoLineMode
} from '../../stores/uiStore'
import {
  BIT_PERFECT_DSP_DISABLED_MESSAGE,
  DEFAULT_NORMALIZATION_TARGET_LUFS,
  useAudioSettingsStore,
  type ReplayGainMode
} from '../../stores/audioSettingsStore'
import { useVisualizerSettingsStore } from '../../stores/visualizerSettingsStore'
import { useAiSettingsStore, DEFAULT_MODELS, PROVIDER_MODEL_PRESETS } from '../../stores/aiSettingsStore'
import {
  DISCORD_PAUSE_CLEAR_MINUTE_PRESETS,
  useDiscordSettingsStore,
  type DiscordRpcCompactStatusMode,
  type DiscordRpcExpandedInfoMode,
  type DiscordRpcLinkDestination,
} from '../../stores/discordSettingsStore'
import { useLocalApiSettingsStore } from '../../stores/localApiSettingsStore'
import { usePhoneRemoteSettingsStore } from '../../stores/phoneRemoteSettingsStore'
import { useParallaxStore } from '../../stores/parallaxStore'
import { useLastFmSettingsStore } from '../../stores/lastFmSettingsStore'
import { useLyricsStore } from '../../stores/lyricsStore'
import { useLyricsDisplaySettingsStore } from '../../stores/lyricsDisplaySettingsStore'
import { useUpdateStore } from '../../stores/updateStore'
import { useDiagnosticsStore } from '../../stores/diagnosticsStore'
import { useGraphStore } from '../../stores/graphStore'
import { useListeningStatsStore } from '../../stores/listeningStatsStore'
import { useLibraryIntegrityStore } from '../../stores/libraryIntegrityStore'
import { useRatingsStore } from '../../stores/ratingsStore'
import RemoteServersPanel from '../settings/RemoteServersPanel'
import {
  SLEEP_TIMER_MAX_MINUTES,
  SLEEP_TIMER_MIN_MINUTES,
  SLEEP_TIMER_PRESET_MINUTES,
  useSleepTimerStore
} from '../../stores/sleepTimerStore'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../constants/settingsSections'
import {
  DEFAULT_THEME_ACCENT,
  THEME_PRESET_LIST,
  useThemeStore,
  type AccentSource,
  type CoverArtAccentMethod,
  type ThemePresetId
} from '../../stores/themeStore'
import {
  factoryResetApplication,
  resetAllSettings,
  resetAudioSettings,
  resetDiscordCoverArtCache,
  resetEqSettings,
  resetIntegrationSettings,
  resetMappedFolders,
  resetThemeSettings,
  resetTrackRatings,
} from '../settings/resetActions'
import type { MiniPlayerVisualizerMode } from '../../../types/miniPlayer'
import {
  LOCAL_API_DEFAULT_PORT,
  LOCAL_API_MAX_PORT,
  LOCAL_API_MIN_PORT
} from '../../../types/localApi'
import {
  PHONE_REMOTE_DEFAULT_PORT,
  PHONE_REMOTE_MAX_PORT,
  PHONE_REMOTE_MIN_PORT
} from '../../../types/phoneRemote'
import {
  LASTFM_OFFICIAL_PROFILE_ID,
  LISTENBRAINZ_OFFICIAL_PROFILE_ID,
  type LastFmProfileStatus,
  type LastFmScrobbleProtocol
} from '../../../types/lastFm'
import { LRCLIB_OFFICIAL_BASE_URL } from '../../../types/lyrics'
import type { AppBuildInfo } from '../../../types/appBuildInfo'
import type { CompanionApiScope } from '../../../types/companionApi'
import ParallaxSettingsPanel from '../parallax/ParallaxSettingsPanel'

type ResetActionId =
  | 'reset-theme'
  | 'reset-audio'
  | 'reset-integrations'
  | 'reset-discord-cover-art-cache'
  | 'reset-eq'
  | 'reset-all'
  | 'reset-ratings'
  | 'reset-listening-history'
  | 'reset-folders'
  | 'factory-reset'

type ResetActionState = 'idle' | 'running' | 'success' | 'error'
type NormalizationDisableStep = 'warning' | 'final' | null
type ReplayGainSelectorValue = ReplayGainMode | 'disabled'
const NORMALIZATION_TARGET_MIN_LUFS = -30
const NORMALIZATION_TARGET_MAX_LUFS = 0

const CUSTOM_SCROBBLE_PROTOCOLS: LastFmScrobbleProtocol[] = ['lastfm2', 'audioscrobbler', 'listenbrainz']

function getScrobbleProtocolLabel(protocol: LastFmScrobbleProtocol): string {
  if (protocol === 'audioscrobbler') return 'AudioScrobbler'
  if (protocol === 'listenbrainz') return 'ListenBrainz'
  return 'Last.fm 2.0'
}

const ACCENT_SOURCE_OPTIONS: readonly SettingsSegmentedOption<AccentSource>[] = [
  { value: 'theme', label: 'Theme Accent' },
  { value: 'cover-art', label: 'Cover Art' },
]

const COVER_ART_ACCENT_METHOD_OPTIONS: readonly SettingsSegmentedOption<CoverArtAccentMethod>[] = [
  { value: 'dominant', label: 'Dominant' },
  { value: 'vibrant', label: 'Vibrant' },
  { value: 'average', label: 'Average' },
]

const HOME_GREETING_TEXT_OPTIONS: readonly SettingsSegmentedOption<HomeGreetingTextMode>[] = [
  { value: 'messages', label: 'Messages' },
  { value: 'clock', label: 'Clock' },
  { value: 'off', label: 'Off' },
]

const TRANSPORT_INFO_LINE_OPTIONS: readonly SettingsSegmentedOption<TransportInfoLineMode>[] = [
  { value: 'output', label: 'Output Device' },
  { value: 'album', label: 'Album' },
  { value: 'hidden', label: 'Hidden' },
]

const REPLAYGAIN_OPTIONS: readonly SettingsSegmentedOption<ReplayGainSelectorValue>[] = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'auto', label: 'Auto' },
  { value: 'track', label: 'Track' },
  { value: 'album', label: 'Album' },
]

const MINI_PLAYER_VISUALIZER_OPTIONS: readonly SettingsSegmentedOption<MiniPlayerVisualizerMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'oscilloscope', label: 'Oscilloscope' },
  { value: 'spectrum', label: 'Spectrum' },
]

const JUMP_TO_PLAYING_OPTIONS: readonly SettingsSegmentedOption<JumpToPlayingDestination>[] = [
  { value: 'smart-source', label: 'Smart Source' },
  { value: 'library-tracks', label: 'Library Tracks' },
  { value: 'album', label: 'Album' },
  { value: 'artist', label: 'Artist' },
  { value: 'queue', label: 'Queue' },
]

const DISCORD_COMPACT_STATUS_OPTIONS: readonly SettingsSegmentedOption<DiscordRpcCompactStatusMode>[] = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
]

const DISCORD_EXPANDED_INFO_OPTIONS: readonly SettingsSegmentedOption<DiscordRpcExpandedInfoMode>[] = [
  { value: 'file-info', label: 'File Info' },
  { value: 'album', label: 'Album' },
]

const DISCORD_LINK_DESTINATION_OPTIONS: readonly SettingsSegmentedOption<DiscordRpcLinkDestination>[] = [
  { value: 'ytmusic', label: 'YT Music' },
  { value: 'lastfm', label: 'Last.fm' },
  { value: 'off', label: 'Off' },
]

const DISCORD_PAUSE_CLEAR_OPTIONS: readonly SettingsSegmentedOption<number>[] = DISCORD_PAUSE_CLEAR_MINUTE_PRESETS.map(
  (minutes) => ({ value: minutes, label: minutes === 0 ? 'Off' : `${minutes}m` })
)

const CUSTOM_SCROBBLE_PROTOCOL_OPTIONS: readonly SettingsSegmentedOption<LastFmScrobbleProtocol>[] = CUSTOM_SCROBBLE_PROTOCOLS.map(
  (protocol) => ({ value: protocol, label: getScrobbleProtocolLabel(protocol) })
)

function getDefaultScrobbleProfileName(protocol: LastFmScrobbleProtocol): string {
  if (protocol === 'audioscrobbler') return 'AudioScrobbler endpoint'
  if (protocol === 'listenbrainz') return 'ListenBrainz endpoint'
  return 'Custom endpoint'
}

function getScrobbleUrlPlaceholder(protocol: LastFmScrobbleProtocol): string {
  if (protocol === 'audioscrobbler') return 'http://post.audioscrobbler.com/'
  if (protocol === 'listenbrainz') return 'https://api.listenbrainz.org'
  return 'http://localhost:9078/2.0/'
}

function getScrobbleUsernameLabel(protocol: LastFmScrobbleProtocol): string {
  if (protocol === 'listenbrainz') return 'Username Label (optional)'
  return 'Username Label'
}

function getScrobbleSecretLabel(protocol: LastFmScrobbleProtocol): string {
  if (protocol === 'audioscrobbler') return 'Password or API Key'
  if (protocol === 'listenbrainz') return 'Auth Token'
  return 'Session Key or Token'
}

function isScrobbleUsernameRequired(protocol: LastFmScrobbleProtocol): boolean {
  return protocol !== 'listenbrainz'
}

interface ResetActionStatus {
  state: ResetActionState
  message: string
}

interface ResetActionDefinition {
  id: ResetActionId
  title: string
  description: string
  buttonLabel: string
  confirmTitle: string
  confirmMessage: string
  confirmLabel: string
  destructive: boolean
  typedPhrase?: string
  disabled?: boolean
  run: () => Promise<string | void>
}

const RESET_ACTION_IDS: ResetActionId[] = [
  'reset-theme',
  'reset-audio',
  'reset-integrations',
  'reset-discord-cover-art-cache',
  'reset-eq',
  'reset-all',
  'reset-ratings',
  'reset-listening-history',
  'reset-folders',
  'factory-reset',
]

const MUSAIC_REPOSITORY_URL = 'https://github.com/solder3t/musaic-player-pc'
const MUSAIC_LICENSE_URL = 'https://github.com/solder3t/musaic-player-pc/blob/main/LICENSE'
const GPL_V3_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'
const BIT_PERFECT_WARNING_DISMISSED_STORAGE_KEY = 'musaic-bitperfect-warning-dismissed-v1'
const DEVELOPER_SETTINGS_VISIBILITY_STORAGE_KEY = 'musaic-settings-developer-section-visible-v1'
const DEVELOPER_SETTINGS_SECTION_ID: SettingsSectionId = 'developer'
const DEVELOPER_SETTINGS_REVEAL_CLICK_TARGET = 7
const DEVELOPER_SETTINGS_REVEAL_RESET_MS = 2500

function buildInitialResetStatusMap(): Record<ResetActionId, ResetActionStatus> {
  return RESET_ACTION_IDS.reduce((acc, actionId) => {
    acc[actionId] = { state: 'idle', message: '' }
    return acc
  }, {} as Record<ResetActionId, ResetActionStatus>)
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(trimmed)
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (!fullMatch) return null
  return `#${fullMatch[1].toLowerCase()}`
}

function formatSleepTimerRemaining(remainingMs: number): string {
  const safeMs = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0
  const totalSeconds = Math.max(0, Math.ceil(safeMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function parseSleepTimerMinutesInput(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return null
  if (parsed < SLEEP_TIMER_MIN_MINUTES || parsed > SLEEP_TIMER_MAX_MINUTES) return null
  return parsed
}

function formatNormalizationTargetLufs(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function parseNormalizationTargetLufsInput(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  if (parsed < NORMALIZATION_TARGET_MIN_LUFS || parsed > NORMALIZATION_TARGET_MAX_LUFS) return null
  return Math.round(parsed * 10) / 10
}

function readDeveloperSectionVisibilityPreference(): boolean {
  try {
    return localStorage.getItem(DEVELOPER_SETTINGS_VISIBILITY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistDeveloperSectionVisibilityPreference(visible: boolean): void {
  try {
    localStorage.setItem(DEVELOPER_SETTINGS_VISIBILITY_STORAGE_KEY, visible ? '1' : '0')
  } catch {
    // Ignore storage failures and continue with in-memory visibility.
  }
}

function formatBuildLabel(buildInfo: AppBuildInfo): string {
  const shortCommitHash = buildInfo.shortCommitHash ?? buildInfo.commitHash?.slice(0, 7)
  if (!shortCommitHash) return ''
  return `${shortCommitHash}${buildInfo.isDirty ? '*' : ''}`
}

function formatBuildCopyValue(buildInfo: AppBuildInfo): string {
  return buildInfo.commitHash ?? ''
}

function formatBuildTooltip(buildInfo: AppBuildInfo): string | undefined {
  if (!buildInfo.commitHash) return undefined
  return `Commit: ${buildInfo.commitHash}${buildInfo.isDirty ? '\nWorking tree was dirty when this build started.' : ''}\nClick to copy the full commit hash.`
}

export default function SettingsView() {
  const [showFolderSettings, setShowFolderSettings] = useState(false)
  const [pendingResetId, setPendingResetId] = useState<ResetActionId | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id)
  const [developerSectionVisible, setDeveloperSectionVisible] = useState(() => readDeveloperSectionVisibilityPreference())
  const [appVersionLabel, setAppVersionLabel] = useState('Loading...')
  const [appBuildLabel, setAppBuildLabel] = useState('')
  const [appBuildTooltip, setAppBuildTooltip] = useState('')
  const [appBuildCopyValue, setAppBuildCopyValue] = useState('')
  const [localApiSelectedPairingBaseUrl, setLocalApiSelectedPairingBaseUrl] = useState('')
  const [localApiPairingModalOpen, setLocalApiPairingModalOpen] = useState(false)
  const [settingsTransferWizardOpen, setSettingsTransferWizardOpen] = useState(false)
  const [showInlinePhoneQr, setShowInlinePhoneQr] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showAiApiKey, setShowAiApiKey] = useState(false)
  const [resetStatuses, setResetStatuses] = useState<Record<ResetActionId, ResetActionStatus>>(
    () => buildInitialResetStatusMap()
  )
  const { rescan, forceRescanAll, backfillReplayGainMetadata, isScanning, isCancelingScan, cancelScan, scanProgress, scanStage } = useLibraryStore()
  const {
    presetId,
    customAccent,
    accentSource,
    coverArtAccentMethod,
    resolvedTokens,
    setPreset,
    setCustomAccent,
    usePresetAccent,
    setAccentSource,
    setCoverArtAccentMethod,
    resetToDefault: resetThemeToDefault,
  } = useThemeStore()
  const {
    isRunning,
    setIsRunning,
  } = useVisualizerSettingsStore()
  const replayGainScanEnabled = useAudioSettingsStore((state) => state.replayGainScanEnabled)
  const setReplayGainScanEnabled = useAudioSettingsStore((state) => state.setReplayGainScanEnabled)
  const replayGainMode = useAudioSettingsStore((state) => state.replayGainMode)
  const setReplayGainMode = useAudioSettingsStore((state) => state.setReplayGainMode)
  const normalizationEnabled = useAudioSettingsStore((state) => state.normalizationEnabled)
  const setNormalizationEnabled = useAudioSettingsStore((state) => state.setNormalizationEnabled)
  const normalizationTargetLufs = useAudioSettingsStore((state) => state.normalizationTargetLufs)
  const setNormalizationTargetLufs = useAudioSettingsStore((state) => state.setNormalizationTargetLufs)
  const playbackOutputMode = useAudioSettingsStore((state) => state.playbackOutputMode)
  const setPlaybackOutputMode = useAudioSettingsStore((state) => state.setPlaybackOutputMode)
  const disableGaplessPrebufferDev = useAudioSettingsStore((state) => state.disableGaplessPrebufferDev)
  const setDisableGaplessPrebufferDev = useAudioSettingsStore((state) => state.setDisableGaplessPrebufferDev)
  const disableStandardAnalysisGraphDev = useAudioSettingsStore((state) => state.disableStandardAnalysisGraphDev)
  const setDisableStandardAnalysisGraphDev = useAudioSettingsStore((state) => state.setDisableStandardAnalysisGraphDev)
  const nativeAudioCapabilities = useAudioSettingsStore((state) => state.nativeAudioCapabilities)
  const playbackModeStatusMessage = useAudioSettingsStore((state) => state.playbackModeStatusMessage)
  const showTracklistBpmKey = useLibraryStore((state) => state.showTracklistBpmKey)
  const setShowTracklistBpmKey = useLibraryStore((state) => state.setShowTracklistBpmKey)
  const showTracklistGenre = useLibraryStore((state) => state.showTracklistGenre)
  const setShowTracklistGenre = useLibraryStore((state) => state.setShowTracklistGenre)
  const showTracklistAddedDate = useLibraryStore((state) => state.showTracklistAddedDate)
  const setShowTracklistAddedDate = useLibraryStore((state) => state.setShowTracklistAddedDate)
  const showTracklistPlayCount = useLibraryStore((state) => state.showTracklistPlayCount)
  const setShowTracklistPlayCount = useLibraryStore((state) => state.setShowTracklistPlayCount)
  const artistBrowseMode = useLibraryStore((state) => state.artistBrowseMode)
  const setArtistBrowseMode = useLibraryStore((state) => state.setArtistBrowseMode)
  const {
    enabled: discordEnabled,
    coverArtEnabled: discordCoverArtEnabled,
    smallIconEnabled: discordSmallIconEnabled,
    compactStatusMode: discordCompactStatusMode,
    expandedInfoMode: discordExpandedInfoMode,
    linkDestination: discordLinkDestination,
    pauseClearMinutes: discordPauseClearMinutes,
    statusMessage: discordStatusMessage,
    setEnabled: setDiscordEnabled,
    setCoverArtEnabled: setDiscordCoverArtEnabled,
    setSmallIconEnabled: setDiscordSmallIconEnabled,
    setCompactStatusMode: setDiscordCompactStatusMode,
    setExpandedInfoMode: setDiscordExpandedInfoMode,
    setLinkDestination: setDiscordLinkDestination,
    setPauseClearMinutes: setDiscordPauseClearMinutes,
  } = useDiscordSettingsStore()

  const {
    settings: aiSettings,
    setProvider: setAiProvider,
    setApiKey: setAiApiKey,
    setModel: setAiModel,
    setServerUrl: setAiServerUrl,
    setAutoRomanize: setAiAutoRomanize,
    setAutoTranslate: setAiAutoTranslate,
    setTargetLanguage: setAiTargetLanguage
  } = useAiSettingsStore()
  const { provider, apiKey, model, serverUrl, autoRomanize, autoTranslate, targetLanguage } = aiSettings

  const {
    status: localApiStatus,
    errorMessage: localApiErrorMessage,
    init: initLocalApi,
    setEnabled: setLocalApiEnabled,
    setControlsEnabled: setLocalApiControlsEnabled,
    setLibrarySearchEnabled: setLocalApiLibrarySearchEnabled,
    setLibraryWriteEnabled: setLocalApiLibraryWriteEnabled,
    setPort: setLocalApiPort,
    rotateToken: rotateLocalApiToken,
  } = useLocalApiSettingsStore()
  const {
    status: phoneRemoteStatus,
    pairedDevices: phoneRemotePairedDevices,
    pendingPairingRequests: phoneRemotePendingPairingRequests,
    activePairingTicket: phoneRemoteActivePairingTicket,
    errorMessage: phoneRemoteErrorMessage,
    init: initPhoneRemote,
    setEnabled: setPhoneRemoteEnabled,
    setPort: setPhoneRemotePort,
    setSyncEnabled: setPhoneRemoteSyncEnabled,
    requestSync: requestPhoneRemoteSync,
    openSyncConflictResolver: openPhoneSyncConflictResolver,
    createPairingTicket: createPhoneRemotePairingTicket,
    clearActivePairingTicket: clearPhoneRemoteActivePairingTicket,
    approvePairingRequest: approvePhoneRemotePairingRequest,
    rejectPairingRequest: rejectPhoneRemotePairingRequest,
    revokePairedDevice: revokePhoneRemotePairedDevice,
    revokeAllPairedDevices: revokeAllPhoneRemotePairedDevices
  } = usePhoneRemoteSettingsStore()
  const {
    status: lastFmStatus,
    isAuthorizing: lastFmIsAuthorizing,
    errorMessage: lastFmErrorMessage,
    authHint: lastFmAuthHint,
    setEnabled: setLastFmEnabled,
    createCustomProfile: createLastFmCustomProfile,
    updateCustomProfile: updateLastFmCustomProfile,
    deleteCustomProfile: deleteLastFmCustomProfile,
    setProfileEnabled: setLastFmProfileEnabled,
    setProfileNowPlaying: setLastFmProfileNowPlaying,
    setListenBrainzToken,
    beginAuth: beginLastFmAuth,
    disconnectProfile: disconnectLastFmProfile,
    setCustomCredentials: setLastFmCustomCredentials,
  } = useLastFmSettingsStore()
  const {
    status: lyricsStatus,
    errorMessage: lyricsErrorMessage,
    setEnabled: setLyricsEnabled,
    setLrclibBaseUrl: setLyricsLrclibBaseUrl,
  } = useLyricsStore()
  const lyricsDisplaySettings = useLyricsDisplaySettingsStore((state) => state.settings)
  const setLyricsWordTimingEnabled = useLyricsDisplaySettingsStore((state) => state.setWordTimingEnabled)
  const setLyricsFuriganaEnabled = useLyricsDisplaySettingsStore((state) => state.setFuriganaEnabled)
  const setLyricsTranslationsEnabled = useLyricsDisplaySettingsStore((state) => state.setTranslationsEnabled)
  const setLyricsTranslationLanguagePriority = useLyricsDisplaySettingsStore((state) => state.setTranslationLanguagePriority)
  const setLyricsVoiceLabelsEnabled = useLyricsDisplaySettingsStore((state) => state.setVoiceLabelsEnabled)
  const setLyricsPreferOnlineSyncedLyrics = useLyricsDisplaySettingsStore((state) => state.setPreferOnlineSyncedLyrics)
  const {
    autoCheckEnabled,
    checkState: updateCheckState,
    statusMessage: updateStatusMessage,
    updateAvailable,
    latestTag,
    releaseName,
    lastCheckedAt,
    setAutoCheckEnabled,
    checkForUpdates,
    openReleasesPage,
  } = useUpdateStore()
  const {
    status: diagnosticsStatus,
    isLoading: diagnosticsIsLoading,
    isCapturingBundle: diagnosticsIsCapturingBundle,
    lastCaptureResult: diagnosticsLastCaptureResult,
    errorMessage: diagnosticsErrorMessage,
    init: initDiagnostics,
    setEnabled: setDiagnosticsEnabled,
    captureBundle: captureDiagnosticsBundle,
    revealCurrentLog,
    revealPreviousLog,
  } = useDiagnosticsStore()
  const [accentInputValue, setAccentInputValue] = useState(resolvedTokens.accent)
  const [miniPlayerVisualizerMode, setMiniPlayerVisualizerMode] = useState<MiniPlayerVisualizerMode>('off')
  const [localApiPortInput, setLocalApiPortInput] = useState(String(LOCAL_API_DEFAULT_PORT))
  const [phoneRemotePortInput, setPhoneRemotePortInput] = useState(String(PHONE_REMOTE_DEFAULT_PORT))
  const [lastFmDialogOpen, setLastFmDialogOpen] = useState(false)
  const [listenBrainzDialogOpen, setListenBrainzDialogOpen] = useState(false)
  const [listenBrainzTokenInput, setListenBrainzTokenInput] = useState('')
  const [customEndpointsExpanded, setCustomEndpointsExpanded] = useState(false)
  const [lastFmProfileModalMode, setLastFmProfileModalMode] = useState<'create' | 'edit' | null>(null)
  const [lastFmEditingProfileId, setLastFmEditingProfileId] = useState<string | null>(null)
  const [lastFmProfileProtocolInput, setLastFmProfileProtocolInput] = useState<LastFmScrobbleProtocol>('lastfm2')
  const [lastFmProfileNameInput, setLastFmProfileNameInput] = useState('')
  const [lastFmProfileUrlInput, setLastFmProfileUrlInput] = useState('')
  const [lastFmProfileUsernameInput, setLastFmProfileUsernameInput] = useState('')
  const [lastFmProfileSessionKeyInput, setLastFmProfileSessionKeyInput] = useState('')
  const [lastFmCustomApiKeyInput, setLastFmCustomApiKeyInput] = useState(lastFmStatus?.customApiKey ?? '')
  const [lastFmCustomSharedSecretInput, setLastFmCustomSharedSecretInput] = useState(lastFmStatus?.customSharedSecret ?? '')
  const [localApiFeedback, setLocalApiFeedback] = useState('')
  const [phoneRemoteFeedback, setPhoneRemoteFeedback] = useState('')
  const [lastFmProfileFeedback, setLastFmProfileFeedback] = useState('')
  const [infoFeedback, setInfoFeedback] = useState('')
  const [infoFeedbackTone, setInfoFeedbackTone] = useState<'success' | 'error'>('success')
  const [sleepTimerCustomMinutesInput, setSleepTimerCustomMinutesInput] = useState(
    String(SLEEP_TIMER_PRESET_MINUTES[1] ?? SLEEP_TIMER_PRESET_MINUTES[0] ?? 30)
  )
  const [sleepTimerFeedback, setSleepTimerFeedback] = useState('')
  const [sleepTimerFeedbackTone, setSleepTimerFeedbackTone] = useState<'success' | 'error'>('success')
  const [normalizationDisableStep, setNormalizationDisableStep] = useState<NormalizationDisableStep>(null)
  const [normalizationTargetInput, setNormalizationTargetInput] = useState(() => formatNormalizationTargetLufs(normalizationTargetLufs))
  const [normalizationTargetError, setNormalizationTargetError] = useState('')
  const [lyricsTranslationPriorityInput, setLyricsTranslationPriorityInput] = useState(() => (
    lyricsDisplaySettings.translationLanguagePriority.join(', ')
  ))
  const [lyricsLrclibBaseUrlInput, setLyricsLrclibBaseUrlInput] = useState(LRCLIB_OFFICIAL_BASE_URL)
  const [showBitPerfectWarning, setShowBitPerfectWarning] = useState(false)
  const [dontShowBitPerfectWarningAgain, setDontShowBitPerfectWarningAgain] = useState(false)
  const [bitPerfectWarningDismissed, setBitPerfectWarningDismissed] = useState(() => {
    return localStorage.getItem(BIT_PERFECT_WARNING_DISMISSED_STORAGE_KEY) === '1'
  })
  const developerRevealClickCountRef = useRef(0)
  const developerRevealResetTimeoutRef = useRef<number | null>(null)
  const uiScalePercent = useUIStore((state) => state.uiScalePercent)
  const setUIScalePercent = useUIStore((state) => state.setUIScalePercent)
  const resetUIScalePercent = useUIStore((state) => state.resetUIScalePercent)
  const homeGreetingTextMode = useUIStore((state) => state.homeGreetingTextMode)
  const setHomeGreetingTextMode = useUIStore((state) => state.setHomeGreetingTextMode)
  const transportInfoLineMode = useUIStore((state) => state.transportInfoLineMode)
  const setTransportInfoLineMode = useUIStore((state) => state.setTransportInfoLineMode)
  const activityIndicatorExperimentEnabled = useUIStore((state) => state.activityIndicatorExperimentEnabled)
  const setActivityIndicatorExperimentEnabled = useUIStore((state) => state.setActivityIndicatorExperimentEnabled)
  const controllerSupportEnabled = useUIStore((state) => state.controllerSupportEnabled)
  const setControllerSupportEnabled = useUIStore((state) => state.setControllerSupportEnabled)
  const jumpToPlayingDestination = useUIStore((state) => state.jumpToPlayingDestination)
  const setJumpToPlayingDestination = useUIStore((state) => state.setJumpToPlayingDestination)
  const parallaxExperimentEnabled = useUIStore((state) => state.parallaxExperimentEnabled)
  const setParallaxExperimentEnabled = useUIStore((state) => state.setParallaxExperimentEnabled)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const pendingSettingsSection = useUIStore((state) => state.pendingSettingsSection)
  const consumePendingSettingsSection = useUIStore((state) => state.consumePendingSettingsSection)
  const trackRatingsEnabled = useRatingsStore((state) => state.enabled)
  const setTrackRatingsEnabled = useRatingsStore((state) => state.setEnabled)
  const libraryGraphEnabled = useGraphStore((state) => state.enabled)
  const setLibraryGraphEnabled = useGraphStore((state) => state.setEnabled)
  const openFullGraph = useGraphStore((state) => state.openFullMap)
  const listeningStatsEnabled = useListeningStatsStore((state) => state.enabled)
  const setListeningStatsEnabled = useListeningStatsStore((state) => state.setEnabled)
  const clearDetailedListeningHistory = useListeningStatsStore((state) => state.clearDetailedHistory)
  const libraryIntegrityEnabled = useLibraryIntegrityStore((state) => state.enabled)
  const setLibraryIntegrityEnabled = useLibraryIntegrityStore((state) => state.setEnabled)
  const openLibraryIntegrityPanel = useLibraryIntegrityStore((state) => state.openPanel)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const playbackState = usePlayerStore((state) => state.playbackState)
  const sleepTimerIsActive = useSleepTimerStore((state) => state.isActive)
  const sleepTimerExpiresAtMs = useSleepTimerStore((state) => state.expiresAtMs)
  const sleepTimerRemainingMs = useSleepTimerStore((state) => state.remainingMs)
  const startSleepTimer = useSleepTimerStore((state) => state.startTimer)
  const replaceSleepTimer = useSleepTimerStore((state) => state.replaceTimer)
  const cancelSleepTimer = useSleepTimerStore((state) => state.cancelTimer)

  const selectedPreset = useMemo(
    () => THEME_PRESET_LIST.find((preset) => preset.id === presetId) ?? THEME_PRESET_LIST[0],
    [presetId]
  )
  const defaultPresetAccent = useMemo(
    () => THEME_PRESET_LIST.find((preset) => preset.id === 'default')?.accent ?? DEFAULT_THEME_ACCENT,
    []
  )
  const fallbackAccent = customAccent ?? selectedPreset.accent
  const canStartSleepTimer = Boolean(
    currentTrack &&
    (playbackState === 'playing' || playbackState === 'paused')
  )
  const bitPerfectModeActive = playbackOutputMode === 'bitperfect'
  const nativeBackendLabel = useMemo(() => {
    switch (nativeAudioCapabilities.activeBackend) {
      case 'coreaudio':
        return 'CoreAudio'
      case 'wasapi-exclusive':
        return 'WASAPI Exclusive'
      case 'alsa-hw':
        return 'ALSA hw'
      default:
        return 'Unavailable'
    }
  }, [nativeAudioCapabilities.activeBackend])
  const sleepTimerRemainingLabel = useMemo(
    () => formatSleepTimerRemaining(sleepTimerRemainingMs),
    [sleepTimerRemainingMs]
  )
  const sleepTimerEndsAtLabel = useMemo(() => {
    if (sleepTimerExpiresAtMs == null) return null
    return new Date(sleepTimerExpiresAtMs).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })
  }, [sleepTimerExpiresAtMs])
  const sleepTimerStatusLabel = useMemo(() => {
    if (!sleepTimerIsActive) {
      return 'No active sleep timer.'
    }
    if (sleepTimerEndsAtLabel) {
      return `Sleep timer active • ${sleepTimerRemainingLabel} remaining • ends at ${sleepTimerEndsAtLabel}`
    }
    return `Sleep timer active • ${sleepTimerRemainingLabel} remaining.`
  }, [sleepTimerEndsAtLabel, sleepTimerIsActive, sleepTimerRemainingLabel])
  const visibleSettingsSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => {
      if (!('hidden' in section && section.hidden)) return true
      // Parallax is revealed by its own Experimental master toggle; other hidden sections
      // (Developer) stay gated behind the developer visibility preference.
      if (section.id === 'parallax') return parallaxExperimentEnabled
      return developerSectionVisible
    }),
    [developerSectionVisible, parallaxExperimentEnabled]
  )

  // Master on/off for the experimental Parallax feature. Enabling reveals + jumps to the dedicated
  // section; disabling fully stops host/sink networking before the section disappears (it is an
  // experimental feature — "off" means off, not just hidden).
  const handleToggleParallaxExperiment = (enabled: boolean) => {
    setParallaxExperimentEnabled(enabled)
    if (enabled) {
      setActiveSectionId('parallax')
    } else {
      const parallax = useParallaxStore.getState()
      void parallax.setHostEnabled(false)
      void parallax.setSinkEnabled(false)
    }
  }

  useEffect(() => {
    setAccentInputValue(fallbackAccent)
  }, [fallbackAccent])

  useEffect(() => {
    void initLocalApi()
    void initPhoneRemote()
  }, [initLocalApi, initPhoneRemote])

  useEffect(() => {
    void initDiagnostics()
  }, [initDiagnostics])

  useEffect(() => {
    if (!localApiStatus) return
    setLocalApiPortInput(String(localApiStatus.port))
  }, [localApiStatus?.port])

  useEffect(() => {
    if (!phoneRemoteStatus) return
    setPhoneRemotePortInput(String(phoneRemoteStatus.port))
  }, [phoneRemoteStatus?.port])

  useEffect(() => {
    const lanUrls = phoneRemoteStatus?.lanUrls ?? []
    if (lanUrls.length === 0) {
      setLocalApiSelectedPairingBaseUrl('')
      return
    }
    if (localApiSelectedPairingBaseUrl && lanUrls.includes(localApiSelectedPairingBaseUrl)) {
      return
    }
    setLocalApiSelectedPairingBaseUrl(lanUrls[0])
  }, [phoneRemoteStatus?.lanUrls, localApiSelectedPairingBaseUrl])

  useEffect(() => {
    if (!localApiFeedback) return
    const timeoutId = window.setTimeout(() => {
      setLocalApiFeedback('')
    }, 2600)
    return () => window.clearTimeout(timeoutId)
  }, [localApiFeedback])

  useEffect(() => {
    if (!phoneRemoteFeedback) return
    const timeoutId = window.setTimeout(() => {
      setPhoneRemoteFeedback('')
    }, 2600)
    return () => window.clearTimeout(timeoutId)
  }, [phoneRemoteFeedback])

  useEffect(() => {
    if (!lastFmProfileFeedback) return
    const timeoutId = window.setTimeout(() => {
      setLastFmProfileFeedback('')
    }, 3200)
    return () => window.clearTimeout(timeoutId)
  }, [lastFmProfileFeedback])

  useEffect(() => {
    if (!sleepTimerFeedback) return
    const timeoutId = window.setTimeout(() => {
      setSleepTimerFeedback('')
    }, 2600)
    return () => window.clearTimeout(timeoutId)
  }, [sleepTimerFeedback])

  useEffect(() => {
    setNormalizationTargetInput(formatNormalizationTargetLufs(normalizationTargetLufs))
  }, [normalizationTargetLufs])

  useEffect(() => {
    setLyricsTranslationPriorityInput(lyricsDisplaySettings.translationLanguagePriority.join(', '))
  }, [lyricsDisplaySettings.translationLanguagePriority])

  useEffect(() => {
    if (lastFmStatus?.customApiKey != null) {
      setLastFmCustomApiKeyInput(lastFmStatus.customApiKey)
    }
    if (lastFmStatus?.customSharedSecret != null) {
      setLastFmCustomSharedSecretInput(lastFmStatus.customSharedSecret)
    }
  }, [lastFmStatus?.customApiKey, lastFmStatus?.customSharedSecret])

  useEffect(() => {
    if (!lyricsStatus?.lrclibBaseUrl) return
    setLyricsLrclibBaseUrlInput(lyricsStatus.lrclibBaseUrl)
  }, [lyricsStatus?.lrclibBaseUrl])

  useEffect(() => {
    if (!showBitPerfectWarning) {
      setDontShowBitPerfectWarningAgain(false)
    }
  }, [showBitPerfectWarning])

  useEffect(() => {
    return () => {
      if (developerRevealResetTimeoutRef.current != null) {
        window.clearTimeout(developerRevealResetTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pendingSettingsSection === null) return

    const pendingSection = consumePendingSettingsSection()
    if (!pendingSection) return

    const pendingSectionDefinition = SETTINGS_SECTIONS.find((section) => section.id === pendingSection)
    if (
      pendingSectionDefinition != null &&
      'hidden' in pendingSectionDefinition &&
      pendingSectionDefinition.hidden &&
      !developerSectionVisible
    ) {
      return
    }

    setActiveSectionId(pendingSection)
  }, [consumePendingSettingsSection, developerSectionVisible, pendingSettingsSection])

  useEffect(() => {
    if (!developerSectionVisible && activeSectionId === DEVELOPER_SETTINGS_SECTION_ID) {
      setActiveSectionId('info')
    }
  }, [activeSectionId, developerSectionVisible])

  const resetDeveloperRevealProgress = () => {
    developerRevealClickCountRef.current = 0
    if (developerRevealResetTimeoutRef.current != null) {
      window.clearTimeout(developerRevealResetTimeoutRef.current)
      developerRevealResetTimeoutRef.current = null
    }
  }

  const revealDeveloperSection = () => {
    persistDeveloperSectionVisibilityPreference(true)
    setDeveloperSectionVisible(true)
    setActiveSectionId(DEVELOPER_SETTINGS_SECTION_ID)
    resetDeveloperRevealProgress()
  }

  const handleAppVersionClick = () => {
    if (developerSectionVisible) {
      setActiveSectionId(DEVELOPER_SETTINGS_SECTION_ID)
      return
    }

    developerRevealClickCountRef.current += 1
    if (developerRevealResetTimeoutRef.current != null) {
      window.clearTimeout(developerRevealResetTimeoutRef.current)
    }
    developerRevealResetTimeoutRef.current = window.setTimeout(() => {
      developerRevealClickCountRef.current = 0
      developerRevealResetTimeoutRef.current = null
    }, DEVELOPER_SETTINGS_REVEAL_RESET_MS)

    if (developerRevealClickCountRef.current >= DEVELOPER_SETTINGS_REVEAL_CLICK_TARGET) {
      revealDeveloperSection()
    }
  }

  const handleHideDeveloperSection = () => {
    persistDeveloperSectionVisibilityPreference(false)
    setDeveloperSectionVisible(false)
    resetDeveloperRevealProgress()
  }

  const resetActions = useMemo<ResetActionDefinition[]>(() => ([
    {
      id: 'reset-theme',
      title: 'Reset Theme',
      description: 'Restore the default Musaic theme and accent.',
      buttonLabel: 'Reset Theme',
      confirmTitle: 'Reset Theme to Default',
      confirmMessage: 'This will restore the default preset and accent color.',
      confirmLabel: 'Reset Theme',
      destructive: false,
      run: resetThemeSettings,
    },
    {
      id: 'reset-audio',
      title: 'Reset Audio Settings',
      description: 'Clear output device, routing, delay, calibration settings, and saved volume.',
      buttonLabel: 'Reset Audio',
      confirmTitle: 'Reset Audio Settings',
      confirmMessage: 'This will clear custom output routing, delay calibration profiles, and saved volume.',
      confirmLabel: 'Reset Audio',
      destructive: false,
      run: resetAudioSettings,
    },
    {
      id: 'reset-integrations',
      title: 'Reset Integrations',
      description: 'Disable Discord, scrobbling, Lyrics lookup, and the Local API.',
      buttonLabel: 'Reset Integrations',
      confirmTitle: 'Reset Integration Settings',
      confirmMessage: 'This will disable Discord, scrobbling, online lyrics lookup, and the local integration API, then clear related preferences.',
      confirmLabel: 'Reset Integrations',
      destructive: false,
      run: resetIntegrationSettings,
    },
    {
      id: 'reset-discord-cover-art-cache',
      title: 'Reset Discord Cover Art Cache',
      description: 'Clear saved cover art lookup hits and misses for Discord Rich Presence.',
      buttonLabel: 'Reset Cover Art Cache',
      confirmTitle: 'Reset Discord Cover Art Cache',
      confirmMessage: 'This clears cached Discord cover art lookup results and allows fresh lookups.',
      confirmLabel: 'Reset Cover Art Cache',
      destructive: false,
      run: resetDiscordCoverArtCache,
    },
    {
      id: 'reset-eq',
      title: 'Reset EQ Presets',
      description: 'Remove custom EQ presets and restore default EQ curve.',
      buttonLabel: 'Reset EQ',
      confirmTitle: 'Reset EQ Presets',
      confirmMessage: 'Custom EQ presets will be removed and EQ will return to defaults.',
      confirmLabel: 'Reset EQ',
      destructive: false,
      run: resetEqSettings,
    },
    {
      id: 'reset-all',
      title: 'Reset All Settings',
      description: 'Reset theme, audio, integrations, EQ, and visualizer settings.',
      buttonLabel: 'Reset All Settings',
      confirmTitle: 'Reset All Renderer Settings',
      confirmMessage: 'This clears all renderer settings but keeps your library data and folders.',
      confirmLabel: 'Reset All',
      destructive: false,
      run: resetAllSettings,
    },
    {
      id: 'reset-ratings',
      title: 'Reset Track Ratings',
      description: 'Permanently remove every star rating. Favorites, playlists, and library data are untouched.',
      buttonLabel: 'Reset Ratings',
      confirmTitle: 'Reset Track Ratings',
      confirmMessage: 'This permanently deletes all star ratings from the library database. Dynamic playlists that filter by rating will match no rated tracks until you rate again.',
      confirmLabel: 'Reset Ratings',
      destructive: true,
      typedPhrase: 'RESET RATINGS',
      run: resetTrackRatings,
    },
    {
      id: 'reset-listening-history',
      title: 'Clear Listening History',
      description: 'Delete detailed Stats sessions and listening time while preserving play counts, recents, and last-played values.',
      buttonLabel: 'Clear Listening History',
      confirmTitle: 'Clear Detailed Listening History',
      confirmMessage: 'This permanently removes detailed listening sessions, time totals, rankings, and the Stats baseline. Track play counts, recently played, last-played values, and dynamic playlist behavior are preserved.',
      confirmLabel: 'Clear History',
      destructive: true,
      typedPhrase: 'CLEAR LISTENING HISTORY',
      run: async () => {
        await clearDetailedListeningHistory()
        return 'Detailed listening history cleared. Play counts were preserved.'
      },
    },
    {
      id: 'reset-folders',
      title: 'Reset Mapped Folders',
      description: 'Remove mapped folders and indexed library data while preserving playlists.',
      buttonLabel: 'Reset Mapped Folders',
      confirmTitle: 'Reset Mapped Folders',
      confirmMessage: 'This deletes mapped folders, indexed tracks, favorites, and recently played history.',
      confirmLabel: 'Reset Folders',
      destructive: true,
      typedPhrase: 'RESET FOLDERS',
      disabled: isScanning,
      run: resetMappedFolders,
    },
    {
      id: 'factory-reset',
      title: 'Factory Reset',
      description: 'Wipe all settings and all library-side data including playlists and app metadata.',
      buttonLabel: 'Factory Reset',
      confirmTitle: 'Factory Reset Musaic',
      confirmMessage: 'This removes all settings and all library data, then reloads the app.',
      confirmLabel: 'Factory Reset',
      destructive: true,
      typedPhrase: 'FACTORY RESET',
      disabled: isScanning,
      run: factoryResetApplication,
    },
  ]), [clearDetailedListeningHistory, isScanning])

  const resetActionMap = useMemo(() => {
    return new Map<ResetActionId, ResetActionDefinition>(resetActions.map((action) => [action.id, action]))
  }, [resetActions])
  const safeResetActions = useMemo(
    () => resetActions.filter((action) => !action.destructive),
    [resetActions]
  )
  const destructiveResetActions = useMemo(
    () => resetActions.filter((action) => action.destructive),
    [resetActions]
  )

  const pendingReset = pendingResetId ? (resetActionMap.get(pendingResetId) ?? null) : null
  const isAnyResetRunning = Object.values(resetStatuses).some((status) => status.state === 'running')
  const updateStatusTone = updateCheckState === 'update-available'
    ? 'available'
    : updateCheckState === 'error'
      ? 'error'
      : updateCheckState === 'checking'
        ? 'checking'
        : 'default'
  const lastCheckedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleString()
    : 'No update checks have run yet.'
  const localApiEnabled = localApiStatus?.enabled ?? false
  const localApiControlsEnabled = localApiStatus?.controlsEnabled ?? false
  const localApiLibrarySearchEnabled = localApiStatus?.librarySearchEnabled ?? false
  const localApiLibraryWriteEnabled = localApiStatus?.libraryWriteEnabled ?? false
  const localApiBaseUrl = localApiStatus?.baseUrl ?? `http://127.0.0.1:${LOCAL_API_DEFAULT_PORT}`
  const localApiToken = localApiStatus?.token ?? ''
  const phoneRemoteEnabled = phoneRemoteStatus?.enabled ?? false
  const phoneRemoteControlsEnabled = phoneRemoteStatus?.controlsEnabled ?? localApiControlsEnabled
  const phoneRemoteSync = phoneRemoteStatus?.sync ?? null
  const phoneRemoteSyncEnabled = phoneRemoteSync?.enabled ?? true
  const phoneRemoteSyncConflictCount = phoneRemoteSync?.conflicts.length ?? 0
  const phoneRemoteSyncPendingCount = phoneRemoteSync?.pendingResolutions.length ?? 0
  const phoneRemoteLanUrls = phoneRemoteStatus?.lanUrls ?? []
  const phoneRemoteControllerUrls = phoneRemoteLanUrls.map((url) => `${url}/remote/`)
  const localApiSelectedPairingUrl = localApiSelectedPairingBaseUrl
    ? `${localApiSelectedPairingBaseUrl}/remote/`
    : phoneRemoteControllerUrls[0] ?? ''
  const phoneRemotePairedDeviceCount = phoneRemoteStatus?.pairedDeviceCount ?? phoneRemotePairedDevices.length
  const phoneRemotePendingPairingCount = phoneRemoteStatus?.pendingPairingCount ?? phoneRemotePendingPairingRequests.length
  const localApiPhoneRemoteSummary = !phoneRemoteEnabled
    ? 'Phone remote is off. Turn it on when you want Musaic to expose `/remote/` on your LAN.'
    : phoneRemoteLanUrls.length === 0
      ? 'Phone remote is enabled, but Musaic has not found a usable `192.168.*` LAN address yet.'
      : phoneRemotePendingPairingCount > 0
        ? `${phoneRemotePendingPairingCount} phone${phoneRemotePendingPairingCount === 1 ? '' : 's'} waiting for approval.`
        : phoneRemotePairedDeviceCount > 0
          ? `${phoneRemotePairedDeviceCount} phone${phoneRemotePairedDeviceCount === 1 ? '' : 's'} paired.`
          : phoneRemoteControlsEnabled
            ? 'Phone remote is ready for full control.'
            : 'Phone remote is ready in read-only mode until playback controls are enabled.'
  const localApiStatusLabel = !localApiStatus
    ? 'Loading local API status...'
    : localApiStatus.active
      ? `Local integration API active on ${localApiStatus.baseUrl}.`
      : localApiStatus.enabled
        ? `Local integration API enabled but not active${localApiStatus.lastError ? `: ${localApiStatus.lastError}` : '.'}`
        : 'Local integration API is disabled.'
  const localApiActiveDevices = useMemo(
    () => phoneRemotePairedDevices.filter((d) => d.revokedAt == null),
    [phoneRemotePairedDevices]
  )
  const localApiControllerUrl = phoneRemoteControllerUrls[0] ?? ''
  const localApiInlineQrSvg = useMemo(() => {
    if (!localApiControllerUrl) return ''
    try { return renderPairingQrSvg(localApiControllerUrl) } catch { return '' }
  }, [localApiControllerUrl])
  // §20 Commit 4 — Codex round 1 finding (medium): the Parallax host QR was for the legacy
  // sink-types-PIN flow which is gone. Removed.
  const lastFmEnabled = lastFmStatus?.enabled ?? false
  const lastFmAuthPending = lastFmStatus?.authPending ?? false
  const lastFmHasApiCredentials = lastFmStatus?.hasApiCredentials ?? true
  const lastFmProfiles = lastFmStatus?.profiles ?? []
  const officialLastFmProfile = lastFmStatus?.lastFmProfile ?? lastFmProfiles.find((p) => p.id === LASTFM_OFFICIAL_PROFILE_ID)
  const officialListenBrainzProfile = lastFmStatus?.listenBrainzProfile ?? lastFmProfiles.find((p) => p.id === LISTENBRAINZ_OFFICIAL_PROFILE_ID)
  const customScrobbleProfiles = lastFmProfiles.filter((p) => p.kind === 'custom')
  const lastFmPendingScrobbles = lastFmStatus?.pendingScrobbles ?? 0
  const lastFmStatusLabel = lastFmStatus?.statusMessage ?? 'Loading scrobbling status...'
  const lastFmQueueLabel = `Pending scrobbles: ${lastFmPendingScrobbles}.`
  const lastFmResolvedError = lastFmErrorMessage || (lastFmStatus?.lastError ?? '')
  const lastFmDialogPresence = usePresence(lastFmDialogOpen ? 'Last.fm' : null)
  const listenBrainzDialogPresence = usePresence(listenBrainzDialogOpen ? 'ListenBrainz' : null)
  const lastFmProfileModalOpen = lastFmProfileModalMode != null
  const lastFmProfileModalTitle = lastFmProfileModalMode === 'edit' ? 'Edit Destination' : 'Add Destination'
  const lastFmProfilePresence = usePresence(lastFmProfileModalOpen ? lastFmProfileModalTitle : null)
  const lastFmProfileSaveDisabled = !lastFmProfileNameInput.trim() ||
    !lastFmProfileUrlInput.trim() ||
    (isScrobbleUsernameRequired(lastFmProfileProtocolInput) && !lastFmProfileUsernameInput.trim()) ||
    (lastFmProfileModalMode === 'create' && !lastFmProfileSessionKeyInput.trim())
  const lyricsEnabled = lyricsStatus?.enabled ?? false
  const lyricsStatusLabel = lyricsStatus?.statusMessage ?? 'Loading lyrics status...'
  const lyricsResolvedError = lyricsErrorMessage || (lyricsStatus?.lastError ?? '')
  const diagnosticsEnabled = diagnosticsStatus?.enabled ?? false
  const diagnosticsSampleIntervalLabel = `${Math.round((diagnosticsStatus?.sampleIntervalMs ?? 15000) / 1000)} seconds`
  const diagnosticsCurrentLogPath = diagnosticsStatus?.currentLogPath ?? 'Loading diagnostics paths...'
  const diagnosticsPreviousLogPath = diagnosticsStatus?.previousLogPath ?? 'Loading diagnostics paths...'
  const diagnosticsSessionLabel = diagnosticsStatus?.sessionStartedAt
    ? `Current session started ${new Date(diagnosticsStatus.sessionStartedAt).toLocaleString()}.`
    : diagnosticsEnabled
      ? 'Waiting for the current diagnostics session header.'
      : 'Diagnostics are disabled.'
  const diagnosticsLastBundleLabel = diagnosticsLastCaptureResult
    ? `Last bundle captured ${new Date(diagnosticsLastCaptureResult.capturedAt).toLocaleString()}.`
    : 'No memory bundle captured in this session.'

  const handlePlaybackPathChange = (mode: 'standard' | 'bitperfect') => {
    if (mode === playbackOutputMode) return
    if (mode === 'standard') {
      void setPlaybackOutputMode('standard')
      return
    }

    if (bitPerfectWarningDismissed) {
      void setPlaybackOutputMode('bitperfect')
      return
    }

    setShowBitPerfectWarning(true)
  }

  const handleConfirmBitPerfectWarning = () => {
    if (dontShowBitPerfectWarningAgain) {
      localStorage.setItem(BIT_PERFECT_WARNING_DISMISSED_STORAGE_KEY, '1')
      setBitPerfectWarningDismissed(true)
    }
    setShowBitPerfectWarning(false)
    void setPlaybackOutputMode('bitperfect')
  }

  useEffect(() => {
    let isMounted = true

    const loadAppBuildInfo = async () => {
      if (window.electronAPI?.getAppBuildInfo) {
        try {
          const buildInfo = await window.electronAPI.getAppBuildInfo()
          if (!isMounted) return
          setAppVersionLabel(buildInfo.version ? `v${buildInfo.version}` : 'Unavailable')
          setAppBuildLabel(formatBuildLabel(buildInfo))
          setAppBuildTooltip(formatBuildTooltip(buildInfo) ?? '')
          setAppBuildCopyValue(formatBuildCopyValue(buildInfo))
        } catch {
          if (!isMounted) return
          setAppVersionLabel('Unavailable')
          setAppBuildLabel('')
          setAppBuildTooltip('')
          setAppBuildCopyValue('')
        }
        return
      }

      if (!window.electronAPI?.getAppVersion) {
        if (!isMounted) return
        setAppVersionLabel('Unavailable')
        setAppBuildLabel('')
        setAppBuildTooltip('')
        setAppBuildCopyValue('')
        return
      }

      try {
        const version = await window.electronAPI.getAppVersion()
        if (!isMounted) return
        setAppVersionLabel(version ? `v${version}` : 'Unavailable')
        setAppBuildLabel('')
        setAppBuildTooltip('')
        setAppBuildCopyValue('')
      } catch {
        if (!isMounted) return
        setAppVersionLabel('Unavailable')
        setAppBuildLabel('')
        setAppBuildTooltip('')
        setAppBuildCopyValue('')
      }
    }

    void loadAppBuildInfo()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    void window.electronAPI.miniPlayer.getWindowState().then((state) => {
      if (!isMounted) return
      setMiniPlayerVisualizerMode(state.visualizerMode)
    })

    const unsubscribe = window.electronAPI.miniPlayer.onWindowState((state) => {
      setMiniPlayerVisualizerMode(state.visualizerMode)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const executeResetAction = async (actionId: ResetActionId): Promise<void> => {
    const action = resetActionMap.get(actionId)
    if (!action) return

    setResetStatuses((prev) => ({
      ...prev,
      [actionId]: { state: 'running', message: 'Running...' },
    }))

    try {
      const result = await action.run()
      setResetStatuses((prev) => ({
        ...prev,
        [actionId]: { state: 'success', message: result ?? 'Completed.' },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete action.'
      setResetStatuses((prev) => ({
        ...prev,
        [actionId]: { state: 'error', message },
      }))
    } finally {
      setPendingResetId(null)
    }
  }

  const handleAccentColorInput = (value: string) => {
    setAccentInputValue(value)
    const normalized = normalizeHexColor(value)
    if (!normalized) return
    setCustomAccent(normalized)
  }

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleMiniPlayerVisualizerModeChange = (mode: MiniPlayerVisualizerMode) => {
    setMiniPlayerVisualizerMode(mode)
    void window.electronAPI.miniPlayer.setVisualizerMode(mode).then((state) => {
      setMiniPlayerVisualizerMode(state.visualizerMode)
    })
  }

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setLocalApiFeedback(`${label} copied.`)
    } catch {
      setLocalApiFeedback(`Failed to copy ${label.toLowerCase()}.`)
    }
  }

  const copyPhoneRemoteToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setPhoneRemoteFeedback(`${label} copied.`)
    } catch {
      setPhoneRemoteFeedback(`Failed to copy ${label.toLowerCase()}.`)
    }
  }

  const copyInfoToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setInfoFeedbackTone('success')
      setInfoFeedback(`${label} copied.`)
    } catch {
      setInfoFeedbackTone('error')
      setInfoFeedback(`Failed to copy ${label.toLowerCase()}.`)
    }
  }

  const handleSaveLocalApiPort = () => {
    const parsedPort = Number(localApiPortInput)
    if (!Number.isInteger(parsedPort) || parsedPort < LOCAL_API_MIN_PORT || parsedPort > LOCAL_API_MAX_PORT) {
      setLocalApiFeedback(`Port must be an integer between ${LOCAL_API_MIN_PORT} and ${LOCAL_API_MAX_PORT}.`)
      return
    }

    void setLocalApiPort(parsedPort).then((status) => {
      if (!status) return
      setLocalApiFeedback(`API port set to ${status.port}.`)
    })
  }

  const handleRotateLocalApiToken = () => {
    void rotateLocalApiToken().then((status) => {
      if (!status) return
      setLocalApiFeedback('API key regenerated.')
    })
  }

  const handleSavePhoneRemotePort = () => {
    const parsedPort = Number(phoneRemotePortInput)
    if (!Number.isInteger(parsedPort) || parsedPort < PHONE_REMOTE_MIN_PORT || parsedPort > PHONE_REMOTE_MAX_PORT) {
      setPhoneRemoteFeedback(`Port must be an integer between ${PHONE_REMOTE_MIN_PORT} and ${PHONE_REMOTE_MAX_PORT}.`)
      return
    }

    void setPhoneRemotePort(parsedPort).then((status) => {
      if (!status) return
      setPhoneRemoteFeedback(`Phone remote port set to ${status.port}.`)
    })
  }

  const openLastFmCreateProfileModal = () => {
    const protocol: LastFmScrobbleProtocol = 'lastfm2'
    setLastFmProfileModalMode('create')
    setLastFmEditingProfileId(null)
    setLastFmProfileProtocolInput(protocol)
    setLastFmProfileNameInput(getDefaultScrobbleProfileName(protocol))
    setLastFmProfileUrlInput('')
    setLastFmProfileUsernameInput('')
    setLastFmProfileSessionKeyInput('')
  }

  const openLastFmEditProfileModal = (profile: LastFmProfileStatus) => {
    if (profile.kind !== 'custom') return
    setLastFmProfileModalMode('edit')
    setLastFmEditingProfileId(profile.id)
    setLastFmProfileProtocolInput(profile.protocol)
    setLastFmProfileNameInput(profile.name)
    setLastFmProfileUrlInput(profile.apiBaseUrl)
    setLastFmProfileUsernameInput(profile.username ?? '')
    setLastFmProfileSessionKeyInput('')
  }

  const closeLastFmProfileModal = () => {
    setLastFmProfileModalMode(null)
    setLastFmEditingProfileId(null)
    setLastFmProfileSessionKeyInput('')
  }

  const handleLastFmProfileProtocolChange = (protocol: LastFmScrobbleProtocol) => {
    const previousProtocol = lastFmProfileProtocolInput
    setLastFmProfileProtocolInput(protocol)
    if (
      lastFmProfileModalMode === 'create' &&
      lastFmProfileNameInput === getDefaultScrobbleProfileName(previousProtocol)
    ) {
      setLastFmProfileNameInput(getDefaultScrobbleProfileName(protocol))
    }
  }

  const handleSaveLastFmProfile = () => {
    const input = {
      protocol: lastFmProfileProtocolInput,
      name: lastFmProfileNameInput,
      apiBaseUrl: lastFmProfileUrlInput,
      username: lastFmProfileUsernameInput,
      sessionKey: lastFmProfileSessionKeyInput.trim() ? lastFmProfileSessionKeyInput : null
    }

    const savePromise = lastFmProfileModalMode === 'edit' && lastFmEditingProfileId
      ? updateLastFmCustomProfile(lastFmEditingProfileId, input)
      : createLastFmCustomProfile(input)

    void savePromise.then((status) => {
      if (!status || status.lastError) return
      setLastFmProfileFeedback(lastFmProfileModalMode === 'edit' ? 'Destination updated.' : 'Destination added.')
      closeLastFmProfileModal()
    })
  }

  const handleDeleteLastFmProfile = (profile: LastFmProfileStatus) => {
    if (profile.kind !== 'custom') return
    if (!window.confirm(`Delete ${profile.name}?`)) return
    void deleteLastFmCustomProfile(profile.id).then((status) => {
      if (!status || status.lastError) return
      setLastFmProfileFeedback('Destination deleted.')
    })
  }

  const canToggleLastFmProfile = (profile: LastFmProfileStatus): boolean => {
    return profile.connected && (!profile.requiresApiCredentials || lastFmHasApiCredentials)
  }

  const handleToggleLastFmProfile = (profile: LastFmProfileStatus) => {
    if (!canToggleLastFmProfile(profile)) return
    void setLastFmProfileEnabled(profile.id, !profile.enabled).then((status) => {
      if (!status || status.lastError) return
      setLastFmProfileFeedback(`${profile.name} ${profile.enabled ? 'disabled' : 'enabled'}.`)
    })
  }

  const handleEnablePhoneRemoteControl = () => {
    void (async () => {
      if (!phoneRemoteEnabled) {
        const status = await setPhoneRemoteEnabled(true)
        if (!status) return
      }

      if (!localApiControlsEnabled) {
        const status = await setLocalApiControlsEnabled(true)
        if (!status) return
      }

      setPhoneRemoteFeedback('Phone remote control enabled.')
    })()
  }

  const handleOpenPhoneRemotePairingModal = () => {
    setLocalApiPairingModalOpen(true)
  }

  const handleClosePhoneRemotePairingModal = () => {
    setLocalApiPairingModalOpen(false)
    clearPhoneRemoteActivePairingTicket()
  }

  const handleCreatePhoneRemotePairingTicket = () => {
    void createPhoneRemotePairingTicket(localApiSelectedPairingBaseUrl || undefined).then((ticket) => {
      if (!ticket) return
      setPhoneRemoteFeedback('Pairing ticket generated.')
    })
  }

  const handleRefreshPhoneRemotePairingTicket = () => {
    void createPhoneRemotePairingTicket(
      localApiSelectedPairingBaseUrl || undefined,
      phoneRemoteActivePairingTicket?.clientKind ?? 'native'
    ).then((ticket) => {
      if (!ticket) return
      setPhoneRemoteFeedback('Pairing ticket refreshed.')
    })
  }

  const handleCreatePhoneRemoteWebPairingTicket = () => {
    void createPhoneRemotePairingTicket(localApiSelectedPairingBaseUrl || undefined, 'web').then((ticket) => {
      if (!ticket) return
      setPhoneRemoteFeedback('Control-only browser pairing ticket generated.')
    })
  }

  const handleApprovePhoneRemotePairingRequest = (id: string, scopes: CompanionApiScope[]) => {
    void approvePhoneRemotePairingRequest(id, scopes).then(() => {
      setPhoneRemoteFeedback('Pairing request approved.')
    })
  }

  const handleRejectPhoneRemotePairingRequest = (id: string) => {
    void rejectPhoneRemotePairingRequest(id).then(() => {
      setPhoneRemoteFeedback('Pairing request rejected.')
    })
  }

  const handleRevokePhoneRemotePairedDevice = (id: string) => {
    void revokePhoneRemotePairedDevice(id).then(() => {
      setPhoneRemoteFeedback('Paired phone revoked.')
    })
  }

  const handleRevokeAllPhoneRemoteDevices = () => {
    void revokeAllPhoneRemotePairedDevices().then((revokedCount) => {
      if (revokedCount > 0) {
        setPhoneRemoteFeedback(`${revokedCount} paired phone${revokedCount === 1 ? '' : 's'} revoked.`)
        return
      }
      setPhoneRemoteFeedback('No paired phones to revoke.')
    })
  }

  const handleSleepTimerStartResult = (
    result: ReturnType<typeof startSleepTimer>,
    successMessage: string
  ) => {
    if (result.ok) {
      setSleepTimerFeedbackTone('success')
      setSleepTimerFeedback(successMessage)
      return
    }

    setSleepTimerFeedbackTone('error')
    if (result.reason === 'invalid-duration') {
      setSleepTimerFeedback(
        `Minutes must be an integer between ${SLEEP_TIMER_MIN_MINUTES} and ${SLEEP_TIMER_MAX_MINUTES}.`
      )
      return
    }

    setSleepTimerFeedback('Load a track and keep playback in playing or paused state before starting a sleep timer.')
  }

  const handleSleepTimerPreset = (minutes: number) => {
    const result = sleepTimerIsActive
      ? replaceSleepTimer(minutes)
      : startSleepTimer(minutes)
    handleSleepTimerStartResult(result, `Sleep timer set for ${minutes} minute${minutes === 1 ? '' : 's'}.`)
  }

  const handleSleepTimerCustomStart = () => {
    const parsedMinutes = parseSleepTimerMinutesInput(sleepTimerCustomMinutesInput)
    if (parsedMinutes == null) {
      setSleepTimerFeedbackTone('error')
      setSleepTimerFeedback(
        `Minutes must be an integer between ${SLEEP_TIMER_MIN_MINUTES} and ${SLEEP_TIMER_MAX_MINUTES}.`
      )
      return
    }

    const result = sleepTimerIsActive
      ? replaceSleepTimer(parsedMinutes)
      : startSleepTimer(parsedMinutes)
    handleSleepTimerStartResult(
      result,
      `Sleep timer set for ${parsedMinutes} minute${parsedMinutes === 1 ? '' : 's'}.`
    )
  }

  const handleSleepTimerCancel = () => {
    cancelSleepTimer()
    setSleepTimerFeedbackTone('success')
    setSleepTimerFeedback('Sleep timer canceled.')
  }

  const handleNormalizationToggle = () => {
    if (bitPerfectModeActive) return
    if (normalizationEnabled) {
      setNormalizationDisableStep('warning')
      return
    }
    setNormalizationEnabled(true)
  }

  const handleConfirmDisableNormalization = () => {
    if (normalizationDisableStep === 'warning') {
      setNormalizationDisableStep('final')
      return
    }
    if (normalizationDisableStep === 'final') {
      setNormalizationEnabled(false)
      setNormalizationDisableStep(null)
    }
  }

  const commitNormalizationTarget = () => {
    if (bitPerfectModeActive) return
    const parsed = parseNormalizationTargetLufsInput(normalizationTargetInput)
    if (parsed == null) {
      setNormalizationTargetError(
        `Enter a value between ${NORMALIZATION_TARGET_MIN_LUFS} and ${NORMALIZATION_TARGET_MAX_LUFS} LUFS.`
      )
      setNormalizationTargetInput(formatNormalizationTargetLufs(normalizationTargetLufs))
      return
    }
    setNormalizationTargetError('')
    setNormalizationTargetLufs(parsed)
    setNormalizationTargetInput(formatNormalizationTargetLufs(parsed))
  }

  const resetNormalizationTarget = () => {
    if (bitPerfectModeActive) return
    setNormalizationTargetError('')
    setNormalizationTargetLufs(DEFAULT_NORMALIZATION_TARGET_LUFS)
    setNormalizationTargetInput(formatNormalizationTargetLufs(DEFAULT_NORMALIZATION_TARGET_LUFS))
  }

  const replayGainSelectorValue: ReplayGainSelectorValue = replayGainScanEnabled
    ? replayGainMode
    : 'disabled'

  const handleReplayGainSelectorChange = async (value: ReplayGainSelectorValue): Promise<void> => {
    if (bitPerfectModeActive) return
    if (value === 'disabled') {
      await setReplayGainScanEnabled(false)
      return
    }

    setReplayGainMode(value)
    if (!replayGainScanEnabled) {
      await setReplayGainScanEnabled(true)
      await backfillReplayGainMetadata()
    }
  }

  const renderResetAction = (action: ResetActionDefinition) => {
    const status = resetStatuses[action.id]
    return (
      <div
        key={action.id}
        className={`settings-danger-item ${action.destructive ? 'settings-danger-item-destructive' : ''}`}
      >
        <div className="settings-danger-item-copy">
          <p className="settings-danger-item-title">{action.title}</p>
          <p className="settings-danger-item-description">{action.description}</p>
          {status.state !== 'idle' && (
            <p className={`settings-danger-status settings-danger-status-${status.state}`}>
              {status.message}
            </p>
          )}
        </div>
        <button
          className={`settings-btn ${action.destructive ? 'settings-btn-danger' : ''}`}
          onClick={() => setPendingResetId(action.id)}
          disabled={Boolean(action.disabled) || isAnyResetRunning}
        >
          {action.buttonLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="settings-view">
      <div className="settings-shell">
        <div className="settings-header">
          <div>
            <p className="settings-kicker">System Controls</p>
            <h2>Settings</h2>
            <p className="settings-subtitle">Manage playback behavior, library scanning, and application preferences.</p>
          </div>
          {isScanning && (
            <div className="settings-scan-badge">
              <span>
                {scanStage?.stage === 'backfill'
                  ? 'Metadata'
                  : scanStage?.stage === 'cleanup'
                    ? 'Finalizing'
                    : 'Scanning'}
                {scanProgress ? ` ${scanProgress.current}/${scanProgress.total}` : '...'}
              </span>
              <button
                className="settings-scan-badge-cancel"
                onClick={() => void cancelScan()}
                disabled={isCancelingScan}
                aria-label="Cancel scan"
                title="Cancel scan"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="settings-layout">
          <nav className="settings-sidebar" aria-label="Settings sections">
            {visibleSettingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-sidebar-item ${activeSectionId === section.id ? 'active' : ''}`}
                aria-current={activeSectionId === section.id ? 'true' : undefined}
                onClick={() => setActiveSectionId(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeSectionId === 'appearance' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Appearance</h3>
            </div>
            <div className="settings-theme-grid">
              {THEME_PRESET_LIST.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`settings-theme-card ${presetId === preset.id ? 'active' : ''}`}
                  onClick={() => setPreset(preset.id as ThemePresetId)}
                >
                  <span className="settings-theme-card-title">{preset.label}</span>
                  <span className="settings-theme-card-description">{preset.description}</span>
                </button>
              ))}
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Accent</div>
                <div className="settings-grid">
                  <label className="settings-field">
                    <span className="settings-field-label">
                      {accentSource === 'cover-art' ? 'Fallback Accent Color' : 'Accent Color'}
                    </span>
                    <div className="settings-accent-inputs">
                      <input
                        className="settings-color settings-color-wide"
                        type="color"
                        value={fallbackAccent}
                        onChange={(event) => {
                          const next = event.target.value.toLowerCase()
                          setAccentInputValue(next)
                          setCustomAccent(next)
                        }}
                      />
                      <input
                        className="settings-select settings-accent-hex-input"
                        type="text"
                        value={accentInputValue}
                        onChange={(event) => handleAccentColorInput(event.target.value)}
                        onBlur={() => {
                          const normalized = normalizeHexColor(accentInputValue)
                          if (!normalized) {
                            setAccentInputValue(fallbackAccent)
                            return
                          }
                          setAccentInputValue(normalized)
                        }}
                        placeholder={defaultPresetAccent}
                        spellCheck={false}
                      />
                    </div>
                  </label>
                  <div className="settings-field">
                    <span className="settings-field-label">Accent Source</span>
                    <SettingsSegmentedControl
                      ariaLabel="Accent source"
                      fullWidth
                      options={ACCENT_SOURCE_OPTIONS}
                      value={accentSource}
                      onChange={setAccentSource}
                    />
                  </div>
                  {accentSource === 'cover-art' && (
                    <div className="settings-field">
                      <span className="settings-field-label">Cover Art Method</span>
                      <SettingsSegmentedControl
                        ariaLabel="Cover art accent method"
                        fullWidth
                        options={COVER_ART_ACCENT_METHOD_OPTIONS}
                        value={coverArtAccentMethod}
                        onChange={setCoverArtAccentMethod}
                      />
                    </div>
                  )}
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">
                      {accentSource === 'cover-art' ? 'Fallback Accent' : 'Preset Accent'}
                    </span>
                    {customAccent ? (
                      <button className="settings-btn" onClick={usePresetAccent}>
                        Use Preset Accent
                      </button>
                    ) : (
                      <span className="settings-chip">Using Preset Accent</span>
                    )}
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Theme</span>
                    <button
                      className="settings-btn settings-btn-primary"
                      onClick={() => {
                        resetThemeToDefault()
                        setAccentInputValue(defaultPresetAccent)
                      }}
                    >
                      Reset Theme to Default
                    </button>
                  </div>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Interface Scale</div>
                <div className="settings-grid">
                  <label className="settings-field">
                    <span className="settings-field-label">UI Scale</span>
                    <div className="settings-scale-row">
                      <input
                        className="settings-scale-slider"
                        type="range"
                        min={MIN_UI_SCALE_PERCENT}
                        max={MAX_UI_SCALE_PERCENT}
                        step={UI_SCALE_STEP_PERCENT}
                        value={uiScalePercent}
                        onChange={(event) => setUIScalePercent(Number(event.target.value))}
                        aria-label="UI scale"
                      />
                      <span className="settings-chip settings-chip-mono settings-scale-value">
                        {uiScalePercent}%
                      </span>
                      <button
                        type="button"
                        className="settings-chip settings-chip-mono settings-chip-danger"
                        onClick={resetUIScalePercent}
                        disabled={uiScalePercent === DEFAULT_UI_SCALE_PERCENT}
                      >
                        RESET
                      </button>
                    </div>
                  </label>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Home Greeting</div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <span className="settings-field-label">Text</span>
                    <SettingsSegmentedControl
                      ariaLabel="Home greeting text"
                      fullWidth
                      options={HOME_GREETING_TEXT_OPTIONS}
                      value={homeGreetingTextMode}
                      onChange={setHomeGreetingTextMode}
                    />
                  </div>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Transport Bar</div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <span className="settings-field-label">Info Line</span>
                    <SettingsSegmentedControl
                      ariaLabel="Transport bar info line"
                      fullWidth
                      options={TRANSPORT_INFO_LINE_OPTIONS}
                      value={transportInfoLineMode}
                      onChange={setTransportInfoLineMode}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'library' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Library</h3>
            </div>
            <div className="settings-actions settings-actions-grid settings-actions-grid-spaced">
              <button className="settings-btn settings-btn-primary" onClick={() => setShowFolderSettings(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
                Manage Folders
              </button>
              <button className="settings-btn" onClick={rescan} disabled={isScanning}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                Scan for Changes
              </button>
              <button className="settings-btn" onClick={forceRescanAll} disabled={isScanning}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                Force Rescan All
              </button>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Normalization</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Normalization</span>
                    <button
                      className={`settings-toggle ${normalizationEnabled ? 'active' : ''}`}
                      onClick={handleNormalizationToggle}
                      disabled={bitPerfectModeActive}
                      title={bitPerfectModeActive ? BIT_PERFECT_DSP_DISABLED_MESSAGE : undefined}
                    >
                      {normalizationEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <label className="settings-field">
                    <span className="settings-field-label">Normalization Target</span>
                    <div className="settings-inline-row">
                      <input
                        className="settings-select settings-inline-input settings-inline-input-compact"
                        type="number"
                        min={NORMALIZATION_TARGET_MIN_LUFS}
                        max={NORMALIZATION_TARGET_MAX_LUFS}
                        step={0.5}
                        value={normalizationTargetInput}
                        disabled={!normalizationEnabled || bitPerfectModeActive}
                        onChange={(event) => {
                          setNormalizationTargetInput(event.target.value)
                          if (normalizationTargetError) {
                            setNormalizationTargetError('')
                          }
                        }}
                        onBlur={commitNormalizationTarget}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          commitNormalizationTarget()
                        }}
                      />
                      <span className="settings-chip settings-chip-mono">LUFS</span>
                      <button
                        type="button"
                        className="settings-chip settings-chip-mono settings-chip-danger"
                        disabled={!normalizationEnabled || bitPerfectModeActive}
                        onClick={resetNormalizationTarget}
                      >
                        RESET
                      </button>
                    </div>
                  </label>
                  <div className="settings-field">
                    <span className="settings-field-label">ReplayGain</span>
                    <SettingsSegmentedControl
                      ariaLabel="ReplayGain preference"
                      fullWidth
                      options={REPLAYGAIN_OPTIONS}
                      value={replayGainSelectorValue}
                      disabled={bitPerfectModeActive}
                      onChange={(value) => void handleReplayGainSelectorChange(value)}
                    />
                  </div>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Artist Parsing</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Artist Parsing</span>
                    <div className="settings-inline-row">
                      <button
                        className={`settings-toggle ${artistBrowseMode === 'strict' ? 'active' : ''}`}
                        onClick={() => setArtistBrowseMode('strict')}
                        aria-pressed={artistBrowseMode === 'strict'}
                        title="Use stored Album Artist and Artist tags as written"
                      >
                        File tags
                      </button>
                      <button
                        className={`settings-toggle ${artistBrowseMode === 'canonical' ? 'active' : ''}`}
                        onClick={() => setArtistBrowseMode('canonical')}
                        aria-pressed={artistBrowseMode === 'canonical'}
                        title="Use Musaic's primary artist and collaboration grouping"
                      >
                        Musaic grouping
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Track Ratings</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Ratings</span>
                    <button
                      className={`settings-toggle ${trackRatingsEnabled ? 'active' : ''}`}
                      onClick={() => setTrackRatingsEnabled(!trackRatingsEnabled)}
                      title="Rate tracks with 1-5 stars in half-star steps"
                    >
                      {trackRatingsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="settings-note">
                    Rate tracks with 1-5 stars in half-star steps. Adds a rating column to tracklists,
                    a Rate entry to the track menu, and rating filters for dynamic playlists. Ratings
                    are kept if you turn this off.
                  </p>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Tracklist Columns</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">BPM / Key</span>
                    <button
                      className={`settings-toggle ${showTracklistBpmKey ? 'active' : ''}`}
                      onClick={() => setShowTracklistBpmKey(!showTracklistBpmKey)}
                    >
                      {showTracklistBpmKey ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Genre</span>
                    <button
                      className={`settings-toggle ${showTracklistGenre ? 'active' : ''}`}
                      onClick={() => setShowTracklistGenre(!showTracklistGenre)}
                    >
                      {showTracklistGenre ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Added Date</span>
                    <button
                      className={`settings-toggle ${showTracklistAddedDate ? 'active' : ''}`}
                      onClick={() => setShowTracklistAddedDate(!showTracklistAddedDate)}
                    >
                      {showTracklistAddedDate ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Play Count</span>
                    <button
                      className={`settings-toggle ${showTracklistPlayCount ? 'active' : ''}`}
                      onClick={() => setShowTracklistPlayCount(!showTracklistPlayCount)}
                    >
                      {showTracklistPlayCount ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {bitPerfectModeActive && (
              <p className="settings-note">
                {BIT_PERFECT_DSP_DISABLED_MESSAGE}
              </p>
            )}
            {normalizationTargetError && (
              <p className="settings-note settings-note-error">{normalizationTargetError}</p>
            )}
            {!normalizationEnabled && (
              <p className="settings-note settings-note-error">
                ReplayGain is configured but playback gain is bypassed while normalization is off.
              </p>
            )}
            <RemoteServersPanel />
          </section>
            )}

            {activeSectionId === 'analyzer' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Analyzer</h3>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Visualizer</div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <span className="settings-field-label">Mini Player Visualizer</span>
                    <SettingsSegmentedControl
                      ariaLabel="Mini player visualizer"
                      fullWidth
                      options={MINI_PLAYER_VISUALIZER_OPTIONS}
                      value={miniPlayerVisualizerMode}
                      onChange={handleMiniPlayerVisualizerModeChange}
                    />
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Visualizer</span>
                    <button
                      className={`settings-toggle ${isRunning ? 'active' : ''}`}
                      onClick={() => setIsRunning(!isRunning)}
                    >
                      {isRunning ? 'Running' : 'Paused'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'audio' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Audio Output</h3>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Playback Path</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Playback Path</span>
                    <div className="settings-inline-row">
                      <button
                        className={`settings-toggle ${playbackOutputMode === 'standard' ? 'active' : ''}`}
                        onClick={() => handlePlaybackPathChange('standard')}
                      >
                        Standard
                      </button>
                      <div className="settings-inline-row">
                        <button
                          className={`settings-toggle ${playbackOutputMode === 'bitperfect' ? 'active' : ''}`}
                          onClick={() => handlePlaybackPathChange('bitperfect')}
                        >
                          Bit-Perfect (Exclusive)
                        </button>
                        <span className="settings-chip settings-chip-mono settings-chip-danger">
                          Experimental
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="settings-field">
                    <span className="settings-field-label">Native Status</span>
                    <div className="settings-inline-row">
                      <span className="settings-chip settings-chip-mono">
                        {nativeBackendLabel}
                      </span>
                      {nativeAudioCapabilities.activeSampleRate && (
                        <span className="settings-chip settings-chip-mono">
                          {(nativeAudioCapabilities.activeSampleRate / 1000).toFixed(1)} kHz
                        </span>
                      )}
                      <span className="settings-chip settings-chip-mono">
                        {nativeAudioCapabilities.activeDeviceExclusive ? 'Exclusive' : 'Shared/Off'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-audio-control">
              <AudioOutputSelect />
            </div>
            {playbackModeStatusMessage && (
              <p className="settings-note">
                {playbackModeStatusMessage}
              </p>
            )}
            {bitPerfectModeActive && (
              <p className="settings-note">
                {BIT_PERFECT_DSP_DISABLED_MESSAGE}
              </p>
            )}
            <DelayCompensationPanel />
            <ChannelRoutingPanel />
          </section>
            )}

            {activeSectionId === 'playback' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Playback</h3>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Navigation</div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <span className="settings-field-label">Jump to Playing opens</span>
                    <SettingsSegmentedControl
                      ariaLabel="Jump to Playing destination"
                      fullWidth
                      options={JUMP_TO_PLAYING_OPTIONS}
                      value={jumpToPlayingDestination}
                      onChange={setJumpToPlayingDestination}
                    />
                  </div>
                </div>
                {jumpToPlayingDestination !== DEFAULT_JUMP_TO_PLAYING_DESTINATION && (
                  <p className="settings-note">Default: Smart Source</p>
                )}
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Sleep Timer</div>
                <div className="settings-sleep-controls">
                  <div className="settings-sleep-presets">
                    {SLEEP_TIMER_PRESET_MINUTES.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className="settings-btn"
                        onClick={() => handleSleepTimerPreset(minutes)}
                        disabled={!canStartSleepTimer}
                      >
                        {minutes} min
                      </button>
                    ))}
                  </div>
                  <div className="settings-sleep-custom-row">
                    <input
                      className="settings-select"
                      type="number"
                      min={SLEEP_TIMER_MIN_MINUTES}
                      max={SLEEP_TIMER_MAX_MINUTES}
                      step={1}
                      value={sleepTimerCustomMinutesInput}
                      onChange={(event) => setSleepTimerCustomMinutesInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        handleSleepTimerCustomStart()
                      }}
                    />
                    <button
                      type="button"
                      className="settings-btn settings-btn-primary"
                      onClick={handleSleepTimerCustomStart}
                      disabled={!canStartSleepTimer}
                    >
                      {sleepTimerIsActive ? 'Replace Timer' : 'Start Timer'}
                    </button>
                    {sleepTimerIsActive && (
                      <button
                        type="button"
                        className="settings-btn"
                        onClick={handleSleepTimerCancel}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <p className={`settings-note settings-sleep-status${sleepTimerIsActive ? ' settings-sleep-status-active' : ''}`}>
                  {sleepTimerStatusLabel}
                </p>
                {sleepTimerFeedback && (
                  <p className={`settings-note ${sleepTimerFeedbackTone === 'error' ? 'settings-note-error' : 'settings-note-success'}`}>
                    {sleepTimerFeedback}
                  </p>
                )}
                {!canStartSleepTimer && (
                  <p className="settings-note">
                    Load a track to start a sleep timer.
                  </p>
                )}
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'keybinds' && <KeybindSettings />}

            {activeSectionId === 'integrations' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Integrations</h3>
            </div>
            <div className="settings-integration-cards">
              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>AI Configuration</h4>
                  <p>Configure your preferred API provider for AI Equalizer generation and Lyrics Romanization.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="settings-field-label" style={{ margin: 0 }}>AI Provider</label>
                      {provider !== 'none' && (
                        (() => {
                          const links: Record<string, { label: string; url: string }> = {
                            gemini: { label: 'Get Gemini API Key', url: 'https://aistudio.google.com/app/apikey' },
                            openai: { label: 'Get OpenAI API Key', url: 'https://platform.openai.com/api-keys' },
                            claude: { label: 'Get Anthropic API Key', url: 'https://console.anthropic.com/settings/keys' },
                            groq: { label: 'Get Groq API Key', url: 'https://console.groq.com/keys' },
                            deepseek: { label: 'Get DeepSeek API Key', url: 'https://platform.deepseek.com/api_keys' },
                            ollama: { label: 'Download Ollama', url: 'https://ollama.com/download' }
                          }
                          const target = links[provider]
                          if (!target) return null
                          return (
                            <button
                              type="button"
                              onClick={() => openExternalLink(target.url)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--accent, #60a5fa)',
                                cursor: 'pointer',
                                fontSize: '0.82em',
                                padding: 0,
                                textDecoration: 'underline',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title={`Open ${target.label} webpage in browser`}
                            >
                              🔑 {target.label} ↗
                            </button>
                          )
                        })()
                      )}
                    </div>
                    <select
                      className="settings-select"
                      value={provider}
                      onChange={(e) => setAiProvider(e.target.value as any)}
                    >
                      <option value="none">None (Offline Heuristics)</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Anthropic Claude</option>
                      <option value="groq">Groq</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="ollama">Ollama (Local)</option>
                    </select>
                  </div>
                  {provider === 'ollama' && (
                    <div className="settings-field">
                      <label className="settings-field-label">Server URL</label>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="http://localhost:11434"
                        value={serverUrl}
                        onChange={(e) => setAiServerUrl(e.target.value)}
                      />
                    </div>
                  )}
                  {provider !== 'none' && provider !== 'ollama' && (
                    <div className="settings-field" style={{ width: '100%' }}>
                      <label className="settings-field-label" style={{ marginBottom: '6px' }}>API Key</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                        <input
                          type={showAiApiKey ? 'text' : 'password'}
                          className="settings-input"
                          style={{
                            width: '100%',
                            minHeight: '40px',
                            paddingRight: apiKey ? '110px' : '65px',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '13px',
                            letterSpacing: showAiApiKey ? 'normal' : '0.12em'
                          }}
                          placeholder={`Enter your ${provider === 'gemini' ? 'Google Gemini' : provider === 'claude' ? 'Anthropic Claude' : provider.toUpperCase()} API Key`}
                          value={apiKey}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            right: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {apiKey && (
                            <button
                              type="button"
                              onClick={() => setAiApiKey('')}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                                color: 'var(--text-muted, #9ca3af)',
                                cursor: 'pointer',
                                fontSize: '0.78em',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                transition: 'all 0.15s ease'
                              }}
                              title={`Clear API key for ${provider}`}
                            >
                              Clear
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowAiApiKey((v) => !v)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                              color: showAiApiKey ? 'var(--accent, #60a5fa)' : 'var(--text-muted, #9ca3af)',
                              cursor: 'pointer',
                              fontSize: '0.78em',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontWeight: 500,
                              transition: 'all 0.15s ease'
                            }}
                            title={showAiApiKey ? 'Hide API key' : 'Show API key'}
                          >
                            {showAiApiKey ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '0.78em', opacity: 0.65 }}>
                        Keys are saved individually per provider and never shared or sent to third parties.
                      </p>
                    </div>
                  )}
                  {provider !== 'none' && (
                    <div className="settings-field">
                      <label className="settings-field-label">Model</label>
                      <select
                        className="settings-select"
                        value={
                          (PROVIDER_MODEL_PRESETS[provider] || []).includes(model)
                            ? model
                            : '__custom__'
                        }
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '__custom__') {
                            if ((PROVIDER_MODEL_PRESETS[provider] || []).includes(model)) {
                              setAiModel('')
                            }
                          } else {
                            setAiModel(val)
                          }
                        }}
                      >
                        {((PROVIDER_MODEL_PRESETS[provider] || []) as string[]).map((preset: string) => (
                          <option key={preset} value={preset}>
                            {preset}{preset === DEFAULT_MODELS[provider] ? ' (Default)' : ''}
                          </option>
                        ))}
                        <option value="__custom__">Custom Model...</option>
                      </select>
                      {!((PROVIDER_MODEL_PRESETS[provider] || []).includes(model)) && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="text"
                            className="settings-input"
                            placeholder={DEFAULT_MODELS[provider] ? `e.g. ${DEFAULT_MODELS[provider]}` : 'Enter custom model name'}
                            value={model}
                            onChange={(e) => setAiModel(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {provider !== 'none' && (
                    <>
                      <div className="settings-field settings-field-inline">
                        <div>
                          <span className="settings-field-label">Auto-Romanize Non-Latin Lyrics</span>
                          <p style={{ margin: '2px 0 0', fontSize: '0.82em', opacity: 0.7 }}>
                            Automatically transliterate Hangul, Kana/Kanji, Hanzi, and Cyrillic lyrics to Latin script on track start.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`settings-toggle ${autoRomanize ? 'active' : ''}`}
                          onClick={() => setAiAutoRomanize(!autoRomanize)}
                        >
                          {autoRomanize ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      <div className="settings-field settings-field-inline">
                        <div>
                          <span className="settings-field-label">Auto-Translate Lyrics</span>
                          <p style={{ margin: '2px 0 0', fontSize: '0.82em', opacity: 0.7 }}>
                            Automatically translate lyrics into your target language on track start.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`settings-toggle ${autoTranslate ? 'active' : ''}`}
                          onClick={() => setAiAutoTranslate(!autoTranslate)}
                        >
                          {autoTranslate ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      <div className="settings-field">
                        <label className="settings-field-label">Translation Target Language</label>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="English"
                          value={targetLanguage}
                          onChange={(e) => setAiTargetLanguage(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Scrobblers</h4>
                  <p>Track your listening history and send Now Playing updates across services.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Scrobbling</span>
                    <button
                      className={`settings-toggle ${lastFmEnabled ? 'active' : ''}`}
                      onClick={() => void setLastFmEnabled(!lastFmEnabled)}
                    >
                      {lastFmEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* Last.fm Card */}
                  <div className="settings-scrobbler-card">
                    <div className="settings-scrobbler-header">
                      <div className="settings-scrobbler-info">
                        <div className="settings-scrobbler-icon-row">
                          <span className="settings-scrobbler-title">Last.fm</span>
                          {officialLastFmProfile?.connected && (
                            <span className="settings-chip settings-chip-mono">Connected</span>
                          )}
                        </div>
                        <span className="settings-scrobbler-subtitle">
                          {officialLastFmProfile?.connected
                            ? `Signed in as ${officialLastFmProfile.username}`
                            : 'Track listening history on Last.fm'}
                        </span>
                      </div>
                      <div className="settings-inline-row">
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => setLastFmDialogOpen(true)}
                        >
                          {officialLastFmProfile?.connected ? 'Manage' : 'Sign In'}
                        </button>
                        {officialLastFmProfile?.connected && (
                          <button
                            className={`settings-toggle ${officialLastFmProfile.enabled ? 'active' : ''}`}
                            onClick={() => void setLastFmProfileEnabled(LASTFM_OFFICIAL_PROFILE_ID, !officialLastFmProfile.enabled)}
                            aria-label="Toggle Last.fm Scrobbling"
                          >
                            {officialLastFmProfile.enabled ? 'On' : 'Off'}
                          </button>
                        )}
                      </div>
                    </div>
                    {officialLastFmProfile?.connected && (
                      <div className="settings-scrobbler-subfield">
                        <div className="settings-scrobbler-subfield-text">
                          <span className="settings-scrobbler-subfield-label">Send Now Playing</span>
                          <span className="settings-scrobbler-subfield-desc">Notify Last.fm of the track currently playing</span>
                        </div>
                        <button
                          className={`settings-toggle ${officialLastFmProfile.nowPlayingEnabled !== false ? 'active' : ''}`}
                          onClick={() => void setLastFmProfileNowPlaying(LASTFM_OFFICIAL_PROFILE_ID, !(officialLastFmProfile.nowPlayingEnabled !== false))}
                          aria-label="Toggle Last.fm Now Playing"
                        >
                          {officialLastFmProfile.nowPlayingEnabled !== false ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ListenBrainz Card */}
                  <div className="settings-scrobbler-card">
                    <div className="settings-scrobbler-header">
                      <div className="settings-scrobbler-info">
                        <div className="settings-scrobbler-icon-row">
                          <span className="settings-scrobbler-title">ListenBrainz</span>
                          {officialListenBrainzProfile?.connected && (
                            <span className="settings-chip settings-chip-mono">Connected</span>
                          )}
                        </div>
                        <span className="settings-scrobbler-subtitle">
                          {officialListenBrainzProfile?.connected
                            ? 'Connected to ListenBrainz'
                            : 'Track listening history on ListenBrainz'}
                        </span>
                      </div>
                      <div className="settings-inline-row">
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => {
                            setListenBrainzTokenInput('')
                            setListenBrainzDialogOpen(true)
                          }}
                        >
                          {officialListenBrainzProfile?.connected ? 'Configure' : 'Connect'}
                        </button>
                        {officialListenBrainzProfile?.connected && (
                          <button
                            className={`settings-toggle ${officialListenBrainzProfile.enabled ? 'active' : ''}`}
                            onClick={() => void setLastFmProfileEnabled(LISTENBRAINZ_OFFICIAL_PROFILE_ID, !officialListenBrainzProfile.enabled)}
                            aria-label="Toggle ListenBrainz Scrobbling"
                          >
                            {officialListenBrainzProfile.enabled ? 'On' : 'Off'}
                          </button>
                        )}
                      </div>
                    </div>
                    {officialListenBrainzProfile?.connected && (
                      <div className="settings-scrobbler-subfield">
                        <div className="settings-scrobbler-subfield-text">
                          <span className="settings-scrobbler-subfield-label">Send Now Playing</span>
                          <span className="settings-scrobbler-subfield-desc">Notify ListenBrainz of the track currently playing</span>
                        </div>
                        <button
                          className={`settings-toggle ${officialListenBrainzProfile.nowPlayingEnabled !== false ? 'active' : ''}`}
                          onClick={() => void setLastFmProfileNowPlaying(LISTENBRAINZ_OFFICIAL_PROFILE_ID, !(officialListenBrainzProfile.nowPlayingEnabled !== false))}
                          aria-label="Toggle ListenBrainz Now Playing"
                        >
                          {officialListenBrainzProfile.nowPlayingEnabled !== false ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Queue & Status Info */}
                  <p className="settings-note">{lastFmStatusLabel}</p>
                  {lastFmPendingScrobbles > 0 && (
                    <p className="settings-note">{lastFmQueueLabel}</p>
                  )}
                  {lastFmProfileFeedback && <p className="settings-note settings-note-success">{lastFmProfileFeedback}</p>}
                  {lastFmAuthHint && <p className="settings-note settings-note-success">{lastFmAuthHint}</p>}
                  {lastFmResolvedError && <p className="settings-note settings-note-error">{lastFmResolvedError}</p>}
                  {!lastFmHasApiCredentials && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', padding: '12px', marginTop: '4px' }}>
                      <p className="settings-note settings-note-error" style={{ margin: 0, marginBottom: '8px' }}>
                        Last.fm API credentials are missing in this build. Provide your custom API credentials below to connect:
                      </p>
                      <div className="settings-grid">
                        <label className="settings-field">
                          <span className="settings-field-label">Custom Last.fm API Key</span>
                          <input
                            className="settings-input"
                            type="text"
                            placeholder="Enter Last.fm API Key"
                            value={lastFmCustomApiKeyInput}
                            onChange={(e) => setLastFmCustomApiKeyInput(e.target.value)}
                            onBlur={() => {
                              const nextKey = lastFmCustomApiKeyInput.trim() || null
                              const nextSecret = lastFmCustomSharedSecretInput.trim() || null
                              if (
                                nextKey !== (lastFmStatus?.customApiKey ?? null) ||
                                nextSecret !== (lastFmStatus?.customSharedSecret ?? null)
                              ) {
                                void setLastFmCustomCredentials(nextKey, nextSecret)
                              }
                            }}
                          />
                        </label>
                        <label className="settings-field">
                          <span className="settings-field-label">Custom Last.fm Shared Secret</span>
                          <input
                            className="settings-input"
                            type="password"
                            placeholder="Enter Last.fm Shared Secret"
                            value={lastFmCustomSharedSecretInput}
                            onChange={(e) => setLastFmCustomSharedSecretInput(e.target.value)}
                            onBlur={() => {
                              const nextKey = lastFmCustomApiKeyInput.trim() || null
                              const nextSecret = lastFmCustomSharedSecretInput.trim() || null
                              if (
                                nextKey !== (lastFmStatus?.customApiKey ?? null) ||
                                nextSecret !== (lastFmStatus?.customSharedSecret ?? null)
                              ) {
                                void setLastFmCustomCredentials(nextKey, nextSecret)
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Advanced / Custom Endpoints */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        className="settings-btn settings-link-btn"
                        style={{ padding: 0, fontSize: '0.85rem' }}
                        onClick={() => setCustomEndpointsExpanded(!customEndpointsExpanded)}
                      >
                        {customEndpointsExpanded ? '▼ Hide Custom Scrobble Endpoints' : '► Custom Scrobble Endpoints & Overrides'}
                      </button>
                      {customEndpointsExpanded && (
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={openLastFmCreateProfileModal}
                        >
                          Add Custom Endpoint
                        </button>
                      )}
                    </div>
                    {customEndpointsExpanded && (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {customScrobbleProfiles.length > 0 ? (
                          <div className="settings-lastfm-profile-list">
                            {customScrobbleProfiles.map((profile) => {
                              const canToggleProfile = canToggleLastFmProfile(profile)
                              const rowClassName = [
                                'settings-lastfm-profile-row',
                                profile.enabled ? 'active' : 'inactive',
                                !canToggleProfile ? 'blocked' : ''
                              ].filter(Boolean).join(' ')

                              return (
                                <div key={profile.id} className={rowClassName}>
                                  <label className="settings-lastfm-profile-check">
                                    <input
                                      type="checkbox"
                                      checked={profile.enabled}
                                      disabled={!canToggleProfile}
                                      onChange={() => handleToggleLastFmProfile(profile)}
                                      aria-label={`${profile.enabled ? 'Disable' : 'Enable'} ${profile.name}`}
                                    />
                                    <span aria-hidden="true" />
                                  </label>
                                  <div className="settings-lastfm-profile-main">
                                    <div className="settings-lastfm-profile-title-row">
                                      <span className="settings-lastfm-profile-name">{profile.name}</span>
                                      <span className="settings-chip settings-chip-mono">
                                        {profile.protocolLabel}
                                      </span>
                                    </div>
                                    <div className="settings-lastfm-profile-meta">
                                      <span>{profile.apiBaseUrl}</span>
                                      <span>
                                        {profile.connected
                                          ? profile.username
                                            ? `Connected as ${profile.username}`
                                            : 'Token configured'
                                          : 'Not connected'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="settings-lastfm-profile-actions">
                                    <button
                                      type="button"
                                      className="settings-lastfm-icon-btn"
                                      onClick={() => openLastFmEditProfileModal(profile)}
                                      title="Edit"
                                      aria-label={`Edit ${profile.name}`}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 20H8.4L19.2 9.2C20.1 8.3 20.1 6.9 19.2 6L18 4.8C17.1 3.9 15.7 3.9 14.8 4.8L4 15.6V20Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M13.8 5.8L18.2 10.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                      </svg>
                                    </button>
                                    {profile.canDelete && (
                                      <button
                                        type="button"
                                        className="settings-lastfm-icon-btn danger"
                                        onClick={() => handleDeleteLastFmProfile(profile)}
                                        title="Delete"
                                        aria-label={`Delete ${profile.name}`}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                          <path d="M6 7V19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                          <path d="M4 7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                          <path d="M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            No custom endpoints configured. You can add Libre.fm, GNU FM, or custom servers.
                          </div>
                        )}
                        <div className="settings-grid" style={{ marginTop: '8px' }}>
                          <label className="settings-field">
                            <span className="settings-field-label">Custom Last.fm API Key</span>
                            <input
                              className="settings-select"
                              type="text"
                              placeholder="Optional overrides"
                              value={lastFmCustomApiKeyInput}
                              onChange={(e) => setLastFmCustomApiKeyInput(e.target.value)}
                              onBlur={() => {
                                const nextKey = lastFmCustomApiKeyInput.trim() || null
                                const nextSecret = lastFmCustomSharedSecretInput.trim() || null
                                if (
                                  nextKey !== (lastFmStatus?.customApiKey ?? null) ||
                                  nextSecret !== (lastFmStatus?.customSharedSecret ?? null)
                                ) {
                                  void setLastFmCustomCredentials(nextKey, nextSecret)
                                }
                              }}
                            />
                          </label>
                          <label className="settings-field">
                            <span className="settings-field-label">Custom Last.fm Shared Secret</span>
                            <input
                              className="settings-select"
                              type="password"
                              placeholder="Optional overrides"
                              value={lastFmCustomSharedSecretInput}
                              onChange={(e) => setLastFmCustomSharedSecretInput(e.target.value)}
                              onBlur={() => {
                                const nextKey = lastFmCustomApiKeyInput.trim() || null
                                const nextSecret = lastFmCustomSharedSecretInput.trim() || null
                                if (
                                  nextKey !== (lastFmStatus?.customApiKey ?? null) ||
                                  nextSecret !== (lastFmStatus?.customSharedSecret ?? null)
                                ) {
                                  void setLastFmCustomCredentials(nextKey, nextSecret)
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Lyrics</h4>
                  <p>LRC, XLRC, embedded lyrics, and optional XLRCDB/LRCLIB lookup.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Online Lyrics Lookup</span>
                    <button
                      className={`settings-toggle ${lyricsEnabled ? 'active' : ''}`}
                      onClick={() => void setLyricsEnabled(!lyricsEnabled)}
                    >
                      {lyricsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Prefer Online Synced</span>
                    <button
                      className={`settings-toggle ${lyricsDisplaySettings.preferOnlineSyncedLyrics ? 'active' : ''}`}
                      onClick={() => setLyricsPreferOnlineSyncedLyrics(!lyricsDisplaySettings.preferOnlineSyncedLyrics)}
                    >
                      {lyricsDisplaySettings.preferOnlineSyncedLyrics ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <label className="settings-field">
                    <span className="settings-field-label">LRCLIB Base URL</span>
                    <input
                      className="settings-select"
                      type="url"
                      value={lyricsLrclibBaseUrlInput}
                      onChange={(event) => setLyricsLrclibBaseUrlInput(event.target.value)}
                      onBlur={() => {
                        if (lyricsLrclibBaseUrlInput.trim() === lyricsStatus?.lrclibBaseUrl) return
                        void setLyricsLrclibBaseUrl(lyricsLrclibBaseUrlInput).then((status) => {
                          if (status) setLyricsLrclibBaseUrlInput(status.lrclibBaseUrl)
                        })
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      placeholder={LRCLIB_OFFICIAL_BASE_URL}
                      spellCheck={false}
                    />
                  </label>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Word Timing</span>
                    <button
                      className={`settings-toggle ${lyricsDisplaySettings.wordTimingEnabled ? 'active' : ''}`}
                      onClick={() => setLyricsWordTimingEnabled(!lyricsDisplaySettings.wordTimingEnabled)}
                    >
                      {lyricsDisplaySettings.wordTimingEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">XLRC Furigana</span>
                    <button
                      className={`settings-toggle ${lyricsDisplaySettings.furiganaEnabled ? 'active' : ''}`}
                      onClick={() => setLyricsFuriganaEnabled(!lyricsDisplaySettings.furiganaEnabled)}
                    >
                      {lyricsDisplaySettings.furiganaEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">XLRC Translations</span>
                    <button
                      className={`settings-toggle ${lyricsDisplaySettings.translationsEnabled ? 'active' : ''}`}
                      onClick={() => setLyricsTranslationsEnabled(!lyricsDisplaySettings.translationsEnabled)}
                    >
                      {lyricsDisplaySettings.translationsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">XLRC Voice Labels</span>
                    <button
                      className={`settings-toggle ${lyricsDisplaySettings.voiceLabelsEnabled ? 'active' : ''}`}
                      onClick={() => setLyricsVoiceLabelsEnabled(!lyricsDisplaySettings.voiceLabelsEnabled)}
                    >
                      {lyricsDisplaySettings.voiceLabelsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="settings-field-label">XLRC Translation Language Priority</span>
                    <p style={{ margin: '2px 0 8px', fontSize: '0.82em', opacity: 0.7 }}>
                      Prioritize which translation tracks in .xlrc files are displayed under original lyrics lines (matched left to right).
                    </p>
                    
                    {/* Active priority chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                      {lyricsDisplaySettings.translationLanguagePriority.map((lang, index) => {
                        const suggestions = [
                          { code: 'en', label: 'English' },
                          { code: 'hi-Latn', label: 'Hindi (Romanized)' },
                          { code: 'pa-Latn', label: 'Punjabi (Romanized)' },
                          { code: 'ta-Latn', label: 'Tamil (Romanized)' },
                          { code: 'te-Latn', label: 'Telugu (Romanized)' },
                          { code: 'bn-Latn', label: 'Bengali (Romanized)' },
                          { code: 'ml-Latn', label: 'Malayalam (Romanized)' },
                          { code: 'kn-Latn', label: 'Kannada (Romanized)' },
                          { code: 'mr-Latn', label: 'Marathi (Romanized)' },
                          { code: 'gu-Latn', label: 'Gujarati (Romanized)' },
                          { code: 'ur-Latn', label: 'Urdu (Romanized)' },
                          { code: 'hi', label: 'Hindi' },
                          { code: 'pa', label: 'Punjabi' },
                          { code: 'ta', label: 'Tamil' },
                          { code: 'te', label: 'Telugu' },
                          { code: 'bn', label: 'Bengali' },
                          { code: 'ml', label: 'Malayalam' },
                          { code: 'kn', label: 'Kannada' },
                          { code: 'mr', label: 'Marathi' },
                          { code: 'gu', label: 'Gujarati' },
                          { code: 'ur', label: 'Urdu' },
                          { code: 'ja-Latn', label: 'Japanese (Romaji)' },
                          { code: 'ko-Latn', label: 'Korean (Romaja)' },
                          { code: 'zh-Latn', label: 'Chinese (Pinyin)' },
                          { code: 'ja', label: 'Japanese' },
                          { code: 'ko', label: 'Korean' },
                          { code: 'zh', label: 'Chinese' },
                          { code: 'es', label: 'Spanish' },
                          { code: 'fr', label: 'French' },
                          { code: 'de', label: 'German' },
                          { code: 'ru', label: 'Russian' },
                          { code: 'ar', label: 'Arabic' }
                        ]
                        const match = suggestions.find(s => s.code.toLowerCase() === lang.toLowerCase())
                        return (
                          <span
                            key={lang}
                            className="settings-chip"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px' }}
                          >
                            <span style={{ opacity: 0.5, fontSize: '0.85em' }}>{index + 1}.</span>
                            <strong>{lang}</strong>
                            {match && <span style={{ opacity: 0.65, fontSize: '0.85em' }}>({match.label})</span>}
                            <button
                              type="button"
                              onClick={() => {
                                const next = lyricsDisplaySettings.translationLanguagePriority.filter((_, i) => i !== index)
                                setLyricsTranslationLanguagePriority(next)
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0 2px',
                                marginLeft: '2px',
                                opacity: 0.6,
                                lineHeight: 1
                              }}
                              title={`Remove ${lang}`}
                            >
                              ✕
                            </button>
                          </span>
                        )
                      })}
                    </div>

                    {/* Quick Add Suggestions */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8em', opacity: 0.65 }}>Quick add:</span>
                      {[
                        { code: 'en', label: 'English' },
                        { code: 'hi-Latn', label: 'Hindi (Romanized)' },
                        { code: 'pa-Latn', label: 'Punjabi (Romanized)' },
                        { code: 'ta-Latn', label: 'Tamil (Romanized)' },
                        { code: 'te-Latn', label: 'Telugu (Romanized)' },
                        { code: 'bn-Latn', label: 'Bengali (Romanized)' },
                        { code: 'ml-Latn', label: 'Malayalam (Romanized)' },
                        { code: 'kn-Latn', label: 'Kannada (Romanized)' },
                        { code: 'mr-Latn', label: 'Marathi (Romanized)' },
                        { code: 'gu-Latn', label: 'Gujarati (Romanized)' },
                        { code: 'ur-Latn', label: 'Urdu (Romanized)' },
                        { code: 'hi', label: 'Hindi' },
                        { code: 'pa', label: 'Punjabi' },
                        { code: 'ta', label: 'Tamil' },
                        { code: 'te', label: 'Telugu' },
                        { code: 'bn', label: 'Bengali' },
                        { code: 'ml', label: 'Malayalam' },
                        { code: 'kn', label: 'Kannada' },
                        { code: 'mr', label: 'Marathi' },
                        { code: 'gu', label: 'Gujarati' },
                        { code: 'ur', label: 'Urdu' },
                        { code: 'ja-Latn', label: 'Japanese (Romaji)' },
                        { code: 'ko-Latn', label: 'Korean (Romaja)' },
                        { code: 'zh-Latn', label: 'Chinese (Pinyin)' },
                        { code: 'ja', label: 'Japanese' },
                        { code: 'ko', label: 'Korean' },
                        { code: 'zh', label: 'Chinese' },
                        { code: 'es', label: 'Spanish' },
                        { code: 'fr', label: 'French' },
                        { code: 'de', label: 'German' },
                        { code: 'ru', label: 'Russian' },
                        { code: 'ar', label: 'Arabic' }
                      ].filter(
                        s => !lyricsDisplaySettings.translationLanguagePriority.some(p => p.toLowerCase() === s.code.toLowerCase())
                      ).map(suggestion => (
                        <button
                          key={suggestion.code}
                          type="button"
                          className="settings-chip settings-chip-mono"
                          style={{ cursor: 'pointer', opacity: 0.85, padding: '2px 8px', fontSize: '0.8em' }}
                          onClick={() => {
                            const next = [...lyricsDisplaySettings.translationLanguagePriority, suggestion.code]
                            setLyricsTranslationLanguagePriority(next)
                          }}
                        >
                          + {suggestion.code} ({suggestion.label})
                        </button>
                      ))}
                    </div>

                    {/* Custom input */}
                    <div style={{ display: 'flex', gap: '8px', maxWidth: '380px' }}>
                      <input
                        className="settings-input"
                        type="text"
                        value={lyricsTranslationPriorityInput}
                        onChange={(event) => setLyricsTranslationPriorityInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            setLyricsTranslationLanguagePriority(lyricsTranslationPriorityInput)
                          }
                        }}
                        placeholder="e.g. it, pt-BR, vi"
                      />
                      <button
                        type="button"
                        className="settings-button"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => setLyricsTranslationLanguagePriority(lyricsTranslationPriorityInput)}
                      >
                        Set Custom Priority
                      </button>
                    </div>
                  </div>
                </div>
                <p className="settings-note">{lyricsStatusLabel}</p>
                <p className="settings-note">Musaic appends <code>/api/get</code> and <code>/api/search</code>. HTTP is supported for local mirrors.</p>
                <p className="settings-note">XLRC translation codes are matched left to right, with the first available translation shown.</p>
                {lyricsResolvedError && <p className="settings-note settings-note-error">{lyricsResolvedError}</p>}
              </div>

              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Discord</h4>
                  <p>Discord Rich Presence integration.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Discord Rich Presence</span>
                    <button
                      className={`settings-toggle ${discordEnabled ? 'active' : ''}`}
                      onClick={() => void setDiscordEnabled(!discordEnabled)}
                    >
                      {discordEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Discord Cover Art (Internet Lookup)</span>
                    <button
                      className={`settings-toggle ${discordCoverArtEnabled ? 'active' : ''}`}
                      onClick={() => void setDiscordCoverArtEnabled(!discordCoverArtEnabled)}
                      disabled={!discordEnabled}
                    >
                      {discordCoverArtEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Musaic Icon on Cover Art</span>
                    <button
                      className={`settings-toggle ${discordSmallIconEnabled ? 'active' : ''}`}
                      onClick={() => void setDiscordSmallIconEnabled(!discordSmallIconEnabled)}
                      disabled={!discordEnabled || !discordCoverArtEnabled}
                    >
                      {discordSmallIconEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Compact Status</span>
                    <SettingsSegmentedControl
                      ariaLabel="Discord compact status"
                      disabled={!discordEnabled}
                      options={DISCORD_COMPACT_STATUS_OPTIONS}
                      value={discordCompactStatusMode}
                      onChange={(value) => void setDiscordCompactStatusMode(value)}
                    />
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Profile Info Line</span>
                    <SettingsSegmentedControl
                      ariaLabel="Discord profile info line"
                      disabled={!discordEnabled}
                      options={DISCORD_EXPANDED_INFO_OPTIONS}
                      value={discordExpandedInfoMode}
                      onChange={(value) => void setDiscordExpandedInfoMode(value)}
                    />
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Title & Artist Links</span>
                    <SettingsSegmentedControl
                      ariaLabel="Discord title and artist links"
                      className="settings-segmented-control-wide"
                      disabled={!discordEnabled}
                      options={DISCORD_LINK_DESTINATION_OPTIONS}
                      value={discordLinkDestination}
                      onChange={(value) => void setDiscordLinkDestination(value)}
                    />
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Clear When Paused</span>
                    <SettingsSegmentedControl
                      ariaLabel="Discord clear presence when paused"
                      className="settings-segmented-control-wide"
                      disabled={!discordEnabled}
                      options={DISCORD_PAUSE_CLEAR_OPTIONS}
                      value={discordPauseClearMinutes}
                      onChange={(value) => void setDiscordPauseClearMinutes(value)}
                    />
                  </div>
                </div>
                <p className="settings-note">{discordStatusMessage}</p>
              </div>

              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Local API</h4>
                  <p>Companion API for local automations, launchers, widgets, and creative tools.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Local Integration API</span>
                    <button
                      className={`settings-toggle ${localApiEnabled ? 'active' : ''}`}
                      onClick={() => void setLocalApiEnabled(!localApiEnabled)}
                    >
                      {localApiEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">External Playback Controls</span>
                    <button
                      className={`settings-toggle ${localApiControlsEnabled ? 'active' : ''}`}
                      onClick={() => void setLocalApiControlsEnabled(!localApiControlsEnabled)}
                    >
                      {localApiControlsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Library Search</span>
                    <button
                      className={`settings-toggle ${localApiLibrarySearchEnabled ? 'active' : ''}`}
                      onClick={() => void setLocalApiLibrarySearchEnabled(!localApiLibrarySearchEnabled)}
                    >
                      {localApiLibrarySearchEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Favorites & Playlist Changes</span>
                    <button
                      className={`settings-toggle ${localApiLibraryWriteEnabled ? 'active' : ''}`}
                      onClick={() => void setLocalApiLibraryWriteEnabled(!localApiLibraryWriteEnabled)}
                    >
                      {localApiLibraryWriteEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="settings-field">
                    <span className="settings-field-label">Local API Port</span>
                    <div className="settings-inline-row">
                      <input
                        className="settings-select settings-inline-input settings-inline-input-compact"
                        type="number"
                        min={LOCAL_API_MIN_PORT}
                        max={LOCAL_API_MAX_PORT}
                        step={1}
                        value={localApiPortInput}
                        onChange={(event) => setLocalApiPortInput(event.target.value)}
                        onBlur={handleSaveLocalApiPort}
                      />
                      <button className="settings-btn" onClick={handleSaveLocalApiPort}>
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="settings-field">
                    <span className="settings-field-label">Local API Endpoint</span>
                    <div className="settings-inline-row">
                      <span className="settings-chip settings-chip-mono settings-chip-grow">
                        {localApiBaseUrl}
                      </span>
                      <button
                        className="settings-btn"
                        onClick={() => void copyToClipboard(`${localApiBaseUrl}/v2/capabilities`, 'Endpoint')}
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="settings-field">
                    <span className="settings-field-label">Local API Key</span>
                    <div className="settings-inline-row">
                      <span className="settings-chip settings-chip-mono settings-chip-grow">
                        {localApiToken
                          ? (showApiKey ? localApiToken : '•'.repeat(Math.min(localApiToken.length, 24)))
                          : 'Unavailable'}
                      </span>
                      <button
                        className="settings-btn"
                        onClick={() => setShowApiKey((v) => !v)}
                        disabled={!localApiToken}
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                      <button
                        className="settings-btn"
                        onClick={() => void copyToClipboard(localApiToken, 'API key')}
                        disabled={!localApiToken}
                      >
                        Copy
                      </button>
                      <button className="settings-btn settings-btn-primary" onClick={handleRotateLocalApiToken}>
                        Regenerate
                      </button>
                    </div>
                  </div>
                </div>
                <p className="settings-note">{localApiStatusLabel}</p>
                {localApiFeedback && <p className="settings-note settings-note-success">{localApiFeedback}</p>}
                {localApiErrorMessage && <p className="settings-note settings-note-error">{localApiErrorMessage}</p>}
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'experimental' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Experimental</h3>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Controller Support</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Controller Support</span>
                    <button
                      className={`settings-toggle ${controllerSupportEnabled ? 'active' : ''}`}
                      onClick={() => setControllerSupportEnabled(!controllerSupportEnabled)}
                    >
                      {controllerSupportEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="settings-note">
                    Navigate Musaic with an Xbox or PlayStation controller. D-pad/stick moves focus, A/Cross selects,
                    X/Square plays or pauses, bumpers skip tracks, triggers seek, right stick switches tabs, and
                    Menu/Options opens a radial menu for advanced controls.
                  </p>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Activity Indicator</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Scope Rail Activity Indicator</span>
                    <button
                      className={`settings-toggle ${activityIndicatorExperimentEnabled ? 'active' : ''}`}
                      onClick={() => setActivityIndicatorExperimentEnabled(!activityIndicatorExperimentEnabled)}
                    >
                      {activityIndicatorExperimentEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="settings-note">
                    Replaces the scope editor rail dot with an adaptive 5x5 activity indicator for playback, Parallax connections, scans, syncs, and transient background work.
                  </p>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Library Graph</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Library Graph</span>
                    <button
                      className={`settings-toggle ${libraryGraphEnabled ? 'active' : ''}`}
                      onClick={() => setLibraryGraphEnabled(!libraryGraphEnabled)}
                    >
                      {libraryGraphEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Open Graph</span>
                    <button
                      className="settings-btn"
                      disabled={!libraryGraphEnabled}
                      onClick={() => {
                        openFullGraph()
                        setActiveView('graph')
                      }}
                    >
                      Open Full Map
                    </button>
                  </div>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Listening Stats</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Listening Stats</span>
                    <button
                      className={`settings-toggle ${listeningStatsEnabled ? 'active' : ''}`}
                      onClick={() => setListeningStatsEnabled(!listeningStatsEnabled)}
                    >
                      {listeningStatsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Open Stats</span>
                    <button
                      className="settings-btn"
                      disabled={!listeningStatsEnabled}
                      onClick={() => setActiveView('stats')}
                    >
                      Open Listening Stats
                    </button>
                  </div>
                  <p className="settings-note">
                    Shows local listening time, plays, and rankings. Detailed history keeps recording on this installation even while the view is hidden.
                  </p>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Library Integrity Check</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Integrity Check</span>
                    <button
                      className={`settings-toggle ${libraryIntegrityEnabled ? 'active' : ''}`}
                      onClick={() => setLibraryIntegrityEnabled(!libraryIntegrityEnabled)}
                    >
                      {libraryIntegrityEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Open Scanner</span>
                    <button
                      className="settings-btn"
                      disabled={!libraryIntegrityEnabled}
                      onClick={openLibraryIntegrityPanel}
                    >
                      Open Integrity Check
                    </button>
                  </div>
                  <p className="settings-note">
                    Quick scans inspect local file headers and metadata. Deep scans decode FLAC files and add quality-signal hints.
                  </p>
                </div>
              </div>
              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Phone Remote</h4>
                  <p>Opt-in LAN controller surface for the phone PWA.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Phone Remote</span>
                    <button
                      className={`settings-toggle ${phoneRemoteEnabled ? 'active' : ''}`}
                      onClick={() => void setPhoneRemoteEnabled(!phoneRemoteEnabled)}
                    >
                      {phoneRemoteEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field">
                    <span className="settings-field-label">Phone Remote Port</span>
                    <div className="settings-inline-row">
                      <input
                        className="settings-select settings-inline-input settings-inline-input-compact"
                        type="number"
                        min={PHONE_REMOTE_MIN_PORT}
                        max={PHONE_REMOTE_MAX_PORT}
                        step={1}
                        value={phoneRemotePortInput}
                        onChange={(event) => setPhoneRemotePortInput(event.target.value)}
                        onBlur={handleSavePhoneRemotePort}
                      />
                      <button className="settings-btn" onClick={handleSavePhoneRemotePort}>
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="settings-field">
                    <span className="settings-field-label">Status</span>
                    <span className="settings-info-value">{localApiPhoneRemoteSummary}</span>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Pair a New Phone</span>
                    <button
                      className="settings-btn settings-btn-primary"
                      onClick={handleOpenPhoneRemotePairingModal}
                    >
                      Pair Phone
                    </button>
                  </div>
                </div>
                {phoneRemoteFeedback && <p className="settings-note settings-note-success">{phoneRemoteFeedback}</p>}
                {phoneRemoteErrorMessage && <p className="settings-note settings-note-error">{phoneRemoteErrorMessage}</p>}

                {/* Inline paired devices */}
                {localApiActiveDevices.length > 0 && (
                  <div className="local-api-inline-devices">
                    <div className="local-api-inline-devices-header">
                      <span className="local-api-inline-devices-count">
                        {localApiActiveDevices.length} paired phone{localApiActiveDevices.length !== 1 ? 's' : ''}
                      </span>
                      {localApiControllerUrl && localApiInlineQrSvg && (
                        <button
                          className={`settings-btn${showInlinePhoneQr ? ' settings-btn-primary' : ''}`}
                          onClick={() => setShowInlinePhoneQr((prev) => !prev)}
                        >
                          {showInlinePhoneQr ? 'Hide QR' : 'Open on Phone'}
                        </button>
                      )}
                    </div>

                    {showInlinePhoneQr && localApiControllerUrl && localApiInlineQrSvg && (
                      <div className="local-api-inline-qr">
                        <div className="local-api-pairing-qr" dangerouslySetInnerHTML={{ __html: localApiInlineQrSvg }} />
                        <p className="settings-note" style={{ textAlign: 'center', margin: 0 }}>Scan to open the remote — no new pairing needed</p>
                        <button
                          className="settings-btn settings-btn-primary"
                          onClick={() => { void navigator.clipboard.writeText(localApiControllerUrl) }}
                        >
                          Copy Link
                        </button>
                      </div>
                    )}

                    <div className="local-api-inline-devices-list">
                      {localApiActiveDevices.map((device) => (
                        <div key={device.id} className="local-api-inline-device">
                          <div className="local-api-inline-device-info">
                            <span className="local-api-inline-device-name">{device.name}</span>
                            <span className="local-api-inline-device-detail">
                              Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
                            </span>
                          </div>
                          <button
                            className="settings-btn settings-btn-danger"
                            onClick={() => handleRevokePhoneRemotePairedDevice(device.id)}
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                      {localApiActiveDevices.length >= 2 && (
                        <button className="settings-btn settings-btn-danger" onClick={handleRevokeAllPhoneRemoteDevices}>
                          Revoke All
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="settings-integration-card">
                <div className="settings-integration-card-head">
                  <h4>Library Sync</h4>
                  <p>Two-way favorites and playlist sync with paired phones. Independent of playback controls.</p>
                </div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Library Sync</span>
                    <button
                      className={`settings-toggle ${phoneRemoteSyncEnabled ? 'active' : ''}`}
                      onClick={() => void setPhoneRemoteSyncEnabled(!phoneRemoteSyncEnabled)}
                    >
                      {phoneRemoteSyncEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Sync Now</span>
                    <button
                      className="settings-btn settings-btn-primary"
                      disabled={!phoneRemoteEnabled || !phoneRemoteSyncEnabled || phoneRemotePairedDeviceCount === 0}
                      onClick={() => void requestPhoneRemoteSync()}
                    >
                      {phoneRemoteSync?.requestedAt ? 'Waiting for phone…' : 'Sync Now'}
                    </button>
                  </div>
                  <div className="settings-field">
                    <span className="settings-field-label">Last Synced</span>
                    <span className="settings-info-value">
                      {phoneRemoteSync?.lastSyncedAt
                        ? new Date(phoneRemoteSync.lastSyncedAt).toLocaleString()
                        : 'Never (the phone runs the sync — it picks requests up when it can reach this desktop)'}
                    </span>
                  </div>
                </div>
                {phoneRemoteSyncConflictCount > 0 && (
                  <div className="local-api-inline-devices">
                    <div className="local-api-inline-devices-header">
                      <span className="local-api-inline-devices-count">
                        {phoneRemoteSyncConflictCount} sync conflict{phoneRemoteSyncConflictCount !== 1 ? 's' : ''} need attention
                      </span>
                      <button className="settings-btn settings-btn-primary" onClick={openPhoneSyncConflictResolver}>
                        Review conflicts
                      </button>
                    </div>
                    <p className="settings-note">
                      {phoneRemoteSyncPendingCount > 0
                        ? `${phoneRemoteSyncPendingCount} choice${phoneRemoteSyncPendingCount === 1 ? '' : 's'} waiting for the phone to pick up.`
                        : 'Open the resolver to compare both playlists and preview the result before choosing.'}
                    </p>
                  </div>
                )}
              </div>
              <div className="settings-card">
                <div className="settings-card-label">Listen Together (Parallax Engine)</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Enable Listen Together</span>
                    <button
                      className={`settings-toggle ${parallaxExperimentEnabled ? 'active' : ''}`}
                      onClick={() => handleToggleParallaxExperiment(!parallaxExperimentEnabled)}
                    >
                      {parallaxExperimentEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="settings-note">
                    Experimental LAN multi-room audio synchronization and collaborative playlist voting. Reveals a dedicated <strong>Listen Together</strong> section where
                    you can orchestrate speakers, invite peers via QR code, and approve real-time guest track recommendations. Turning this off stops all
                    Parallax networking on this machine and hides the section.
                  </p>
                </div>
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'parallax' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Listen Together</h3>
            </div>
            <div className="settings-cards">
              <ParallaxSettingsPanel />
            </div>
          </section>
            )}

            {activeSectionId === 'info' && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Info</h3>
            </div>
            <div className="settings-cards">
              <div className="settings-card">
                <div className="settings-card-label">Updates</div>
                <div className="settings-grid">
                  <div className="settings-field">
                    <span className="settings-field-label">App Version</span>
                    <div className="settings-version-inline">
                      <button
                        type="button"
                        className="settings-version-reveal-btn settings-info-value"
                        onClick={handleAppVersionClick}
                        aria-label={developerSectionVisible ? 'Open developer settings' : 'App version'}
                      >
                        {appVersionLabel}
                      </button>
                      {appBuildLabel && (
                        <button
                          type="button"
                          className="settings-build-copy-btn"
                          title={appBuildTooltip || undefined}
                          aria-label="Copy full build hash"
                          onClick={() => void copyInfoToClipboard(appBuildCopyValue, 'Build hash')}
                        >
                          {appBuildLabel}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="settings-fields-row">
                    <div className="settings-field settings-field-inline">
                      <span className="settings-field-label">Auto-check on Startup</span>
                      <button
                        className={`settings-toggle ${autoCheckEnabled ? 'active' : ''}`}
                        onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
                      >
                        {autoCheckEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                    <div className="settings-field settings-field-inline">
                      <span className="settings-field-label">Check for Updates</span>
                      <button
                        className="settings-btn settings-btn-primary"
                        onClick={() => void checkForUpdates()}
                        disabled={updateCheckState === 'checking'}
                      >
                        {updateCheckState === 'checking' ? 'Checking...' : 'Check Now'}
                      </button>
                    </div>
                    <div className="settings-field settings-field-inline">
                      <span className="settings-field-label">Download</span>
                      <button
                        className="settings-btn"
                        onClick={() => void openReleasesPage()}
                      >
                        Open Releases
                      </button>
                    </div>
                  </div>
                </div>
                {infoFeedback && (
                  <p className={`settings-note ${infoFeedbackTone === 'success' ? 'settings-note-success' : 'settings-note-error'}`}>
                    {infoFeedback}
                  </p>
                )}
                <p className={`settings-note settings-update-status settings-update-status-${updateStatusTone}`}>
                  {updateStatusMessage}
                </p>
                {updateAvailable && latestTag && (
                  <p className="settings-note settings-update-meta">
                    Latest release: {latestTag}{releaseName ? ` (${releaseName})` : ''}
                  </p>
                )}
                <p className="settings-note settings-update-meta">
                  {lastCheckedAt ? `Last checked: ${lastCheckedLabel}` : lastCheckedLabel}
                </p>
              </div>
            </div>
            <div className="settings-info-panels">
              <div className="settings-info-panel">
                <h4>Attribution</h4>
                <p>Musaic is created and maintained by solder3t.</p>
                <p className="settings-info-meta">Contact: sold3vs@gmail.com</p>
                <p className="settings-note">Musaic is a personal fork of Astra. Full credits to the original Astra developers.</p>
                <div className="settings-info-links">
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => openExternalLink(MUSAIC_REPOSITORY_URL)}
                  >
                    GitHub Repository
                  </button>
                </div>
              </div>
              <div className="settings-info-panel">
                <h4>License</h4>
                <p>Musaic is distributed under GPL-3.0-only.</p>
                <div className="settings-info-links">
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => openExternalLink(MUSAIC_LICENSE_URL)}
                  >
                    View LICENSE
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => openExternalLink(GPL_V3_URL)}
                  >
                    GPL v3 Text
                  </button>
                </div>
              </div>
            </div>
            <div className="settings-cards settings-info-transfer-card">
              <div className="settings-card">
                <div className="settings-card-label">Settings Transfer</div>
                <div className="settings-grid">
                  <div className="settings-field settings-field-inline">
                    <span className="settings-field-label">Portable Settings</span>
                    <button
                      type="button"
                      className="settings-btn settings-btn-primary"
                      onClick={() => setSettingsTransferWizardOpen(true)}
                    >
                      Open Settings Transfer Wizard
                    </button>
                  </div>
                </div>
                <p className="settings-note">
                  Import or export your Musaic settings to move preferences between installs.
                </p>
              </div>
              <ImportedListeningDataCard />
            </div>
          </section>
            )}

            {activeSectionId === 'developer' && developerSectionVisible && (
            <section className="settings-section settings-section-panel">
            <div className="settings-section-head">
              <h3>Developer</h3>
            </div>
            <div className="settings-actions settings-info-actions">
              <button
                type="button"
                className="settings-btn"
                onClick={handleHideDeveloperSection}
              >
                Hide Developer Section
              </button>
            </div>
            <div className="settings-info-panels">
              <div className="settings-info-panel">
                <h4>Memory Diagnostics</h4>
                <p>
                  Writes a CSV memory log every {diagnosticsSampleIntervalLabel} plus playback breadcrumbs
                  so you can correlate growth with track changes, buffering, gapless handoffs, and remote streams.
                </p>
                <div className="settings-field settings-field-inline">
                  <span className="settings-field-label">Diagnostics Logging</span>
                  <button
                    type="button"
                    className={`settings-toggle ${diagnosticsEnabled ? 'active' : ''}`}
                    onClick={() => void setDiagnosticsEnabled(!diagnosticsEnabled)}
                    disabled={diagnosticsIsLoading && diagnosticsStatus === null}
                  >
                    {diagnosticsEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <p className="settings-info-meta">Current log</p>
                <p className="settings-info-path">{diagnosticsCurrentLogPath}</p>
                <p className="settings-info-meta">Previous log</p>
                <p className="settings-info-path">{diagnosticsPreviousLogPath}</p>
                <p className="settings-info-meta">{diagnosticsSessionLabel}</p>
                <div className="settings-info-links">
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => void captureDiagnosticsBundle()}
                    disabled={diagnosticsIsCapturingBundle}
                  >
                    {diagnosticsIsCapturingBundle ? 'Capturing Bundle...' : 'Capture Memory Bundle'}
                  </button>
                </div>
                <p className="settings-info-meta">{diagnosticsLastBundleLabel}</p>
                {diagnosticsLastCaptureResult && (
                  <p className="settings-info-path">{diagnosticsLastCaptureResult.directoryPath}</p>
                )}
                {diagnosticsErrorMessage && (
                  <p className="settings-note settings-note-error">{diagnosticsErrorMessage}</p>
                )}
                <div className="settings-info-links">
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => void revealCurrentLog()}
                    disabled={!diagnosticsStatus?.hasCurrentLog}
                  >
                    Reveal Current Log
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => void revealPreviousLog()}
                    disabled={!diagnosticsStatus?.hasPreviousLog}
                  >
                    Reveal Previous Log
                  </button>
                </div>
              </div>
              <div className="settings-info-panel">
                <h4>Playback Overrides</h4>
                {import.meta.env.DEV ? (
                  <>
                    <p>Temporary switches for isolating standard-mode playback behavior during local debugging.</p>
                    <div className="settings-grid">
                      <div className="settings-field settings-field-inline">
                        <span className="settings-field-label">Disable Gapless Prebuffer</span>
                        <button
                          className={`settings-toggle ${disableGaplessPrebufferDev ? 'active' : ''}`}
                          onClick={() => setDisableGaplessPrebufferDev(!disableGaplessPrebufferDev)}
                        >
                          {disableGaplessPrebufferDev ? 'Disabled' : 'Enabled'}
                        </button>
                      </div>
                      <div className="settings-field settings-field-inline">
                        <span className="settings-field-label">Disable Analysis/EQ Taps</span>
                        <button
                          className={`settings-toggle ${disableStandardAnalysisGraphDev ? 'active' : ''}`}
                          onClick={() => setDisableStandardAnalysisGraphDev(!disableStandardAnalysisGraphDev)}
                        >
                          {disableStandardAnalysisGraphDev ? 'Disabled' : 'Enabled'}
                        </button>
                      </div>
                    </div>
                    <p className="settings-note">
                      When gapless prebuffer is disabled, Musaic stops preloading the next track and clears scheduled handoffs so you can compare memory growth without gapless-style buffering.
                    </p>
                    <p className="settings-note">
                      When analysis and EQ taps are disabled, Musaic bypasses the standard post-EQ analyser and analysis-worklet branches while keeping normal playback and EQ filters active.
                    </p>
                  </>
                ) : (
                  <>
                    <p>Playback override switches are only available in development builds.</p>
                    <p className="settings-note">
                      Production builds keep these toggles off and ignore their stored values.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
            )}

            {activeSectionId === 'danger' && (
            <section className="settings-section settings-section-panel settings-danger-zone">
            <div className="settings-section-head">
              <h3>Danger Zone</h3>
            </div>
            <div className="settings-danger-groups">
              <div className="settings-danger-group">
                <p className="settings-danger-group-title">Safe Resets</p>
                <p className="settings-danger-group-description">
                  Reset app preferences while keeping primary library data.
                </p>
                <div className="settings-danger-list">
                  {safeResetActions.map((action) => renderResetAction(action))}
                </div>
              </div>
              <div className="settings-danger-group settings-danger-group-destructive">
                <p className="settings-danger-group-title">Destructive Resets</p>
                <p className="settings-danger-group-description">
                  Remove indexed media data or perform a full wipe.
                </p>
                <div className="settings-danger-list">
                  {destructiveResetActions.map((action) => renderResetAction(action))}
                </div>
              </div>
            </div>
            {isScanning && (
              <p className="settings-note settings-danger-note">
                Destructive resets are disabled while library scanning is in progress.
              </p>
            )}
          </section>
            )}
          </div>
        </div>
      </div>
      <FolderSettings
        isOpen={showFolderSettings}
        onClose={() => setShowFolderSettings(false)}
      />
      <ConfirmActionModal
        isOpen={pendingReset != null}
        title={pendingReset?.confirmTitle ?? ''}
        message={pendingReset?.confirmMessage ?? ''}
        confirmLabel={pendingReset?.confirmLabel ?? 'Confirm'}
        typedPhrase={pendingReset?.typedPhrase ?? null}
        isDestructive={pendingReset?.destructive ?? false}
        isBusy={pendingReset ? resetStatuses[pendingReset.id].state === 'running' : false}
        onCancel={() => {
          if (pendingReset && resetStatuses[pendingReset.id].state === 'running') return
          setPendingResetId(null)
        }}
        onConfirm={() => {
          if (!pendingReset) return
          void executeResetAction(pendingReset.id)
        }}
      />
      <ConfirmActionModal
        isOpen={normalizationDisableStep != null}
        title={normalizationDisableStep === 'warning' ? 'Disable Normalization?' : 'Final Safety Check'}
        message={normalizationDisableStep === 'warning'
          ? 'Disabling normalization removes automatic loudness protection. Tracks can jump to unsafe levels and may cause hearing damage.'
          : 'You are about to disable all playback normalization (including ReplayGain gain application). Continue only if you understand the risks and control output volume carefully.'}
        confirmLabel={normalizationDisableStep === 'warning' ? 'Continue' : 'Disable Normalization'}
        isDestructive
        onCancel={() => setNormalizationDisableStep(null)}
        onConfirm={handleConfirmDisableNormalization}
      />
      <BitPerfectModeWarningModal
        isOpen={showBitPerfectWarning}
        dontShowAgain={dontShowBitPerfectWarningAgain}
        onDontShowAgainChange={setDontShowBitPerfectWarningAgain}
        onCancel={() => setShowBitPerfectWarning(false)}
        onConfirm={handleConfirmBitPerfectWarning}
      />
      {lastFmDialogPresence.shouldRender && (
        <div
          className="modal-overlay"
          data-presence={lastFmDialogPresence.phase}
          aria-hidden={lastFmDialogPresence.phase === 'exiting'}
          onClick={() => setLastFmDialogOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div className="modal-header" style={{ justifyContent: 'center', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                <div style={{ color: 'var(--accent, #6366f1)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                  </svg>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Last.fm</h2>
              </div>
              <button
                className="modal-close"
                style={{ position: 'absolute', right: '16px', top: '16px' }}
                onClick={() => setLastFmDialogOpen(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '16px 24px' }}>
              <p style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Connect your Last.fm account to automatically scrobble the tracks you listen to.
              </p>

              {officialLastFmProfile?.connected ? (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                  }}
                >
                  <div style={{ color: 'var(--accent, #6366f1)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                    Signed in as {officialLastFmProfile.username}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    Scrobbles after 50% or 4 minutes (whichever comes first)
                  </div>
                </div>
              ) : !lastFmHasApiCredentials ? (
                <div style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)', textAlign: 'left' }}>
                  <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                    Last.fm credentials are not configured in this build. Provide your API Key and Shared Secret below to authorize:
                  </div>
                  <div className="settings-grid" style={{ gap: '10px' }}>
                    <label className="settings-field">
                      <span className="settings-field-label">API Key</span>
                      <input
                        className="settings-input"
                        type="text"
                        placeholder="Enter Last.fm API Key"
                        value={lastFmCustomApiKeyInput}
                        onChange={(e) => setLastFmCustomApiKeyInput(e.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span className="settings-field-label">Shared Secret</span>
                      <input
                        className="settings-input"
                        type="password"
                        placeholder="Enter Last.fm Shared Secret"
                        value={lastFmCustomSharedSecretInput}
                        onChange={(e) => setLastFmCustomSharedSecretInput(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  {lastFmAuthPending || lastFmIsAuthorizing
                    ? (lastFmAuthHint || 'Waiting for authorization in your browser...')
                    : 'Signing in connects your Last.fm account to automatically scrobble tracks and update Now Playing.'}
                </div>
              )}
              {lastFmResolvedError && (
                <div style={{ color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem', marginTop: '8px' }}>
                  {lastFmResolvedError}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '8px' }}>
              <button className="settings-btn" onClick={() => setLastFmDialogOpen(false)}>
                Cancel
              </button>
              {officialLastFmProfile?.connected ? (
                <button
                  className="settings-btn"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  onClick={() => {
                    void disconnectLastFmProfile(LASTFM_OFFICIAL_PROFILE_ID)
                    setLastFmDialogOpen(false)
                  }}
                >
                  Sign Out
                </button>
              ) : (
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={async () => {
                    const nextKey = lastFmCustomApiKeyInput.trim() || null
                    const nextSecret = lastFmCustomSharedSecretInput.trim() || null
                    if (nextKey && nextSecret) {
                      await setLastFmCustomCredentials(nextKey, nextSecret)
                    }
                    void beginLastFmAuth(LASTFM_OFFICIAL_PROFILE_ID)
                  }}
                  disabled={lastFmIsAuthorizing}
                >
                  {lastFmIsAuthorizing || lastFmAuthPending ? 'Authorizing...' : 'Sign In'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {listenBrainzDialogPresence.shouldRender && (
        <div
          className="modal-overlay"
          data-presence={listenBrainzDialogPresence.phase}
          aria-hidden={listenBrainzDialogPresence.phase === 'exiting'}
          onClick={() => setListenBrainzDialogOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div className="modal-header" style={{ justifyContent: 'center', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                <div style={{ color: 'var(--accent, #6366f1)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z" />
                  </svg>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>ListenBrainz</h2>
              </div>
              <button
                className="modal-close"
                style={{ position: 'absolute', right: '16px', top: '16px' }}
                onClick={() => setListenBrainzDialogOpen(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '16px 24px' }}>
              <p style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Connect your ListenBrainz account to track your listening history.
              </p>

              {officialListenBrainzProfile?.connected ? (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                  }}
                >
                  <div style={{ color: '#22c55e' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                    Connected to ListenBrainz
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    Scrobbles after 50% or 4 minutes (whichever comes first)
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                  <label className="settings-field">
                    <span className="settings-field-label">User Token</span>
                    <input
                      className="settings-input"
                      type="password"
                      placeholder="e.g. 12345678-1234-1234-1234-123456789abc"
                      value={listenBrainzTokenInput}
                      onChange={(e) => setListenBrainzTokenInput(e.target.value)}
                      autoFocus
                    />
                  </label>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="settings-btn settings-link-btn"
                      style={{ fontSize: '0.85rem', padding: 0 }}
                      onClick={() => openExternalLink('https://listenbrainz.org/profile/')}
                    >
                      Get Token
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '8px' }}>
              <button className="settings-btn" onClick={() => setListenBrainzDialogOpen(false)}>
                Cancel
              </button>
              {officialListenBrainzProfile?.connected ? (
                <button
                  className="settings-btn"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  onClick={() => {
                    void setListenBrainzToken('')
                    setListenBrainzDialogOpen(false)
                  }}
                >
                  Log Out
                </button>
              ) : (
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={() => {
                    if (listenBrainzTokenInput.trim()) {
                      void setListenBrainzToken(listenBrainzTokenInput.trim())
                      setListenBrainzDialogOpen(false)
                    }
                  }}
                  disabled={!listenBrainzTokenInput.trim()}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {lastFmProfilePresence.shouldRender && (
        <div
          className="modal-overlay"
          data-presence={lastFmProfilePresence.phase}
          aria-hidden={lastFmProfilePresence.phase === 'exiting'}
          onClick={closeLastFmProfileModal}
        >
          <div
            className="modal-content settings-lastfm-profile-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{lastFmProfilePresence.presentValue}</h2>
              <button className="modal-close" onClick={closeLastFmProfileModal} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="modal-body settings-lastfm-profile-form">
              <label className="settings-field">
                <span className="settings-field-label">Destination Name</span>
                <input
                  className="settings-select"
                  type="text"
                  value={lastFmProfileNameInput}
                  autoFocus
                  onChange={(event) => setLastFmProfileNameInput(event.target.value)}
                />
              </label>
              <div className="settings-field">
                <span className="settings-field-label">Protocol</span>
                <SettingsSegmentedControl
                  ariaLabel="Scrobble protocol"
                  fullWidth
                  options={CUSTOM_SCROBBLE_PROTOCOL_OPTIONS}
                  value={lastFmProfileProtocolInput}
                  onChange={handleLastFmProfileProtocolChange}
                />
              </div>
              <label className="settings-field">
                <span className="settings-field-label">API Base URL</span>
                <input
                  className="settings-select"
                  type="url"
                  value={lastFmProfileUrlInput}
                  placeholder={getScrobbleUrlPlaceholder(lastFmProfileProtocolInput)}
                  onChange={(event) => setLastFmProfileUrlInput(event.target.value)}
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">{getScrobbleUsernameLabel(lastFmProfileProtocolInput)}</span>
                <input
                  className="settings-select"
                  type="text"
                  value={lastFmProfileUsernameInput}
                  autoComplete="off"
                  onChange={(event) => setLastFmProfileUsernameInput(event.target.value)}
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">{getScrobbleSecretLabel(lastFmProfileProtocolInput)}</span>
                <input
                  className="settings-select"
                  type="password"
                  value={lastFmProfileSessionKeyInput}
                  placeholder={lastFmProfileModalMode === 'edit' ? `Leave blank to keep current ${getScrobbleSecretLabel(lastFmProfileProtocolInput).toLowerCase()}` : ''}
                  autoComplete="off"
                  onChange={(event) => setLastFmProfileSessionKeyInput(event.target.value)}
                />
              </label>
              {lastFmProfileProtocolInput === 'listenbrainz' && (
                <div style={{ marginTop: '-8px', marginBottom: '12px', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="settings-btn settings-link-btn"
                    onClick={() => openExternalLink('https://listenbrainz.org/profile/')}
                  >
                    Get ListenBrainz Token
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="settings-btn" onClick={closeLastFmProfileModal}>
                Cancel
              </button>
              <button
                className="settings-btn settings-btn-primary"
                onClick={handleSaveLastFmProfile}
                disabled={lastFmProfileSaveDisabled}
              >
                {lastFmProfileModalMode === 'edit' ? 'Save Destination' : 'Add Destination'}
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsTransferWizard
        isOpen={settingsTransferWizardOpen}
        onClose={() => setSettingsTransferWizardOpen(false)}
      />
      <LocalApiPairingModal
          isOpen={localApiPairingModalOpen}
          ticket={phoneRemoteActivePairingTicket}
          pairedDevices={phoneRemotePairedDevices}
          pendingRequests={phoneRemotePendingPairingRequests}
          apiEnabled={phoneRemoteEnabled}
          remoteWebEnabled={phoneRemoteEnabled}
          controlsEnabled={localApiControlsEnabled}
          lanUrls={phoneRemoteLanUrls}
          selectedBaseUrl={localApiSelectedPairingBaseUrl}
          selectedControllerUrl={localApiSelectedPairingUrl}
          feedbackMessage={phoneRemoteFeedback}
          errorMessage={phoneRemoteErrorMessage}
          onClose={handleClosePhoneRemotePairingModal}
          onEnableRemoteControl={handleEnablePhoneRemoteControl}
          onSelectBaseUrl={setLocalApiSelectedPairingBaseUrl}
          onGenerateTicket={handleCreatePhoneRemotePairingTicket}
          onGenerateWebTicket={handleCreatePhoneRemoteWebPairingTicket}
          onRefreshTicket={handleRefreshPhoneRemotePairingTicket}
          onCopyPairingUrl={() => {
            if (!phoneRemoteActivePairingTicket) return
            void copyPhoneRemoteToClipboard(phoneRemoteActivePairingTicket.pairingUrl, 'Pairing link')
          }}
          onApproveRequest={handleApprovePhoneRemotePairingRequest}
          onRejectRequest={handleRejectPhoneRemotePairingRequest}
          onRevokeDevice={handleRevokePhoneRemotePairedDevice}
          onRevokeAllDevices={handleRevokeAllPhoneRemoteDevices}
        />
    </div>
  )
}
