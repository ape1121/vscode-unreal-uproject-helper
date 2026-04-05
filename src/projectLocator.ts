import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	getExtensionConfig,
	pathExists,
	resolveWorkspacePath,
	updateConfigurationValue,
} from './config';

export interface ProjectState {
	selectedPath?: string;
	message: string;
	workspaceHasProjects: boolean;
}

export class ProjectLocator {
	public async setSelectedUproject(uprojectPath: string): Promise<string> {
		await updateConfigurationValue('uprojectPath', path.normalize(uprojectPath));
		return path.normalize(uprojectPath);
	}

	public async getProjectState(): Promise<ProjectState> {
		const configuredPath = await this.getExistingConfiguredPath();
		const workspacePaths = await this.findWorkspaceUprojects();

		if (configuredPath) {
			return {
				selectedPath: configuredPath,
				message: configuredPath,
				workspaceHasProjects: workspacePaths.length > 0,
			};
		}

		if (workspacePaths.length === 1) {
			return {
				selectedPath: workspacePaths[0],
				message: workspacePaths[0],
				workspaceHasProjects: true,
			};
		}

		if (workspacePaths.length > 1) {
			return {
				message: `Found ${workspacePaths.length} .uproject files. Use Pick .uproject to choose one.`,
				workspaceHasProjects: true,
			};
		}

		if (getExtensionConfig().uprojectPath) {
			return {
				message: 'Configured .uproject was not found. Pick one or update settings.',
				workspaceHasProjects: false,
			};
		}

		return {
			message: 'No .uproject found in the workspace. Use Pick .uproject to select one manually.',
			workspaceHasProjects: false,
		};
	}

	public async ensureUprojectPath(): Promise<string | undefined> {
		const configuredPath = await this.getExistingConfiguredPath();
		if (configuredPath) {
			return configuredPath;
		}

		const workspacePaths = await this.findWorkspaceUprojects();
		if (workspacePaths.length === 1) {
			return workspacePaths[0];
		}

		if (workspacePaths.length > 1) {
			return this.promptForWorkspaceProject(workspacePaths);
		}

		const choice = await vscode.window.showWarningMessage(
			'No .uproject found in the workspace.',
			'Pick .uproject',
			'Open Settings',
		);

		if (choice === 'Pick .uproject') {
			return this.pickUproject();
		}

		if (choice === 'Open Settings') {
			await vscode.commands.executeCommand(
				'workbench.action.openSettings',
				'unrealHelper.uprojectPath',
			);
		}

		return undefined;
	}

	public async pickUproject(): Promise<string | undefined> {
		const selection = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
			filters: {
				'Unreal Project': ['uproject'],
			},
			openLabel: 'Select .uproject',
			title: 'Select Unreal Project',
		});

		const selectedPath = selection?.[0]?.fsPath;
		if (!selectedPath) {
			return undefined;
		}

		return this.setSelectedUproject(selectedPath);
	}

	public async findWorkspaceUprojects(): Promise<string[]> {
		const uris = await vscode.workspace.findFiles(
			'**/*.uproject',
			'**/{Binaries,DerivedDataCache,Intermediate,Saved}/**',
		);

		return uris
			.map((uri) => path.normalize(uri.fsPath))
			.sort((left, right) => left.localeCompare(right));
	}

	private async getExistingConfiguredPath(): Promise<string | undefined> {
		const configuredPath = resolveWorkspacePath(getExtensionConfig().uprojectPath);
		if (!configuredPath || !await pathExists(configuredPath)) {
			return undefined;
		}

		return configuredPath;
	}

	private async promptForWorkspaceProject(
		workspacePaths: string[],
	): Promise<string | undefined> {
		const selection = await vscode.window.showQuickPick(
			workspacePaths.map((uprojectPath) => ({
				label: path.basename(uprojectPath),
				description: uprojectPath,
				uprojectPath,
			})),
			{
				ignoreFocusOut: true,
				placeHolder: 'Select the Unreal project to use',
				title: 'Multiple .uproject files found',
			},
		);

		if (!selection) {
			return undefined;
		}

		return this.setSelectedUproject(selection.uprojectPath);
	}
}
