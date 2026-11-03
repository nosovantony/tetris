<script lang="ts">
	import { stickDirection, type StickDirection } from '../input/touch';
	import { i18n } from '../i18n/index.svelte';
	let {
		disabled = false,
		deadzone = 0.25,
		onchange
	}: {
		disabled?: boolean;
		deadzone?: number;
		onchange: (direction: StickDirection) => void;
	} = $props();
	let pointer = $state<number | null>(null);
	let direction = $state<StickDirection>(null);
	let knob = $state({ x: 0, y: 0 });
	function reset() {
		pointer = null;
		direction = null;
		knob = { x: 0, y: 0 };
		onchange(null);
	}
	function update(event: PointerEvent, target: HTMLButtonElement) {
		const rect = target.getBoundingClientRect();
		const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.38);
		const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.38);
		const distance = Math.max(1, Math.hypot(x, y));
		knob = { x: (x / distance) * 23, y: (y / distance) * 23 };
		const next = stickDirection(x, y, direction, deadzone);
		if (next !== direction) {
			direction = next;
			onchange(next);
		}
	}
	$effect(() => {
		if (disabled) reset();
	});
</script>

<button
	type="button"
	class="joystick"
	{disabled}
	aria-label={i18n.current === 'ru'
		? 'Джойстик: влево, вправо, вниз'
		: 'Joystick: left, right, down'}
	data-direction={direction ?? 'neutral'}
	onpointerdown={(event) => {
		if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
		event.preventDefault();
		pointer = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		update(event, event.currentTarget);
	}}
	onpointermove={(event) => {
		if (pointer === event.pointerId) update(event, event.currentTarget);
	}}
	onpointerup={(event) => {
		if (pointer === event.pointerId) reset();
	}}
	onpointercancel={(event) => {
		if (pointer === event.pointerId) reset();
	}}
	onlostpointercapture={(event) => {
		if (pointer === event.pointerId) reset();
	}}
	oncontextmenu={(event) => event.preventDefault()}
>
	<svg viewBox="0 0 156 156" aria-hidden="true">
		<circle cx="78" cy="78" r="74" fill="#141f2e" stroke="#354359" />
		<path d="M67 61V25h22v36h42v28H89v42H67V89H25V61z" fill="#1d2c3f" />
		<path d="m30 78 12-9v18z" fill={direction === 'left' ? '#73ebc1' : '#8295ad'} />
		<path d="m126 78-12-9v18z" fill={direction === 'right' ? '#73ebc1' : '#8295ad'} />
		<path d="m78 126-9-12h18z" fill={direction === 'soft-drop' ? '#73ebc1' : '#8295ad'} />
		<circle cx="78" cy="78" r="32" fill="none" stroke="#3a4a61" stroke-dasharray="2 4" />
		<circle
			cx={78 + knob.x}
			cy={78 + knob.y}
			r="23"
			fill="#2b4057"
			stroke={direction ? '#73ebc1' : '#637d9d'}
			stroke-width="2"
		/>
	</svg>
</button>

<style>
	button {
		width: 156px;
		height: 156px;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 50%;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.4;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
