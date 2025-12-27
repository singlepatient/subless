/**
 * Granular record of a single watch session with subtitles enabled.
 * Stored in IndexedDB for detailed analytics.
 */
export interface WatchTimeRecord {
    /** Auto-incremented primary key */
    id?: number;
    /** Unique identifier for this watch session */
    sessionId: string;
    /** Unix timestamp (ms) when this record was created */
    timestamp: number;
    /** Duration of active watching in milliseconds */
    durationMs: number;
    /** ISO 639-1 language code (e.g., 'ja', 'ko', 'zh', 'en') */
    languageCode: string;
    /** Domain where video was watched (e.g., 'youtube.com', 'netflix.com') */
    domain: string;
    /** Optional: URL of the video for reference */
    videoUrl?: string;
    /** Optional: Name of the subtitle file that was loaded */
    subtitleFileName?: string;
}

/**
 * Aggregated watch time summary for a single day.
 * Computed from granular records for display in activity grid.
 */
export interface DailyWatchTimeSummary {
    /** Date in 'YYYY-MM-DD' format (local timezone) */
    date: string;
    /** Total watch time in milliseconds for this day */
    totalMs: number;
    /** Breakdown of watch time by language code */
    languageBreakdown: Record<string, number>;
    /** Number of watch sessions on this day */
    sessionCount: number;
}

/**
 * Comprehensive watch time statistics for display in UI.
 */
export interface WatchTimeStats {
    /** Daily summaries for activity grid (typically last 365 days) */
    dailySummaries: DailyWatchTimeSummary[];
    /** Total watch time across all records in milliseconds */
    totalAllTimeMs: number;
    /** Current consecutive days streak */
    currentStreak: number;
    /** Longest ever consecutive days streak */
    longestStreak: number;
    /** Average watch time per day in milliseconds (days with activity only) */
    averagePerDayMs: number;
    /** Total number of watch sessions */
    totalSessions: number;
    /** Breakdown of all-time watch time by language */
    languageBreakdown: Record<string, number>;
}

/**
 * Options for querying watch time records.
 */
export interface WatchTimeQueryOptions {
    /** Start of date range (Unix timestamp ms) */
    startDate?: number;
    /** End of date range (Unix timestamp ms) */
    endDate?: number;
    /** Filter by specific language code */
    languageCode?: string;
    /** Filter by specific domain */
    domain?: string;
    /** Maximum number of records to return */
    limit?: number;
}
