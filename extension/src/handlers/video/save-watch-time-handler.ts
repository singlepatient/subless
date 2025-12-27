import type { Command, Message, SaveWatchTimeMessage } from '@project/common';
import { IndexedDBWatchTimeRepository } from '@project/common/watch-time';
import { SettingsProvider } from '@project/common/settings';

export default class SaveWatchTimeHandler {
    private readonly _settings: SettingsProvider;
    private readonly _repository: IndexedDBWatchTimeRepository;

    constructor(settings: SettingsProvider) {
        this._settings = settings;
        this._repository = new IndexedDBWatchTimeRepository();
    }

    get sender() {
        return 'asbplayer-video';
    }

    get command() {
        return 'save-watch-time';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (r?: any) => void) {
        const message = command.message as SaveWatchTimeMessage;

        this._settings
            .get(['watchTimeTrackingEnabled', 'watchTimeRetentionDays'])
            .then(async ({ watchTimeTrackingEnabled, watchTimeRetentionDays }) => {
                if (!watchTimeTrackingEnabled) {
                    sendResponse({});
                    return;
                }

                // Save the record
                await this._repository.save({
                    sessionId: message.record.sessionId,
                    timestamp: message.record.timestamp,
                    durationMs: message.record.durationMs,
                    languageCode: message.record.languageCode,
                    domain: message.record.domain,
                    videoUrl: message.record.videoUrl,
                    subtitleFileName: message.record.subtitleFileName,
                });

                // Clean up old records based on retention policy
                const retentionMs = watchTimeRetentionDays * 24 * 60 * 60 * 1000;
                const cutoffTimestamp = Date.now() - retentionMs;
                await this._repository.deleteOlderThan(cutoffTimestamp);

                sendResponse({});
            })
            .catch((e) => {
                console.error('Failed to save watch time:', e);
                sendResponse({ error: e.message });
            });

        return true;
    }
}
