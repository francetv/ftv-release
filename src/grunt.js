var RSVP = require('rsvp'),
    exec = require('child_process').exec,
    fs = require('fs');

var baseDir = process.cwd();
var gruntBinPath = baseDir + '/node_modules/grunt-cli/bin/';
var GruntFilePath = baseDir + '/Gruntfile.js';

module.exports = {
    exec: function(args) {
        var deferred = RSVP.defer();

        var command = 'grunt';
        command += (args && args.cmd) ? ' ' + args.cmd : '';

        exec(gruntBinPath + command, function(error, stdout, stderr) {
            if (error !== null || stderr !== '') {
                return deferred.reject(new Error(command + ' command failed'));
            }

            deferred.resolve();
        });

        return deferred.promise;
    },
    checkConfig: function() {
        var deferred = RSVP.defer();

        fs.exists(GruntFilePath, function(exists) {
            if (!exists) {
                return deferred.reject(new Error('No Gruntfile found'));
            }

            deferred.resolve();
        });

        return deferred.promise;
    }
};
