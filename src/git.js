var RSVP = require('rsvp'),
    GitWrapper = require('git-wrapper');

var gitWrapper = new GitWrapper();

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
                that.baseBranch = branch;
            });
    },
    clean: function(branch) {
        return this.exec('branch', ['-D', branch]);
    },
    restore: function() {
        if (!this.baseBranch) {
            throw new Error('No base branch is definded');
        }

        return this.exec('checkout', [this.baseBranch]);
    }
};
