<script>
	import MarkdownContent from './MarkdownContent.svelte';
	import { t } from './i18n';

	let { question } = $props();
</script>

<!-- Assertion-Reasoning body: plain paragraphs with bold inline labels, in
     the style printed papers use. The four standard statements render as
     ordinary option buttons below. -->
<div class="question-assertion">
	<p class="ar-line">
		<b>{$t('assertionLabel')}:</b>
		<span class="ar-text">
			<MarkdownContent content={question?.assertion || ''} links="text" tag="span" />
		</span>
	</p>
	<p class="ar-line">
		<b>{$t('reasonLabel')}:</b>
		<span class="ar-text">
			<MarkdownContent content={question?.reason || ''} links="text" tag="span" />
		</span>
	</p>
</div>

<style>
	.question-assertion {
		margin-bottom: 12px;
	}

	.ar-line {
		margin: 0 0 8px;
		font-size: 0.95rem;
		line-height: 1.45;
	}

	.ar-line:last-child {
		margin-bottom: 0;
	}

	.ar-line b {
		margin-right: 0.15rem;
	}

	.ar-text {
		overflow-wrap: anywhere;
	}
</style>
