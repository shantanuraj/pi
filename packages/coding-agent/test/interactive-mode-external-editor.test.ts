import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

const usage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4",
		usage,
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

type FakeInteractiveMode = {
	streamingMessage?: AssistantMessage;
	hideThinkingBlock: boolean;
	session: { messages: AgentMessage[] };
	editor: { setText: (text: string) => void };
	ui: { requestRender: () => void };
	openTextInExternalEditor: (text: string) => Promise<string | undefined>;
	showStatus: (message: string) => void;
};

type InteractiveModePrivate = {
	openLastAssistantInExternalEditor(this: FakeInteractiveMode): Promise<void>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrivate;

describe("InteractiveMode external editor actions", () => {
	test("uses edited last assistant text as the current user message draft", async () => {
		const setText = vi.fn();
		const requestRender = vi.fn();
		const openTextInExternalEditor = vi.fn(async () => "edited user message");
		const fakeThis: FakeInteractiveMode = {
			hideThinkingBlock: false,
			session: { messages: [assistantMessage("assistant response")] },
			editor: { setText },
			ui: { requestRender },
			openTextInExternalEditor,
			showStatus: vi.fn(),
		};

		await interactiveModePrototype.openLastAssistantInExternalEditor.call(fakeThis);

		expect(openTextInExternalEditor).toHaveBeenCalledWith("assistant response");
		expect(setText).toHaveBeenCalledWith("edited user message");
		expect(requestRender).toHaveBeenCalledOnce();
	});

	test("keeps the current draft when external editing is cancelled", async () => {
		const setText = vi.fn();
		const fakeThis: FakeInteractiveMode = {
			hideThinkingBlock: false,
			session: { messages: [assistantMessage("assistant response")] },
			editor: { setText },
			ui: { requestRender: vi.fn() },
			openTextInExternalEditor: vi.fn(async () => undefined),
			showStatus: vi.fn(),
		};

		await interactiveModePrototype.openLastAssistantInExternalEditor.call(fakeThis);

		expect(setText).not.toHaveBeenCalled();
	});
});
