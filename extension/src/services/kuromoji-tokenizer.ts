/**
 * Kuromoji Tokenizer
 * 
 * Implements the Tokenizer interface using @sglkc/kuromoji via a Web Worker.
 * The worker handles dictionary loading and tokenization to avoid blocking the main thread.
 */
import { Tokenizer, TokenPart } from '@project/common/tokenizer';

interface WorkerMessage {
    type: 'ready' | 'result' | 'error';
    id?: string;
    tokens?: TokenPart[][];
    error?: string;
}

export class KuromojiTokenizer implements Tokenizer {
    private worker: Worker | null = null;
    private ready: boolean = false;
    private readyPromise: Promise<void> | null = null;
    private pendingRequests: Map<string, { 
        resolve: (tokens: TokenPart[][]) => void; 
        reject: (error: Error) => void;
    }> = new Map();
    private cache: Map<string, TokenPart[][]> = new Map();
    private requestId: number = 0;
    private dictionaryPath: string;

    constructor(dictionaryPath?: string) {
        // Default to extension's bundled dictionary
        // Type assertion needed - WXT types are regenerated on build to include new paths
        this.dictionaryPath = dictionaryPath || browser.runtime.getURL('/kuromoji-dict/' as any);
    }

    private async initWorker(): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise(async (resolve, reject) => {
            try {
                // Load worker code and create worker (same pattern as mp3-encoder-worker)
                // Type assertion needed - WXT types are regenerated on build to include new paths
                const code = await (await fetch(browser.runtime.getURL('/kuromoji-worker.js' as any))).text();
                const blob = new Blob([code], { type: 'application/javascript' });
                this.worker = new Worker(URL.createObjectURL(blob));

                this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                    const { type, id, tokens, error } = e.data;

                    if (type === 'ready') {
                        this.ready = true;
                        resolve();
                    } else if (type === 'error' && !id) {
                        // Initialization error
                        reject(new Error(error || 'Unknown error initializing Kuromoji'));
                    } else if (type === 'result' && id) {
                        const pending = this.pendingRequests.get(id);
                        if (pending) {
                            this.pendingRequests.delete(id);
                            pending.resolve(tokens || []);
                        }
                    } else if (type === 'error' && id) {
                        const pending = this.pendingRequests.get(id);
                        if (pending) {
                            this.pendingRequests.delete(id);
                            pending.reject(new Error(error || 'Tokenization error'));
                        }
                    }
                };

                this.worker.onerror = (e) => {
                    reject(new Error(`Worker error: ${e.message}`));
                };

                // Initialize with dictionary path
                this.worker.postMessage({ 
                    type: 'init', 
                    dictionaryPath: this.dictionaryPath 
                });
            } catch (error) {
                reject(error);
            }
        });

        return this.readyPromise;
    }

    async tokenize(text: string): Promise<TokenPart[][]> {
        // Check cache first
        const cached = this.cache.get(text);
        if (cached) return cached;

        // Ensure worker is initialized
        await this.initWorker();

        return new Promise((resolve, reject) => {
            const id = String(++this.requestId);
            this.pendingRequests.set(id, {
                resolve: (tokens) => {
                    this.cache.set(text, tokens);
                    resolve(tokens);
                },
                reject,
            });
            this.worker!.postMessage({ type: 'tokenize', id, text });
        });
    }

    async isReady(): Promise<boolean> {
        try {
            await this.initWorker();
            return this.ready;
        } catch {
            return false;
        }
    }

    resetCache(): void {
        this.cache.clear();
    }

    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.ready = false;
        this.readyPromise = null;
        this.pendingRequests.clear();
        this.cache.clear();
    }
}
