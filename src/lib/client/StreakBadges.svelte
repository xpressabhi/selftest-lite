<script>
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';
	import { STREAK_MILESTONES } from '$lib/client/learning';

	let { streak = null } = $props();

	const longestStreak = $derived(Number(streak?.longestStreak || 0));
	const currentStreak = $derived(Number(streak?.currentStreak || 0));
	const badges = $derived(
		STREAK_MILESTONES.map((days) => ({
			days,
			earned: longestStreak >= days,
			progress: Math.min(currentStreak, days),
			titleKey: `achievement_streak_${days}_title`,
		}))
	);

	let trackEl = $state(null);
	let activeIndex = $state(0);

	function reducedMotion() {
		if (typeof window === 'undefined') {
			return true;
		}
		return (
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.classList.contains('reduce-motion') ||
			document.documentElement.classList.contains('data-saver')
		);
	}

	function scrollToIndex(index) {
		const clamped = Math.max(0, Math.min(badges.length - 1, index));
		activeIndex = clamped;
		const child = trackEl?.children?.[clamped];
		if (!trackEl || !child) {
			return;
		}
		trackEl.scrollTo({
			left: child.offsetLeft,
			behavior: reducedMotion() ? 'auto' : 'smooth',
		});
	}

	function onTrackScroll() {
		const el = trackEl;
		if (!el || el.children.length < 2) {
			return;
		}
		const step = el.children[1].offsetLeft - el.children[0].offsetLeft;
		if (step <= 0) {
			return;
		}
		activeIndex = Math.max(0, Math.min(badges.length - 1, Math.round(el.scrollLeft / step)));
	}
</script>

<div class="streak-badges" role="group" aria-label={$t('streakBadgesLabel')}>
	<button
		type="button"
		class="streak-badge-arrow"
		aria-label={$t('streakBadgePrev')}
		disabled={activeIndex === 0}
		onclick={() => scrollToIndex(activeIndex - 1)}
	>
		<Icon name="chevron-left" size={18} />
	</button>
	<ul class="streak-badge-track" bind:this={trackEl} onscroll={onTrackScroll}>
		{#each badges as badge (badge.days)}
			<li class="streak-badge" class:earned={badge.earned}>
				<span class="streak-badge-star" aria-hidden="true"><Icon name="star" size={22} /></span>
				<span class="streak-badge-meta">
					{badge.earned
						? $t('streakBadgeDays', { count: badge.days })
						: $t('streakBadgeProgress', { current: badge.progress, target: badge.days })}
				</span>
				<span class="streak-badge-title">{$t(badge.titleKey)}</span>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		class="streak-badge-arrow"
		aria-label={$t('streakBadgeNext')}
		disabled={activeIndex === badges.length - 1}
		onclick={() => scrollToIndex(activeIndex + 1)}
	>
		<Icon name="chevron-right" size={18} />
	</button>
</div>
<div class="streak-badge-dots" aria-hidden="true">
	{#each badges as badge, index (badge.days)}
		<span class:on={index === activeIndex}></span>
	{/each}
</div>

<style>
	.streak-badges {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}

	.streak-badge-arrow {
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

	.streak-badge-arrow:hover:not(:disabled) {
		background: var(--surface-muted);
		color: var(--text);
	}

	.streak-badge-arrow:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.streak-badge-track {
		display: flex;
		flex: 1;
		gap: 6px;
		min-width: 0;
		margin: 0;
		padding: 0;
		position: relative;
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	.streak-badge-track::-webkit-scrollbar {
		display: none;
	}

	.streak-badge {
		display: flex;
		flex: 1 0 48px;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		min-width: 0;
		scroll-snap-align: start;
		text-align: center;
	}

	.streak-badge-star {
		display: flex;
		color: var(--line);
	}

	.streak-badge.earned .streak-badge-star {
		color: var(--warn);
	}

	.streak-badge-meta {
		font-size: 10px;
		font-weight: 700;
		color: var(--text);
		white-space: nowrap;
	}

	.streak-badge:not(.earned) .streak-badge-meta {
		color: var(--text-muted);
	}

	.streak-badge-title {
		font-size: 10px;
		line-height: 1.2;
		color: var(--text-muted);
	}

	.streak-badge-dots {
		display: flex;
		justify-content: center;
		gap: 5px;
		padding-top: 6px;
	}

	.streak-badge-dots span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--line);
	}

	.streak-badge-dots span.on {
		background: var(--warn);
	}
</style>
