var RSVP = require('rsvp'),
    ProgressBar = require('progress'),
    Hipchatter = require('hipchatter'),
    inquirer = require("inquirer");

var git = require('./git'),
    grunt = require('./grunt'),
    config = require('../config.json'),
    bar = new ProgressBar(':bar', {
        total: 90
    });

var baseDir = process.cwd();
var tmpBranch = 'tmp/release';

var version;
var versions = {};

var projectName;

module.exports = {
    release: function release(params) {
        var dryRun = params.dryRun || false;

        RSVP.Promise.resolve()
            // Init git process (stock current branch etc.)
            .then(function() {
                return git.init();
            })
            // Check if package.json file exists
            .then(function() {
                var deferred = RSVP.defer();

                try {
                    var packageConf = require(baseDir + '/package.json');
                    projectName = packageConf.name;
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
            // Check if bower.json file exists
            .then(function() {
                var deferred = RSVP.defer();

                try {
                    var bowerConf = require(baseDir + '/bower.json');
                    versions.bower = bowerConf.version;
                    projectName = projectName || bowerConf.name;
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
            // Set the version to release (error if npm & bower versions are different)
            .then(function() {
                if (!Object.keys(versions).length) {
                    throw new Error('Stop release process without any bower.json or package.json file');
                }

                if (versions.npm && versions.bower && versions.npm != versions.bower) {
                    throw new Error('Stop release process, npm and bower version number are different');
                }

                version = versions.npm ? versions.npm : versions.bower;
            })
            // Confirm the version to release
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
            // Check for unstaged or changed files
            .then(function() {
                bar.tick(10);

                return git.exec('diff', ['--exit-code'])
                    .then(function() {
                        return git.exec('diff', ['--cached', '--exit-code']);
                    })
                    .catch(function(error) {
                        var stepError = new Error('GIT - Please, commit your changes or stash them first');
                        throw stepError;
                    });
            })
            // Fetch the upstream remote
            .then(function() {
                bar.tick(10);

                return git.exec('fetch', ['upstream'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - fetch upstream remotes failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Checkout the upstream/master
            .then(function() {
                bar.tick(10);

                return git.exec('checkout', ['upstream/master'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - checkout upstream/master failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Checkout a new branch from the upstream/master (called tmp/release)
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
            // Merge in no-fast-forward the stocked working branch
            .then(function() {
                bar.tick(10);

                return git.exec('merge', ['--no-ff', git.baseBranch, '-m', '"Release ' + version + '"'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - merge in no fast-forward mode failed (message: Release ' + version + ')');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Launch Grunt tasks (default & check-coverage)
            .then(function() {
                bar.tick(10);

                var deferred = RSVP.defer();

                grunt.checkConfig()
                    .then(function() {
                        grunt.exec()
                            .then(function() {
                                return grunt.exec({
                                        cmd: 'check-coverage'
                                    })
                                    .catch(function(error) {
                                        throw error;
                                    });
                            })
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
            // Add the new generated files
            .then(function() {
                bar.tick(10);

                return git.exec('add', ['.'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - add new generated files failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Amend those files to the merge commit
            .then(function() {
                bar.tick(10);

                return git.exec('commit', ['--amend', '--no-edit'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - amend new generated files failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Generate or overwrite the version tag
            .then(function() {
                bar.tick(10);

                if (dryRun) {
                    process.stdout.write('\nDRY RUN - generate tag ' + version);
                    return;
                }

                return git.checkForTag(version)
                    .then(function() {
                        return git.exec('tag', ['-f', version])
                            .catch(function(error) {
                                var stepError = new Error('GIT - tag generation failed');
                                stepError.parent = error;
                                throw stepError;
                            });
                    });
            })
            // Push the temporary branch to the upstream master
            .then(function() {
                bar.tick(10);

                if (dryRun) {
                    process.stdout.write('DRY RUN - push tmp/release to upstream:master');
                    return;
                }

                return git.exec('push', ['upstream', 'tmp/release:master'])
                    .catch(function(error) {
                        var stepError = new Error('GIT - push tmp/release to upstream:master failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            // Push the tag to the upstream remote
            .then(function() {
                bar.tick(10);

                if (dryRun) {
                    process.stdout.write('DRY RUN - push tag to upstream');
                    return;
                }

                return git.exec('push', ['upstream', version])
                    .catch(function(error) {
                        var stepError = new Error('GIT - push tag to upstream failed');
                        stepError.parent = error;
                        throw stepError;
                    });
            })
            .then(function() {
                bar.tick(10);

                var deferred = RSVP.defer();
                var hipchat = new Hipchatter(config.hipchatUserToken);
                var message = 'New version ' + version + ' released for ' + projectName;

                hipchat.notify(config.hipchatRoomId, {
                    message: message,
                    color: 'green',
                    token: config.hipchatUserToken,
                    notify: true
                }, function(err) {
                    if (err === null) {
                        process.stdout.write('\n\nSuccessfully notified the room for version ' + version + ' release\n');
                        deferred.resolve();
                    } else {
                        var stepError = new Error('HIPCHAT - notification failed');
                        stepError.parent = error;
                        throw stepError;
                    }
                });

                return deferred.promise;
            })
            // Catch all errors
            .catch(function(error) {
                process.stdout.write('\nERROR ' + error.message + ' ' + (error.parent ? "(" + error.parent.message + ")" : '') + '\n');
            })
            .then(function() {
                process.stdout.write('\nSuccessfully deploy ' + (dryRun ? '(in dry-run mode)' : '') + ' the release ' + version + '\n');
            })
            // Finally restore the working environment (checkout stocked working branch and delete temporary one)
            .finally(function() {
                git.restore()
                    .then(function() {
                        process.stdout.write('Successfully restore git previous work state\n');
                    })
                    .catch(function(error) {
                        process.stdout.write('\n\nERROR (during git restore) ' + error.message + '\n');
                    })
                    .finally(function() {
                        process.exit(1);
                    });
            });
    }
};
