import { CachingElementOverlay, ElementOverlayParams, OffsetAnchor, KeyedHtml } from './element-overlay';
import { TokenPart } from '@project/common/yomitan';

export interface StudyTestDisplayState {
    tokens: TokenPart[];
    blankedIndices: number[];
    userAnswers: string[];
    showingResult: boolean;
    resultCorrect: boolean;
}

/**
 * Generates inline HTML for the study test overlay.
 * This is rendered as inline HTML (not iframe) to survive fullscreen container transfers.
 */
export function generateStudyTestHtml(
    state: StudyTestDisplayState,
    themeType: 'dark' | 'light',
    isFullscreen: boolean
): string {
    const { tokens, blankedIndices, userAnswers, showingResult, resultCorrect } = state;
    
    const fontSize = isFullscreen ? '28px' : '20px';
    const inputFontSize = isFullscreen ? '24px' : '18px';
    const containerPadding = isFullscreen ? '20px 24px' : '12px 16px';
    
    const bgColor = themeType === 'dark' ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = themeType === 'dark' ? '#ffffff' : '#000000';
    const inputBgColor = themeType === 'dark' ? 'rgba(60, 60, 60, 0.9)' : 'rgba(240, 240, 240, 0.9)';
    const inputBorderColor = themeType === 'dark' ? '#555' : '#ccc';
    const correctColor = '#4caf50';
    const incorrectColor = '#f44336';
    const correctBgColor = 'rgba(76, 175, 80, 0.15)';
    const incorrectBgColor = 'rgba(244, 67, 54, 0.15)';
    
    // Build cloze sentence HTML
    let clozeHtml = '';
    let inputIndex = 0;
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (blankedIndices.includes(i)) {
            const answer = userAnswers[inputIndex] || '';
            const correctAnswer = token.text;
            
            if (showingResult) {
                const isCorrect = answer.trim() === correctAnswer.trim();
                
                if (isCorrect) {
                    // Correct: green text with subtle highlight, add spacing for separation from other results
                    clozeHtml += `<span style="
                        color: ${correctColor}; 
                        font-weight: bold;
                        background: ${correctBgColor};
                        padding: 2px 6px;
                        border-radius: 4px;
                        margin: 0 4px;
                    ">${escapeHtml(correctAnswer)}</span>`;
                } else {
                    // Incorrect: user input keeps text-box styling, then arrow, then clean green highlight
                    const userInput = answer.trim() || '(empty)';
                    clozeHtml += `<span style="display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin: 0 4px;">` +
                        // User's wrong answer (styled like text input box with red border)
                        `<span style="
                            color: ${incorrectColor}; 
                            background: ${inputBgColor};
                            padding: 4px 8px;
                            border: 2px solid ${incorrectColor};
                            border-radius: 4px;
                            font-size: 0.95em;
                        ">${escapeHtml(userInput)}</span>` +
                        // Arrow separator
                        `<span style="color: ${textColor}; opacity: 0.5; font-size: 0.85em;">→</span>` +
                        // Correct answer (bold green, clean highlight - no border)
                        `<span style="
                            color: ${correctColor}; 
                            font-weight: bold;
                            background: ${correctBgColor};
                            padding: 2px 6px;
                            border-radius: 4px;
                        ">${escapeHtml(correctAnswer)}</span>` +
                    `</span>`;
                }
            } else {
                // Calculate input width based on expected answer length, with reasonable bounds
                const charWidth = Math.max(4, Math.min(correctAnswer.length + 2, 15));
                clozeHtml += `<input 
                    type="text" 
                    class="asbplayer-study-input" 
                    data-input-index="${inputIndex}"
                    value="${escapeHtml(answer)}"
                    style="
                        font-size: ${inputFontSize};
                        width: ${charWidth}em;
                        max-width: 180px;
                        padding: 4px 8px;
                        border: 2px solid ${inputBorderColor};
                        border-radius: 4px;
                        background: ${inputBgColor};
                        color: ${textColor};
                        outline: none;
                        text-align: center;
                        font-family: inherit;
                        box-sizing: border-box;
                    "
                    ${inputIndex === 0 ? 'autofocus' : ''}
                />`;
            }
            inputIndex++;
        } else {
            clozeHtml += `<span>${escapeHtml(token.text)}</span>`;
        }
    }
    
    // Build action button
    let buttonHtml = '';
    if (showingResult) {
        const buttonColor = resultCorrect ? correctColor : incorrectColor;
        const buttonText = resultCorrect ? '✓ Correct! Continue' : '✗ Incorrect. Continue';
        buttonHtml = `<button 
            class="asbplayer-study-continue-btn"
            style="
                margin-top: 12px;
                padding: 8px 24px;
                font-size: ${inputFontSize};
                background: ${buttonColor};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
            "
        >${buttonText}</button>`;
    } else {
        buttonHtml = `<button 
            class="asbplayer-study-submit-btn"
            style="
                margin-top: 12px;
                margin-right: 8px;
                padding: 8px 24px;
                font-size: ${inputFontSize};
                background: #2196f3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            "
        >Submit</button>
        <button 
            class="asbplayer-study-replay-btn"
            style="
                margin-top: 12px;
                padding: 8px 16px;
                font-size: ${inputFontSize};
                background: transparent;
                color: ${textColor};
                border: 1px solid ${inputBorderColor};
                border-radius: 4px;
                cursor: pointer;
            "
        >🔊 Replay</button>`;
    }
    
    return `
        <div class="asbplayer-study-test-container" style="
            background: ${bgColor};
            color: ${textColor};
            padding: ${containerPadding};
            border-radius: 8px;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 90%;
            margin: 0 auto;
            overflow: hidden;
            box-sizing: border-box;
        ">
            <div class="asbplayer-study-cloze" style="
                font-size: ${fontSize};
                line-height: 1.8;
                margin-bottom: 8px;
                word-wrap: break-word;
                overflow-wrap: break-word;
            ">${clozeHtml}</div>
            <div class="asbplayer-study-actions">${buttonHtml}</div>
        </div>
    `;
}

/**
 * Generates inline HTML for the persistent study mode indicator.
 */
export function generateStudyIndicatorHtml(
    linesUntilTest: number,
    themeType: 'dark' | 'light',
    isFullscreen: boolean
): string {
    const size = isFullscreen ? '48px' : '36px';
    const fontSize = isFullscreen ? '14px' : '11px';
    const bgColor = themeType === 'dark' ? 'rgba(50, 50, 50, 0.85)' : 'rgba(255, 255, 255, 0.85)';
    const textColor = themeType === 'dark' ? '#ffffff' : '#000000';
    const accentColor = '#2196f3';
    
    return `
        <div class="asbplayer-study-indicator" style="
            width: ${size};
            height: ${size};
            border-radius: 50%;
            background: ${bgColor};
            color: ${textColor};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            border: 2px solid ${accentColor};
            user-select: none;
            pointer-events: none;
        ">
            <span style="font-size: ${fontSize}; font-weight: bold;">${linesUntilTest}</span>
            <span style="font-size: ${isFullscreen ? '10px' : '8px'}; opacity: 0.7;">lines</span>
        </div>
    `;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * StudyOverlay manages the study test display using CachingElementOverlay pattern
 * for fullscreen compatibility. Content is rendered as inline HTML to survive
 * container transfers during fullscreen transitions.
 */
export class StudyOverlay {
    private readonly _overlay: CachingElementOverlay;
    private _visible: boolean = false;
    private _currentState?: StudyTestDisplayState;
    private _themeType: 'dark' | 'light' = 'dark';
    private _eventListeners: { element: Element; type: string; listener: EventListener }[] = [];

    public onReplay?: () => void;
    public onSubmit?: (answers: string[]) => void;
    public onContinue?: (passed: boolean) => void;
    public onInputChange?: (index: number, value: string) => void;

    constructor(targetElement: HTMLElement, onMouseOver: (event: MouseEvent) => void) {
        const params: ElementOverlayParams = {
            targetElement,
            nonFullscreenContainerClassName: 'asbplayer-study-container',
            nonFullscreenContentClassName: 'asbplayer-study-content',
            fullscreenContainerClassName: 'asbplayer-study-container',
            fullscreenContentClassName: 'asbplayer-study-fullscreen-content',
            offsetAnchor: OffsetAnchor.bottom,
            contentPositionOffset: 100,
            contentWidthPercentage: 90,
            onMouseOver,
        };
        this._overlay = new CachingElementOverlay(params);
    }

    get visible(): boolean {
        return this._visible;
    }

    setTheme(themeType: 'dark' | 'light') {
        this._themeType = themeType;
        if (this._visible && this._currentState) {
            this._render();
        }
    }

    show(state: StudyTestDisplayState) {
        this._currentState = state;
        this._visible = true;
        this._render();
    }

    updateState(state: Partial<StudyTestDisplayState>) {
        if (!this._currentState) return;
        this._currentState = { ...this._currentState, ...state };
        this._render();
    }

    hide() {
        this._visible = false;
        this._currentState = undefined;
        this._cleanupEventListeners();
        this._overlay.hide();
    }

    dispose() {
        this._cleanupEventListeners();
        this._overlay.dispose();
    }

    refresh() {
        this._overlay.refresh();
    }

    private _render() {
        if (!this._visible || !this._currentState) return;

        const isFullscreen = !!document.fullscreenElement;
        const html = generateStudyTestHtml(this._currentState, this._themeType, isFullscreen);
        
        // Don't use a key - we want fresh HTML each render since state changes (input vs result mode)
        this._overlay.setHtml([{ html: () => html }]);
        
        // Attach event listeners after render
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => this._attachEventListeners(), 0);
    }

    private _attachEventListeners() {
        this._cleanupEventListeners();
        
        const container = this._overlay.containerElement;
        if (!container) return;

        // Stop all click propagation on the container to prevent video player interaction
        const containerClickListener = (e: Event) => {
            e.stopPropagation();
        };
        container.addEventListener('click', containerClickListener);
        this._eventListeners.push({ element: container, type: 'click', listener: containerClickListener });
        
        // Stop mousedown propagation too (some video players use this)
        const containerMousedownListener = (e: Event) => {
            e.stopPropagation();
        };
        container.addEventListener('mousedown', containerMousedownListener);
        this._eventListeners.push({ element: container, type: 'mousedown', listener: containerMousedownListener });

        // Input fields
        const inputs = container.querySelectorAll('.asbplayer-study-input');
        inputs.forEach((input) => {
            const inputEl = input as HTMLInputElement;
            const index = parseInt(inputEl.dataset.inputIndex || '0', 10);
            
            const inputListener = (e: Event) => {
                e.stopPropagation(); // Prevent video player interaction
                this.onInputChange?.(index, (e.target as HTMLInputElement).value);
            };
            inputEl.addEventListener('input', inputListener);
            this._eventListeners.push({ element: inputEl, type: 'input', listener: inputListener });
            
            const keydownListener = (e: Event) => {
                const keyEvent = e as KeyboardEvent;
                // Allow Tab to move focus between fields (don't stop propagation for Tab)
                if (keyEvent.key !== 'Tab') {
                    e.stopPropagation(); // Prevent extension shortcut conflicts
                }
                // Only submit on Enter when not composing (IME) and all fields are filled
                if (keyEvent.key === 'Enter' && !keyEvent.isComposing) {
                    const allInputs = container.querySelectorAll('.asbplayer-study-input');
                    const allFilled = Array.from(allInputs).every(
                        (inp) => (inp as HTMLInputElement).value.trim() !== ''
                    );
                    if (allFilled) {
                        e.preventDefault();
                        this._handleSubmit();
                    }
                }
            };
            inputEl.addEventListener('keydown', keydownListener);
            this._eventListeners.push({ element: inputEl, type: 'keydown', listener: keydownListener });
            
            // Stop click propagation to prevent video pause/play
            const clickListener = (e: Event) => {
                e.stopPropagation();
            };
            inputEl.addEventListener('click', clickListener);
            this._eventListeners.push({ element: inputEl, type: 'click', listener: clickListener });
        });

        // Submit button
        const submitBtn = container.querySelector('.asbplayer-study-submit-btn');
        if (submitBtn) {
            const submitListener = (e: Event) => {
                e.stopPropagation();
                this._handleSubmit();
            };
            submitBtn.addEventListener('click', submitListener);
            this._eventListeners.push({ element: submitBtn, type: 'click', listener: submitListener });
        }

        // Replay button
        const replayBtn = container.querySelector('.asbplayer-study-replay-btn');
        if (replayBtn) {
            const replayListener = (e: Event) => {
                e.stopPropagation();
                this.onReplay?.();
            };
            replayBtn.addEventListener('click', replayListener);
            this._eventListeners.push({ element: replayBtn, type: 'click', listener: replayListener });
        }

        // Continue button
        const continueBtn = container.querySelector('.asbplayer-study-continue-btn');
        if (continueBtn) {
            const continueListener = (e: Event) => {
                e.stopPropagation();
                this.onContinue?.(this._currentState?.resultCorrect ?? false);
            };
            continueBtn.addEventListener('click', continueListener);
            this._eventListeners.push({ element: continueBtn, type: 'click', listener: continueListener });
            
            // Also handle Enter key for continue
            const keydownListener = (e: Event) => {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.onContinue?.(this._currentState?.resultCorrect ?? false);
                }
            };
            document.addEventListener('keydown', keydownListener);
            this._eventListeners.push({ element: document as unknown as Element, type: 'keydown', listener: keydownListener });
        }

        // Focus first input if not showing result
        if (!this._currentState?.showingResult) {
            const firstInput = container.querySelector('.asbplayer-study-input') as HTMLInputElement;
            firstInput?.focus();
        } else {
            // Focus continue button
            const continueBtn = container.querySelector('.asbplayer-study-continue-btn') as HTMLButtonElement;
            continueBtn?.focus();
        }
    }

    private _handleSubmit() {
        if (!this._currentState) return;
        
        // Read answers directly from DOM inputs (more reliable than state)
        const container = this._overlay.containerElement;
        if (!container) return;
        
        const inputs = container.querySelectorAll('.asbplayer-study-input');
        const answers: string[] = [];
        inputs.forEach((input) => {
            answers.push((input as HTMLInputElement).value);
        });
        
        // Update internal state with DOM values
        this._currentState = {
            ...this._currentState,
            userAnswers: answers,
        };
        
        // Don't submit unless ALL fields are filled
        if (!answers.every(a => a.trim())) return;
        
        this.onSubmit?.(answers);
    }

    private _cleanupEventListeners() {
        for (const { element, type, listener } of this._eventListeners) {
            element.removeEventListener(type, listener);
        }
        this._eventListeners = [];
    }
}

/**
 * StudyIndicatorOverlay shows a persistent badge with lines until next test.
 */
export class StudyIndicatorOverlay {
    private readonly _overlay: CachingElementOverlay;
    private _visible: boolean = false;
    private _linesUntilTest: number = 0;
    private _themeType: 'dark' | 'light' = 'dark';

    constructor(targetElement: HTMLElement) {
        const params: ElementOverlayParams = {
            targetElement,
            nonFullscreenContainerClassName: 'asbplayer-study-indicator-container',
            nonFullscreenContentClassName: 'asbplayer-study-indicator-content',
            fullscreenContainerClassName: 'asbplayer-study-indicator-container',
            fullscreenContentClassName: 'asbplayer-study-indicator-fullscreen-content',
            offsetAnchor: OffsetAnchor.bottom,
            contentPositionOffset: 20,
            contentWidthPercentage: -1, // Use maxWidth instead
            onMouseOver: () => {},
        };
        this._overlay = new CachingElementOverlay(params);
    }

    get visible(): boolean {
        return this._visible;
    }

    setTheme(themeType: 'dark' | 'light') {
        this._themeType = themeType;
        if (this._visible) {
            this._render();
        }
    }

    show(linesUntilTest: number) {
        this._linesUntilTest = linesUntilTest;
        this._visible = true;
        this._render();
    }

    update(linesUntilTest: number) {
        this._linesUntilTest = linesUntilTest;
        if (this._visible) {
            this._render();
        }
    }

    hide() {
        this._visible = false;
        this._overlay.hide();
    }

    dispose() {
        this._overlay.dispose();
    }

    refresh() {
        this._overlay.refresh();
    }

    private _render() {
        if (!this._visible) return;

        const isFullscreen = !!document.fullscreenElement;
        const html = generateStudyIndicatorHtml(this._linesUntilTest, this._themeType, isFullscreen);
        
        this._overlay.setHtml([{ key: 'study-indicator', html: () => html }]);
    }
}
