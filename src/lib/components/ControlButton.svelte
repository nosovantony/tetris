<script lang="ts">
	import type { Control } from '../input/controls';
	let {
		action,
		label,
		symbol,
		disabled = false,
		primary = false,
		onpress
	}: {
		action: Control;
		label: string;
		symbol: string;
		disabled?: boolean;
		primary?: boolean;
		onpress: (action: Control) => void;
	} = $props();
	let pointer = $state<number | null>(null);
	$effect(() => {
		if (disabled) pointer = null;
	});
</script>

<button
	type="button"
	class:primary
	class:pressed={pointer !== null}
	{disabled}
	aria-label={label}
	onpointerdown={(event) => {
		if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
		event.preventDefault();
		pointer = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		onpress(action);
	}}
	onpointerup={(event) => {
		if (pointer === event.pointerId) pointer = null;
	}}
	onpointercancel={() => {
		pointer = null;
	}}
	onlostpointercapture={() => {
		pointer = null;
	}}
	onclick={(event) => {
		if (event.detail === 0) onpress(action);
	}}
	oncontextmenu={(event) => event.preventDefault()}
>
	<svg viewBox="0 0 48 36" aria-hidden="true"
		><text x="24" y="26" text-anchor="middle">{symbol}</text></svg
	>
	<span>{label}</span>
</button>

<style>
	button {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-width: 58px;
		min-height: 64px;
		padding: 5px;
		border: 1px solid #354359;
		border-radius: 12px;
		color: #d7e5f4;
		background: #1a2637;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		cursor: pointer;
	}
	button.primary {
		background: #203d3a;
		color: var(--accent);
		border-color: #3d6b5d;
	}
	button.pressed,
	button:active {
		background: #365666;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	svg {
		width: 40px;
		height: 30px;
	}
	text {
		fill: currentColor;
		font:
			30px ui-sans-serif,
			system-ui,
			sans-serif;
	}
	span {
		font-size: 10px;
	}
</style>
