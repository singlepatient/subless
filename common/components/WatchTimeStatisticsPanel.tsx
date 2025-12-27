import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ActivityHistoryGrid from './ActivityHistoryGrid';

interface WatchTimeStats {
    dailySummaries: Array<{
        date: string;
        totalMs: number;
        languageBreakdown: Record<string, number>;
        sessionCount: number;
    }>;
    totalAllTimeMs: number;
    currentStreak: number;
    longestStreak: number;
    averagePerDayMs: number;
    totalSessions: number;
    languageBreakdown: Record<string, number>;
}

interface WatchTimeStatisticsPanelProps {
    stats: WatchTimeStats | null;
    loading?: boolean;
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
                flex: 1,
                minWidth: 140,
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

const WatchTimeStatisticsPanel: React.FC<WatchTimeStatisticsPanelProps> = ({ stats, loading }) => {
    const theme = useTheme();

    if (loading) {
        return (
            <Box>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                    {[1, 2, 3, 4].map((i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                            <Skeleton variant="circular" width={24} height={24} sx={{ mx: 'auto', mb: 1 }} />
                            <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
                            <Skeleton variant="text" width="80%" sx={{ mx: 'auto' }} />
                        </Paper>
                    ))}
                </Stack>
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
            </Box>
        );
    }

    if (!stats) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">No watch time data available yet.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Start watching videos with subtitles to track your progress!
                </Typography>
            </Box>
        );
    }

    const { dailySummaries, totalAllTimeMs, currentStreak, longestStreak, averagePerDayMs, languageBreakdown } = stats;

    // Calculate total days with activity
    const daysActive = dailySummaries.length;

    // Get top languages
    const topLanguages = Object.entries(languageBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([lang, ms]) => ({ lang, duration: formatDuration(ms, true) }));

    return (
        <Box>
            {/* Stats cards */}
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                <StatCard
                    icon={<AccessTimeIcon />}
                    label="Total Watch Time"
                    value={formatDuration(totalAllTimeMs, true)}
                    subValue={`${daysActive} active day${daysActive !== 1 ? 's' : ''}`}
                />
                <StatCard
                    icon={<LocalFireDepartmentIcon />}
                    label="Current Streak"
                    value={`${currentStreak} day${currentStreak !== 1 ? 's' : ''}`}
                    subValue={longestStreak > currentStreak ? `Best: ${longestStreak} days` : undefined}
                />
                <StatCard
                    icon={<TrendingUpIcon />}
                    label="Daily Average"
                    value={formatDuration(averagePerDayMs, true)}
                    subValue="on active days"
                />
                <StatCard
                    icon={<CalendarTodayIcon />}
                    label="Longest Streak"
                    value={`${longestStreak} day${longestStreak !== 1 ? 's' : ''}`}
                />
            </Stack>

            {/* Activity grid */}
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Activity History
                </Typography>
                <ActivityHistoryGrid dailySummaries={dailySummaries} weeks={26} />
            </Paper>

            {/* Language breakdown */}
            {topLanguages.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Top Languages
                    </Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                        {topLanguages.map(({ lang, duration }) => (
                            <Box
                                key={lang}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 1.5,
                                    py: 0.5,
                                    borderRadius: 1,
                                    backgroundColor: theme.palette.action.hover,
                                }}
                            >
                                <Typography variant="body2" fontWeight="medium">
                                    {lang.toUpperCase()}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {duration}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                </Paper>
            )}
        </Box>
    );
};

export default WatchTimeStatisticsPanel;
