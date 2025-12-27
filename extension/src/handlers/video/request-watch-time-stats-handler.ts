import type { Command, Message, RequestWatchTimeStatsMessage, RequestWatchTimeStatsResponse } from '@project/common';
import { IndexedDBWatchTimeRepository } from '@project/common/watch-time';
import { SettingsProvider } from '@project/common/settings';

export default class RequestWatchTimeStatsHandler {
    private readonly _settings: SettingsProvider;
    private readonly _repository: IndexedDBWatchTimeRepository;

    constructor(settings: SettingsProvider) {
        this._settings = settings;
        this._repository = new IndexedDBWatchTimeRepository();
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'request-watch-time-stats';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (r?: any) => void) {
        const message = command.message as RequestWatchTimeStatsMessage;

        this._settings
            .get(['watchTimeTrackingEnabled'])
            .then(async ({ watchTimeTrackingEnabled }) => {
                if (!watchTimeTrackingEnabled) {
                    const response: RequestWatchTimeStatsResponse = {
                        stats: {
                            totalAllTimeMs: 0,
                            dailySummaries: [],
                            currentStreak: 0,
                            longestStreak: 0,
                            averagePerDayMs: 0,
                            totalSessions: 0,
                            languageBreakdown: {},
                        },
                    };
                    sendResponse(response);
                    return;
                }

                const stats = await this._repository.getStats(message.startDate, message.endDate);

                const response: RequestWatchTimeStatsResponse = { stats };
                sendResponse(response);
            })
            .catch((e) => {
                console.error('Failed to fetch watch time stats:', e);
                sendResponse({ error: e.message });
            });

        return true;
    }
}
