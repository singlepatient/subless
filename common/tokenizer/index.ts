/**
 * Modular Tokenizer Interface
 * 
 * This module provides an abstraction layer for text tokenization,
 * allowing different backends (Yomitan, Kuromoji, etc.) to be swapped easily.
 */

/**
 * A token part representing a segment of text with its reading.
 */
export interface TokenPart {
    text: string;
    reading: string;
    /** Part of speech from morphological analyzer (e.g., '名詞', '動詞', '記号') */
    pos?: string;
    /** Whether the token is a known dictionary word or unknown */
    wordType?: 'KNOWN' | 'UNKNOWN';
}

/**
 * Abstract tokenizer interface that all implementations must follow.
 */
export interface Tokenizer {
    /**
     * Tokenize text into groups of token parts.
     * Each group represents a semantic unit (e.g., a word with its reading).
     * @param text The text to tokenize
     * @returns Promise resolving to array of token groups
     */
    tokenize(text: string): Promise<TokenPart[][]>;
    
    /**
     * Check if the tokenizer is ready for use.
     * For Yomitan, this validates the connection.
     * For Kuromoji, this checks if the dictionary is loaded.
     */
    isReady(): Promise<boolean>;
    
    /**
     * Reset any internal caches.
     */
    resetCache(): void;
    
    /**
     * Clean up resources (e.g., terminate workers).
     */
    dispose(): void;
}

/**
 * Available tokenizer backends.
 */
export type TokenizerType = 'yomitan' | 'kuromoji';
