var request = require('request');
var crypto = require('crypto');
var util = require('util');
var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');
var progress = require('progress-stream');
var mpuUploader = require('s3-upload-stream').Uploader;
var AWS = require('aws-sdk');
var stream = require('stream');

module.exports = upload;

// Returns a progress stream immediately
function upload(opts) {
    var prog = progress({ time: 100 });

    opts = upload.opts(opts);

    upload.getcreds(opts, function(err, c) {
        if (err) return prog.emit('error', err);
        var creds = c;
        upload.putfile(opts, creds, prog);
    });
    return prog;
}
upload.MAPBOX = 'https://api.tiles.mapbox.com';

upload.opts = function(opts) {
    opts = opts || {};
    opts.proxy = opts.proxy || process.env.HTTP_PROXY;
    opts.mapbox = opts.mapbox || upload.MAPBOX;
    if (!opts.file && !opts.stream)
        throw new Error('"file" or "stream" option required');
    if (!opts.account)
        throw new Error('"account" option required');
    if (!opts.accesstoken)
        throw new Error('"accesstoken" option required');
    if (!opts.mapid)
        throw new Error('"mapid" option required');
    if (opts.mapid.split('.')[0] !== opts.account)
        throw new Error(util.format('Invalid mapid "%s" for account "%s"', opts.mapid, opts.account));
    return opts;
};

upload.getcreds = function(opts, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return callback(err) }
    request.get({
        uri: util.format('%s/uploads/v1/%s/credentials?access_token=%s', opts.mapbox, opts.account, opts.accesstoken),
        headers: { 'Host': url.parse(opts.mapbox).host },
        proxy: opts.proxy
    }, function(err, resp, body) {
        if (err) return callback(err);
        try {
            body = JSON.parse(body);
        } catch(e) {
            var err = new Error('Invalid JSON returned from Mapbox API: ' + e.message);
            return callback(err);
        }
        if (resp.statusCode !== 200) {
            var err = new Error(body && body.message || 'Mapbox is not available: ' + resp.statusCode);
            err.code = resp.statusCode;
            return callback(err);
        }
        if (!body.key || !body.bucket) {
            return callback(new Error('Invalid creds'));
        } else {
            return callback(null, body);
        }
    });
};

upload.putfile = function(opts, creds, prog) {
    try { opts = upload.opts(opts) }
    catch(err) { return prog.emit('error', err) }

    if (!creds.key)
        return prog.emit('error', new Error('"key" required in creds'), prog);
    if (!creds.bucket)
        return prog.emit('error', new Error('"bucket" required in creds'), prog);

    if (opts.stream) {
        if (!opts.stream instanceof stream) return prog.emit('error', new Error('"stream" must be an stream object'), prog);
        var st = opts.stream;

        // if length isn't set progress-stream will not report progress
        if (opts.length) prog.setLength(opts.length)
        else st.on('length', prog.setLength);
    } else {
        if (!opts.file || typeof opts.file != 'string') return prog.emit('error', new Error('"file" must be an string'), prog);
        var st = fs.createReadStream(opts.file)
            .on('error', function(err) {
                prog.emit('error', err);
            });
        prog.setLength(fs.statSync(opts.file).size);
    }

    prog.on('progress', function(p){
        prog.emit('stats', p);
    });
    // Set up aws client
    var client = new AWS.S3({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        region: 'us-east-1'
    });
    // Set up read for file and start the upload.
    var mpu = new mpuUploader({
        s3Client: client
    }, {
        ACL: 'public-read',
        Bucket: creds.bucket,
        Key: creds.key
    }, function(err, uploadStream) {
        if (err) return prog.emit('error', err);

        uploadStream.on('error', function(e){
            e = new Error(e || 'Upload to Mapbox.com failed');
            return prog.emit('error', e, prog);
        });

        uploadStream.on('uploaded', function (data) {
            var url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
            upload.createupload(url, opts, function(err, body) {
                if (err) return prog.emit('error', err);
                prog.emit('finished', body);
            });
        });

        st.pipe(prog).pipe(uploadStream);
    });
};

upload.createupload = function(url, opts, callback) {
    try {
        opts = opts || {};
        opts.proxy = opts.proxy || process.env.HTTP_PROXY;
        opts.mapbox = opts.mapbox || upload.MAPBOX;
        if (!opts.account)
            throw new Error('"account" option required');
        if (!opts.accesstoken)
            throw new Error('"accesstoken" option required');
        if (!opts.mapid)
            throw new Error('"mapid" option required');
        if (opts.mapid.split('.')[0] !== opts.account)
            throw new Error(util.format('Invalid mapid "%s" for account "%s"', opts.mapid, opts.account));
    } catch(err) {
        return callback(err)
    }

    var uri = util.format('%s/uploads/v1/%s?access_token=%s', opts.mapbox, opts.account, opts.accesstoken);

    request.post({
        uri: uri,
        proxy: opts.proxy,
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            url: url,
            dataset: opts.mapid,
            patch: opts.patch
        })
    }, function(err, res, body) {
        if (err) return callback(err);
        try {
            body = JSON.parse(body);
        } catch(e) {
            var err = new Error('Invalid JSON returned from Mapbox API: ' + e.message);
            return callback(err);
        }
        if (res.statusCode !== 201) {
            var err = new Error(body && body.message || body);
            err.code = res.statusCode;
            return callback(err);
        }

        return callback(null, body);
    });
};

// Generate test-friendly upload credentials.
// Objects from the testing bucket are deleted via lifecycle rule daily.
upload.testcreds = function(callback) {
    var md5 = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
    var key = '_pending/test/' + md5;

    if (!process.env.AWS_ACCESS_KEY_ID)
        return callback(new Error('env var AWS_ACCESS_KEY_ID required'));
    if (!process.env.AWS_SECRET_ACCESS_KEY)
        return callback(new Error('env var AWS_SECRET_ACCESS_KEY required'));
    var sts = new AWS.STS({ region:'us-east-1' });

    callback(null, {
        bucket: 'mapbox-upload-testing',
        key: key,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    });
};
