// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const TapRunner = require('./tapRunner');
const {TestParser, RunnableTag} = require('./testParser');
const {TestData} = require('./dataCache');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const controller = vscode.tests.createTestController('nodeTapExplorer', 'Node Tap Explorer');
	context.subscriptions.push(controller);

	// Loading tests can take a while.
	// Lets start looking as soon as possible.
	discoverAllFilesInWorkspace(controller);

	async function runHandler(shouldDebug, request, token) {
		const run = controller.createTestRun(request);

		if(!request.include) {
			for (let folder of vscode.workspace.workspaceFolders) {
				await new Promise((resolve) => {
					let runner = new TapRunner(folder.uri.path);
					let parser = new TestParser(controller, run, folder.uri, ()=>resolve());
					
					runner.run(parser.getStream());
				})
			}
		}
		else {
			for(let test of request.include) {
				let data = TestData.get(test);

				await new Promise((resolve) => {
					let runner = new TapRunner(data.cwd.path);
					let parser = new TestParser(controller, run, data.cwd, ()=>resolve());
					
					runner.run(parser.getStream());
				})
			}
		}

		run.end();
	}

	controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => {
		runHandler(false, request, token);
	}, true, RunnableTag);

}

/**
 * This method of loading tests requires running tests.
 * We just run tap and watch its output.
 * @param {*} folder The current workspace folder
 * @param {*} uri The uri of the file or folder we are running tests for.
 * @param {*} controller The test controller.
 */
async function getTests(folder, uri, controller) {
	const run = controller.createTestRun(new vscode.TestRunRequest());
	await new Promise((resolve) => {
		let runner = new TapRunner(folder.uri.path);
		let parser = new TestParser(controller, run, folder.uri, ()=>resolve(), uri.path);
		
		runner.run(parser.getStream(), uri.path);
	});
	run.end();
}

async function discoverAllFilesInWorkspace(controller) {
	if (!vscode.workspace.workspaceFolders) {
		return;
	}

	for (let folder of vscode.workspace.workspaceFolders) {
		const pattern = new vscode.RelativePattern(folder, '**/test/**/*.js');
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		watcher.onDidCreate(uri => getTests(folder, uri, controller));

		// When files change, re-parse them. Note that you could optimize this so
		// that you only re-parse children that have been resolved in the past.
		watcher.onDidChange(uri => getTests(folder, uri, controller));

		watcher.onDidDelete(uri => getTests(folder, uri, controller));

		await getTests(folder, folder.uri, controller);
	}
}

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}