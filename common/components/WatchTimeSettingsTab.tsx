import React, { useCallback, useState } from 'react';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import SettingsTextField from './SettingsTextField';
import SwitchLabelWithHoverEffect from './SwitchLabelWithHoverEffect';
import SettingsSection from './SettingsSection';
import WatchTimeStatisticsPanel from './WatchTimeStatisticsPanel';
import { AsbplayerSettings } from '../settings';
import { useWatchTimeStats } from '../hooks/use-watch-time-stats';
import { useTranslation } from 'react-i18next';
import type ChromeExtension from '../app/services/chrome-extension';

interface Props {
    settings: AsbplayerSettings;
    onSettingChanged: <K extends keyof AsbplayerSettings>(key: K, value: AsbplayerSettings[K]) => Promise<void>;
    extension?: ChromeExtension;
}

const WatchTimeSettingsTab: React.FC<Props> = ({ settings, onSettingChanged, extension }) => {
    const { t } = useTranslation();
    const { watchTimeTrackingEnabled, watchTimeRetentionDays } = settings;
    const { stats, loading, clearStats } = useWatchTimeStats({ autoFetch: true, extension });
    const [clearDialogOpen, setClearDialogOpen] = useState(false);
    const [clearing, setClearing] = useState(false);

    const handleClearData = useCallback(async () => {
        setClearing(true);
        try {
            await clearStats();
        } catch (e) {
            console.error('Failed to clear watch time data:', e);
        } finally {
            setClearing(false);
            setClearDialogOpen(false);
        }
    }, [clearStats]);

    return (
        <>
            <Stack spacing={1}>
                <SettingsSection>{t('settings.watchTimeTracking', 'Watch Time Tracking')}</SettingsSection>
                <SwitchLabelWithHoverEffect
                    control={
                        <Switch
                            checked={watchTimeTrackingEnabled}
                            onChange={(event) => onSettingChanged('watchTimeTrackingEnabled', event.target.checked)}
                        />
                    }
                    label={t('settings.watchTimeTrackingEnabled', 'Track watch time')}
                    labelPlacement="start"
                />
                <SettingsTextField
                    type="number"
                    label={t('settings.watchTimeRetentionDays', 'Data retention (days)')}
                    fullWidth
                    value={watchTimeRetentionDays}
                    color="primary"
                    onChange={(event) => onSettingChanged('watchTimeRetentionDays', Number(event.target.value))}
                    slotProps={{
                        htmlInput: {
                            min: 1,
                            max: 3650,
                            step: 1,
                        },
                    }}
                    helperText={t(
                        'settings.watchTimeRetentionDaysHelp',
                        'How long to keep watch time records. Older records are automatically deleted.'
                    )}
                />

                <SettingsSection>{t('settings.statistics', 'Statistics')}</SettingsSection>
                <WatchTimeStatisticsPanel stats={stats} loading={loading} />

                <SettingsSection>{t('settings.dataManagement', 'Data Management')}</SettingsSection>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setClearDialogOpen(true)}
                    disabled={clearing || !stats || stats.totalAllTimeMs === 0}
                >
                    {t('action.clearWatchTimeData', 'Clear All Watch Time Data')}
                </Button>
            </Stack>

            <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
                <DialogTitle>{t('dialog.clearWatchTimeTitle', 'Clear Watch Time Data?')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t(
                            'dialog.clearWatchTimeContent',
                            'This will permanently delete all your watch time history. This action cannot be undone.'
                        )}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClearDialogOpen(false)} disabled={clearing}>
                        {t('action.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleClearData} color="error" disabled={clearing}>
                        {clearing ? t('action.clearing', 'Clearing...') : t('action.clear', 'Clear')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default WatchTimeSettingsTab;
