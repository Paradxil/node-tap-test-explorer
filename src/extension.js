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

	controller.resolveHandler = async test => {
		try {
			await discoverAllFilesInWorkspace(controller);
		}
		catch (err) {
			console.log(err);
		}
	};

	async function runHandler(shouldDebug, request, token) {
		const run = controller.createTestRun(request);
		
		for(let test of request.include) {
			let data = TestData.get(test);

			await new Promise((resolve) => {
				let runner = new TapRunner(data.cwd.path);
				let parser = new TestParser(controller, run, data.cwd, ()=>{console.log('completed'); resolve();});
				
				runner.run(parser.getStream());
			})
		}

		run.end();
	}

	const runProfile = controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => {
		runHandler(false, request, token);
	}, true, RunnableTag);

}

async function getTests(folder, controller) {
	const run = controller.createTestRun(new vscode.TestRunRequest());
	await new Promise((resolve) => {
		let runner = new TapRunner(folder.uri.path);
		let parser = new TestParser(controller, run, folder.uri, ()=>resolve());
		
		runner.run(parser.getStream());
	});
	run.end();
}

async function discoverAllFilesInWorkspace(controller) {
	if (!vscode.workspace.workspaceFolders) {
		return;
	}

	for (let folder of vscode.workspace.workspaceFolders) {
		const pattern = new vscode.RelativePattern(folder, '**/*.js');
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		// When files are created, make sure there's a corresponding "file" node in the tree
		watcher.onDidCreate(uri => getTests(folder, controller));
		// When files change, re-parse them. Note that you could optimize this so
		// that you only re-parse children that have been resolved in the past.
		watcher.onDidChange(uri => getTests(folder, controller));
		// And, finally, delete TestItems for removed files. This is simple, since
		// we use the URI as the TestItem's ID.
		watcher.onDidDelete(uri => console.log(uri));

		await getTests(folder, controller);
	}
}

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}