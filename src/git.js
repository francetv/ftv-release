var RSVP = require('rsvp'),
    GitWrapper = require('git-wrapper');

var gitWrapper = new GitWrapper();

var tmpBranch = 'tmp/release';

module.exports = {
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
        var that = this;

        return this.exec('rev-parse', ['--abbrev-ref HEAD'])
            .then(function(branch) {
                that.baseBranch = branch.replace(/(\r\n|\n|\r)/gm, "");
            });
    },
    clean: function(branch) {
        this.exec('branch', ['-D', branch]);
    },
    restore: function() {
        var that = this;
        var deferred = RSVP.defer();

        if (!this.baseBranch) {
            return deferred.reject(new Error('No base branch is definded'));
        }

        this.exec('rev-parse', ['--abbrev-ref HEAD'])
            .then(function(currentBranch) {
                if (that.baseBranch === currentBranch) {
                    return deferred.resolve();
                }

                that.exec('checkout', [that.baseBranch])
                    .then(function() {
                        that.clean(tmpBranch);
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
    }
};
