import { useEffect, useState, useCallback } from 'react';
import type { RequestWatchTimeStatsResponse } from '../src/message';
import type ChromeExtension from '../app/services/chrome-extension';

interface WatchTimeStats {
    dailySummaries: Array<{
        date: string;
        totalMs: number;
        languageBreakdown: Record<string, number>;
        sessionCount: number;
    }>;
    totalAllTimeMs: number;
    currentStreak: number;
    longestStreak: number;
    averagePerDayMs: number;
    totalSessions: number;
    languageBreakdown: Record<string, number>;
}

interface UseWatchTimeStatsOptions {
    /** Number of days to fetch (default: 365) */
    days?: number;
    /** Whether to auto-fetch on mount (default: true) */
    autoFetch?: boolean;
    /** ChromeExtension instance for app context (uses postMessage). If not provided, uses chrome.runtime.sendMessage */
    extension?: ChromeExtension;
}

interface UseWatchTimeStatsResult {
    stats: WatchTimeStats | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    clearStats: () => Promise<void>;
}

/**
 * Hook to fetch watch time statistics from the extension background.
 * Works in both extension context (popup, options page, side panel) and app context (via ChromeExtension).
 */
export function useWatchTimeStats(options: UseWatchTimeStatsOptions = {}): UseWatchTimeStatsResult {
    const { days = 365, autoFetch = true, extension } = options;

    const [stats, setStats] = useState<WatchTimeStats | null>(null);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<Error | null>(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const endDate = Date.now();
            const startDate = endDate - days * 24 * 60 * 60 * 1000;

            let response: RequestWatchTimeStatsResponse;

            if (extension) {
                // App context - use postMessage via ChromeExtension
                response = await extension.requestWatchTimeStats(startDate, endDate);
            } else {
                // Extension context - use chrome.runtime.sendMessage directly
                response = await chrome.runtime.sendMessage({
                    sender: 'asbplayerv2',
                    message: {
                        command: 'request-watch-time-stats',
                        messageId: `watch-time-stats-${Date.now()}`,
                        startDate,
                        endDate,
                    },
                }) as RequestWatchTimeStatsResponse;
            }

            if ('error' in response) {
                throw new Error((response as any).error);
            }

            setStats(response.stats);
        } catch (e) {
            console.error('Failed to fetch watch time stats:', e);
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoading(false);
        }
    }, [days, extension]);

    const clearStats = useCallback(async () => {
        try {
            if (extension) {
                await extension.clearWatchTime();
            } else {
                await chrome.runtime.sendMessage({
                    sender: 'asbplayerv2',
                    message: {
                        command: 'clear-watch-time',
                        messageId: `clear-watch-time-${Date.now()}`,
                    },
                });
            }
            setStats(null);
            await fetchStats();
        } catch (e) {
            console.error('Failed to clear watch time:', e);
            throw e;
        }
    }, [extension, fetchStats]);

    useEffect(() => {
        if (autoFetch) {
            fetchStats();
        }
    }, [autoFetch, fetchStats]);

    return { stats, loading, error, refetch: fetchStats, clearStats };
}
