import * as vscode from 'vscode';

export type SidebarStatusKind = 'info' | 'success' | 'error';

export interface SidebarState {
	uprojectPath?: string;
	uprojectMessage: string;
	projectSummaryLines: string[];
	moduleSummaryLines: string[];
	targetSummaryLines: string[];
	buildScriptPath?: string;
	buildScriptMessage: string;
	buildArgsText: string;
	lastStatus: {
		kind: SidebarStatusKind;
		text: string;
	};
	openAfterBuild: boolean;
	canBuild: boolean;
	canOpenEditor: boolean;
}

export interface SidebarActions {
	build(): void;
	openEditor(): void;
	pickUproject(): void;
	pickBuildScript(): void;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'unrealHelper.sidebar';

	private view?: vscode.WebviewView;

	private state: SidebarState = {
		buildArgsText: 'No extra arguments.',
		buildScriptMessage: 'No build script configured.',
		canBuild: false,
		canOpenEditor: false,
		lastStatus: {
			kind: 'info',
			text: 'Ready.',
		},
		openAfterBuild: true,
		moduleSummaryLines: ['No module summary available.'],
		projectSummaryLines: ['No project summary available.'],
		targetSummaryLines: ['No target summary available.'],
		uprojectMessage: 'No .uproject selected.',
	};

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly actions: SidebarActions,
	) {}

	public updateState(nextState: Partial<SidebarState>): void {
		this.state = {
			...this.state,
			...nextState,
		};
		this.render();
	}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};

		webviewView.webview.onDidReceiveMessage((message: { command?: string }) => {
			switch (message.command) {
			case 'build':
				this.actions.build();
				return;
			case 'openEditor':
				this.actions.openEditor();
				return;
			case 'pickBuildScript':
				this.actions.pickBuildScript();
				return;
			case 'pickUproject':
				this.actions.pickUproject();
				return;
			default:
				return;
			}
		});

		this.render();
	}

	private render(): void {
		if (!this.view) {
			return;
		}

		const nonce = createNonce();
		this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
	/>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Unreal Helper</title>
	<style>
		:root {
			color-scheme: light dark;
		}

		body {
			margin: 0;
			padding: 12px;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}

		.layout {
			display: grid;
			gap: 8px;
		}

		.panel {
			display: grid;
			gap: 8px;
			padding: 8px;
			border: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
			border-radius: 4px;
			background: var(--vscode-sideBar-background);
			box-shadow: inset 0 1px 0 color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
		}

		.label {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--vscode-descriptionForeground);
		}

		.value {
			padding: 8px 10px;
			border-radius: 4px;
			background: var(--vscode-textCodeBlock-background);
			word-break: break-word;
			line-height: 1.4;
		}

		.value.compact {
			padding: 6px 8px;
			font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
			font-size: 12px;
		}

		.header {
			display: grid;
			gap: 8px;
		}

		.header-top {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.title {
			font-size: 12px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--vscode-descriptionForeground);
		}

		.status-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 3px 8px;
			border-radius: 999px;
			font-size: 11px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			border: 1px solid transparent;
		}

		.status-badge.info {
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}

		.status-badge.success {
			background: color-mix(in srgb, var(--vscode-testing-iconPassed) 14%, transparent);
			color: var(--vscode-testing-iconPassed);
			border-color: color-mix(in srgb, var(--vscode-testing-iconPassed) 55%, transparent);
		}

		.status-badge.error {
			background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
			color: var(--vscode-errorForeground);
			border-color: color-mix(in srgb, var(--vscode-errorForeground) 50%, transparent);
		}

		.actions {
			display: grid;
			gap: 6px;
		}

		.primary-actions {
			display: flex;
			gap: 6px;
		}

		.secondary-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 6px;
		}

		button {
			min-width: 0;
			width: 100%;
			border: 1px solid transparent;
			border-radius: 4px;
			padding: 7px 9px;
			font: inherit;
			font-size: 12px;
			font-weight: 600;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			cursor: pointer;
			text-align: left;
			transition: background 120ms ease, border-color 120ms ease;
			white-space: nowrap;
		}

		button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button.primary {
			flex: 1 1 0;
			padding-top: 8px;
			padding-bottom: 8px;
		}

		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
			border-color: color-mix(in srgb, var(--vscode-button-secondaryForeground) 12%, transparent);
		}

		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		button:disabled {
			opacity: 0.55;
			cursor: default;
		}

		.button-content {
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 0;
			width: 100%;
		}

		.button-icon {
			width: 13px;
			height: 13px;
			flex: 0 0 13px;
			display: inline-block;
			color: currentColor;
		}

		.button-text {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.status-text {
			padding: 10px;
			border-radius: 4px;
			line-height: 1.4;
			background: var(--vscode-editorWidget-background, var(--vscode-textCodeBlock-background));
		}

		.meta-grid {
			display: grid;
			gap: 8px;
		}

		.pane {
			border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
			border-left: 0;
			border-right: 0;
			border-bottom: 0;
			border-radius: 0;
			background: var(--vscode-sideBar-background);
			overflow: hidden;
		}

		.pane summary {
			list-style: none;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 7px 0;
			cursor: pointer;
			user-select: none;
			background: var(--vscode-sideBarSectionHeader-background, transparent);
			border-bottom: 0;
		}

		.pane summary::-webkit-details-marker {
			display: none;
		}

		.pane[open] summary {
			box-shadow: inset 0 -1px 0 var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
		}

		.pane-title {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			min-width: 0;
			font-size: 12px;
			font-weight: 600;
			text-transform: none;
			letter-spacing: 0;
		}

		.chevron {
			font-size: 10px;
			color: var(--vscode-descriptionForeground);
			transition: transform 120ms ease;
		}

		.pane[open] .chevron {
			transform: rotate(90deg);
		}

		.pane-count {
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-weight: 600;
		}

		.pane-body {
			display: grid;
			gap: 6px;
			padding: 6px 0 8px 14px;
		}

		.line-list {
			display: grid;
			gap: 1px;
		}

		.tree-row {
			padding: 4px 6px;
			border-radius: 3px;
			line-height: 1.4;
			color: var(--vscode-foreground);
		}

		.tree-row:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.note {
			color: var(--vscode-descriptionForeground);
			line-height: 1.4;
			font-size: 12px;
		}

		.note.inline {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		@media (max-width: 220px) {
			.primary-actions,
			.secondary-actions {
				grid-template-columns: 1fr;
			}
		}
	</style>
</head>
<body>
	<div class="layout">
		<div class="panel header">
			<div class="header-top">
				<div class="title">Unreal Helper</div>
				<div class="status-badge ${this.state.lastStatus.kind}">${statusLabel(this.state.lastStatus.kind)}</div>
			</div>
			<div class="status-text">${escapeHtml(this.state.lastStatus.text)}</div>
			<div class="note inline">
				<span>Open Editor builds first</span>
				<span>${this.state.openAfterBuild ? 'On' : 'Off'}</span>
			</div>
		</div>

		<div class="panel actions">
			<div class="primary-actions">
				<button class="primary" data-command="build" ${this.state.canBuild ? '' : 'disabled'}>
					<span class="button-content">
						${icon('build')}
						<span class="button-text">Build</span>
					</span>
				</button>
				<button class="primary" data-command="openEditor" ${this.state.canOpenEditor ? '' : 'disabled'}>
					<span class="button-content">
						${icon('play')}
						<span class="button-text">Open Editor</span>
					</span>
				</button>
			</div>
			<div class="secondary-actions">
				<button class="secondary" data-command="pickUproject">
					<span class="button-content">
						${icon('file')}
						<span class="button-text">Pick .uproject</span>
					</span>
				</button>
				<button class="secondary" data-command="pickBuildScript">
					<span class="button-content">
						${icon('tool')}
						<span class="button-text">Pick Build Script</span>
					</span>
				</button>
			</div>
		</div>

		<div class="panel meta-grid">
			<div class="label">Current Selection</div>
			<div class="value compact">${escapeHtml(this.state.uprojectPath ?? this.state.uprojectMessage)}</div>
			<div class="value compact">${escapeHtml(this.state.buildScriptPath ?? this.state.buildScriptMessage)}</div>
			<div class="note">Build args: ${escapeHtml(this.state.buildArgsText)}</div>
		</div>

		${renderPane('Project Summary', this.state.projectSummaryLines, true)}
		${renderPane('Modules', this.state.moduleSummaryLines, false)}
		${renderPane('Targets', this.state.targetSummaryLines, false)}
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		for (const button of document.querySelectorAll('button[data-command]')) {
			button.addEventListener('click', () => {
				if (button.disabled) {
					return;
				}

				vscode.postMessage({ command: button.dataset.command });
			});
		}
	</script>
</body>
</html>`;
	}
}

function createNonce(): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let value = '';

	for (let index = 0; index < 32; index += 1) {
		value += characters.charAt(Math.floor(Math.random() * characters.length));
	}

	return value;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderLines(lines: string[]): string {
	return lines
		.map((line) => `<div class="tree-row">${escapeHtml(line)}</div>`)
		.join('');
}

function renderPane(title: string, lines: string[], isOpen: boolean): string {
	return `<details class="pane" ${isOpen ? 'open' : ''}>
		<summary>
			<span class="pane-title">
				<span class="chevron">&gt;</span>
				<span>${escapeHtml(title)}</span>
			</span>
			<span class="pane-count">${lines.length}</span>
		</summary>
		<div class="pane-body">
			<div class="line-list">${renderLines(lines)}</div>
		</div>
	</details>`;
}

function statusLabel(kind: SidebarStatusKind): string {
	switch (kind) {
	case 'success':
		return 'Success';
	case 'error':
		return 'Error';
	default:
		return 'Status';
	}
}

function icon(name: 'build' | 'play' | 'file' | 'tool'): string {
	switch (name) {
	case 'build':
		return `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true">
			<path fill="currentColor" d="M9.63 1.5a4.1 4.1 0 0 0 .76 4.83L6.56 10.16a1.5 1.5 0 0 0-1.49-.24L2.6 12.4a.75.75 0 0 0 0 1.06l.94.94a.75.75 0 0 0 1.06 0l2.48-2.47c.18-.18.27-.43.24-.69l3.83-3.83a4.1 4.1 0 0 0 4.85-5.91l-2.08 2.08-1.5-.26-.26-1.5L14.24 0A4.08 4.08 0 0 0 9.63 1.5Z"/>
		</svg>`;
	case 'play':
		return `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true">
			<path fill="currentColor" d="M4 2.5v11l8.5-5.5L4 2.5Z"/>
		</svg>`;
	case 'file':
		return `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true">
			<path fill="currentColor" d="M3.75 1.5h5.44L13 5.3v8.95a.75.75 0 0 1-.75.75h-8.5A.75.75 0 0 1 3 14.25v-12a.75.75 0 0 1 .75-.75Zm4.75 1.5H4.5v10.5h7V6H8.5V3Z"/>
		</svg>`;
	case 'tool':
		return `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true">
			<path fill="currentColor" d="M9.75 1.5a3.25 3.25 0 0 0-2.68 5.09L2.3 11.36a1.25 1.25 0 0 0 1.77 1.77l4.77-4.78A3.25 3.25 0 1 0 9.75 1.5Zm0 1.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z"/>
		</svg>`;
	}
}
