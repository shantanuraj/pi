import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ImageContent, TextContent, ToolCall } from "@earendil-works/pi-ai";
import { bashExecutionToText } from "../../core/messages.ts";
import type { SessionEntry } from "../../core/session-manager.ts";

export interface MessageEditorFormatOptions {
	includeThinking?: boolean;
	includeToolCalls?: boolean;
}

function joinBlocks(blocks: string[]): string | undefined {
	const text = blocks
		.map((block) => block.trim())
		.filter((block) => block.length > 0)
		.join("\n\n")
		.trim();
	return text || undefined;
}

function stringifyUnknown(value: unknown): string | undefined {
	try {
		return JSON.stringify(value, null, 2) ?? undefined;
	} catch {
		return String(value);
	}
}

function formatTextAndImageContent(content: string | readonly (TextContent | ImageContent)[]): string | undefined {
	if (typeof content === "string") {
		return content.trim() || undefined;
	}

	const blocks = content.map((block) => {
		if (block.type === "text") {
			return block.text;
		}
		return `[image: ${block.mimeType}, ${block.data.length.toLocaleString()} base64 characters]`;
	});
	return joinBlocks(blocks);
}

function formatToolCall(toolCall: ToolCall): string {
	const args = stringifyUnknown(toolCall.arguments) ?? "{}";
	return [`Tool call: ${toolCall.name} (${toolCall.id})`, "", "```json", args, "```"].join("\n");
}

export function formatAssistantMessageForEditor(
	message: AssistantMessage,
	options: MessageEditorFormatOptions = {},
): string | undefined {
	const blocks: string[] = [];
	for (const block of message.content) {
		if (block.type === "text") {
			blocks.push(block.text);
		} else if (block.type === "thinking") {
			if (options.includeThinking) {
				blocks.push(`<thinking>\n${block.thinking}\n</thinking>`);
			}
		} else if (options.includeToolCalls) {
			blocks.push(formatToolCall(block));
		}
	}

	if (message.stopReason === "error") {
		blocks.push(`Error: ${message.errorMessage || "Unknown error"}`);
	} else if (message.stopReason === "aborted") {
		blocks.push(message.errorMessage || "Operation aborted");
	}

	return joinBlocks(blocks);
}

export function getLastAssistantEditorText(
	messages: readonly AgentMessage[],
	options: MessageEditorFormatOptions = {},
): string | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const text = formatAssistantMessageForEditor(message, options);
		if (text) return text;
	}
	return undefined;
}

function formatAgentMessageForEditor(
	message: AgentMessage,
	options: MessageEditorFormatOptions = {},
): string | undefined {
	switch (message.role) {
		case "user":
			return formatTextAndImageContent(message.content);
		case "assistant":
			return formatAssistantMessageForEditor(message, options);
		case "toolResult": {
			const content = formatTextAndImageContent(message.content);
			const header = `Tool result: ${message.toolName} (${message.toolCallId})${message.isError ? " [error]" : ""}`;
			return joinBlocks([header, content ?? ""]);
		}
		case "bashExecution":
			return bashExecutionToText(message);
		case "custom": {
			const content = formatTextAndImageContent(message.content);
			return joinBlocks([`Custom message: ${message.customType}`, content ?? ""]);
		}
		case "branchSummary":
			return message.summary.trim() || undefined;
		case "compactionSummary":
			return message.summary.trim() || undefined;
	}
}

export function formatSessionEntryForEditor(
	entry: SessionEntry,
	options: MessageEditorFormatOptions = {},
): string | undefined {
	switch (entry.type) {
		case "message":
			return formatAgentMessageForEditor(entry.message, {
				...options,
				includeToolCalls: options.includeToolCalls ?? true,
			});
		case "custom_message":
			return joinBlocks([
				`Custom message: ${entry.customType}${entry.display ? "" : " (hidden)"}`,
				formatTextAndImageContent(entry.content) ?? "",
			]);
		case "branch_summary":
			return entry.summary.trim() || undefined;
		case "compaction":
			return joinBlocks([
				`Compaction summary (${entry.tokensBefore.toLocaleString()} tokens before compaction)`,
				entry.summary,
			]);
		case "custom": {
			const data = entry.data === undefined ? undefined : stringifyUnknown(entry.data);
			return joinBlocks([`Custom entry: ${entry.customType}`, data ?? ""]);
		}
		case "label":
			return `Label for ${entry.targetId}: ${entry.label ?? "(cleared)"}`;
		case "model_change":
			return `Model: ${entry.provider}/${entry.modelId}`;
		case "thinking_level_change":
			return `Thinking level: ${entry.thinkingLevel}`;
		case "session_info":
			return `Session title: ${entry.name ?? "(empty)"}`;
	}
}
