import { describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type DialogOptions = {
	signal?: AbortSignal;
};

type ConfirmAbortContext = {
	abortTurnConfirmationActive: boolean;
	agent: {
		readonly signal: AbortSignal | undefined;
		waitForIdle: () => Promise<void>;
	};
	session: {
		isStreaming: boolean;
	};
	showExtensionSelector: (
		title: string,
		options: string[],
		dialogOptions?: DialogOptions,
	) => Promise<string | undefined>;
	restoreQueuedMessagesToEditor: (options?: { abort?: boolean; currentText?: string }) => number;
	showStatus: (message: string) => void;
};

type SetupKeyHandlersContext = {
	ui: {
		onDebug?: () => void;
	};
	defaultEditor: {
		onEscape?: () => void;
		onCtrlD?: () => void;
		onPasteImage?: () => void;
		onChange?: (text: string) => void;
		onAction: (action: string, handler: () => void) => void;
	};
	session: {
		isStreaming: boolean;
		isBashRunning: boolean;
	};
	confirmAbortStreamingTurn: () => Promise<void>;
	restoreQueuedMessagesToEditor: (options?: { abort?: boolean; currentText?: string }) => number;
};

type InteractiveModePrivate = {
	confirmAbortStreamingTurn(this: ConfirmAbortContext): Promise<void>;
	setupKeyHandlers(this: SetupKeyHandlersContext): void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrivate;

describe("InteractiveMode abort confirmation", () => {
	test("asks before aborting a streaming turn", async () => {
		const abortController = new AbortController();
		let resolveIdle: () => void = () => {};
		const idlePromise = new Promise<void>((resolve) => {
			resolveIdle = resolve;
		});
		const showExtensionSelector = vi.fn<ConfirmAbortContext["showExtensionSelector"]>(async () => "Abort turn");
		const restoreQueuedMessagesToEditor = vi.fn(() => 0);
		const context: ConfirmAbortContext = {
			abortTurnConfirmationActive: false,
			agent: {
				signal: abortController.signal,
				waitForIdle: vi.fn(() => idlePromise),
			},
			session: {
				isStreaming: true,
			},
			showExtensionSelector,
			restoreQueuedMessagesToEditor,
			showStatus: vi.fn(),
		};

		await interactiveModePrototype.confirmAbortStreamingTurn.call(context);

		expect(showExtensionSelector).toHaveBeenCalledTimes(1);
		const [title, options, dialogOptions] = showExtensionSelector.mock.calls[0]!;
		expect(title).toContain("Abort current turn?");
		expect(options).toEqual(["Keep working", "Abort turn"]);
		expect(dialogOptions?.signal).toBeInstanceOf(AbortSignal);
		expect(restoreQueuedMessagesToEditor).toHaveBeenCalledWith({ abort: true });
		expect(context.abortTurnConfirmationActive).toBe(false);

		resolveIdle();
	});

	test("keeps working when confirmation is cancelled", async () => {
		const abortController = new AbortController();
		const showExtensionSelector = vi.fn<ConfirmAbortContext["showExtensionSelector"]>(async () => "Keep working");
		const restoreQueuedMessagesToEditor = vi.fn(() => 0);
		const context: ConfirmAbortContext = {
			abortTurnConfirmationActive: false,
			agent: {
				signal: abortController.signal,
				waitForIdle: vi.fn(() => new Promise<void>(() => {})),
			},
			session: {
				isStreaming: true,
			},
			showExtensionSelector,
			restoreQueuedMessagesToEditor,
			showStatus: vi.fn(),
		};

		await interactiveModePrototype.confirmAbortStreamingTurn.call(context);

		expect(restoreQueuedMessagesToEditor).not.toHaveBeenCalled();
		expect(context.abortTurnConfirmationActive).toBe(false);
	});

	test("does not abort if the active turn changed while confirmation was open", async () => {
		const firstRun = new AbortController();
		const secondRun = new AbortController();
		let currentSignal: AbortSignal | undefined = firstRun.signal;
		const showExtensionSelector = vi.fn<ConfirmAbortContext["showExtensionSelector"]>(async () => {
			currentSignal = secondRun.signal;
			return "Abort turn";
		});
		const restoreQueuedMessagesToEditor = vi.fn(() => 0);
		const showStatus = vi.fn();
		const context: ConfirmAbortContext = {
			abortTurnConfirmationActive: false,
			agent: {
				get signal() {
					return currentSignal;
				},
				waitForIdle: vi.fn(() => new Promise<void>(() => {})),
			},
			session: {
				isStreaming: true,
			},
			showExtensionSelector,
			restoreQueuedMessagesToEditor,
			showStatus,
		};

		await interactiveModePrototype.confirmAbortStreamingTurn.call(context);

		expect(restoreQueuedMessagesToEditor).not.toHaveBeenCalled();
		expect(showStatus).toHaveBeenCalledWith("Current turn already finished");
	});

	test("Escape opens confirmation instead of aborting immediately", () => {
		const confirmAbortStreamingTurn = vi.fn(async () => undefined);
		const restoreQueuedMessagesToEditor = vi.fn(() => 0);
		const context: SetupKeyHandlersContext = {
			ui: {},
			defaultEditor: {
				onAction: vi.fn(),
			},
			session: {
				isStreaming: true,
				isBashRunning: false,
			},
			confirmAbortStreamingTurn,
			restoreQueuedMessagesToEditor,
		};

		interactiveModePrototype.setupKeyHandlers.call(context);
		context.defaultEditor.onEscape?.();

		expect(confirmAbortStreamingTurn).toHaveBeenCalledTimes(1);
		expect(restoreQueuedMessagesToEditor).not.toHaveBeenCalled();
	});
});
