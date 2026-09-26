<script>
	// In-app exam-update inbox: a passive bell with an unseen badge and a
	// dropdown/sheet of relevant notifications. Opening the inbox is reading
	// it: every badge key is marked seen. No permission, no interruption here
	// (the toast interrupt is a separate, separately-capped surface).
	import { onMount } from 'svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import { getBookmarkedExamIds, getHistory } from '$lib/client/storage';
	import {
		buildFeedView,
		buildNotificationCandidates,
		fetchNotificationFeed,
		interestsFrom,
		selectBadges
	} from '$lib/client/notifications';
	import {
		buildNotificationState,
		getSessionBudget,
		interruptSuppression,
		markInterruptShown,
		markNotificationSeen,
		readNudgeLedger,
		requestNudgeDecision,
		writeNudgeLedger
	} from '$lib/client/nudge';
	import { isDataSaverActive } from '$lib/client/preferences';
	import { showToastWithAction } from '$lib/client/toast';
	import { NOTIFICATION_STATUS, todayInIst } from '$lib/shared/examNotificationStatus';
	import { localizedPath } from '$lib/shared/seo';

	let feed = $state([]);
	let rows = $state([]);
	let badges = $state([]);
	let relevantIds = $state([]);
	let unavailable = $state(false);
	let open = $state(false);
	let badgeTracked = false;
	let ranked = false;
	let wrapEl = $state();

	onMount(() => {
		if (navigator.onLine === false) {
			return;
		}
		void loadFeed();
	});

	async function loadFeed() {
		const result = await fetchNotificationFeed();
		feed = result.items;
		unavailable = result.unavailable;
		refreshBadges();
		void rankCandidates();
	}

	/**
	 * One Jev ranking call per page session: hard matches already badge, so
	 * only when soft candidates exist. Fail-open: no ranking, tier-0 only.
	 */
	async function rankCandidates() {
		if (ranked || feed.length === 0) {
			return;
		}
		ranked = true;
		const interests = interestsNow();
		const candidates = buildNotificationCandidates(feed, {
			now: Date.now(),
			todayIso: todayInIst(),
			bookmarkedExamIds: interests.bookmarkedExamIds,
			practicedExamIds: interests.practicedExamIds
		});
		if (candidates.length === 0) {
			return;
		}
		const ranking = await requestNudgeDecision(
			buildNotificationState({
				candidates,
				topics: interests.topics,
				hourLocal: new Date().getHours(),
				isDataSaver: $isDataSaverActive,
				locale: $activeLanguage === 'hindi' ? 'hi' : 'en'
			})
		);
		if (!ranking) {
			return;
		}
		const softIds = Array.isArray(ranking.relevantIds) ? ranking.relevantIds.map(String) : [];
		if (ranking.pickedId && !softIds.includes(String(ranking.pickedId))) {
			softIds.push(String(ranking.pickedId));
		}
		relevantIds = softIds;
		refreshBadges();
		if (ranking.pickedId) {
			maybeToast(String(ranking.pickedId));
		}
	}

	/** The interrupt: one per session and 24h, quiet hours respected. */
	function maybeToast(pickedId) {
		if (open) {
			return;
		}
		const item = feed.find((row) => String(row.id) === pickedId);
		if (!item) {
			return;
		}
		const reason = interruptSuppression({
			ledger: readNudgeLedger(),
			now: Date.now(),
			hourLocal: new Date().getHours(),
			session: getSessionBudget()
		});
		if (reason) {
			return;
		}
		markInterruptShown();
		track('notification:toast-shown', { id: pickedId });
		showToastWithAction(String(item.title).slice(0, 90), {
			actionLabel: $t('notificationsToastAction'),
			durationMs: 8000,
			onAction: () => {
				track('notification:toast-click', { id: pickedId });
				if (!open) {
					togglePanel();
				}
			},
			onDismiss: (dismissReason) => {
				if (dismissReason !== 'action') {
					track('notification:toast-dismiss', { id: pickedId, reason: dismissReason });
				}
			}
		});
	}

	function interestsNow() {
		return interestsFrom({
			bookmarkedExamIds: getBookmarkedExamIds(),
			history: getHistory()
		});
	}

	function refreshBadges() {
		badges = selectBadges(feed, {
			ledger: readNudgeLedger(),
			now: Date.now(),
			todayIso: todayInIst(),
			...interestsNow(),
			relevantIds
		});
		if (badges.length > 0 && !badgeTracked) {
			badgeTracked = true;
			track('notifications:badge-shown', { count: badges.length });
		}
	}

	function togglePanel() {
		if (open) {
			closePanel();
			return;
		}
		open = true;
		track('notifications:view', { count: feed.length });
		// Opening the inbox marks every badge read.
		let ledger = readNudgeLedger();
		for (const badge of badges) {
			ledger = markNotificationSeen({ ledger, key: badge.key });
		}
		writeNudgeLedger(ledger);
		if (badges.length > 0) {
			track('notifications:all-read', { count: badges.length });
		}
		badges = [];
		rows = buildFeedView(feed, {
			ledger,
			now: Date.now(),
			todayIso: todayInIst(),
			...interestsNow(),
			relevantIds
		});
	}

	function closePanel() {
		open = false;
	}

	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && open) {
			closePanel();
		}
	}

	function handleWindowPointerDown(event) {
		// pointerdown, not click: by click time Svelte may have detached the
		// clicked node (the badge clears on open), which breaks containment.
		if (open && wrapEl && !wrapEl.contains(event.target)) {
			closePanel();
		}
	}

	function statusKey(status) {
		if (status === NOTIFICATION_STATUS.CLOSING_SOON) return 'examsStatusClosingSoon';
		if (status === NOTIFICATION_STATUS.CLOSED) return 'examsStatusClosed';
		if (status === NOTIFICATION_STATUS.UPCOMING) return 'examsStatusUpcoming';
		return 'examsStatusOpen';
	}

	function handleNoticeOpen(item) {
		track('notifications:item-open', { id: item.id, examId: item.examId || null });
		track('exams:notice-open', { source: 'notification', examId: item.examId || null });
	}

	function handlePracticeClick(item) {
		track('notifications:practice-click', { examId: item.examId });
		track('exams:practice-click', { examId: item.examId, source: 'notification' });
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} onpointerdown={handleWindowPointerDown} />

<div class="notifications-wrap" bind:this={wrapEl}>
	<button
		class="header-icon notifications-trigger"
		type="button"
		aria-label={badges.length > 0
			? $t('notificationsUnreadAria', { count: badges.length })
			: $t('notificationsBellLabel')}
		aria-expanded={open}
		aria-haspopup="dialog"
		onclick={togglePanel}
	>
		<Icon name="bell" />
		{#if badges.length > 0}
			<span class="notifications-badge" aria-hidden="true"
				>{badges.length > 9 ? '9+' : badges.length}</span
			>
		{/if}
	</button>

	{#if open}
		<div class="notifications-panel" role="dialog" aria-label={$t('notificationsTitle')}>
			<header class="notifications-head">
				<p class="notifications-title">{$t('notificationsTitle')}</p>
				<button
					class="notifications-close"
					type="button"
					aria-label={$t('close')}
					onclick={closePanel}
				>
					<Icon name="close" size={16} />
				</button>
			</header>

			{#if unavailable}
				<p class="notifications-note">{$t('examsUnavailableNote')}</p>
			{:else if rows.length === 0}
				<div class="notifications-empty">
					<p class="notifications-empty-title">{$t('notificationsEmptyTitle')}</p>
					<p class="notifications-empty-body">{$t('notificationsEmptyBody')}</p>
				</div>
			{:else}
				<ul class="notifications-list">
					{#each rows as row (row.item.id)}
						<li class="notifications-item">
							<div class="notifications-item-head">
								<span class="notifications-status notifications-status-{row.status}">
									{$t(statusKey(row.status))}
								</span>
								{#if row.event === 'new'}
									<span class="notifications-new">{$t('examsNewBadge')}</span>
								{/if}
							</div>
							<p class="notifications-item-title">{row.item.title}</p>
							<p class="notifications-meta">
								{row.item.org}{#if row.item.applyEnd} · {$t('examsApplyBy', {
										date: row.item.applyEnd
									})}{:else if row.item.examDate} · {$t('examsExamOn', {
										date: row.item.examDate
									})}{/if}
							</p>
							<div class="notifications-actions">
								{#if row.item.notificationUrl}
									<a
										class="notifications-link"
										href={row.item.notificationUrl}
										target="_blank"
										rel="noopener noreferrer"
										onclick={() => handleNoticeOpen(row.item)}
									>
										{$t('examsOfficialNotice')}
									</a>
								{/if}
								{#if row.item.applyUrl}
									<a
										class="notifications-link"
										href={row.item.applyUrl}
										target="_blank"
										rel="noopener noreferrer"
										onclick={() => handleNoticeOpen(row.item)}
									>
										{$t('examsApplyNow')}
									</a>
								{/if}
								{#if row.item.examId}
									<a
										class="notifications-link notifications-practice"
										href={localizedPath(`/practice/${row.item.examId}`, $activeLanguage)}
										onclick={() => handlePracticeClick(row.item)}
									>
										{$t('notificationsPracticeCta')}
									</a>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<a
				class="notifications-more"
				href={localizedPath('/exams', $activeLanguage)}
				onclick={closePanel}
			>
				{$t('notificationsBrowseAll')}
			</a>
		</div>
	{/if}
</div>

<style>
	.notifications-wrap {
		position: relative;
		display: inline-flex;
	}

	.notifications-trigger {
		/* The layout's .header-icon primitive is scoped to the layout, so this
		   button carries its own copy (same 44px grid control). */
		position: relative;
		display: grid;
		width: 44px;
		height: 44px;
		flex: none;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
	}

	.notifications-trigger:hover,
	.notifications-trigger:focus-visible {
		background: color-mix(in srgb, var(--color-brand-600) 13%, transparent);
		color: var(--brand-text);
	}

	.notifications-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
	}

	.notifications-panel {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: var(--z-menu, 60);
		display: flex;
		flex-direction: column;
		width: min(360px, 92vw);
		max-height: min(70vh, 520px);
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		box-shadow: var(--shadow-2, var(--shadow-1));
		overflow: hidden;
	}

	.notifications-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line);
	}

	.notifications-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--text);
	}

	.notifications-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin: -10px -8px -10px 0;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.notifications-close:hover {
		background: var(--surface-muted);
		color: var(--text);
	}

	.notifications-list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}

	.notifications-item {
		padding: 12px;
		border-bottom: 1px solid var(--line);
	}

	.notifications-item-head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.notifications-status {
		display: inline-flex;
		align-items: center;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.notifications-status-closing_soon {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}

	.notifications-status-open {
		background: color-mix(in srgb, var(--color-brand-600) 16%, transparent);
		color: var(--brand-text);
	}

	.notifications-status-upcoming,
	.notifications-status-closed {
		background: var(--surface-muted);
		color: var(--text-muted);
	}

	.notifications-new {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--brand-text);
	}

	.notifications-item-title {
		margin: 0 0 2px;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.35;
		color: var(--text);
	}

	.notifications-meta {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted);
	}

	.notifications-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 8px;
	}

	.notifications-link {
		font-size: 12px;
		font-weight: 600;
		color: var(--brand-text);
		text-decoration: none;
	}

	.notifications-link:hover {
		text-decoration: underline;
	}

	.notifications-practice {
		color: var(--color-brand-600);
	}

	.notifications-empty,
	.notifications-note {
		padding: 14px 12px;
		margin: 0;
	}

	.notifications-empty-title {
		margin: 0 0 4px;
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
	}

	.notifications-empty-body,
	.notifications-note {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.notifications-more {
		display: block;
		padding: 10px 12px;
		border-top: 1px solid var(--line);
		background: var(--surface-muted);
		font-size: 12px;
		font-weight: 600;
		color: var(--brand-text);
		text-align: center;
		text-decoration: none;
	}

	@media (max-width: 640px) {
		.notifications-panel {
			position: fixed;
			inset: auto 0 0 0;
			width: 100%;
			max-height: 72vh;
			border-radius: var(--radius-surface) var(--radius-surface) 0 0;
			padding-bottom: env(safe-area-inset-bottom, 0);
		}
	}
</style>
