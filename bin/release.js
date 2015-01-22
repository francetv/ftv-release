#!/usr/bin/env node

var program = require('commander');

var pkg = require('../package.json'),
    release = require('../src/index.js');

program
    .version(pkg.version)
    .usage('[options]')
    .description('Automatic release tool')
    .option('-n, --dry-run', 'make a dry-run release process')
    .parse(process.argv);

release.release({
    dryRun: program.dryRun,
});
