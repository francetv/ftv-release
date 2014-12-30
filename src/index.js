var RSVP = require('rsvp'),
    ProgressBar = require('progress'),
    inquirer = require("inquirer");

var git = require('./git'),
    grunt = require('./grunt'),
    bar = new ProgressBar(':bar', {
        total: 90
    });

var baseDir = process.cwd();
var versions = {};
var version;
var tmpBranch = 'tmp/release';

module.exports = {
    release: function release() {
        RSVP.Promise.resolve()
            .then(function() {
                return git.init();
            })
            .then(function() {
                var deferred = RSVP.defer();

                try {
                    var packageConf = require(baseDir + '/package.json');
                    versions.npm = packageConf.version;
                    deferred.resolve();
                } catch (e) {
                    inquirer.prompt([{
                        type: 'confirm',
                        name: 'versionNPM',
                        message: 'No package.json file found, is that normal?',
                        default: false
                    }], function(answers) {
                        if (!answers.versionNPM) {
                            return deferred.reject(new Error('Stop release process without a package.json file'));
                        }

                        deferred.resolve();
                    });
                }

                return deferred.promise;
            })
            .then(function() {
                var deferred = RSVP.defer();

                try {
                    var bowerConf = require(baseDir + '/bower.json');
                    versions.bower = bowerConf.version;
                    deferred.resolve();
                } catch (e) {
                    inquirer.prompt([{
                        type: 'confirm',
                        name: 'versionBower',
                        message: 'No bower.json file found, is that normal?',
                        default: false
                    }], function(answers) {
                        if (!answers.versionBower) {
                            return deferred.reject(new Error('Stop release process without a bower.json file'));
                        }

                        deferred.resolve();
                    });
                }

                return deferred.promise;
            })
            .then(function() {
                if (!Object.keys(versions).length) {
                    throw new Error('Stop release process without any bower.json or package.json file');
                }

                if (versions.npm && versions.bower && versions.npm != versions.bower) {
                    throw new Error('Stop release process, npm and bower version number are different');
                }

                version = versions.npm ? versions.npm : versions.bower;
            })
            .then(function() {
                var deferred = RSVP.defer();

                inquirer.prompt([{
                    type: 'confirm',
                    name: 'sameVersions',
                    message: 'The current version defined is ' + version + ', is this what you want to release?',
                    default: false
                }], function(answers) {
                    if (!answers.sameVersions) {
                        return deferred.reject(new Error('Stop release process, version rejected'));
                    }

                    deferred.resolve();
                });

                return deferred.promise;
            })
            .then(function() {
                bar.tick(10);

                return git.exec('diff', ['--exit-code'])
                    .then(git.exec('diff', ['--cached', '--exit-code']))
                    .catch(function(error) {
                        var stepError = new Error('GIT - Please, commit your changes or stash them first');
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                return git.exec('fetch', ['--all'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - fetch all remotes failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                return git.exec('checkout', ['upstream/master'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - checkout upstream/master failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);
                git.clean(tmpBranch);

                return git.exec('checkout', ['-b', tmpBranch])
                    .catch(function(error) {
                        var stepError = new Error('GIT - checkout new temporary release branch failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                return git.exec('merge', ['--no-ff', git.baseBranch, '-m', '"Release ' + version + '"'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - merge in no fast-forward mode failed (message: Release ' + version + ')');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                var deferred = RSVP.defer();

                grunt.checkConfig()
                    .then(function() {
                        grunt.exec()
                            .then(grunt.exec.bind(grunt, {
                                cmd: 'check-coverage'
                            }))
                            .then(function() {
                                deferred.resolve();
                            })
                            .catch(function(error) {
                                var stepError = new Error('GRUNT - an error occured');
                                stepError.parent = error;
                                deferred.reject(stepError);
                            });
                    })
                    .catch(function() {
                        // bypass grunt step if no gruntfile
                        deferred.resolve();
                    });

                return deferred.promise;
            })
            .then(function() {
                bar.tick(10);

                return git.exec('tag', [version])
                    .catch(function(error) {
                        var stepError = new Error('GIT - tag generation failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                return git.exec('push', ['upstream', 'tmp/release:master'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - push tmp/release to upstream:master failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                return git.exec('push', ['upstream', version])
                    .catch(function(error) {
                        var stepError = new Error('GIT - push tag to upstream failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Catch all errors
            .catch(function(error) {
                process.stdout.write('\n\nERROR ' + error.message + ' ' + (error.parent ? "(" + error.parent.message + ")" : '') + '\n');
            })
            .finally(function() {
                git.restore()
                    .catch(function(error) {
                        process.stdout.write('\n\nERROR ' + error.message + '\n');
                    })
                    .finally(function() {
                        process.exit(1);
                    });
            });
    }
};


/* Steps
   - 1. checkout upstream/master
   - 2. checkout -b tmp/release
   - 3. merge --no-ff dev (msg: Release <pkg.version>)
   - 4. grunt
   - 5. grunt check-coverage
    6. ajout fichiers générés (pt soucis sur le premier car dans gitignore)
    7. amend
   - 8. tag <pkg.version>
   - 9. push upstream tmp/release:master
   - 10. push upstream tag
   - 11. br -D tmp/release

   TODO : add force on tags
*/
