import { beforeEach, describe, expect, it, vi } from "vitest";
import { editInExternalEditor } from "../src/modes/interactive/external-editor.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

vi.mock("../src/modes/interactive/external-editor.ts", () => ({
	editInExternalEditor: vi.fn(),
}));

interface EditorContext {
	settingsManager: { getExternalEditorCommand(): string };
	ui: { stop(): void; start(): void; requestRender(force?: boolean): void };
	showStatus(message: string): void;
}

const prototype = InteractiveMode.prototype as unknown as {
	openTextInExternalEditor(this: EditorContext, text: string): Promise<string | undefined>;
};

function createContext() {
	return {
		settingsManager: { getExternalEditorCommand: () => "test-editor" },
		ui: { stop: vi.fn(), start: vi.fn(), requestRender: vi.fn() },
		showStatus: vi.fn(),
	};
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe("InteractiveMode external editor results", () => {
	it.each(["edited text", ""])("returns saved content %j without changing the input draft", async (content) => {
		const context = createContext();
		vi.mocked(editInExternalEditor).mockResolvedValue({ status: "complete", content });

		expect(await prototype.openTextInExternalEditor.call(context, "original")).toBe(content);
		expect(editInExternalEditor).toHaveBeenCalledWith({ command: "test-editor", content: "original" });
		expect(context.showStatus).not.toHaveBeenCalled();
		expect(context.ui.stop).toHaveBeenCalledOnce();
		expect(context.ui.start).toHaveBeenCalledOnce();
		expect(context.ui.requestRender).toHaveBeenCalledWith(true);
	});

	// #11592: keep upstream error reporting when sharing the editor with tree entries.
	it("reports editor failures and resumes the terminal UI", async () => {
		const context = createContext();
		vi.mocked(editInExternalEditor).mockResolvedValue({ status: "failed", message: "Failed to launch editor" });

		expect(await prototype.openTextInExternalEditor.call(context, "original")).toBeUndefined();
		expect(context.showStatus).toHaveBeenCalledWith("Failed to launch editor");
		expect(context.ui.start).toHaveBeenCalledOnce();
		expect(context.ui.requestRender).toHaveBeenCalledWith(true);
	});

	it("resumes the terminal UI if editing throws", async () => {
		const context = createContext();
		vi.mocked(editInExternalEditor).mockRejectedValue(new Error("Cannot write temporary file"));

		await expect(prototype.openTextInExternalEditor.call(context, "original")).rejects.toThrow(
			"Cannot write temporary file",
		);
		expect(context.ui.start).toHaveBeenCalledOnce();
		expect(context.ui.requestRender).toHaveBeenCalledWith(true);
	});
});
