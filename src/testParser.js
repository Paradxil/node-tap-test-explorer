const Parser = require('tap-parser');
const vscode = require('vscode');
const {TestData} = require('./dataCache');
const {parse, sep} = require('path');

const runnableTag = new vscode.TestTag('runnable');

// Parses test results from TapRunner.
// Creates tests if needed.
// Sets the correct pass and fail state for each test.
class TestParser {
    constructor(controller, testRun, uri, cb) {
        this.tapParser = new Parser();
        this.controller = controller;
        this.cb = cb;
        this.uri = uri;
        this.testRun = testRun;

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
        parent.push({id: assert.id.toString(), assert: assert, uri: uri, name: assert.name});
    }

    handleChild(childParser, parent, uri) {
        let children = [];
        let myuri = this.getParserURI(childParser, uri);

        childParser.on('assert', (assert) => this.handleAssert(assert, children, myuri));
        childParser.on('child', (childParser) => this.handleChild(childParser, children, myuri));
        childParser.on('complete', async () => {
            parent.push({id: this.getParserID(childParser, uri), parser: childParser, uri: myuri, name: childParser.name, children: children});
            //const parentTest = this.getTest(parent, this.getParserID(childParser, uri), childParser.name, myuri);
            //parent.push(parentTest);

            // for (let child of children) {
            //     parentTest.children.add(child);
            // }
        })
    }

    processResults() {
        // for (let child of this.children) {
        //     this.controller.items.add(child);
        // }
        this.processTests(this.children, this.controller);

        if(this.cb) {
            this.cb();
        }
    }

    processTests(children, parent) {
        for(let child of children) {
            const test = this.getTest(parent, child.id, child.name, child.uri);

            if(this.testRun && child.assert) {
                if(child.assert.ok) {
                    this.testRun.passed(test);
                }
                else {
                    this.testRun.failed(test, new vscode.TestMessage(child.assert.diag.source));
                }
            }

            if(child.children) {
                this.processTests(child.children, test);
            }
        }
    }

    /**
     * Gets (or creates) a test.
     * @param {*} id 
     * @param {*} name 
     * @param {*} uri 
     */
    getTest(parent, id, name, uri, runnable=false) {
        let list = parent.items?parent.items:parent.children;

        if(name.endsWith('.js')) {
            let parts = parse(name);
            let dirs = parts.dir.split(sep);

            runnable = true;
            name = parts.base;

            let testDir = parent;
            for(let dir of dirs) {
                testDir = this.getTest(testDir, dir, dir, null, true);
            }

            list = testDir.items?testDir.items:testDir.children;
        }
        else {
            uri = null;
        }

        let test = list.get(id);

        if(test == null) {
            test = this.controller.createTestItem(id, name, uri);

            if(runnable) {
                test.tags = [...test.tags, runnableTag];
            }

            list.add(test);
            TestData.set(test, {uri: uri, cwd: this.uri});
        }

        return test;
    }

    getParserID(parser, uri) {
        if (parser.name.endsWith('.js')) {
            return vscode.Uri.parse(parser.name).toString();
            // let newUri = vscode.Uri.joinPath(uri, parser.name);
            // return newUri.toString();
        }
    
        return parser.closingTestPoint.id.toString();
    }
    
    getParserURI(parser, uri) {
        if (parser.name.endsWith('.js')) {
            //return vscode.Uri.parse(parser.name);
            return vscode.Uri.joinPath(this.uri, parser.name);
        }
    
        return uri;
    }
}

module.exports = TestParser;
module.exports.TestParser = TestParser;
module.exports.RunnableTag = runnableTag;