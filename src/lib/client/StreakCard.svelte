<script>
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';
	import { buildStreakWeek, STREAK_MILESTONES } from '$lib/client/learning';
	import {
		CARD_HEIGHT,
		CARD_WIDTH,
		canvasToFile,
		cardFilename,
		loadCardLogo,
		shareCardFile,
	} from '$lib/client/cardKit';
	import { drawStreakCard } from '$lib/client/streakCard';
	import { track } from '$lib/client/telemetry';
	import { showToast } from '$lib/client/toast';
	import StreakBadges from '$lib/client/StreakBadges.svelte';
	import StreakReminderRow from '$lib/client/StreakReminderRow.svelte';
	import { markShareUsed } from '$lib/client/nudge';

	let { streak = null, stats = null, historyCount = 0, locale = 'en' } = $props();

	const week = $derived(buildStreakWeek(streak?.streakHistory, { locale }));
	const currentStreak = $derived(Number(streak?.currentStreak || 0));
	const longestStreak = $derived(Number(streak?.longestStreak || 0));
	const testsTaken = $derived(Number(stats?.totalTests || 0));
	// A dash, not an em dash: public pages reject em/en dashes (taste-pass).
	const accuracyValue = $derived(testsTaken > 0 ? `${Number(stats?.averageScore || 0)}%` : '-');
	const bestValue = $derived(testsTaken > 0 ? `${Number(stats?.bestScore || 0)}%` : '-');

	const subtitle = $derived(
		currentStreak === 0
			? $t('streakEmpty')
			: currentStreak === 1
				? $t('streakSubtitleOne')
				: currentStreak < 7
					? $t('streakSubtitleRolling')
					: $t('streakSubtitleRecord')
	);

	const dateFormatter = $derived(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }));

	// Badge copy for the share image; the carousel keeps its own markup.
	const shareBadges = $derived(
		STREAK_MILESTONES.map((days) => ({
			days,
			earned: longestStreak >= days,
			meta:
				longestStreak >= days
					? $t('streakBadgeDays', { count: days })
					: $t('streakBadgeProgress', {
							current: Math.min(currentStreak, days),
							target: days,
						}),
			title: $t(`achievement_streak_${days}_title`),
		}))
	);

	let sharing = $state(false);

	/** Exported so the home nudge can trigger the exact same share flow. */
	export async function shareStreak(source = 'button') {
		if (sharing) {
			return;
		}
		sharing = true;
		try {
			track('streak:share', { source });
			const origin = typeof window !== 'undefined' ? window.location.origin : '';
			const canvas = document.createElement('canvas');
			canvas.width = CARD_WIDTH;
			canvas.height = CARD_HEIGHT;
			const logo = await loadCardLogo();
			const drawn = drawStreakCard(
				canvas,
				{
					headline: $t('streakHeadline', { count: currentStreak }),
					subtitle,
					week,
					stats: {
						tests: testsTaken,
						accuracy: accuracyValue,
						best: bestValue,
						max: longestStreak,
					},
					labels: {
						tests: $t('streakStatTests'),
						accuracy: $t('streakStatAccuracy'),
						best: $t('streakStatBest'),
						max: $t('streakStatMax'),
					},
					badges: shareBadges,
					url: origin,
				},
				logo
			);
			if (!drawn) {
				throw new Error('card');
			}
			const file = await canvasToFile(canvas, cardFilename('streak'));
			const result = await shareCardFile(file, {
				title: $t('streakHeadline', { count: currentStreak }),
				text: $t('shareStreakText', { count: currentStreak }),
				url: origin,
			});
			if (result === 'shared' || result === 'downloaded') {
				markShareUsed();
			}
			if (result === 'downloaded') {
				showToast($t('streakCardSaved'), 'success');
			} else if (result === 'failed') {
				showToast($t('cardShareFailed'), 'warning');
			}
		} catch {
			showToast($t('cardShareFailed'), 'warning');
		}
		sharing = false;
	}

	function dayLabel(day) {
		const count =
			day.quizCount === 0
				? $t('streakDayNone')
				: day.quizCount === 1
					? $t('streakDayOne')
					: $t('streakDayCount', { count: day.quizCount });
		return `${dateFormatter.format(new Date(`${day.date}T12:00:00`))}: ${count}`;
	}
</script>

<section class="streak-card" aria-label={$t('streaks')}>
	<div class="streak-stats">
		<div class="streak-stat">
			<span class="streak-stat-value">{testsTaken}</span>
			<span class="streak-stat-label">{$t('streakStatTests')}</span>
		</div>
		<div class="streak-stat">
			<span class="streak-stat-value">{accuracyValue}</span>
			<span class="streak-stat-label">{$t('streakStatAccuracy')}</span>
		</div>
		<div class="streak-stat">
			<span class="streak-stat-value">{bestValue}</span>
			<span class="streak-stat-label">{$t('streakStatBest')}</span>
		</div>
		<div class="streak-stat">
			<span class="streak-stat-value">{longestStreak}</span>
			<span class="streak-stat-label">{$t('streakStatMax')}</span>
		</div>
	</div>

	<div class="streak-head">
		<div>
			<p class="streak-title">{$t('streakHeadline', { count: currentStreak })}</p>
			<p class="streak-sub" class:streak-empty={currentStreak === 0}>{subtitle}</p>
		</div>
		<div class="streak-head-actions">
			<span class="streak-flame" aria-hidden="true"><Icon name="flame" size={26} /></span>
			{#if currentStreak >= 1}
				<button
					class="streak-share"
					type="button"
					aria-label={$t('share')}
					disabled={sharing}
					onclick={() => shareStreak()}
				>
					<Icon name="share" size={18} />
				</button>
			{/if}
		</div>
	</div>

	<div class="streak-week" aria-label={$t('streakWeekLabel')}>
		<div class="streak-weekdays" aria-hidden="true">
			{#each week as day (day.date)}
				<span>{day.weekdayLabel}</span>
			{/each}
		</div>
		<ol class="streak-balls">
			{#each week as day, index (day.date)}
				<li
					class="streak-day"
					class:active={day.active}
					class:today={day.isToday}
					class:linked={index > 0 && day.active && week[index - 1].active}
					aria-label={dayLabel(day)}
				>
					<span
						class="streak-ball"
						class:level-1={day.level === 1}
						class:level-2={day.level === 2}
						class:level-3={day.level === 3}
						aria-hidden="true"
					>
						{#if day.level === 1}
							<Icon name="check" size={14} />
						{:else if day.level === 2}
							2
						{:else if day.level === 3}
							3+
						{/if}
					</span>
				</li>
			{/each}
		</ol>
	</div>

	<StreakBadges {streak} />
	<StreakReminderRow {historyCount} />

	<p class="streak-explainer">{$t('streakExplainer')}</p>
</section>

<style>
	.streak-card {
		margin-bottom: 16px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.streak-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--line);
	}

	.streak-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		text-align: center;
	}

	.streak-stat-value {
		font-size: 15px;
		font-weight: 700;
		line-height: 1.2;
		color: var(--text);
	}

	.streak-stat-label {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.streak-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 0 8px;
	}

	.streak-title {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		line-height: 1.2;
		color: var(--text);
	}

	.streak-sub {
		margin: 2px 0 0;
		font-size: 12px;
		line-height: 1.35;
		color: var(--text-muted);
	}

	.streak-empty {
		font-weight: 600;
		color: var(--brand-text);
	}

	.streak-head-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.streak-flame {
		display: flex;
		color: var(--warn);
	}

	.streak-share {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.streak-share:hover:not(:disabled) {
		background: var(--surface-muted);
		color: var(--brand-text);
	}

	.streak-share:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.streak-week {
		padding: 2px 0 10px;
	}

	.streak-weekdays {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		padding-bottom: 4px;
		font-size: 9px;
		color: var(--text-muted);
		text-align: center;
	}

	.streak-weekdays span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.streak-balls {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.streak-day {
		position: relative;
		display: flex;
		justify-content: center;
	}

	.streak-day + .streak-day::before {
		content: '';
		position: absolute;
		top: 50%;
		right: 50%;
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--line);
		transform: translateY(-50%);
	}

	.streak-day.linked::before {
		background: color-mix(in srgb, var(--warn) 55%, transparent);
	}

	.streak-ball {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: 1.5px solid var(--line);
		border-radius: 50%;
		background: var(--surface-muted);
		font-size: 11px;
		font-weight: 700;
		color: var(--text);
	}

	/* Streak levels: one warn token drives every step, so light and dark
	   both keep three visibly different levels (the old hardcoded ramp
	   collapsed levels 1 and 2 into the same colour in dark mode). */
	.streak-ball.level-1 {
		border-color: color-mix(in srgb, var(--warn) 45%, transparent);
		background: color-mix(in srgb, var(--warn) 20%, var(--surface));
		color: var(--warn);
	}

	.streak-ball.level-2 {
		border-color: color-mix(in srgb, var(--warn) 65%, transparent);
		background: color-mix(in srgb, var(--warn) 40%, var(--surface));
		color: var(--warn);
	}

	.streak-ball.level-3 {
		border-color: var(--warn-fill);
		background: var(--warn-fill);
		color: var(--on-warn);
	}

	.streak-day.today .streak-ball {
		outline: 2px solid var(--warn);
		outline-offset: 2px;
	}

	.streak-explainer {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
</style>
