import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	getExtensionConfig,
	pathExists,
	resolveWorkspacePath,
	updateConfigurationValue,
} from './config';
import { CommandRunner } from './commandRunner';
import { ProjectLocator } from './projectLocator';
import {
	SidebarStatusKind,
	SidebarViewProvider,
} from './sidebarViewProvider';

interface BuildScriptState {
	path?: string;
	message: string;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel('Unreal Helper');
	const projectLocator = new ProjectLocator();
	const commandRunner = new CommandRunner(outputChannel);
	const sidebarViewProvider = new SidebarViewProvider(context.extensionUri, {
		build: () => void vscode.commands.executeCommand('unrealHelper.build'),
		openEditor: () => void vscode.commands.executeCommand('unrealHelper.openEditor'),
		pickBuildScript: () => void vscode.commands.executeCommand('unrealHelper.pickBuildScript'),
		pickUproject: () => void vscode.commands.executeCommand('unrealHelper.pickUproject'),
	});

	context.subscriptions.push(
		outputChannel,
		vscode.window.registerWebviewViewProvider(
			SidebarViewProvider.viewType,
			sidebarViewProvider,
		),
	);

	let lastStatus = {
		kind: 'info' as SidebarStatusKind,
		text: 'Ready.',
	};

	const setStatus = (
		kind: SidebarStatusKind,
		text: string,
		showMessage = false,
	): void => {
		lastStatus = { kind, text };
		sidebarViewProvider.updateState({ lastStatus: lastStatus });

		if (!showMessage) {
			return;
		}

		if (kind === 'error') {
			void vscode.window.showErrorMessage(text);
			return;
		}

		if (kind === 'success') {
			void vscode.window.showInformationMessage(text);
			return;
		}

		void vscode.window.showWarningMessage(text);
	};

	const getBuildScriptState = async (): Promise<BuildScriptState> => {
		const config = getExtensionConfig();
		const configuredPath = resolveWorkspacePath(config.buildScriptPath);
		if (configuredPath && await pathExists(configuredPath)) {
			return {
				path: configuredPath,
				message: 'Using configured build script.',
			};
		}

		if (config.buildScriptPath) {
			return {
				message: 'Configured build script not found. Pick a script or update settings.',
			};
		}

		return {
			message: 'No build script configured. Pick a script or update settings.',
		};
	};

	const refreshSidebar = async (): Promise<void> => {
		const projectState = await projectLocator.getProjectState();
		const buildScriptState = await getBuildScriptState();
		const config = getExtensionConfig();

		await vscode.commands.executeCommand(
			'setContext',
			'unrealHelper.enabled',
			projectState.workspaceHasProjects,
		);

		sidebarViewProvider.updateState({
			buildArgsText: config.buildArgs.length > 0 ? config.buildArgs.join(' ') : 'No extra arguments.',
			buildScriptPath: buildScriptState.path,
			buildScriptMessage: buildScriptState.path
				? buildScriptState.path
				: buildScriptState.message,
			canBuild: true,
			canOpenEditor: projectState.workspaceHasProjects || Boolean(projectState.selectedPath),
			lastStatus: lastStatus,
			openAfterBuild: config.openAfterBuild,
			uprojectMessage: projectState.selectedPath
				? projectState.selectedPath
				: projectState.message,
			uprojectPath: projectState.selectedPath,
		});
	};

	const openConfiguration = async (settingKey: string): Promise<void> => {
		await vscode.commands.executeCommand(
			'workbench.action.openSettings',
			settingKey,
		);
	};

	const ensureBuildScriptPath = async (): Promise<string | undefined> => {
		const buildScriptState = await getBuildScriptState();
		if (buildScriptState.path) {
			return buildScriptState.path;
		}

		const choice = await vscode.window.showWarningMessage(
			buildScriptState.message,
			'Pick Build Script',
			'Open Settings',
		);

		if (choice === 'Pick Build Script') {
			return vscode.commands.executeCommand<string | undefined>(
				'unrealHelper.pickBuildScript',
			);
		}

		if (choice === 'Open Settings') {
			await openConfiguration('unrealHelper.buildScriptPath');
		}

		return undefined;
	};

	const getBuildCwd = (scriptPath: string, uprojectPath?: string): string => {
		if (uprojectPath) {
			return path.dirname(uprojectPath);
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		return workspaceFolder?.uri.fsPath ?? path.dirname(scriptPath);
	};

	const runBuild = async (): Promise<boolean> => {
		const buildScriptPath = await ensureBuildScriptPath();
		if (!buildScriptPath) {
			setStatus('error', 'Build script is not configured.', true);
			return false;
		}

		const projectState = await projectLocator.getProjectState();
		setStatus('info', 'Build started.');
		await refreshSidebar();

		const result = await commandRunner.run({
			args: getExtensionConfig().buildArgs,
			cwd: getBuildCwd(buildScriptPath, projectState.selectedPath),
			label: 'Build',
			scriptPath: buildScriptPath,
		});

		if (!result.success) {
			setStatus(
				'error',
				`Build failed${result.exitCode === null ? '' : ` with exit code ${result.exitCode}`}.`,
				true,
			);
			return false;
		}

		setStatus('success', 'Build finished successfully.', true);
		return true;
	};

	const openSelectedProject = async (): Promise<boolean> => {
		const uprojectPath = await projectLocator.ensureUprojectPath();
		if (!uprojectPath) {
			setStatus('error', 'No .uproject selected.', true);
			return false;
		}

		const opened = await vscode.env.openExternal(vscode.Uri.file(uprojectPath));
		if (!opened) {
			setStatus('error', 'VS Code could not open the selected .uproject.', true);
			return false;
		}

		setStatus('success', `Opened ${path.basename(uprojectPath)}.`);
		return true;
	};

	const registerCommand = (
		command: string,
		callback: () => Promise<void>,
	): void => {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback));
	};

	registerCommand('unrealHelper.build', async () => {
		try {
			await runBuild();
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.buildAndOpen', async () => {
		try {
			const built = await runBuild();
			if (!built) {
				return;
			}

			await openSelectedProject();
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.openEditor', async () => {
		try {
			if (getExtensionConfig().openAfterBuild) {
				await vscode.commands.executeCommand('unrealHelper.buildAndOpen');
				return;
			}

			await openSelectedProject();
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.pickUproject', async () => {
		try {
			const selectedPath = await projectLocator.pickUproject();
			if (!selectedPath) {
				return;
			}

			setStatus('success', `Selected ${path.basename(selectedPath)}.`);
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.pickBuildScript', async () => {
		try {
			const selection = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				openLabel: 'Select Build Script',
				title: 'Select Unreal Build Script',
				defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
			});

			const scriptPath = selection?.[0]?.fsPath;
			if (!scriptPath) {
				return;
			}

			await updateConfigurationValue('buildScriptPath', scriptPath);
			setStatus('success', `Selected ${path.basename(scriptPath)}.`);
		} finally {
			await refreshSidebar();
		}
	});

	const uprojectWatcher = vscode.workspace.createFileSystemWatcher('**/*.uproject');
	context.subscriptions.push(
		uprojectWatcher,
		uprojectWatcher.onDidCreate(() => void refreshSidebar()),
		uprojectWatcher.onDidDelete(() => void refreshSidebar()),
		uprojectWatcher.onDidChange(() => void refreshSidebar()),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('unrealHelper')) {
				void refreshSidebar();
			}
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshSidebar()),
	);

	await refreshSidebar();
}

export function deactivate(): void {}
