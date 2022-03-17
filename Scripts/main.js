
exports.activate = function() {
    console.info("Selene extension being activated");
}

exports.deactivate = function() {
}

function isJson(item) {
    item = typeof item !== "string"
        ? JSON.stringify(item)
        : item;

    try {
        item = JSON.parse(item);
    } catch (e) {
        return false;
    }

    if (typeof item === "object" && item !== null) {
        return true;
    }

    return false;
}

class IssuesProvider {

    constructor() {

    }

    provideIssues(editor) {

        const docLen = editor.document.length;
        if (docLen === 0) {
            console.log("Bailing out early as document length is 0");
            return [];
        }

        return new Promise(function(resolve, reject) {
            let issues = [];

            let processOptions =  {
                args: ["selene", "--display-style", "Json"]
            };

            if (!editor.document.isRemote && typeof editor.document.path === "string") {
                const cwd = nova.workspace.path;
                console.log(cwd)
                processOptions.cwd = cwd;

                processOptions.args.push(editor.document.path)
            }

            const process = new Process("/usr/bin/env", processOptions);

            process.onStdout(function(line) {
                // Not all stdOut is a proper Json, such as the result message
                if (isJson(line)) {
                    let issue = new Issue();
                    let matches = JSON.parse(line)
                    issue.code = matches.code;
                    issue.message = matches.message;
                    issue.severity = matches.severity === "Error" ? IssueSeverity.Error : IssueSeverity.Warning;
                    issue.textRange = new Range(matches["primary_label"].span.start, matches["primary_label"].span.end)
                    issues.push(issue);
                }
            });

            process.onStderr(function(line) {
                console.warn("Stderr line from Luacheck", line);
            });

            process.onDidExit(function(exitStatus) {
                if (exitStatus == 127) {
                    let issue = new Issue();
                    issue.message = "I can not find Selene in your computer, have you installed Selene into your `$PATH`?";
                    issue.severity = IssueSeverity.Error;
                    issue.line = 1;
                    issues.push(issue);
                    resolve(issues);
                }

                else if (exitStatus < 0 || exitStatus > 2) {
                    reject();
                }
                else {
                    resolve(issues);
                }
            });

            // Trick to send text to process via stdin
            // https://devforum.nova.app/t/formating-code-with-a-cli-tool/1089
            const writer = process.stdin.getWriter();
            writer.ready.then(function() {
                // Get text
                const fullRange = new Range(0, docLen);
                const text = editor.document.getTextInRange(fullRange);
                console.log("in writer.ready callback; doc length: " + text.length);
                writer.write(text);
                writer.close();
            });

            try {
                process.start();
            }
            catch (e) {
                console.error(e);
                reject(e);
            }
        });
    }
}

nova.assistants.registerIssueAssistant("lua", new IssuesProvider());
