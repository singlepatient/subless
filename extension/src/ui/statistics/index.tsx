import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import { StyledEngineProvider } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { createTheme } from '@project/common/theme';
import { AsbplayerSettings, SettingsProvider } from '@project/common/settings';
import { ExtensionSettingsStorage } from '@/services/extension-settings-storage';
import { StatisticsContent } from '@project/common/components/StatisticsPage';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../hooks/use-i18n';

function StatisticsUi() {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<AsbplayerSettings>();
    const theme = useMemo(() => settings && createTheme(settings.themeType), [settings]);
    const { initialized: i18nInitialized } = useI18n({ language: settings?.language ?? 'en' });

    useEffect(() => {
        const settingsProvider = new SettingsProvider(new ExtensionSettingsStorage());
        settingsProvider.getAll().then(setSettings);
    }, []);

    if (!settings || !theme || !i18nInitialized) {
        return null;
    }

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Paper
                    square
                    sx={{
                        width: '100vw',
                        minHeight: '100vh',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        pt: 4,
                        pb: 4,
                    }}
                >
                    <Box
                        sx={{
                            width: '100%',
                            maxWidth: 900,
                            mx: 2,
                        }}
                    >
                        <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                            {t('statistics.title', 'Watch Time Statistics')}
                        </Typography>
                        <StatisticsContent insideExtension />
                    </Box>
                </Paper>
            </ThemeProvider>
        </StyledEngineProvider>
    );
}

export function renderStatisticsUi(element: Element) {
    createRoot(element).render(<StatisticsUi />);
}
