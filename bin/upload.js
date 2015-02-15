#!/usr/bin/env node

var upload = require('..');
var fs = require('fs');
var util = require('util');
var argv = require('minimist')(process.argv.slice(2));

if (process.env.MapboxAPI) upload.MAPBOX = process.env.MapboxAPI;

if (!process.env.MapboxAccessToken) {
    console.error('error: missing MapboxAccessToken in environment');
    console.error(fs.readFileSync(__dirname + '/../USAGE.txt', 'utf8'));
    process.exit(1);
}

if (argv._.length !== 2) {
    console.error('error: incorrect number of arguments');
    console.error(fs.readFileSync(__dirname + '/../USAGE.txt', 'utf8'));
    process.exit(1);
}

var filepath = argv._[1];
var dataset = argv._[0];
var parts = dataset.split('.');
var account = parts[0];

if (parts.length !== 2) {
    console.error('error: invalid dataset id');
    console.error(fs.readFileSync(__dirname + '/../USAGE.txt', 'utf8'));
    process.exit(1);
}

var options = {
    account: account,
    mapid: dataset,
    accesstoken: process.env.MapboxAccessToken,
    patch: argv.patch || undefined
};

if (filepath.indexOf('http') === 0) {
    upload.createupload(filepath, options, finish);
} else {
    options.stream = fs.createReadStream(filepath);
    options.length = fs.statSync(filepath).size;

    var progress = upload(options);

    progress.on('progress', function(progress) {
        util.print(util.format('\r\033[KUploaded %s%',
            Math.round(progress.percentage)
        ));
    });
    progress.on('error', function(err) {
        console.error('\nError: %s', err.message);
        process.exit(1);
    });
    progress.on('finished', function(body) {
        console.error('\nUpload complete');
        finish(null, body);
    });
}

function finish(err, body) {
    if (err) {
        console.error(err.message);
        process.exit(1);
    }
    var uri = util.format('%s/uploads/v1/%s/%s?access_token=%s', upload.MAPBOX, account, body.id, process.env.MapboxAccessToken);
    console.log('Upload is now processing. Check status at https://www.mapbox.com/data/.');
    console.log(uri);
    process.exit(0);
}
