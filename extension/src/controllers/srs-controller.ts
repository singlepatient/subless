import Binding from '../services/binding';
import { StudyOverlay, StudyIndicatorOverlay, StudyTestDisplayState } from '../services/study-overlay';
import { Fetcher, SubtitleModel, IndexedSubtitleModel, HttpPostMessage, VideoToExtensionCommand } from '@project/common';
import { TokenPart, Yomitan } from '@project/common/yomitan';
import { DictionaryTrack } from '@project/common/settings';
import { v4 as uuidv4 } from 'uuid';

/**
 * Fetcher that routes HTTP requests through the extension background script
 * to bypass CORS restrictions in content scripts.
 */
class VideoFetcher implements Fetcher {
    private readonly videoSrcCB: () => string;

    constructor(videoSrcCB: () => string) {
        this.videoSrcCB = videoSrcCB;
    }

    fetch(url: string, body: any) {
        const httpPostCommand: VideoToExtensionCommand<HttpPostMessage> = {
            sender: 'asbplayer-video',
            message: {
                command: 'http-post',
                url,
                body,
                messageId: uuidv4(),
            },
            src: this.videoSrcCB(),
        };
        return browser.runtime.sendMessage(httpPostCommand);
    }
}

export type LineStatus = 'pass' | 'fail' | 'incomplete';

export interface LineTestInfo {
    subtitleIndex: number;
    status: LineStatus;
    tokens?: TokenPart[];
    blankedIndices?: number[];
}

export interface StudyTestState {
    themeType: 'dark' | 'light';
    tokens: TokenPart[];
    blankedIndices: number[];
    subtitleStart: number;
    subtitleEnd: number;
}

export default class SrsController {
    public onTestComplete?: (passed: boolean) => void;

    private readonly _context: Binding;
    private readonly _studyOverlay: StudyOverlay;
    private readonly _indicatorOverlay: StudyIndicatorOverlay;
    
    private _lineCount: number = 0;
    private _enabled: boolean = false;
    private _frequency: number = 10;
    private _currentSubtitle?: IndexedSubtitleModel;
    private _currentTestTimeframe?: { start: number; end: number };
    private _yomitan?: Yomitan;
    private _themeType: 'dark' | 'light' = 'dark';
    
    // Per-video line status cache: Map<videoSrc, Map<subtitleIndex, LineTestInfo>>
    private _lineStatusCache: Map<string, Map<number, LineTestInfo>> = new Map();
    
    // Track which subtitle indices are scheduled for testing (to prevent flash)
    private _testLineIndices: Set<number> = new Set();
    
    // Current test state for inline rendering
    private _currentDisplayState?: StudyTestDisplayState;
    
    // Track if test was completed (for cache status)
    private _testCompleted: boolean = false;
    
    // Fullscreen change listener for re-rendering
    private _fullscreenListener?: () => void;

    constructor(context: Binding) {
        this._context = context;
        
        // Create study overlay using CachingElementOverlay pattern
        this._studyOverlay = new StudyOverlay(
            context.video,
            () => {} // No special mouse over handling needed
        );
        
        // Create persistent indicator overlay
        this._indicatorOverlay = new StudyIndicatorOverlay(context.video);
        
        // Wire up overlay callbacks
        this._studyOverlay.onReplay = () => this._replay();
        this._studyOverlay.onSubmit = (answers) => this._handleSubmit(answers);
        this._studyOverlay.onContinue = (passed) => this._handleContinue(passed);
        this._studyOverlay.onInputChange = (index, value) => this._handleInputChange(index, value);
    }

    get showing() {
        return this._studyOverlay.visible;
    }

    get enabled() {
        return this._enabled;
    }

    get lineCount() {
        return this._lineCount;
    }

    get linesUntilTest() {
        if (!this._enabled || this._frequency <= 0) return 0;
        const remaining = this._frequency - (this._lineCount % this._frequency);
        return remaining === this._frequency ? this._frequency : remaining;
    }

    /**
     * Check if a subtitle at the given index is scheduled as a test line.
     * Used by SubtitleController to suppress display and prevent flash.
     */
    isTestLine(subtitleIndex: number): boolean {
        return this._testLineIndices.has(subtitleIndex);
    }

    /**
     * Get the cached test info for a specific line in the current video.
     */
    getLineStatus(subtitleIndex: number): LineTestInfo | undefined {
        const videoSrc = this._context.video.src;
        const videoCache = this._lineStatusCache.get(videoSrc);
        return videoCache?.get(subtitleIndex);
    }

    set enabled(value: boolean) {
        this._enabled = value;
        if (value) {
            this._indicatorOverlay.setTheme(this._themeType);
            this._indicatorOverlay.show(this.linesUntilTest);
        } else {
            this.hide();
            this._lineCount = 0;
            this._testLineIndices.clear();
            this._indicatorOverlay.hide();
        }
    }

    set frequency(value: number) {
        this._frequency = value;
        if (this._enabled) {
            this._indicatorOverlay.update(this.linesUntilTest);
        }
    }

    hide() {
        this._studyOverlay.hide();
        this._currentSubtitle = undefined;
        this._currentTestTimeframe = undefined;
        this._currentDisplayState = undefined;
        this._testCompleted = false;
    }

    bind() {
        // Listen for fullscreen changes to re-render overlay
        this._fullscreenListener = () => this._handleFullscreenChange();
        document.addEventListener('fullscreenchange', this._fullscreenListener);
    }
    
    private _handleFullscreenChange() {
        // Re-render overlay if showing (to update styling and reattach listeners)
        if (this.showing && this._currentDisplayState) {
            this._studyOverlay.refresh();
            // Re-show to trigger re-render with correct fullscreen state
            this._studyOverlay.show(this._currentDisplayState);
        }
    }

    async updateSettings() {
        const settings = await this._context.settings.get(['studyModeEnabled', 'studyModeFrequency', 'dictionaryTracks', 'themeType']);
        this._enabled = settings.studyModeEnabled;
        this._frequency = settings.studyModeFrequency;
        this._themeType = settings.themeType;
        
        // Update overlay themes
        this._studyOverlay.setTheme(this._themeType);
        this._indicatorOverlay.setTheme(this._themeType);
        
        // Update indicator visibility
        if (this._enabled) {
            this._indicatorOverlay.show(this.linesUntilTest);
        } else {
            this._indicatorOverlay.hide();
        }
        
        // Find a dictionary track with a valid Yomitan URL for tokenization
        const enabledTrack = settings.dictionaryTracks.find(
            (dt: DictionaryTrack) => dt.dictionaryYomitanUrl
        );
        
        if (enabledTrack) {
            try {
                const fetcher = new VideoFetcher(() => this._context.video.src);
                const yt = new Yomitan(enabledTrack, fetcher);
                await yt.version(); // Validate connection
                this._yomitan = yt;
            } catch (e) {
                console.warn('[SrsController] Failed to connect to Yomitan:', e);
                this._yomitan = undefined;
            }
        } else {
            this._yomitan = undefined;
        }
        
        console.log('[SrsController] Settings updated:', {
            enabled: this._enabled,
            frequency: this._frequency,
            hasYomitan: !!this._yomitan,
            theme: this._themeType,
        });
    }

    /**
     * Called when a new subtitle line is about to be shown.
     * Returns true if the subtitle should be suppressed (test will be shown instead).
     */
    async onSubtitleShown(subtitle: SubtitleModel): Promise<boolean> {
        // Skip if already showing a test
        if (this.showing) {
            return false;
        }
        
        console.log('[SrsController] onSubtitleShown called', {
            enabled: this._enabled,
            text: subtitle.text.substring(0, 50),
            lineCount: this._lineCount,
            frequency: this._frequency,
            hasYomitan: !!this._yomitan,
            index: subtitle.index,
        });

        if (!this._enabled || !subtitle.text.trim()) {
            return false;
        }

        // Need index for caching and flash prevention
        if (subtitle.index === undefined) {
            return false;
        }
        
        // Cast to IndexedSubtitleModel since we've verified index exists
        const indexedSubtitle = subtitle as IndexedSubtitleModel;

        this._lineCount++;
        
        // Update indicator
        this._indicatorOverlay.update(this.linesUntilTest);
        
        // Check if we have a cached test for this line (revisiting)
        const existingTest = this.getLineStatus(indexedSubtitle.index);
        if (existingTest && existingTest.status !== 'incomplete') {
            // Already completed this line - show result briefly or skip
            console.log('[SrsController] Line already tested:', existingTest.status);
            return false;
        }
        
        if (this._lineCount % this._frequency === 0 || existingTest?.status === 'incomplete') {
            console.log('[SrsController] Triggering test at line', this._lineCount);
            
            // Mark this line as a test line to prevent subtitle flash
            this._testLineIndices.add(indexedSubtitle.index);
            
            this._currentSubtitle = indexedSubtitle;
            const shown = await this._showTest(indexedSubtitle, existingTest);
            return shown;
        }
        
        return false;
    }

    private async _showTest(subtitle: IndexedSubtitleModel, existingTest?: LineTestInfo): Promise<boolean> {
        // Retry Yomitan init if needed
        if (!this._yomitan) {
            console.log('[SrsController] Retrying Yomitan initialization...');
            await this.updateSettings();
        }
        
        if (!this._yomitan) {
            console.warn('[SrsController] Yomitan not configured, cannot show test');
            this._context.subtitleController.notification('error.studyModeNoYomitan');
            this._testLineIndices.delete(subtitle.index);
            return false;
        }

        try {
            let tokens: TokenPart[];
            let blankedIndices: number[];
            
            if (existingTest?.tokens && existingTest?.blankedIndices) {
                // Reuse existing tokenization
                tokens = existingTest.tokens;
                blankedIndices = existingTest.blankedIndices;
            } else {
                // Tokenize the subtitle text
                const tokenGroups = await this._yomitan.tokenize(subtitle.text);
                
                // Flatten token groups into individual tokens
                tokens = [];
                for (const group of tokenGroups) {
                    for (const part of group) {
                        tokens.push(part);
                    }
                }

                if (tokens.length === 0) {
                    this._testLineIndices.delete(subtitle.index);
                    return false;
                }

                // Exclude tokens that are only whitespace or only punctuation/symbols
                const nonPunctOrSpaceIndices = tokens
                    .map((t, i) => ({ token: t, index: i }))
                    .filter(({ token }) => {
                        const text = token.text.trim();
                        return text !== '' && !/^([\p{P}\p{S}]+)$/u.test(text);
                    })
                    .map(({ index }) => index);

                if (nonPunctOrSpaceIndices.length === 0) {
                    this._testLineIndices.delete(subtitle.index);
                    return false;
                }

                // Select random consecutive non-punctuation/non-space tokens to blank (1-3 tokens)
                const blankCount = Math.min(Math.floor(Math.random() * 3) + 1, nonPunctOrSpaceIndices.length);
                const startPos = Math.floor(Math.random() * (nonPunctOrSpaceIndices.length - blankCount + 1));
                blankedIndices = [];
                for (let i = 0; i < blankCount; i++) {
                    blankedIndices.push(nonPunctOrSpaceIndices[startPos + i]);
                }
            }

            // Cache the test info as incomplete
            this._cacheLineStatus(subtitle.index, {
                subtitleIndex: subtitle.index,
                status: 'incomplete',
                tokens,
                blankedIndices,
            });

            // Set up current test timeframe for lifecycle management
            this._currentTestTimeframe = {
                start: subtitle.start,
                end: subtitle.end,
            };
            this._testCompleted = false;

            // Initialize display state
            this._currentDisplayState = {
                tokens,
                blankedIndices,
                userAnswers: blankedIndices.map(() => ''),
                showingResult: false,
                resultCorrect: false,
            };

            // Hide subtitles and show test overlay
            this._context.subtitleController.forceHideSubtitles = true;
            this._context.mobileVideoOverlayController.forceHide = true;
            this._studyOverlay.setTheme(this._themeType);
            this._studyOverlay.show(this._currentDisplayState);
            
            // Let the subtitle line finish playing, then pause
            this._pauseAtSubtitleEnd(subtitle.end);
            return true; // Signal to suppress subtitle display
        } catch (err) {
            console.error('SrsController: Failed to show test', err);
            this._testLineIndices.delete(subtitle.index);
            return false;
        }
    }

    private _cacheLineStatus(subtitleIndex: number, info: LineTestInfo) {
        const videoSrc = this._context.video.src;
        if (!this._lineStatusCache.has(videoSrc)) {
            this._lineStatusCache.set(videoSrc, new Map());
        }
        this._lineStatusCache.get(videoSrc)!.set(subtitleIndex, info);
    }

    private _dismissTestAndRestoreSubtitles() {
        // If test wasn't completed, mark as incomplete in cache
        if (this._currentSubtitle && !this._testCompleted) {
            const existingInfo = this.getLineStatus(this._currentSubtitle.index);
            if (existingInfo) {
                this._cacheLineStatus(this._currentSubtitle.index, {
                    ...existingInfo,
                    status: 'incomplete',
                });
            }
        }
        
        this._context.subtitleController.forceHideSubtitles = false;
        this._context.mobileVideoOverlayController.forceHide = false;
        this._studyOverlay.hide();
        
        if (this._currentSubtitle) {
            this._testLineIndices.delete(this._currentSubtitle.index);
        }
        this._currentSubtitle = undefined;
        this._currentTestTimeframe = undefined;
        this._currentDisplayState = undefined;
        this._testCompleted = false;
    }

    private _replay() {
        if (!this._currentSubtitle) return;
        
        const video = this._context.video;
        video.currentTime = this._currentSubtitle.start / 1000;
        video.play();
        
        // Pause at end of subtitle
        const checkTime = () => {
            if (video.currentTime * 1000 >= this._currentSubtitle!.end) {
                video.pause();
                return;
            }
            requestAnimationFrame(checkTime);
        };
        requestAnimationFrame(checkTime);
    }

    private _pauseAtSubtitleEnd(endTimeMs: number) {
        const video = this._context.video;
        const checkTime = () => {
            if (video.currentTime * 1000 >= endTimeMs) {
                video.pause();
                return;
            }
            requestAnimationFrame(checkTime);
        };
        requestAnimationFrame(checkTime);
    }

    private _handleInputChange(index: number, value: string) {
        if (!this._currentDisplayState) return;
        
        const newAnswers = [...this._currentDisplayState.userAnswers];
        newAnswers[index] = value;
        this._currentDisplayState = {
            ...this._currentDisplayState,
            userAnswers: newAnswers,
        };
        // Don't re-render for input changes - they're handled by the DOM directly
    }

    private _handleSubmit(answers: string[]) {
        if (!this._currentSubtitle || !this._currentDisplayState) return;
        
        const { tokens, blankedIndices } = this._currentDisplayState;
        
        // Check answers
        let allCorrect = true;
        for (let i = 0; i < blankedIndices.length; i++) {
            const correctAnswer = tokens[blankedIndices[i]].text.trim();
            const userAnswer = answers[i]?.trim() || '';
            if (userAnswer !== correctAnswer) {
                allCorrect = false;
                break;
            }
        }
        
        // Update display to show result
        this._currentDisplayState = {
            ...this._currentDisplayState,
            userAnswers: answers,
            showingResult: true,
            resultCorrect: allCorrect,
        };
        this._studyOverlay.updateState(this._currentDisplayState);
        
        this._testCompleted = true;
    }

    private _handleContinue(passed: boolean) {
        if (!this._currentSubtitle) return;
        
        // Update cache with final status
        const existingInfo = this.getLineStatus(this._currentSubtitle.index);
        if (existingInfo) {
            this._cacheLineStatus(this._currentSubtitle.index, {
                ...existingInfo,
                status: passed ? 'pass' : 'fail',
            });
        }
        
        this._testLineIndices.delete(this._currentSubtitle.index);
        this._context.subtitleController.forceHideSubtitles = false;
        this._context.mobileVideoOverlayController.forceHide = false;
        this._studyOverlay.hide();
        this._currentSubtitle = undefined;
        this._currentTestTimeframe = undefined;
        this._currentDisplayState = undefined;
        this._testCompleted = false;
        
        this.onTestComplete?.(passed);
        this._context.play();
    }

    unbind() {
        if (this._fullscreenListener) {
            document.removeEventListener('fullscreenchange', this._fullscreenListener);
            this._fullscreenListener = undefined;
        }
        this._studyOverlay.dispose();
        this._indicatorOverlay.dispose();
    }
}
