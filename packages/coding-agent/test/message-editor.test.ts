import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { describe, expect, test } from "vitest";
import type { SessionEntry } from "../src/core/session-manager.ts";
import { formatSessionEntryForEditor } from "../src/modes/interactive/message-editor.ts";

const usage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage(id: string, text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4",
		usage,
		stopReason: "stop",
		timestamp: Date.now(),
		responseId: id,
	};
}

describe("message editor formatting", () => {
	test("formats selected tree entries with tool call details", () => {
		const entry: SessionEntry = {
			type: "message",
			id: "assistant-entry",
			parentId: null,
			timestamp: new Date().toISOString(),
			message: {
				...assistantMessage("with-tool", ""),
				content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } }],
			},
		};

		expect(formatSessionEntryForEditor(entry)).toContain("Tool call: read (tool-1)");
		expect(formatSessionEntryForEditor(entry)).toContain('"path": "README.md"');
	});
});
