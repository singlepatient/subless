import { createRoot } from 'react-dom/client';
import Bridge from '../bridge';
import { i18nInit } from '../i18n';
import StudyTestUi from '../components/StudyTestUi';

export function renderStudyTestUi(element: Element, lang: string, locStrings: any) {
    const bridge = new Bridge();
    i18nInit(lang, locStrings);
    createRoot(element).render(<StudyTestUi bridge={bridge} />);
    return bridge;
}
