import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	getExtensionConfig,
	pathExists,
	resolveWorkspacePath,
	updateConfigurationValue,
} from './config';
import { CommandRunner } from './commandRunner';
import { ProjectParser } from './projectParser';
import { ProjectLocator } from './projectLocator';
import {
	SidebarStatusKind,
	SidebarViewProvider,
} from './sidebarViewProvider';
import type { ParsedProjectSummary, ModuleSummary, TargetSummary } from './projectParser';

interface BuildScriptState {
	path?: string;
	message: string;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel('Unreal Helper');
	const projectLocator = new ProjectLocator();
	const projectParser = new ProjectParser();
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
		const parsedProject = await projectParser.parse(projectState.selectedPath);

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
			moduleSummaryLines: toModuleSummaryLines(parsedProject),
			openAfterBuild: config.openAfterBuild,
			projectSummaryLines: toProjectSummaryLines(parsedProject),
			targetSummaryLines: toTargetSummaryLines(parsedProject),
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

	const resolveCommandUprojectPath = async (
		targetUri?: vscode.Uri,
	): Promise<string | undefined> => {
		if (targetUri?.scheme === 'file' && targetUri.fsPath.toLowerCase().endsWith('.uproject')) {
			return projectLocator.setSelectedUproject(targetUri.fsPath);
		}

		return projectLocator.ensureUprojectPath();
	};

	const runBuild = async (targetUri?: vscode.Uri): Promise<boolean> => {
		const buildScriptPath = await ensureBuildScriptPath();
		if (!buildScriptPath) {
			setStatus('error', 'Build script is not configured.', true);
			return false;
		}

		const uprojectPath = await resolveCommandUprojectPath(targetUri);
		setStatus('info', 'Build started.');
		await refreshSidebar();

		const result = await commandRunner.run({
			args: getExtensionConfig().buildArgs,
			cwd: getBuildCwd(buildScriptPath, uprojectPath),
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

	const openSelectedProject = async (targetUri?: vscode.Uri): Promise<boolean> => {
		const uprojectPath = await resolveCommandUprojectPath(targetUri);
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
		callback: (targetUri?: vscode.Uri) => Promise<void>,
	): void => {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback));
	};

	registerCommand('unrealHelper.build', async (targetUri?: vscode.Uri) => {
		try {
			await runBuild(targetUri);
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.buildAndOpen', async (targetUri?: vscode.Uri) => {
		try {
			const built = await runBuild(targetUri);
			if (!built) {
				return;
			}

			await openSelectedProject(targetUri);
		} finally {
			await refreshSidebar();
		}
	});

	registerCommand('unrealHelper.openEditor', async (targetUri?: vscode.Uri) => {
		try {
			if (getExtensionConfig().openAfterBuild) {
				await vscode.commands.executeCommand('unrealHelper.buildAndOpen', targetUri);
				return;
			}

			await openSelectedProject(targetUri);
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

	registerCommand('unrealHelper.openSettings', async () => {
		await openConfiguration('unrealHelper');
	});

	const uprojectWatcher = vscode.workspace.createFileSystemWatcher('**/*.uproject');
	const buildFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.Build.cs');
	const targetFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.Target.cs');
	context.subscriptions.push(
		uprojectWatcher,
		buildFileWatcher,
		targetFileWatcher,
		uprojectWatcher.onDidCreate(() => void refreshSidebar()),
		uprojectWatcher.onDidDelete(() => void refreshSidebar()),
		uprojectWatcher.onDidChange(() => void refreshSidebar()),
		buildFileWatcher.onDidCreate(() => void refreshSidebar()),
		buildFileWatcher.onDidDelete(() => void refreshSidebar()),
		buildFileWatcher.onDidChange(() => void refreshSidebar()),
		targetFileWatcher.onDidCreate(() => void refreshSidebar()),
		targetFileWatcher.onDidDelete(() => void refreshSidebar()),
		targetFileWatcher.onDidChange(() => void refreshSidebar()),
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

function toProjectSummaryLines(parsedProject: ParsedProjectSummary): string[] {
	if (parsedProject.message) {
		return [parsedProject.message];
	}

	if (!parsedProject.uproject) {
		return ['No project summary available.'];
	}

	return [
		`Name: ${parsedProject.uproject.name}`,
		`Engine: ${parsedProject.uproject.engineAssociation ?? 'Not set'}`,
		`Project Type: ${parsedProject.uproject.isCodeProject ? 'Code' : 'Blueprint-only'}`,
		`Declared Modules: ${formatList(parsedProject.uproject.moduleNames)}`,
		`Enabled Plugins: ${formatList(parsedProject.uproject.pluginNames)}`,
		`Target Platforms: ${formatList(parsedProject.uproject.targetPlatforms)}`,
	];
}

function toModuleSummaryLines(parsedProject: ParsedProjectSummary): string[] {
	if (parsedProject.message) {
		return ['No module summary available.'];
	}

	if (parsedProject.modules.length === 0) {
		return ['No Build.cs files found under Source/.'];
	}

	return parsedProject.modules.map((moduleSummary: ModuleSummary) =>
		`${moduleSummary.name}: public ${formatList(moduleSummary.publicDependencies)}, private ${formatList(moduleSummary.privateDependencies)}`,
	);
}

function toTargetSummaryLines(parsedProject: ParsedProjectSummary): string[] {
	if (parsedProject.message) {
		return ['No target summary available.'];
	}

	if (parsedProject.targets.length === 0) {
		return ['No Target.cs files found under Source/.'];
	}

	return parsedProject.targets.map((targetSummary: TargetSummary) =>
		`${targetSummary.name}: type ${targetSummary.targetType ?? 'Unknown'}, build ${targetSummary.defaultBuildSettings ?? 'Unknown'}, include ${targetSummary.includeOrderVersion ?? 'Unknown'}, modules ${formatList(targetSummary.extraModuleNames)}`,
	);
}

function formatList(values: string[]): string {
	return values.length > 0 ? values.join(', ') : 'None';
}
