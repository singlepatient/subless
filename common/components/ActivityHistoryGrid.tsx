import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

interface DaySummary {
    date: string; // 'YYYY-MM-DD'
    totalMs: number;
    languageBreakdown: Record<string, number>;
    sessionCount: number;
}

interface ActivityHistoryGridProps {
    dailySummaries: DaySummary[];
    /** Number of weeks to display (default: 52) */
    weeks?: number;
    /** Minimum minutes to consider "active" for coloring (default: 1) */
    minActiveMinutes?: number;
}

/**
 * Format milliseconds as a human-readable duration.
 */
function formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Get intensity level (0-4) based on watch time.
 * 0 = no activity
 * 1 = < 15 min
 * 2 = 15-30 min
 * 3 = 30-60 min
 * 4 = 60+ min
 */
function getIntensityLevel(totalMs: number, minActiveMinutes: number): number {
    const minutes = totalMs / 60000;
    if (minutes < minActiveMinutes) return 0;
    if (minutes < 15) return 1;
    if (minutes < 30) return 2;
    if (minutes < 60) return 3;
    return 4;
}

/**
 * Generate array of dates for the grid (going back N weeks from today).
 */
function generateDateGrid(weeks: number): string[][] {
    const grid: string[][] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from the beginning of the week (Sunday) N weeks ago
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - startDate.getDay() - (weeks - 1) * 7);

    for (let week = 0; week < weeks; week++) {
        const weekDates: string[] = [];
        for (let day = 0; day < 7; day++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + week * 7 + day);
            
            // Only include dates up to today
            if (date <= today) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const dayStr = String(date.getDate()).padStart(2, '0');
                weekDates.push(`${year}-${month}-${dayStr}`);
            } else {
                weekDates.push(''); // Future date placeholder
            }
        }
        grid.push(weekDates);
    }

    return grid;
}

/**
 * Get month labels for the grid header.
 */
function getMonthLabels(weeks: number): { label: string; weekIndex: number }[] {
    const labels: { label: string; weekIndex: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - startDate.getDay() - (weeks - 1) * 7);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = -1;

    for (let week = 0; week < weeks; week++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + week * 7);
        const month = weekStart.getMonth();

        if (month !== lastMonth) {
            labels.push({ label: monthNames[month], weekIndex: week });
            lastMonth = month;
        }
    }

    return labels;
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const ActivityHistoryGrid: React.FC<ActivityHistoryGridProps> = ({
    dailySummaries,
    weeks = 52,
    minActiveMinutes = 1,
}) => {
    const theme = useTheme();

    // Build lookup map for quick access
    const summaryMap = useMemo(() => {
        const map = new Map<string, DaySummary>();
        for (const summary of dailySummaries) {
            map.set(summary.date, summary);
        }
        return map;
    }, [dailySummaries]);

    const dateGrid = useMemo(() => generateDateGrid(weeks), [weeks]);
    const monthLabels = useMemo(() => getMonthLabels(weeks), [weeks]);

    // Color palette based on theme
    const colors = useMemo(() => {
        const isDark = theme.palette.mode === 'dark';
        return {
            empty: isDark ? '#161b22' : '#ebedf0',
            level1: isDark ? '#0e4429' : '#9be9a8',
            level2: isDark ? '#006d32' : '#40c463',
            level3: isDark ? '#26a641' : '#30a14e',
            level4: isDark ? '#39d353' : '#216e39',
        };
    }, [theme.palette.mode]);

    const getColor = (level: number): string => {
        switch (level) {
            case 1: return colors.level1;
            case 2: return colors.level2;
            case 3: return colors.level3;
            case 4: return colors.level4;
            default: return colors.empty;
        }
    };

    const formatTooltip = (date: string, summary?: DaySummary): string => {
        const dateObj = new Date(date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });

        if (!summary || summary.totalMs < minActiveMinutes * 60000) {
            return `No activity on ${formattedDate}`;
        }

        const duration = formatDuration(summary.totalMs);
        const sessions = summary.sessionCount;
        const languages = Object.entries(summary.languageBreakdown)
            .map(([lang, ms]) => `${lang}: ${formatDuration(ms)}`)
            .join(', ');

        return `${duration} watched on ${formattedDate}\n${sessions} session${sessions !== 1 ? 's' : ''}${languages ? `\n${languages}` : ''}`;
    };

    return (
        <Box sx={{ overflow: 'auto' }}>
            {/* Month labels */}
            <Box sx={{ display: 'flex', ml: '32px', mb: 0.5 }}>
                {monthLabels.map(({ label, weekIndex }, idx) => (
                    <Box
                        key={idx}
                        sx={{
                            position: 'absolute',
                            left: 32 + weekIndex * (CELL_SIZE + CELL_GAP),
                            fontSize: '10px',
                            color: theme.palette.text.secondary,
                        }}
                    >
                        {label}
                    </Box>
                ))}
            </Box>

            <Box sx={{ display: 'flex', mt: 2.5 }}>
                {/* Day labels */}
                <Box sx={{ display: 'flex', flexDirection: 'column', mr: 0.5 }}>
                    {DAY_LABELS.map((label, idx) => (
                        <Box
                            key={idx}
                            sx={{
                                height: CELL_SIZE,
                                mb: `${CELL_GAP}px`,
                                fontSize: '10px',
                                lineHeight: `${CELL_SIZE}px`,
                                color: theme.palette.text.secondary,
                                width: 28,
                                textAlign: 'right',
                                pr: 0.5,
                            }}
                        >
                            {label}
                        </Box>
                    ))}
                </Box>

                {/* Grid */}
                <Box sx={{ display: 'flex', gap: `${CELL_GAP}px` }}>
                    {dateGrid.map((week, weekIdx) => (
                        <Box key={weekIdx} sx={{ display: 'flex', flexDirection: 'column', gap: `${CELL_GAP}px` }}>
                            {week.map((date, dayIdx) => {
                                if (!date) {
                                    // Future date - render empty placeholder
                                    return (
                                        <Box
                                            key={dayIdx}
                                            sx={{
                                                width: CELL_SIZE,
                                                height: CELL_SIZE,
                                                borderRadius: '2px',
                                                backgroundColor: 'transparent',
                                            }}
                                        />
                                    );
                                }

                                const summary = summaryMap.get(date);
                                const level = getIntensityLevel(summary?.totalMs ?? 0, minActiveMinutes);

                                return (
                                    <Tooltip
                                        key={dayIdx}
                                        title={
                                            <Box sx={{ whiteSpace: 'pre-line' }}>
                                                {formatTooltip(date, summary)}
                                            </Box>
                                        }
                                        arrow
                                        placement="top"
                                    >
                                        <Box
                                            sx={{
                                                width: CELL_SIZE,
                                                height: CELL_SIZE,
                                                borderRadius: '2px',
                                                backgroundColor: getColor(level),
                                                cursor: 'pointer',
                                                '&:hover': {
                                                    outline: `1px solid ${theme.palette.text.primary}`,
                                                    outlineOffset: '-1px',
                                                },
                                            }}
                                        />
                                    </Tooltip>
                                );
                            })}
                        </Box>
                    ))}
                </Box>
            </Box>

            {/* Legend */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 1, gap: 0.5 }}>
                <Box sx={{ fontSize: '10px', color: theme.palette.text.secondary, mr: 0.5 }}>Less</Box>
                {[0, 1, 2, 3, 4].map((level) => (
                    <Box
                        key={level}
                        sx={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            borderRadius: '2px',
                            backgroundColor: getColor(level),
                        }}
                    />
                ))}
                <Box sx={{ fontSize: '10px', color: theme.palette.text.secondary, ml: 0.5 }}>More</Box>
            </Box>
        </Box>
    );
};

export default ActivityHistoryGrid;
