import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export interface CommandRunRequest {
	scriptPath: string;
	args: string[];
	cwd: string;
	label: string;
}

export interface CommandRunResult {
	success: boolean;
	exitCode: number | null;
}

interface SpawnDescriptor {
	command: string;
	args: string[];
	displayCommand: string;
}

export class CommandRunner {
	public constructor(private readonly outputChannel: vscode.OutputChannel) {}

	public async run(request: CommandRunRequest): Promise<CommandRunResult> {
		const descriptor = this.createSpawnDescriptor(request.scriptPath, request.args);
		if (!descriptor) {
			this.outputChannel.appendLine(
				`[${request.label}] Unsupported script type for ${request.scriptPath}`,
			);
			return {
				success: false,
				exitCode: null,
			};
		}

		this.outputChannel.show(true);
		this.outputChannel.appendLine('');
		this.outputChannel.appendLine(`[${request.label}] ${descriptor.displayCommand}`);
		this.outputChannel.appendLine(`[cwd] ${request.cwd}`);

		return new Promise<CommandRunResult>((resolve) => {
			const child = spawn(descriptor.command, descriptor.args, {
				cwd: request.cwd,
				env: process.env,
				windowsHide: true,
			});

			child.stdout.on('data', (chunk: Buffer) => {
				this.outputChannel.append(chunk.toString());
			});

			child.stderr.on('data', (chunk: Buffer) => {
				this.outputChannel.append(chunk.toString());
			});

			child.on('error', (error: Error) => {
				this.outputChannel.appendLine(`[error] ${error.message}`);
				resolve({
					success: false,
					exitCode: null,
				});
			});

			child.on('close', (exitCode) => {
				this.outputChannel.appendLine(
					`[${request.label}] exited with code ${exitCode ?? 'unknown'}`,
				);
				resolve({
					success: exitCode === 0,
					exitCode,
				});
			});
		});
	}

	private createSpawnDescriptor(
		scriptPath: string,
		args: string[],
	): SpawnDescriptor | undefined {
		const extension = path.extname(scriptPath).toLowerCase();

		if (process.platform === 'win32') {
			if (extension === '.bat' || extension === '.cmd') {
				return {
					command: process.env.ComSpec ?? 'cmd.exe',
					args: ['/d', '/c', 'call', scriptPath, ...args],
					displayCommand: formatDisplayCommand(scriptPath, args),
				};
			}

			if (extension === '.ps1') {
				const powershellPath = path.join(
					process.env.SystemRoot ?? 'C:\\Windows',
					'System32',
					'WindowsPowerShell',
					'v1.0',
					'powershell.exe',
				);

				return {
					command: powershellPath,
					args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
					displayCommand: formatDisplayCommand(powershellPath, [
						'-NoProfile',
						'-ExecutionPolicy',
						'Bypass',
						'-File',
						scriptPath,
						...args,
					]),
				};
			}

			if (extension === '.sh') {
				return undefined;
			}

			return {
				command: scriptPath,
				args,
				displayCommand: formatDisplayCommand(scriptPath, args),
			};
		}

		if (extension === '.bat' || extension === '.cmd') {
			return undefined;
		}

		if (extension === '.ps1') {
			return undefined;
		}

		if (extension === '.sh') {
			return {
				command: '/bin/sh',
				args: [scriptPath, ...args],
				displayCommand: formatDisplayCommand('/bin/sh', [scriptPath, ...args]),
			};
		}

		return {
			command: scriptPath,
			args,
			displayCommand: formatDisplayCommand(scriptPath, args),
		};
	}
}

function formatDisplayCommand(command: string, args: string[]): string {
	return [command, ...args.map((argument) => quoteForDisplay(argument))].join(' ');
}

function quoteForDisplay(value: string): string {
	if (!/[\s"]/.test(value)) {
		return value;
	}

	return `"${value.replace(/"/g, '\\"')}"`;
}
