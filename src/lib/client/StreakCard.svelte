<script>
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';
	import { buildStreakWeek } from '$lib/client/learning';
	import StreakBadges from '$lib/client/StreakBadges.svelte';
	import StreakReminderRow from '$lib/client/StreakReminderRow.svelte';

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
		<span class="streak-flame" aria-hidden="true"><Icon name="flame" size={26} /></span>
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

	.streak-flame {
		display: flex;
		flex-shrink: 0;
		color: var(--warn);
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
		background: #f59e0b;
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

	.streak-ball.level-1 {
		border-color: #fcd34d;
		background: #fcd34d;
		color: #78350f;
	}

	.streak-ball.level-2 {
		border-color: #f59e0b;
		background: #f59e0b;
		color: #78350f;
	}

	.streak-ball.level-3 {
		border-color: #b45309;
		background: #b45309;
		color: #fff7ed;
	}

	.streak-day.today .streak-ball {
		outline: 2px solid #d97706;
		outline-offset: 2px;
	}

	.streak-explainer {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}

	:global(:root.dark) .streak-ball.level-1,
	:global(:root.dark) .streak-ball.level-2 {
		border-color: #fcd34d;
		background: #fcd34d;
		color: #78350f;
	}

	:global(:root.dark) .streak-ball.level-3 {
		border-color: #f59e0b;
		background: #f59e0b;
		color: #78350f;
	}

	:global(:root.dark) .streak-day.today .streak-ball {
		outline-color: #fcd34d;
	}
</style>
