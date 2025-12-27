import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ActivityHistoryGrid from './ActivityHistoryGrid';
import { useWatchTimeStats } from '../hooks/use-watch-time-stats';
import type ChromeExtension from '../app/services/chrome-extension';
import { useTranslation } from 'react-i18next';

type TimeRange = 'week' | 'month' | 'quarter' | 'year' | 'all';

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
    week: 7,
    month: 30,
    quarter: 90,
    year: 365,
    all: 3650, // ~10 years
};

const TIME_RANGE_GRID_WEEKS: Record<TimeRange, number> = {
    week: 2,
    month: 5,
    quarter: 13,
    year: 26,
    all: 52,
};

interface StatisticsPageProps {
    extension?: ChromeExtension;
    open: boolean;
    onClose: () => void;
}

/**
 * Format milliseconds as a human-readable duration.
 */
function formatDuration(ms: number, short = false): string {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (short) {
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

interface StatCardProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    subValue?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subValue }) => {
    const theme = useTheme();

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                flex: '1 1 200px',
                minWidth: 150,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
            }}
        >
            <Box sx={{ color: theme.palette.primary.main, mb: 1 }}>{icon}</Box>
            <Typography variant="h5" fontWeight="bold">
                {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {label}
            </Typography>
            {subValue && (
                <Typography variant="caption" color="text.secondary">
                    {subValue}
                </Typography>
            )}
        </Paper>
    );
};

const StatisticsPage: React.FC<StatisticsPageProps> = ({ extension, open, onClose }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const [timeRange, setTimeRange] = useState<TimeRange>('year');
    const [clearDialogOpen, setClearDialogOpen] = useState(false);
    const [clearing, setClearing] = useState(false);

    const { stats, loading, refetch, clearStats } = useWatchTimeStats({
        days: TIME_RANGE_DAYS[timeRange],
        extension,
        autoFetch: open,
    });

    const handleClearData = async () => {
        setClearing(true);
        try {
            await clearStats();
        } catch (e) {
            console.error('Failed to clear watch time data:', e);
        } finally {
            setClearing(false);
            setClearDialogOpen(false);
        }
    };

    // Filter daily summaries based on selected time range
    const filteredSummaries = useMemo(() => {
        if (!stats?.dailySummaries) return [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - TIME_RANGE_DAYS[timeRange]);
        const cutoffString = cutoffDate.toISOString().split('T')[0];
        return stats.dailySummaries.filter((s) => s.date >= cutoffString);
    }, [stats?.dailySummaries, timeRange]);

    // Calculate stats for filtered range
    const rangeStats = useMemo(() => {
        if (filteredSummaries.length === 0) {
            return { totalMs: 0, sessions: 0, daysActive: 0, avgPerDay: 0 };
        }

        let totalMs = 0;
        let sessions = 0;
        for (const summary of filteredSummaries) {
            totalMs += summary.totalMs;
            sessions += summary.sessionCount;
        }

        return {
            totalMs,
            sessions,
            daysActive: filteredSummaries.length,
            avgPerDay: Math.round(totalMs / filteredSummaries.length),
        };
    }, [filteredSummaries]);

    // Get top languages
    const topLanguages = useMemo(() => {
        if (!stats?.languageBreakdown) return [];
        return Object.entries(stats.languageBreakdown)
            .filter(([lang]) => lang !== 'unknown')
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang, ms]) => ({ lang, ms, duration: formatDuration(ms, true) }));
    }, [stats?.languageBreakdown]);

    const extensionNotInstalled = !extension?.installed;

    const renderContent = () => {
        if (extensionNotInstalled) {
            return (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <PlayCircleOutlineIcon sx={{ fontSize: 64, color: theme.palette.text.secondary, mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                        {t('statistics.extensionRequired', 'Extension Required')}
                    </Typography>
                    <Typography color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
                        {t(
                            'statistics.extensionRequiredDescription',
                            'Install the asbplayer browser extension to track your watch time. Your statistics will appear here automatically as you watch videos with subtitles.'
                        )}
                    </Typography>
                </Box>
            );
        }

        if (loading) {
            return (
                <Box>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                        {[1, 2, 3, 4].map((i) => (
                            <Paper key={i} variant="outlined" sx={{ p: 2, flex: '1 1 200px', minWidth: 150 }}>
                                <Skeleton variant="circular" width={24} height={24} sx={{ mx: 'auto', mb: 1 }} />
                                <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
                                <Skeleton variant="text" width="80%" sx={{ mx: 'auto' }} />
                            </Paper>
                        ))}
                    </Stack>
                    <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
                </Box>
            );
        }

        if (!stats || stats.totalAllTimeMs === 0) {
            return (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <PlayCircleOutlineIcon sx={{ fontSize: 64, color: theme.palette.text.secondary, mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                        {t('statistics.noData', 'No Watch Time Data Yet')}
                    </Typography>
                    <Typography color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
                        {t(
                            'statistics.noDataDescription',
                            'Start watching videos with subtitles to track your progress! Your activity will appear here as you learn.'
                        )}
                    </Typography>
                </Box>
            );
        }

        return (
            <>
                {/* Time range selector */}
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                    <ButtonGroup variant="outlined" size="small">
                        <Button
                            variant={timeRange === 'week' ? 'contained' : 'outlined'}
                            onClick={() => setTimeRange('week')}
                        >
                            {t('statistics.week', 'Week')}
                        </Button>
                        <Button
                            variant={timeRange === 'month' ? 'contained' : 'outlined'}
                            onClick={() => setTimeRange('month')}
                        >
                            {t('statistics.month', 'Month')}
                        </Button>
                        <Button
                            variant={timeRange === 'quarter' ? 'contained' : 'outlined'}
                            onClick={() => setTimeRange('quarter')}
                        >
                            {t('statistics.quarter', '3 Months')}
                        </Button>
                        <Button
                            variant={timeRange === 'year' ? 'contained' : 'outlined'}
                            onClick={() => setTimeRange('year')}
                        >
                            {t('statistics.year', 'Year')}
                        </Button>
                        <Button
                            variant={timeRange === 'all' ? 'contained' : 'outlined'}
                            onClick={() => setTimeRange('all')}
                        >
                            {t('statistics.all', 'All Time')}
                        </Button>
                    </ButtonGroup>
                </Box>

                {/* Stats cards */}
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                    <StatCard
                        icon={<AccessTimeIcon />}
                        label={t('statistics.totalWatchTime', 'Watch Time')}
                        value={formatDuration(rangeStats.totalMs, true)}
                        subValue={`${rangeStats.daysActive} ${t('statistics.activeDays', 'active days')}`}
                    />
                    <StatCard
                        icon={<LocalFireDepartmentIcon />}
                        label={t('statistics.currentStreak', 'Current Streak')}
                        value={`${stats.currentStreak} ${t('statistics.days', 'days')}`}
                        subValue={
                            stats.longestStreak > stats.currentStreak
                                ? `${t('statistics.best', 'Best')}: ${stats.longestStreak} ${t('statistics.days', 'days')}`
                                : undefined
                        }
                    />
                    <StatCard
                        icon={<TrendingUpIcon />}
                        label={t('statistics.dailyAverage', 'Daily Average')}
                        value={formatDuration(rangeStats.avgPerDay, true)}
                        subValue={t('statistics.onActiveDays', 'on active days')}
                    />
                    <StatCard
                        icon={<CalendarTodayIcon />}
                        label={t('statistics.longestStreak', 'Longest Streak')}
                        value={`${stats.longestStreak} ${t('statistics.days', 'days')}`}
                    />
                </Stack>

                {/* Activity grid */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3, overflow: 'auto' }}>
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>
                        {t('statistics.activityHistory', 'Activity History')}
                    </Typography>
                    <ActivityHistoryGrid
                        dailySummaries={filteredSummaries}
                        weeks={TIME_RANGE_GRID_WEEKS[timeRange]}
                    />
                </Paper>

                {/* Language breakdown */}
                {topLanguages.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 2 }}>
                            {t('statistics.topLanguages', 'Top Languages')}
                        </Typography>
                        <Stack spacing={1}>
                            {topLanguages.map(({ lang, ms, duration }) => {
                                const percentage = stats.totalAllTimeMs > 0 ? (ms / stats.totalAllTimeMs) * 100 : 0;
                                return (
                                    <Box key={lang}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" fontWeight="medium">
                                                {lang.toUpperCase()}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {duration}
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                height: 8,
                                                borderRadius: 1,
                                                backgroundColor: theme.palette.action.hover,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    height: '100%',
                                                    width: `${percentage}%`,
                                                    backgroundColor: theme.palette.primary.main,
                                                    borderRadius: 1,
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Paper>
                )}

                {/* Clear data button */}
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => setClearDialogOpen(true)}
                        disabled={clearing}
                    >
                        {t('action.clearWatchTimeData', 'Clear All Data')}
                    </Button>
                </Box>
            </>
        );
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {t('statistics.title', 'Watch Time Statistics')}
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ minHeight: 400 }}>
                    {renderContent()}
                </DialogContent>
            </Dialog>

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

export default StatisticsPage;
