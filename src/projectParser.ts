import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';

export interface UprojectSummary {
	name: string;
	engineAssociation?: string;
	isCodeProject: boolean;
	moduleNames: string[];
	pluginNames: string[];
	targetPlatforms: string[];
}

export interface ModuleSummary {
	name: string;
	filePath: string;
	publicDependencies: string[];
	privateDependencies: string[];
}

export interface TargetSummary {
	name: string;
	filePath: string;
	targetType?: string;
	defaultBuildSettings?: string;
	includeOrderVersion?: string;
	extraModuleNames: string[];
}

export interface ParsedProjectSummary {
	uproject?: UprojectSummary;
	modules: ModuleSummary[];
	targets: TargetSummary[];
	message?: string;
}

interface UprojectDescriptor {
	EngineAssociation?: string;
	Modules?: Array<{ Name?: string }>;
	Plugins?: Array<{ Name?: string; Enabled?: boolean }>;
	TargetPlatforms?: string[];
}

export class ProjectParser {
	public async parse(uprojectPath?: string): Promise<ParsedProjectSummary> {
		if (!uprojectPath) {
			return {
				modules: [],
				targets: [],
				message: 'Select a .uproject to inspect project structure.',
			};
		}

		try {
			const uproject = await this.parseUproject(uprojectPath);
			const projectRoot = path.dirname(uprojectPath);
			const [modules, targets] = await Promise.all([
				this.parseBuildFiles(projectRoot),
				this.parseTargetFiles(projectRoot),
			]);

			return {
				modules,
				targets,
				uproject,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown parser error.';
			return {
				modules: [],
				targets: [],
				message: `Could not parse project metadata: ${errorMessage}`,
			};
		}
	}

	private async parseUproject(uprojectPath: string): Promise<UprojectSummary> {
		const fileContent = await fs.readFile(uprojectPath, 'utf8');
		const descriptor = JSON.parse(fileContent) as UprojectDescriptor;
		const moduleNames = (descriptor.Modules ?? [])
			.map((moduleEntry) => moduleEntry.Name?.trim())
			.filter((name): name is string => Boolean(name));
		const pluginNames = (descriptor.Plugins ?? [])
			.filter((pluginEntry) => pluginEntry.Enabled !== false)
			.map((pluginEntry) => pluginEntry.Name?.trim())
			.filter((name): name is string => Boolean(name));

		return {
			engineAssociation: descriptor.EngineAssociation,
			isCodeProject: moduleNames.length > 0,
			moduleNames,
			name: path.basename(uprojectPath, '.uproject'),
			pluginNames,
			targetPlatforms: (descriptor.TargetPlatforms ?? []).filter(
				(platform): platform is string => typeof platform === 'string' && platform.trim().length > 0,
			),
		};
	}

	private async parseBuildFiles(projectRoot: string): Promise<ModuleSummary[]> {
		const pattern = new vscode.RelativePattern(projectRoot, 'Source/**/*.Build.cs');
		const uris = await vscode.workspace.findFiles(pattern);
		const summaries = await Promise.all(
			uris.map(async (uri) => this.parseBuildFile(uri.fsPath, projectRoot)),
		);

		return summaries.sort((left, right) => left.name.localeCompare(right.name));
	}

	private async parseBuildFile(filePath: string, projectRoot: string): Promise<ModuleSummary> {
		const fileContent = await fs.readFile(filePath, 'utf8');

		return {
			filePath: path.relative(projectRoot, filePath),
			name: path.basename(filePath, '.Build.cs'),
			privateDependencies: this.extractModuleList(fileContent, 'PrivateDependencyModuleNames'),
			publicDependencies: this.extractModuleList(fileContent, 'PublicDependencyModuleNames'),
		};
	}

	private async parseTargetFiles(projectRoot: string): Promise<TargetSummary[]> {
		const pattern = new vscode.RelativePattern(projectRoot, 'Source/**/*.Target.cs');
		const uris = await vscode.workspace.findFiles(pattern);
		const summaries = await Promise.all(
			uris.map(async (uri) => this.parseTargetFile(uri.fsPath, projectRoot)),
		);

		return summaries.sort((left, right) => left.name.localeCompare(right.name));
	}

	private async parseTargetFile(filePath: string, projectRoot: string): Promise<TargetSummary> {
		const fileContent = await fs.readFile(filePath, 'utf8');

		return {
			defaultBuildSettings: this.extractEnumValue(fileContent, 'DefaultBuildSettings', 'BuildSettingsVersion'),
			extraModuleNames: this.extractModuleList(fileContent, 'ExtraModuleNames'),
			filePath: path.relative(projectRoot, filePath),
			includeOrderVersion: this.extractEnumValue(fileContent, 'IncludeOrderVersion', 'EngineIncludeOrderVersion'),
			name: path.basename(filePath, '.Target.cs'),
			targetType: this.extractEnumValue(fileContent, 'Type', 'TargetType'),
		};
	}

	private extractModuleList(fileContent: string, propertyName: string): string[] {
		const entries = new Set<string>();
		const addRangePattern = new RegExp(
			`${propertyName}\\s*\\.\\s*AddRange\\s*\\(\\s*new\\s+(?:string\\s*\\[\\s*\\]|\\[\\])\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
			'g',
		);
		const addPattern = new RegExp(
			`${propertyName}\\s*\\.\\s*Add\\s*\\(\\s*"([^"]+)"\\s*\\)`,
			'g',
		);

		for (const match of fileContent.matchAll(addRangePattern)) {
			for (const quotedValue of match[1].matchAll(/"([^"]+)"/g)) {
				entries.add(quotedValue[1]);
			}
		}

		for (const match of fileContent.matchAll(addPattern)) {
			entries.add(match[1]);
		}

		return Array.from(entries).sort((left, right) => left.localeCompare(right));
	}

	private extractEnumValue(
		fileContent: string,
		propertyName: string,
		enumName: string,
	): string | undefined {
		const pattern = new RegExp(`${propertyName}\\s*=\\s*${enumName}\\.([A-Za-z0-9_]+)`);
		return fileContent.match(pattern)?.[1];
	}
}
