/**
 * Tokenizer Factory
 * 
 * Creates tokenizer instances based on configuration.
 * Provides a simple interface to create either Yomitan or Kuromoji tokenizers.
 */
import { Tokenizer, TokenizerType } from '@project/common/tokenizer';
import { YomitanTokenizer } from '@project/common/tokenizer/yomitan-tokenizer';
import { KuromojiTokenizer } from './kuromoji-tokenizer';
import { Fetcher } from '@project/common';
import { DictionaryTrack } from '@project/common/settings';

export interface CreateTokenizerOptions {
    type: TokenizerType;
    // Yomitan options
    dictionaryTrack?: DictionaryTrack;
    fetcher?: Fetcher;
    // Kuromoji options
    dictionaryPath?: string;
}

/**
 * Create a tokenizer instance based on the provided options.
 * 
 * @param options Configuration for the tokenizer
 * @returns A ready-to-use Tokenizer instance
 * @throws Error if the tokenizer fails to initialize
 */
export async function createTokenizer(options: CreateTokenizerOptions): Promise<Tokenizer> {
    if (options.type === 'kuromoji') {
        const tokenizer = new KuromojiTokenizer(options.dictionaryPath);
        const ready = await tokenizer.isReady();
        if (!ready) {
            throw new Error('Failed to initialize Kuromoji tokenizer');
        }
        return tokenizer;
    }

    // Default to Yomitan
    if (!options.dictionaryTrack) {
        throw new Error('DictionaryTrack is required for Yomitan tokenizer');
    }
    const tokenizer = new YomitanTokenizer(options.dictionaryTrack, options.fetcher);
    const ready = await tokenizer.isReady();
    if (!ready) {
        throw new Error('Failed to connect to Yomitan');
    }
    return tokenizer;
}
