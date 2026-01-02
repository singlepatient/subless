/**
 * Kuromoji Worker Implementation
 * 
 * Handles tokenization in a Web Worker to avoid blocking the main thread.
 * Uses @sglkc/kuromoji for Japanese morphological analysis.
 */
import kuromoji from '@sglkc/kuromoji';

interface TokenizeMessage {
    type: 'init' | 'tokenize';
    id?: string;
    text?: string;
    dictionaryPath?: string;
}

interface KuromojiToken {
    word_id: number;
    word_type: string;
    word_position: number;
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    reading?: string;
    pronunciation?: string;
}

let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;

/**
 * Initialize the worker message handler.
 * Called from the WXT unlisted script entry point.
 */
export function onMessage() {
    self.onmessage = async (e: MessageEvent<TokenizeMessage>) => {
        const { type, id, text, dictionaryPath } = e.data;

        if (type === 'init') {
            try {
                const dicPath = dictionaryPath || '';
                tokenizer = await new Promise((resolve, reject) => {
                    kuromoji.builder({ dicPath }).build((err: Error | null, tok: kuromoji.Tokenizer<kuromoji.IpadicFeatures>) => {
                        if (err) reject(err);
                        else resolve(tok);
                    });
                });
                self.postMessage({ type: 'ready' });
            } catch (error) {
                self.postMessage({ type: 'error', error: String(error) });
            }
        } else if (type === 'tokenize' && tokenizer && text) {
            try {
                const tokens = tokenizer.tokenize(text) as KuromojiToken[];
                // Convert to TokenPart[][] format
                // Each token becomes its own group (single element array)
                // Kuromoji returns katakana readings; we keep them as-is
                const result = tokens.map((t: KuromojiToken) => [{
                    text: t.surface_form,
                    // Use reading if available, otherwise fall back to surface_form
                    reading: t.reading || t.surface_form,
                    // Include POS for filtering (記号 = punctuation/symbols)
                    pos: t.pos,
                    // KNOWN = dictionary word, UNKNOWN = unknown word
                    wordType: t.word_type as 'KNOWN' | 'UNKNOWN' | undefined,
                }]);
                self.postMessage({ type: 'result', id, tokens: result });
            } catch (error) {
                self.postMessage({ type: 'error', id, error: String(error) });
            }
        }
    };
}
