const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TapRunner {
    constructor(cwd) {
        this.cwd = cwd;
    }

    run(stream=null, file=null) {
        return new Promise((resolve, reject) => {
            // Use the tap reporter for input into the tap parser.
            let args = ['tap', '--reporter=tap'];

            if(file) {
                try {
                    if(fs.lstatSync(file).isFile()) {
                        let relPath = path.relative(this.cwd, file);
                        args.push(relPath);
                    }
                }
                catch(err) {
                    console.log(err);
                }
            }
            
            const cmd = spawn("npx", args, { cwd: this.cwd });

            if(stream!=null) {
                cmd.stdout.pipe(stream);
            }
        
            cmd.on('error', (err) => { console.log(err); reject(err); });
            cmd.on('exit', ()=>resolve());
        });
    }
}

module.exports = TapRunner;