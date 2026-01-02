import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ReplayIcon from '@mui/icons-material/Replay';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import CssBaseline from '@mui/material/CssBaseline';
import { PaletteMode } from '@mui/material/styles';
import { Message, UpdateStateMessage } from '@project/common';
import { createTheme } from '@project/common/theme';
import Bridge from '../bridge';
import { TokenPart } from '@project/common/yomitan';

interface Props {
    bridge: Bridge;
}

interface StudyTestState {
    tokens: TokenPart[];
    blankedIndices: number[];
    subtitleStart: number;
    subtitleEnd: number;
}

const StudyTestUi = ({ bridge }: Props) => {
    const { t } = useTranslation();
    const [themeType, setThemeType] = useState<PaletteMode>('dark');
    const [tokens, setTokens] = useState<TokenPart[]>([]);
    const [blankedIndices, setBlankedIndices] = useState<number[]>([]);
    const [answers, setAnswers] = useState<string[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [results, setResults] = useState<boolean[]>([]);
    const [isComposing, setIsComposing] = useState(false);

    // Prevent Enter from immediately triggering continue after submit
    const justSubmitted = useRef(false);

    const theme = useMemo(() => createTheme(themeType), [themeType]);

    useEffect(() => {
        const unsubscribe = bridge.addClientMessageListener((message: Message) => {
            if (message.command !== 'updateState') {
                return;
            }

            const state = (message as UpdateStateMessage).state as StudyTestState & { 
                themeType?: PaletteMode;
                showingResult?: boolean;
                answerResults?: boolean[];
            };

            if (state.themeType !== undefined) {
                setThemeType(state.themeType);
            }

            if (state.tokens !== undefined) {
                setTokens(state.tokens);
                setSubmitted(false);
                setResults([]);
            }

            if (state.blankedIndices !== undefined) {
                setBlankedIndices(state.blankedIndices);
                setAnswers(new Array(state.blankedIndices.length).fill(''));
            }
            
            // Receive validation results from controller
            if (state.showingResult && state.answerResults) {
                setSubmitted(true);
                setResults(state.answerResults);
            }
        });

        return unsubscribe;
    }, [bridge]);

    const handleReplay = useCallback(() => {
        bridge.sendMessageFromServer({ command: 'replay' });
    }, [bridge]);

    const handleAnswerChange = useCallback((index: number, value: string) => {
        setAnswers(prev => {
            const newAnswers = [...prev];
            newAnswers[index] = value;
            return newAnswers;
        });
    }, []);

    const handleSubmit = useCallback(() => {
        // Send answers to controller for validation (with tokenization support)
        // Results will come back via updateState message
        justSubmitted.current = true;
        bridge.sendMessageFromServer({ command: 'submit', answers } as any);
    }, [bridge, answers]);

    const handleContinue = useCallback(() => {
        const passed = results.every(r => r);
        bridge.sendMessageFromServer({ command: 'continue', passed } as any);
    }, [bridge, results]);

    const allAnswered = useMemo(() => answers.every(a => a.trim() !== ''), [answers]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Don't submit during IME composition (e.g., Japanese input)
        if (isComposing) return;
        
        if (e.key === 'Enter' && !submitted && allAnswered) {
            handleSubmit();
        } else if (e.key === 'Enter' && submitted) {
            handleContinue();
        }
    }, [submitted, isComposing, allAnswered, handleSubmit, handleContinue]);

    // Global keydown listener for Enter to continue after submission, but not immediately after submit
    useEffect(() => {
        if (!submitted) return;
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (!justSubmitted.current) {
                    handleContinue();
                }
            }
        };
        const handleGlobalKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                justSubmitted.current = false;
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        window.addEventListener('keyup', handleGlobalKeyUp);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
            window.removeEventListener('keyup', handleGlobalKeyUp);
        };
    }, [submitted, handleContinue]);

    // Build the display with blanks
    let blankIndex = 0;
    const displayElements = tokens.map((token, idx) => {
        if (blankedIndices.includes(idx)) {
            const currentBlankIndex = blankIndex++;
            const isCorrect = submitted ? results[currentBlankIndex] : undefined;
            const correctAnswer = token.text;
            const currentAnswer = answers[currentBlankIndex] || '';
            const displayLength = Math.max(correctAnswer.length, currentAnswer.length, 2);
            return (
                <Box key={idx} component="span" sx={{ display: 'inline-flex', alignItems: 'center', mx: 0.5 }}>
                    <TextField
                        size="small"
                        variant="outlined"
                        value={currentAnswer}
                        onChange={(e) => handleAnswerChange(currentBlankIndex, e.target.value)}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        disabled={submitted}
                        error={isCorrect === false}
                        sx={{
                            minWidth: '100px',
                            width: `${displayLength * 2.5}em`,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: submitted 
                                    ? (isCorrect ? 'success.dark' : 'error.dark')
                                    : 'background.paper',
                            },
                            '& input': {
                                textAlign: 'center',
                                fontSize: '1.1rem',
                                padding: '6px 10px',
                            }
                        }}
                        autoFocus={currentBlankIndex === 0}
                    />
                    {submitted && !isCorrect && (
                        <Typography 
                            component="span" 
                            sx={{ ml: 1, color: 'success.light', fontSize: '1.2rem' }}
                        >
                            ({correctAnswer})
                        </Typography>
                    )}
                </Box>
            );
        }
        return (
            <Typography key={idx} component="span" sx={{ fontSize: '1.5rem' }}>
                {token.text}
            </Typography>
        );
    });

    const allCorrect = submitted && results.every(r => r);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    p: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    borderRadius: 2,
                    height: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                }}
            >
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary', textAlign: 'center' }}>
                    {t('studyMode.fillInTheBlanks', 'Fill in the blanks')}
                </Typography>

                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: 2,
                        alignItems: { xs: 'stretch', sm: 'center' },
                        backgroundColor: 'background.paper',
                        borderRadius: 2,
                        p: 1.5,
                    }}
                >
                    {/* Scrollable cloze content */}
                    <Box
                        sx={{
                            flex: 1,
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            whiteSpace: 'nowrap',
                            py: 1,
                            px: 0.5,
                            lineHeight: 2.2,
                            '&::-webkit-scrollbar': {
                                height: 6,
                            },
                            '&::-webkit-scrollbar-thumb': {
                                backgroundColor: 'rgba(255,255,255,0.3)',
                                borderRadius: 3,
                            },
                        }}
                    >
                        {displayElements}
                    </Box>

                    {/* Fixed action buttons */}
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'row', sm: 'column' },
                            gap: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            borderLeft: { xs: 'none', sm: '1px solid' },
                            borderTop: { xs: '1px solid', sm: 'none' },
                            borderColor: 'divider',
                            pl: { xs: 0, sm: 2 },
                            pt: { xs: 1, sm: 0 },
                            minWidth: { xs: 'auto', sm: '120px' },
                        }}
                    >
                        <IconButton 
                            onClick={handleReplay} 
                            color="primary"
                            size="medium"
                            title={t('studyMode.replay', 'Replay')}
                        >
                            <ReplayIcon />
                        </IconButton>

                        {!submitted ? (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleSubmit}
                                disabled={!allAnswered}
                            >
                                {t('studyMode.checkAnswer', 'Check')}
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleContinue}
                                color={allCorrect ? 'success' : 'warning'}
                                aria-live="polite"
                                startIcon={allCorrect ? '✓' : '✗'}
                            >
                                {allCorrect 
                                    ? t('studyMode.correct', 'Correct!') 
                                    : t('studyMode.incorrect', 'Incorrect')}
                            </Button>
                        )}
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
};

export default StudyTestUi;
