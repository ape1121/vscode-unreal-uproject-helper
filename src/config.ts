import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';

export interface UnrealHelperConfig {
	uprojectPath?: string;
	buildScriptPath?: string;
	buildArgs: string[];
	openAfterBuild: boolean;
}

const configurationSection = 'unrealHelper';

export function getExtensionConfig(): UnrealHelperConfig {
	const configuration = vscode.workspace.getConfiguration(configurationSection);

	return {
		buildArgs: sanitizeStringArray(
			configuration.get<unknown>('buildArgs'),
			[],
		),
		buildScriptPath: sanitizeOptionalString(
			configuration.get<unknown>('buildScriptPath'),
		),
		openAfterBuild: configuration.get<boolean>('openAfterBuild', true),
		uprojectPath: sanitizeOptionalString(
			configuration.get<unknown>('uprojectPath'),
		),
	};
}

export async function updateConfigurationValue(
	key: keyof UnrealHelperConfig,
	value: string | string[] | boolean | undefined,
): Promise<void> {
	await vscode.workspace
		.getConfiguration(configurationSection)
		.update(key, value, vscode.ConfigurationTarget.Workspace);
}

export function resolveWorkspacePath(inputPath?: string): string | undefined {
	if (!inputPath) {
		return undefined;
	}

	if (path.isAbsolute(inputPath)) {
		return path.normalize(inputPath);
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return path.normalize(inputPath);
	}

	return path.normalize(path.join(workspaceFolder.uri.fsPath, inputPath));
}

export async function pathExists(targetPath?: string): Promise<boolean> {
	if (!targetPath) {
		return false;
	}

	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function sanitizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) {
		return fallback;
	}

	const normalized = value
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	return normalized.length > 0 ? normalized : fallback;
}
