var RSVP = require('rsvp'),
    GitWrapper = require('git-wrapper'),
    inquirer = require("inquirer");

var gitWrapper = new GitWrapper();

var tmpBranch = 'tmp/release';

var git = module.exports = {
    baseBranch: null,
    exec: function exec() {
        var deferred = RSVP.defer();
        var args = [].slice.call(arguments);

        args.push(function(error, result) {
            if (error) {
                return deferred.reject(error);
            }
            deferred.resolve(result);
        });

        gitWrapper.exec.apply(gitWrapper, args);

        return deferred.promise;
    },
    init: function() {
        return git.exec('rev-parse', ['--abbrev-ref HEAD'])
            .then(function(branch) {
                git.baseBranch = branch.replace(/(\r\n|\n|\r)/gm, "");
            });
    },
    clean: function(branch) {
        git.exec('branch', ['-D', branch]);
    },
    restore: function() {
        var deferred = RSVP.defer();

        if (!git.baseBranch) {
            return deferred.reject(new Error('No base branch is definded'));
        }

        git.exec('rev-parse', ['--abbrev-ref HEAD'])
            .then(function(currentBranch) {
                if (git.baseBranch === currentBranch) {
                    return deferred.resolve();
                }

                git.exec('checkout', [git.baseBranch])
                    .then(function() {
                        git.clean(tmpBranch);
                        deferred.resolve();
                    })
                    .catch(function() {
                        return deferred.reject(new Error('Can\'t checkout on the previous working branch'));
                    });
            })
            .catch(function() {
                return deferred.reject(new Error('Can\'t get the current branch'));
            });

        return deferred.promise;
    },
    checkForTag: function(version) {
        var deferred = RSVP.defer();

        // Check tag existance on upstream
        git.exec('ls-remote upstream | grep', ['tags/' + version])
            .then(function(branchInfo) {
                process.stdout.write('\n');
                inquirer.prompt([{
                    type: 'confirm',
                    name: 'overwriteTag',
                    message: 'The tag ' + version + ' already exist on upstream, overwrite it?',
                    default: false
                }], function(answers) {
                    if (!answers.overwriteTag) {
                        return deferred.reject(new Error('Process stopped if no tag created or updated'));
                    }

                    deferred.resolve();
                });
            })
            .catch(function(error) {
                // catch if no tags found
                return deferred.resolve();
            });

        return deferred.promise;
    }
};
