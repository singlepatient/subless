import FrameBridgeServer from '@/services/frame-bridge-server';
import { renderStudyTestUi } from '@/ui/study-test';

export default defineUnlistedScript(() => {
    window.addEventListener('load', () => {
        const root = document.getElementById('root')!;
        const loc = JSON.parse(document.getElementById('loc')!.innerHTML!);
        const bridge = renderStudyTestUi(root, loc.lang, loc.strings);
        const listener = new FrameBridgeServer(bridge);
        listener.bind();

        window.addEventListener('unload', () => {
            listener.unbind();
        });
    });
});
