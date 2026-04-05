import * as vscode from 'vscode';

export type SidebarStatusKind = 'info' | 'success' | 'error';

export interface SidebarState {
	uprojectPath?: string;
	uprojectMessage: string;
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
			padding: 16px;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}

		.layout {
			display: grid;
			gap: 14px;
		}

		.section {
			display: grid;
			gap: 8px;
			padding: 12px;
			border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			border-radius: 8px;
			background: var(--vscode-editorWidget-background, transparent);
		}

		.label {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--vscode-descriptionForeground);
		}

		.value {
			padding: 10px;
			border-radius: 6px;
			background: var(--vscode-textCodeBlock-background);
			word-break: break-word;
			line-height: 1.4;
		}

		.buttons {
			display: grid;
			grid-template-columns: 1fr;
			gap: 10px;
		}

		button {
			width: 100%;
			border: 0;
			border-radius: 8px;
			padding: 14px 12px;
			font: inherit;
			font-weight: 600;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			cursor: pointer;
		}

		button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}

		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		button:disabled {
			opacity: 0.55;
			cursor: default;
		}

		.status {
			padding: 12px;
			border-radius: 8px;
			line-height: 1.4;
			border: 1px solid transparent;
		}

		.status.info {
			background: var(--vscode-textCodeBlock-background);
			border-color: var(--vscode-widget-border, var(--vscode-panel-border));
		}

		.status.success {
			background: color-mix(in srgb, var(--vscode-testing-iconPassed) 14%, transparent);
			border-color: color-mix(in srgb, var(--vscode-testing-iconPassed) 60%, transparent);
		}

		.status.error {
			background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
			border-color: color-mix(in srgb, var(--vscode-errorForeground) 55%, transparent);
		}

		.note {
			color: var(--vscode-descriptionForeground);
			line-height: 1.4;
		}
	</style>
</head>
<body>
	<div class="layout">
		<div class="buttons">
			<button data-command="build" ${this.state.canBuild ? '' : 'disabled'}>Build</button>
			<button data-command="openEditor" ${this.state.canOpenEditor ? '' : 'disabled'}>Open Editor</button>
			<button class="secondary" data-command="pickUproject">Pick .uproject</button>
			<button class="secondary" data-command="pickBuildScript">Pick Build Script</button>
		</div>

		<div class="section">
			<div class="label">Selected .uproject</div>
			<div class="value">${escapeHtml(this.state.uprojectPath ?? this.state.uprojectMessage)}</div>
		</div>

		<div class="section">
			<div class="label">Build Script</div>
			<div class="value">${escapeHtml(this.state.buildScriptPath ?? this.state.buildScriptMessage)}</div>
			<div class="note">Args: ${escapeHtml(this.state.buildArgsText)}</div>
		</div>

		<div class="section">
			<div class="label">Status</div>
			<div class="status ${this.state.lastStatus.kind}">${escapeHtml(this.state.lastStatus.text)}</div>
			<div class="note">Open Editor builds first: ${this.state.openAfterBuild ? 'On' : 'Off'}</div>
		</div>
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
