import Binding from '../services/binding';
import { StudyOverlay, StudyIndicatorOverlay, StudyTestDisplayState, StudyModeType } from '../services/study-overlay';
import { SubtitleModel, IndexedSubtitleModel } from '@project/common';
import { Tokenizer, TokenPart } from '@project/common/tokenizer';
import { createTokenizer } from '../services/tokenizer-factory';
import {
    TokenSelector,
    getTestableIndices,
    LineSelector,
    createKnowledgeGetter,
    IndexedDBStudyRepository,
    getAnkiStatus,
    PriorityCalculator,
    createRecognitionRepository,
    INTENSITY_THRESHOLDS,
    type LineSelectionStrategy,
    type TokenBlankingStrategy,
    type KnowledgeGetter,
    type AnkiApi,
    type StudyRepository,
    type StudyDeckConfig,
    type RecognitionRepository,
    type VideoSession,
    type StudyIntensity,
    type FocusMode,
} from '@project/common/study-mode';

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
    private readonly _tokenSelector: TokenSelector;
    private readonly _studyRepository: StudyRepository;
    private readonly _recognitionRepository: RecognitionRepository;
    private readonly _priorityCalculator: PriorityCalculator;
    
    private _lineSelector?: LineSelector;
    private _ankiApi?: AnkiApi;
    private _knowledgeGetter?: KnowledgeGetter;
    
    private _lineCount: number = 0;
    private _enabled: boolean = false;
    private _frequency: number = 10;
    private _lineSelectionStrategy: LineSelectionStrategy = 'random';
    private _tokenSelectionStrategy: TokenBlankingStrategy = 'random';
    private _includeConjugations: boolean = true;
    private _trackResults: boolean = true;
    private _studyDecks: StudyDeckConfig[] = [];
    private _intensity: StudyIntensity = 'medium';
    private _rateLimitSeconds: number = 10;
    private _focusMode: FocusMode = 'balanced';
    private _currentSubtitle?: IndexedSubtitleModel;
    private _currentTestTimeframe?: { start: number; end: number };
    private _tokenizer?: Tokenizer;
    private _themeType: 'dark' | 'light' = 'dark';
    
    // Per-video session state (in-memory only)
    private _currentSession: VideoSession | null = null;
    
    // Per-video line status cache: Map<videoSrc, Map<subtitleIndex, LineTestInfo>>
    private _lineStatusCache: Map<string, Map<number, LineTestInfo>> = new Map();
    
    // Track which subtitle indices are scheduled for testing (to prevent flash)
    private _testLineIndices: Set<number> = new Set();
    
    // Current test state for inline rendering
    private _currentDisplayState?: StudyTestDisplayState;
    
    // Track if test was completed (for cache status)
    private _testCompleted: boolean = false;
    
    // Track if answer has been submitted (to prevent input changes after submit)
    private _answerSubmitted: boolean = false;
    
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
        
        // Create token selector (knowledge getter can be added later for Anki integration)
        this._tokenSelector = new TokenSelector();
        
        // Create study repository for tracking test results
        this._studyRepository = new IndexedDBStudyRepository();
        
        // Create recognition repository for tracking recognition success/failure
        this._recognitionRepository = createRecognitionRepository();
        
        // Wire up recognition repository to token selector for consistent priority scoring
        this._tokenSelector.setRecognitionRepository(this._recognitionRepository);
        
        // Create priority calculator for two-tier system
        this._priorityCalculator = new PriorityCalculator('balanced');
        
        // Wire up overlay callbacks
        this._studyOverlay.onReplay = () => this._replay();
        this._studyOverlay.onSubmit = (answers) => void this._handleSubmit(answers);
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
     * Get the indicator mode type based on line selection strategy.
     */
    get indicatorModeType(): StudyModeType {
        return this._lineSelectionStrategy === 'prioritize_unknown' ? 'smart' : 'regular';
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
            this._indicatorOverlay.show(this.linesUntilTest, this.indicatorModeType);
        } else {
            this.hide();
            this._lineCount = 0;
            this._testLineIndices.clear();
            this._indicatorOverlay.hide();
        }
    }

    set frequency(value: number) {
        this._frequency = value;
        // Only update countdown in regular mode
        if (this._enabled && this._lineSelectionStrategy === 'random') {
            this._indicatorOverlay.update(this.linesUntilTest);
        }
    }

    hide() {
        this._studyOverlay.hide();
        this._currentSubtitle = undefined;
        this._currentTestTimeframe = undefined;
        this._currentDisplayState = undefined;
        this._testCompleted = false;
        this._answerSubmitted = false;
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
        const settings = await this._context.settings.get([
            'studyModeEnabled',
            'studyModeFrequency',
            'studyModeLineSelection',
            'studyModeTokenSelection',
            'studyModeIncludeConjugations',
            'studyModeDecks',
            'studyModeTrackResults',
            'studyModeIntensity',
            'studyModeRateLimitSeconds',
            'studyModeFocusMode',
            'themeType',
        ]);
        this._enabled = settings.studyModeEnabled;
        this._frequency = settings.studyModeFrequency;
        this._lineSelectionStrategy = settings.studyModeLineSelection;
        this._tokenSelectionStrategy = settings.studyModeTokenSelection;
        this._includeConjugations = settings.studyModeIncludeConjugations;
        this._trackResults = settings.studyModeTrackResults;
        this._studyDecks = settings.studyModeDecks;
        this._intensity = settings.studyModeIntensity;
        this._rateLimitSeconds = settings.studyModeRateLimitSeconds;
        this._focusMode = settings.studyModeFocusMode;
        this._themeType = settings.themeType;
        
        // Update priority calculator focus mode
        this._priorityCalculator.setFocusMode(this._focusMode);
        
        // Update token selector focus mode for consistent priority scoring
        this._tokenSelector.setFocusMode(this._focusMode);
        
        // Update overlay themes
        this._studyOverlay.setTheme(this._themeType);
        this._indicatorOverlay.setTheme(this._themeType);
        
        // Update indicator visibility
        if (this._enabled) {
            this._indicatorOverlay.show(this.linesUntilTest, this.indicatorModeType);
        } else {
            this._indicatorOverlay.hide();
        }
        
        // Initialize Kuromoji tokenizer if not already initialized
        if (!this._tokenizer) {
            try {
                this._tokenizer = await createTokenizer({ type: 'kuromoji' });
            } catch (e) {
                console.warn('[SrsController] Failed to initialize Kuromoji tokenizer:', e);
                this._tokenizer = undefined;
            }
        }
        
        console.log('[SrsController] Settings updated:', {
            enabled: this._enabled,
            frequency: this._frequency,
            lineSelection: this._lineSelectionStrategy,
            tokenSelection: this._tokenSelectionStrategy,
            hasTokenizer: !!this._tokenizer,
            hasAnkiApi: !!this._ankiApi,
            theme: this._themeType,
        });
    }

    /**
     * Set the AnkiApi for knowledge-driven selection.
     * This enables prioritize_unknown strategies for line and token selection.
     */
    setAnkiApi(ankiApi: AnkiApi) {
        this._ankiApi = ankiApi;
        
        // Log configuration for debugging
        console.log('[SrsController] AnkiApi configured');
        console.log('[SrsController] Study decks:', JSON.stringify(this._studyDecks, null, 2));
        console.log('[SrsController] Enabled decks:', this._studyDecks.filter(d => d.enabled).length);
        
        this._initializeKnowledgeGetter();
    }

    /**
     * Initialize the knowledge getter and LineSelector when AnkiApi is available.
     */
    private _initializeKnowledgeGetter() {
        if (!this._ankiApi) {
            return;
        }

        // Create knowledge getter that combines Anki status and local study stats
        const getAnkiStatusFn = async (lemma: string) => {
            return getAnkiStatus(this._ankiApi!, this._studyDecks, lemma);
        };

        const getStudyStatsFn = async (lemma: string) => {
            return this._studyRepository.getStats(lemma);
        };

        this._knowledgeGetter = createKnowledgeGetter(getAnkiStatusFn, getStudyStatsFn);
        this._lineSelector = new LineSelector(this._knowledgeGetter);
        this._tokenSelector.setKnowledgeGetter(this._knowledgeGetter);

        console.log('[SrsController] Knowledge getter initialized with AnkiApi');
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
            hasTokenizer: !!this._tokenizer,
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
        
        // Update indicator countdown (only relevant in regular mode)
        if (this._lineSelectionStrategy === 'random') {
            this._indicatorOverlay.update(this.linesUntilTest);
        }
        
        // Check if we have a cached test for this line (revisiting)
        const existingTest = this.getLineStatus(indexedSubtitle.index);
        if (existingTest && existingTest.status !== 'incomplete') {
            // Already completed this line - show result briefly or skip
            console.log('[SrsController] Line already tested:', existingTest.status);
            return false;
        }
        
        // Determine if this line should be tested
        const shouldTest = await this._shouldTestLine(indexedSubtitle, existingTest);
        
        if (shouldTest || existingTest?.status === 'incomplete') {
            console.log('[SrsController] Triggering test at line', this._lineCount, 'strategy:', this._lineSelectionStrategy, 'intensity:', this._intensity);
            
            // Mark this line as a test line to prevent subtitle flash
            this._testLineIndices.add(indexedSubtitle.index);
            
            this._currentSubtitle = indexedSubtitle;
            const shown = await this._showTest(indexedSubtitle, existingTest);
            
            // Update session state if test was shown
            if (shown) {
                this._updateSessionOnCardShown(indexedSubtitle.index);
            }
            
            return shown;
        }
        
        return false;
    }

    /**
     * Get or create session for the current video.
     */
    private _getOrCreateSession(): VideoSession {
        const videoSrc = this._context.video.src;
        
        if (!this._currentSession || this._currentSession.videoSrc !== videoSrc) {
            this._currentSession = {
                videoSrc,
                studiedLineIndices: new Set(),
                cardsShownCount: 0,
                lastCardTime: 0,
            };
        }
        
        return this._currentSession;
    }

    /**
     * Update session state when a card is shown.
     */
    private _updateSessionOnCardShown(subtitleIndex: number) {
        const session = this._getOrCreateSession();
        session.studiedLineIndices.add(subtitleIndex);
        session.cardsShownCount++;
        session.lastCardTime = Date.now();
    }

    /**
     * Check if rate limit allows showing another card.
     */
    private _isRateLimitSatisfied(): boolean {
        const session = this._getOrCreateSession();
        const now = Date.now();
        const timeSinceLastCard = (now - session.lastCardTime) / 1000;
        return session.lastCardTime === 0 || timeSinceLastCard >= this._rateLimitSeconds;
    }

    /**
     * Check if priority-based selection is ready (has all required dependencies).
     */
    private _isPrioritySelectionReady(): boolean {
        return !!this._tokenizer && !!this._ankiApi && this._studyDecks.length > 0;
    }

    /**
     * Determine if a line should be tested using the configured strategy.
     */
    private async _shouldTestLine(subtitle: IndexedSubtitleModel, existingTest?: LineTestInfo): Promise<boolean> {
        // Check if this line was already studied this session
        const session = this._getOrCreateSession();
        if (session.studiedLineIndices.has(subtitle.index)) {
            return false;
        }

        // Check rate limiting
        if (!this._isRateLimitSatisfied()) {
            return false;
        }

        // Random strategy: simple frequency-based selection (fallback mode)
        if (this._lineSelectionStrategy === 'random') {
            return this._lineCount % this._frequency === 0;
        }

        // prioritize_unknown strategy: use priority-based scoring only
        // No fallback to frequency - if not ready, skip testing
        if (!this._isPrioritySelectionReady()) {
            console.log('[SrsController] Priority selection not ready (missing tokenizer, AnkiApi, or study decks)');
            return false;
        }

        try {
            // Tokenize to score the line
            const tokenGroups = await this._tokenizer!.tokenize(subtitle.text);
            const tokens: TokenPart[] = tokenGroups.flat();
            
            // Get testable tokens
            const testable = tokens.filter(
                (t) => t.pos !== '記号' && t.text.trim() !== '' && (t.wordType === undefined || t.wordType === 'KNOWN')
            );

            if (testable.length === 0) {
                return false;
            }

            // Calculate priority-based score for the line
            const lineScore = await this._calculateLinePriorityScore(testable);
            
            // Check if score exceeds intensity threshold
            const threshold = INTENSITY_THRESHOLDS[this._intensity];
            const shouldTrigger = this._priorityCalculator.shouldTriggerStudyCard(lineScore, this._intensity);
            
            // Flash the assessment result on the indicator overlay
            this._indicatorOverlay.flashLineAssessment(lineScore, threshold, shouldTrigger, testable.length);
            
            return shouldTrigger;
        } catch (e) {
            console.warn('[SrsController] Priority scoring failed:', e);
            return false;
        }
    }

    /**
     * Calculate priority score for a line based on its tokens.
     */
    private async _calculateLinePriorityScore(tokens: TokenPart[]): Promise<number> {
        let totalScore = 0;

        for (const token of tokens) {
            // Build candidate lemmas: basicForm (kanji), text, and reading (kana)
            // This handles cases where Anki cards might store kanji or kana forms
            const candidates: string[] = [];
            if (token.basicForm) candidates.push(token.basicForm);
            if (token.text && token.text !== token.basicForm) candidates.push(token.text);
            if (token.reading) {
                const hiraganaReading = this._katakanaToHiragana(token.reading);
                if (!candidates.includes(hiraganaReading)) candidates.push(hiraganaReading);
            }
            
            // Get Anki status using all candidate lemmas
            let ankiStatus: 'uncollected' | 'new' | 'learning' | 'young' | 'mature' = 'uncollected';
            if (this._ankiApi && this._studyDecks.length > 0) {
                try {
                    ankiStatus = await getAnkiStatus(this._ankiApi, this._studyDecks, candidates);
                } catch {
                    // Ignore errors, treat as uncollected
                }
            }

            // Get recognition stats (use primary lemma)
            const primaryLemma = token.basicForm || token.text;
            const recognitionStats = await this._recognitionRepository.getStats(primaryLemma);

            // Calculate priority
            const priority = this._priorityCalculator.calculatePriority(primaryLemma, ankiStatus, recognitionStats);
            totalScore += priority.finalPriority;
        }

        return totalScore;
    }

    private async _showTest(subtitle: IndexedSubtitleModel, existingTest?: LineTestInfo): Promise<boolean> {
        // Retry tokenizer init if needed
        if (!this._tokenizer) {
            console.log('[SrsController] Retrying tokenizer initialization...');
            await this.updateSettings();
        }
        
        if (!this._tokenizer) {
            console.warn('[SrsController] Tokenizer not initialized, cannot show test');
            this._context.subtitleController.notification('error.studyModeNoTokenizer');
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
                const tokenGroups = await this._tokenizer.tokenize(subtitle.text);
                
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

                // Check if there are any testable tokens
                const testableIndices = getTestableIndices(tokens);
                if (testableIndices.length === 0) {
                    this._testLineIndices.delete(subtitle.index);
                    return false;
                }

                // Use TokenSelector to pick which tokens to blank
                // This handles conjugation grouping (e.g., 食べ + ました as one unit)
                blankedIndices = await this._tokenSelector.selectTokensToBlank(tokens, {
                    strategy: this._tokenSelectionStrategy,
                    includeConjugations: this._includeConjugations,
                    maxBlanks: 3,
                });

                if (blankedIndices.length === 0) {
                    this._testLineIndices.delete(subtitle.index);
                    return false;
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
        this._answerSubmitted = false;
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
        // Don't allow input changes after answer has been submitted
        if (!this._currentDisplayState || this._answerSubmitted) return;
        
        const newAnswers = [...this._currentDisplayState.userAnswers];
        newAnswers[index] = value;
        this._currentDisplayState = {
            ...this._currentDisplayState,
            userAnswers: newAnswers,
        };
        // Don't re-render for input changes - they're handled by the DOM directly
    }

    private async _handleSubmit(answers: string[]) {
        if (!this._currentSubtitle || !this._currentDisplayState) return;
        
        // Prevent double submission
        if (this._answerSubmitted) return;
        this._answerSubmitted = true;
        
        const { tokens, blankedIndices } = this._currentDisplayState;
        
        // Check each answer - accept exact match, reading match, or tokenized reading match
        const answerResults: boolean[] = [];
        
        for (let i = 0; i < blankedIndices.length; i++) {
            const token = tokens[blankedIndices[i]];
            const correctText = token.text.trim();
            const userAnswer = answers[i]?.trim() || '';
            
            // 1. Exact text match
            if (userAnswer === correctText) {
                answerResults.push(true);
                continue;
            }
            
            // 2. User typed the reading directly (hiragana)
            const expectedReading = this._katakanaToHiragana(token.reading || token.text);
            if (userAnswer === expectedReading) {
                answerResults.push(true);
                continue;
            }
            
            // 3. User typed kanji - tokenize to get its reading and compare
            if (this._tokenizer) {
                try {
                    const userTokens = await this._tokenizer.tokenize(userAnswer);
                    const userReading = userTokens.flat()
                        .map(t => this._katakanaToHiragana(t.reading || t.text))
                        .join('');
                    if (userReading === expectedReading) {
                        answerResults.push(true);
                        continue;
                    }
                } catch {
                    // Tokenization failed, fall through to incorrect
                }
            }
            
            answerResults.push(false);
        }
        
        const allCorrect = answerResults.every(r => r);
        
        // Save study records for each blanked token
        if (this._trackResults) {
            await this._saveStudyRecords(tokens, blankedIndices, answerResults);
        }
        
        // Update display to show result with per-answer results
        this._currentDisplayState = {
            ...this._currentDisplayState,
            userAnswers: answers,
            showingResult: true,
            resultCorrect: allCorrect,
            answerResults,
        };
        this._studyOverlay.updateState(this._currentDisplayState);
        
        this._testCompleted = true;
    }

    /**
     * Save study records for each tested token.
     */
    private async _saveStudyRecords(
        tokens: TokenPart[],
        blankedIndices: number[],
        answerResults: boolean[]
    ): Promise<void> {
        const timestamp = Date.now();
        const mediaSource = this._context.video?.src || '';
        const sentenceContext = tokens.map(t => t.text).join('');

        // Prepare recognition attempts for batch recording
        const recognitionAttempts: Array<{ lemma: string; reading: string; success: boolean }> = [];

        for (let i = 0; i < blankedIndices.length; i++) {
            const token = tokens[blankedIndices[i]];
            const lemma = token.basicForm || token.text;
            const reading = this._katakanaToHiragana(token.reading || token.text);
            const success = answerResults[i];

            // Add to recognition attempts
            recognitionAttempts.push({ lemma, reading, success });

            try {
                await this._studyRepository.save({
                    lemma,
                    reading,
                    surfaceForm: token.text,
                    result: success ? 'correct' : 'incorrect',
                    timestamp,
                    sentenceContext,
                    mediaSource,
                });
            } catch (e) {
                console.warn('[SrsController] Failed to save study record:', e);
            }
        }

        // Batch record recognition attempts
        try {
            await this._recognitionRepository.recordAttemptsBatch(recognitionAttempts);
        } catch (e) {
            console.warn('[SrsController] Failed to record recognition attempts:', e);
        }
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
        this._answerSubmitted = false;
        
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

    /**
     * Convert katakana to hiragana for reading comparison.
     * Kuromoji returns readings in katakana, but users typically type in hiragana.
     */
    private _katakanaToHiragana(str: string): string {
        // Katakana range: U+30A1 to U+30F6
        // Hiragana range: U+3041 to U+3096
        // Offset: 0x60
        return str.replace(/[\u30A1-\u30F6]/g, (char) => 
            String.fromCharCode(char.charCodeAt(0) - 0x60)
        );
    }
}
