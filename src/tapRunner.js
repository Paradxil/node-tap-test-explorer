const { spawn } = require('child_process');
const fs = require('fs');

class TapRunner {
    constructor(cwd) {
        this.cwd = cwd;
    }

    run(stream=null, file=null) {
        return new Promise((resolve, reject) => {
            let args = ['tap', '--reporter=tap'];

            if(file) {
                try {
                    if(fs.lstatSync(file).isFile()) {
                        args.push(file);
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