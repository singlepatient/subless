/**
 * Yomitan Tokenizer Adapter
 * 
 * Wraps the existing Yomitan class to implement the Tokenizer interface.
 */
import { Tokenizer, TokenPart } from './index';
import { Yomitan } from '../yomitan';
import { Fetcher, HttpFetcher } from '@project/common';
import { DictionaryTrack } from '../settings';

export class YomitanTokenizer implements Tokenizer {
    private readonly yomitan: Yomitan;

    constructor(dictionaryTrack: DictionaryTrack, fetcher: Fetcher = new HttpFetcher()) {
        this.yomitan = new Yomitan(dictionaryTrack, fetcher);
    }

    async tokenize(text: string): Promise<TokenPart[][]> {
        return this.yomitan.tokenize(text);
    }

    async isReady(): Promise<boolean> {
        try {
            await this.yomitan.version();
            return true;
        } catch {
            return false;
        }
    }

    resetCache(): void {
        this.yomitan.resetCache();
    }

    dispose(): void {
        // No cleanup needed for Yomitan (HTTP-based)
    }
}
