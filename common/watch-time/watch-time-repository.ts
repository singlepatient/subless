import Dexie from 'dexie';
import {
    WatchTimeRecord,
    DailyWatchTimeSummary,
    WatchTimeStats,
    WatchTimeQueryOptions,
} from './types';

/**
 * Dexie database for storing watch time records.
 */
class WatchTimeDatabase extends Dexie {
    watchTimeRecords!: Dexie.Table<WatchTimeRecord, number>;

    constructor() {
        super('WatchTimeDatabase');
        this.version(1).stores({
            // ++id = auto-increment primary key
            // timestamp, languageCode, domain = indexed for queries
            watchTimeRecords: '++id,timestamp,languageCode,domain,sessionId',
        });
    }
}

/**
 * Repository interface for watch time data operations.
 */
export interface WatchTimeRepository {
    /** Save a new watch time record */
    save: (record: WatchTimeRecord) => Promise<void>;
    /** Fetch records with optional filtering */
    fetch: (options?: WatchTimeQueryOptions) => Promise<WatchTimeRecord[]>;
    /** Get aggregated statistics for a date range */
    getStats: (startDate: number, endDate: number) => Promise<WatchTimeStats>;
    /** Get daily summaries for a date range (for activity grid) */
    getDailySummaries: (startDate: number, endDate: number) => Promise<DailyWatchTimeSummary[]>;
    /** Delete all records */
    clear: () => Promise<void>;
    /** Delete records older than a given timestamp */
    deleteOlderThan: (timestamp: number) => Promise<number>;
    /** Get total record count */
    count: () => Promise<number>;
}

/**
 * Helper to convert timestamp to local date string 'YYYY-MM-DD'.
 */
function timestampToDateString(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Helper to get start of day timestamp for a date string.
 */
function dateStringToTimestamp(dateString: string): number {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
}

/**
 * Calculate streak information from daily summaries.
 */
function calculateStreaks(summaries: DailyWatchTimeSummary[]): { current: number; longest: number } {
    if (summaries.length === 0) {
        return { current: 0, longest: 0 };
    }

    // Sort by date ascending
    const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
    
    // Create a set of dates with activity for O(1) lookup
    const activeDates = new Set(sorted.map(s => s.date));
    
    let longestStreak = 0;
    let currentStreak = 0;
    
    // Calculate longest streak
    let streak = 0;
    let prevDate: Date | null = null;
    
    for (const summary of sorted) {
        const currentDate = new Date(summary.date);
        
        if (prevDate) {
            const dayDiff = Math.round(
                (currentDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000)
            );
            
            if (dayDiff === 1) {
                streak++;
            } else {
                streak = 1;
            }
        } else {
            streak = 1;
        }
        
        longestStreak = Math.max(longestStreak, streak);
        prevDate = currentDate;
    }
    
    // Calculate current streak (counting back from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let checkDate = today;
    currentStreak = 0;
    
    // Allow for checking yesterday if today has no activity yet
    const todayString = timestampToDateString(today.getTime());
    if (!activeDates.has(todayString)) {
        checkDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    }
    
    while (true) {
        const dateString = timestampToDateString(checkDate.getTime());
        if (activeDates.has(dateString)) {
            currentStreak++;
            checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
        } else {
            break;
        }
    }
    
    return { current: currentStreak, longest: longestStreak };
}

/**
 * IndexedDB implementation of WatchTimeRepository using Dexie.
 */
export class IndexedDBWatchTimeRepository implements WatchTimeRepository {
    private readonly _db = new WatchTimeDatabase();

    async save(record: WatchTimeRecord): Promise<void> {
        await this._db.watchTimeRecords.add(record);
    }

    async fetch(options: WatchTimeQueryOptions = {}): Promise<WatchTimeRecord[]> {
        let collection = this._db.watchTimeRecords.toCollection();

        // Apply filters using Dexie's where clauses for efficiency
        if (options.startDate !== undefined || options.endDate !== undefined) {
            const start = options.startDate ?? 0;
            const end = options.endDate ?? Date.now();
            collection = this._db.watchTimeRecords
                .where('timestamp')
                .between(start, end, true, true);
        }

        let results = await collection.toArray();

        // Apply additional filters in memory (less efficient but flexible)
        if (options.languageCode) {
            results = results.filter(r => r.languageCode === options.languageCode);
        }
        if (options.domain) {
            results = results.filter(r => r.domain === options.domain);
        }

        // Sort by timestamp descending (most recent first)
        results.sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit
        if (options.limit !== undefined) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    async getDailySummaries(startDate: number, endDate: number): Promise<DailyWatchTimeSummary[]> {
        const records = await this._db.watchTimeRecords
            .where('timestamp')
            .between(startDate, endDate, true, true)
            .toArray();

        // Group by date
        const dailyMap = new Map<string, {
            totalMs: number;
            languageBreakdown: Record<string, number>;
            sessionIds: Set<string>;
        }>();

        for (const record of records) {
            const dateString = timestampToDateString(record.timestamp);
            
            if (!dailyMap.has(dateString)) {
                dailyMap.set(dateString, {
                    totalMs: 0,
                    languageBreakdown: {},
                    sessionIds: new Set(),
                });
            }

            const daily = dailyMap.get(dateString)!;
            daily.totalMs += record.durationMs;
            daily.languageBreakdown[record.languageCode] = 
                (daily.languageBreakdown[record.languageCode] || 0) + record.durationMs;
            daily.sessionIds.add(record.sessionId);
        }

        // Convert to array of DailyWatchTimeSummary
        const summaries: DailyWatchTimeSummary[] = [];
        for (const [date, data] of dailyMap) {
            summaries.push({
                date,
                totalMs: data.totalMs,
                languageBreakdown: data.languageBreakdown,
                sessionCount: data.sessionIds.size,
            });
        }

        // Sort by date ascending
        summaries.sort((a, b) => a.date.localeCompare(b.date));

        return summaries;
    }

    async getStats(startDate: number, endDate: number): Promise<WatchTimeStats> {
        const dailySummaries = await this.getDailySummaries(startDate, endDate);

        // Calculate totals
        let totalAllTimeMs = 0;
        let totalSessions = 0;
        const languageBreakdown: Record<string, number> = {};

        for (const summary of dailySummaries) {
            totalAllTimeMs += summary.totalMs;
            totalSessions += summary.sessionCount;
            
            for (const [lang, ms] of Object.entries(summary.languageBreakdown)) {
                languageBreakdown[lang] = (languageBreakdown[lang] || 0) + ms;
            }
        }

        // Calculate streaks
        const { current: currentStreak, longest: longestStreak } = calculateStreaks(dailySummaries);

        // Calculate average per day (only days with activity)
        const daysWithActivity = dailySummaries.length;
        const averagePerDayMs = daysWithActivity > 0 
            ? Math.round(totalAllTimeMs / daysWithActivity) 
            : 0;

        return {
            dailySummaries,
            totalAllTimeMs,
            currentStreak,
            longestStreak,
            averagePerDayMs,
            totalSessions,
            languageBreakdown,
        };
    }

    async clear(): Promise<void> {
        await this._db.watchTimeRecords.clear();
    }

    async deleteOlderThan(timestamp: number): Promise<number> {
        const toDelete = await this._db.watchTimeRecords
            .where('timestamp')
            .below(timestamp)
            .primaryKeys();
        
        await this._db.watchTimeRecords.bulkDelete(toDelete);
        return toDelete.length;
    }

    async count(): Promise<number> {
        return await this._db.watchTimeRecords.count();
    }
}
