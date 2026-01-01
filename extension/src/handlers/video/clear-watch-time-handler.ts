import type { Command, Message, ClearWatchTimeMessage } from '@project/common';
import { IndexedDBWatchTimeRepository } from '@project/common/watch-time';
import { SettingsProvider } from '@project/common/settings';

export default class ClearWatchTimeHandler {
    private readonly _settings: SettingsProvider;
    private readonly _repository: IndexedDBWatchTimeRepository;
    private readonly _onAfterClear?: () => void;

    constructor(settings: SettingsProvider, onAfterClear?: () => void) {
        this._settings = settings;
        this._repository = new IndexedDBWatchTimeRepository();
        this._onAfterClear = onAfterClear;
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'clear-watch-time';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender, sendResponse: (r?: any) => void) {
        this._repository
            .clear()
            .then(() => {
                this._onAfterClear?.();
                sendResponse({});
            })
            .catch((e) => {
                console.error('Failed to clear watch time:', e);
                sendResponse({ error: e.message });
            });

        return true;
    }
}
