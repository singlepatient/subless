import {
    SaveWatchTimeMessage,
    VideoToExtensionCommand,
} from '@project/common';
import { SettingsProvider } from '@project/common/settings';

/**
 * Generates a unique session ID for watch time tracking.
 */
function generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extracts domain from a URL string.
 */
function extractDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

/**
 * Attempts to detect language code from subtitle filename.
 * Common patterns: video.ja.srt, video_japanese.ass, video[JPN].srt
 */
function detectLanguageFromFilename(filename: string | undefined): string | undefined {
    if (!filename) return undefined;

    const lowerName = filename.toLowerCase();

    // ISO 639-1 codes (2 letter)
    const iso2Patterns: Record<string, string> = {
        'ja': 'ja', 'jp': 'ja', 'jpn': 'ja', 'japanese': 'ja',
        'ko': 'ko', 'kr': 'ko', 'kor': 'ko', 'korean': 'ko',
        'zh': 'zh', 'cn': 'zh', 'chi': 'zh', 'chinese': 'zh', 'mandarin': 'zh',
        'en': 'en', 'eng': 'en', 'english': 'en',
        'es': 'es', 'spa': 'es', 'spanish': 'es',
        'fr': 'fr', 'fra': 'fr', 'french': 'fr',
        'de': 'de', 'deu': 'de', 'ger': 'de', 'german': 'de',
        'pt': 'pt', 'por': 'pt', 'portuguese': 'pt',
        'it': 'it', 'ita': 'it', 'italian': 'it',
        'ru': 'ru', 'rus': 'ru', 'russian': 'ru',
        'th': 'th', 'tha': 'th', 'thai': 'th',
        'vi': 'vi', 'vie': 'vi', 'vietnamese': 'vi',
        'id': 'id', 'ind': 'id', 'indonesian': 'id',
    };

    // Check for language codes in filename
    // Patterns: .ja., _ja_, [ja], -ja-, .japanese., etc.
    for (const [pattern, code] of Object.entries(iso2Patterns)) {
        const regex = new RegExp(`[._\\-\\[\\(]${pattern}[._\\-\\]\\)]`, 'i');
        if (regex.test(lowerName)) {
            return code;
        }
    }

    // Check if filename ends with language code before extension
    // e.g., video.ja.srt
    const match = lowerName.match(/\.([a-z]{2,3})\.[a-z]{3,4}$/);
    if (match && iso2Patterns[match[1]]) {
        return iso2Patterns[match[1]];
    }

    return undefined;
}

interface WatchTimeTrackerContext {
    video: HTMLMediaElement;
    settings: SettingsProvider;
    getSubtitleCount: () => number;
    getSubtitleFileName: () => string | undefined;
    getVideoSrc: () => string;
}

/**
 * Tracks video watch time when subtitles are enabled.
 * Records granular session data and sends to background script for persistence.
 */
export class WatchTimeTracker {
    private readonly _context: WatchTimeTrackerContext;
    
    private _sessionId: string;
    private _isTracking: boolean = false;
    private _trackingStartTime: number = 0;
    private _accumulatedMs: number = 0;
    private _lastFlushTime: number = 0;
    private _flushInterval?: NodeJS.Timeout;
    private _playListener?: () => void;
    private _pauseListener?: () => void;
    private _bound: boolean = false;
    
    // Flush accumulated time every 30 seconds while playing
    private readonly FLUSH_INTERVAL_MS = 30000;
    // Minimum duration to record (avoid noise from quick seeks)
    private readonly MIN_DURATION_MS = 1000;

    constructor(context: WatchTimeTrackerContext) {
        this._context = context;
        this._sessionId = generateSessionId();
    }

    /**
     * Bind event listeners to start tracking.
     */
    bind(): void {
        if (this._bound) return;

        this._playListener = () => this._onPlay();
        this._pauseListener = () => this._onPause();

        this._context.video.addEventListener('play', this._playListener);
        this._context.video.addEventListener('pause', this._pauseListener);

        this._bound = true;

        // If video is already playing when we bind, start tracking
        if (!this._context.video.paused) {
            this._onPlay();
        }
    }

    /**
     * Unbind event listeners and flush any remaining time.
     */
    unbind(): void {
        if (!this._bound) return;

        // Flush any remaining accumulated time
        this._stopTracking();
        this._flush();

        if (this._playListener) {
            this._context.video.removeEventListener('play', this._playListener);
            this._playListener = undefined;
        }

        if (this._pauseListener) {
            this._context.video.removeEventListener('pause', this._pauseListener);
            this._pauseListener = undefined;
        }

        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = undefined;
        }

        this._bound = false;
    }

    /**
     * Call when subtitles are loaded to potentially start a new session.
     */
    onSubtitlesLoaded(): void {
        // Start a new session when subtitles change
        this._flush();
        this._sessionId = generateSessionId();
        
        // If already playing, resume tracking with new session
        if (!this._context.video.paused) {
            this._checkAndStartTracking();
        }
    }

    /**
     * Call when subtitles are unloaded.
     */
    onSubtitlesUnloaded(): void {
        this._stopTracking();
        this._flush();
    }

    private _onPlay(): void {
        this._checkAndStartTracking();
    }

    private async _checkAndStartTracking(): Promise<void> {
        if (await this._shouldTrack()) {
            this._startTracking();
        }
    }

    private _onPause(): void {
        this._stopTracking();
        // Flush on pause to ensure data is saved
        this._flush();
    }

    private async _shouldTrack(): Promise<boolean> {
        // Only track if subtitles are loaded
        if (this._context.getSubtitleCount() === 0) {
            return false;
        }

        // Check if tracking is enabled in settings
        try {
            const { watchTimeTrackingEnabled } = await this._context.settings.get(['watchTimeTrackingEnabled']);
            return watchTimeTrackingEnabled;
        } catch {
            return true; // Default to enabled
        }
    }

    private _startTracking(): void {
        if (this._isTracking) return;

        this._isTracking = true;
        this._trackingStartTime = Date.now();

        // Set up periodic flush while playing
        this._flushInterval = setInterval(() => {
            this._accumulateTime();
            this._flush();
        }, this.FLUSH_INTERVAL_MS);
    }

    private _stopTracking(): void {
        if (!this._isTracking) return;

        this._accumulateTime();
        this._isTracking = false;

        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = undefined;
        }
    }

    private _accumulateTime(): void {
        if (!this._isTracking) return;

        const now = Date.now();
        const elapsed = now - this._trackingStartTime;
        this._accumulatedMs += elapsed;
        this._trackingStartTime = now;
    }

    private _flush(): void {
        if (this._accumulatedMs < this.MIN_DURATION_MS) {
            this._accumulatedMs = 0;
            return;
        }

        const subtitleFileName = this._context.getSubtitleFileName();
        const detectedLanguage = detectLanguageFromFilename(subtitleFileName);
        
        // Default to 'unknown' if we can't detect the language
        const languageCode = detectedLanguage || 'unknown';
        const domain = extractDomain(this._context.getVideoSrc());

        const command: VideoToExtensionCommand<SaveWatchTimeMessage> = {
            sender: 'asbplayer-video',
            message: {
                command: 'save-watch-time',
                messageId: `watch-time-${Date.now()}`,
                record: {
                    sessionId: this._sessionId,
                    timestamp: Date.now(),
                    durationMs: this._accumulatedMs,
                    languageCode,
                    domain,
                    videoUrl: this._context.getVideoSrc(),
                    subtitleFileName,
                },
            },
            src: this._context.getVideoSrc(),
        };

        browser.runtime.sendMessage(command).catch((e) => {
            console.error('Failed to save watch time:', e);
        });

        this._accumulatedMs = 0;
        this._lastFlushTime = Date.now();
    }
}
