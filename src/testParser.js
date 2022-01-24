const Parser = require('tap-parser');
const vscode = require('vscode');
const { TestData } = require('./dataCache');
const { parse, sep } = require('path');

const runnableTag = new vscode.TestTag('runnable');

// Parses test results from TapRunner.
// Creates tests if needed.
// Sets the correct pass and fail state for each test.
class TestParser {
    /**
     * 
     * @param {*} controller The test controller
     * @param {*} testRun The current testRun
     * @param {*} uri The workspace folder
     * @param {*} cb A callback function on completion
     */
    constructor(controller, testRun, uri, cb, update = null) {
        this.tapParser = new Parser();
        this.controller = controller;
        this.cb = cb;
        this.uri = uri;
        this.testRun = testRun;
        this.updatePath = update;

        this.children = [];

        this.tapParser.on('child', (childParser) => this.handleChild(childParser, this.children, this.uri));
        this.tapParser.on('complete', this.processResults.bind(this));
    }

    getStream() {
        return this.tapParser;
    }

    handleAssert(assert, parent, uri) {
        // Filter result assertions.
        if (assert.time) {
            return;
        }

        //const test = this.getTest(parent, assert.id.toString(), assert.name, uri);
        parent.push({ id: assert.id.toString(), assert: assert, uri: uri, name: assert.name });
    }

    handleChild(childParser, parent, uri) {
        let children = [];
        let myuri = this.getParserURI(childParser, uri);

        childParser.on('assert', (assert) => this.handleAssert(assert, children, myuri));
        childParser.on('child', (childParser) => this.handleChild(childParser, children, myuri));
        childParser.on('complete', async () => {
            parent.push({ id: this.getParserID(childParser, uri), parser: childParser, uri: myuri, name: childParser.name, children: children });
        })
    }

    processResults() {
        // Add a parent test for the current workspace folder.
        let folder = parse(this.uri.path);
        let workspaceFolderTest = this.getTest(this.controller, this.uri.toString(), folder.base, this.uri);

        this.processTests(this.children, workspaceFolderTest);

        // Let everyone know we are done!
        if (this.cb) {
            this.cb();
        }
    }

    /**
     * Due to a limitation with tap-parser I collect all test data
     * and then create and process the tests at the end.
     * From what I can tell ChildParser.closingTestPoint.id is not available
     * until after all its events have fired. Since I need this id to create
     * the tests, I cannot create tests until after all child tests have finished.
     * @param {*} children 
     * @param {*} parent 
     */
    processTests(children, parent) {
        for (let child of children) {
            const test = this.getTest(parent, child.id, child.name, child.uri);

            if (this.testRun && child.assert) {
                if (child.assert.ok) {
                    this.testRun.passed(test);
                }
                else {
                    this.testRun.appendOutput(child.assert.diag['stack'].toString().replaceAll('\n', '\r\n'));
                    this.testRun.appendOutput(child.assert.diag['source'].toString().replaceAll('\n', '\r\n'));
                    this.testRun.appendOutput('Comparison: ' + child.assert.diag['compare'].toString() + '\r\n');
                    this.testRun.appendOutput('Found: ' + child.assert.diag['found'].toString() + '\r\n');
                    this.testRun.appendOutput('Wanted: ' + child.assert.diag['wanted'].toString() + '\r\n\r\n\r\n');
                    this.testRun.failed(test, new vscode.TestMessage(child.assert.diag.source));
                }
            }

            if (child.children) {
                this.processTests(child.children, test);
            }
        }
    }

    /**
     * Gets (or creates) a test.
     * I can't figure out how to get line numbers from the tap-parser
     * so uri's are only available for files.
     * @param {*} id 
     * @param {*} name 
     * @param {*} uri 
     */
    getTest(parent, id, name, uri, runnable = false) {
        // Get the list associated with the parent.
        let list = parent.items ? parent.items : parent.children;

        // If the test is a file (aka the name ends with .js)
        // we want to set it as runnable and create a test
        // for each containing folder in its relative path.
        // This creates a nice tree view in the testing sidebar.
        if (name.endsWith('.js')) {
            let parts = parse(name);
            let dirs = parts.dir.split(sep);

            runnable = true;
            name = parts.base;

            let testDir = parent;
            for (let dir of dirs) {
                // Get or create the test associated with each parent folder.
                testDir = this.getTest(testDir, dir, dir, null, true);
            }

            // Update list as we add parents.
            list = testDir.items ? testDir.items : testDir.children;
        }
        else {
            uri = null;
        }

        // Get the test associated with an id.
        let test = list.get(id);

        // If the test does not exist, create it.
        if (test == null) {
            test = this.controller.createTestItem(id, name, uri);

            // Currently the only runnable tests are folders and files.
            if (runnable) {
                test.tags = [...test.tags, runnableTag];
            }

            // Add the new test to its parent.
            list.add(test);

            // Save the tests uri and working directory (a workspace folder) 
            // for later use.
            TestData.set(test, { uri: uri, cwd: this.uri });
        }

        // If we are updating a tests children delete them all.
        // They will be repopulated later.
        try {
            if (uri && this.updatePath && this.updatePath === uri.path) {
                test.children.replace([]);
            }
        }
        catch (err) {
            console.log(err);
        }

        return test;
    }

    getParserID(parser, uri) {
        if (parser.name.endsWith('.js')) {
            return vscode.Uri.parse(parser.name).toString();
        }

        // The id for a child parser does not seem to be available until the very end.
        // If it was available earlier we could create tests and process them as we go.
        return parser.closingTestPoint.id.toString();
    }

    getParserURI(parser, uri) {
        if (parser.name.endsWith('.js')) {
            return vscode.Uri.joinPath(this.uri, parser.name);
        }

        return uri;
    }
}

module.exports = TestParser;
module.exports.TestParser = TestParser;
module.exports.RunnableTag = runnableTag;