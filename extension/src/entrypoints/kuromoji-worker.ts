/**
 * Kuromoji Worker Entry Point
 * 
 * WXT unlisted script that initializes the kuromoji worker.
 */
import { onMessage } from '../services/kuromoji-worker-impl';

export default defineUnlistedScript(() => {
    onMessage();
});
