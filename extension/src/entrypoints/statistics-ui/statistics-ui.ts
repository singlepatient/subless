import { renderStatisticsUi } from '@/ui/statistics';

window.addEventListener('load', () => {
    const root = document.getElementById('root')!;
    renderStatisticsUi(root);
});
