var request = require('request');
var FormData = require('form-data');
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
    var prog;
    if (opts.prog && opts.prog instanceof stream.Duplex) prog = opts.prog;
    else prog = progress({ time: 100 });

    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, prog) }

    upload.getcreds(opts, prog, function(err, c){
        var creds = c;
        upload.putfile(opts, creds, prog);
    });
    return prog;
}
upload.MAPBOX = 'https://tiles.mapbox.com';

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

upload.error = function(err, prog) {
    return prog.emit('error', err);
};

upload.getcreds = function(opts, prog, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, prog) }
    request.get({
        uri: util.format('%s/v2/upload/%s?access_token=%s', opts.mapbox, opts.account, opts.accesstoken),
        headers: { 'Host': url.parse(opts.mapbox).host },
        proxy: opts.proxy
    }, function(err, resp, body) {
        if (err) return upload.error(err, prog);
        try {
            body = JSON.parse(body);
        } catch(err) {
            return upload.error(err, prog);
        }
        if (resp.statusCode !== 200) {
            var err = new Error(body && body.message || 'Mapbox is not available: ' + resp.statusCode);
            err.code = resp.statusCode;
            return upload.error(err, prog);
        }
        if (!body.key || !body.bucket) {
            return upload.error(new Error('Invalid creds'), prog);
        } else {
            return callback && callback(null, body);
        }
    });
};

upload.putfile = function(opts, creds, prog, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, prog) }

    if (!creds.key)
        return upload.error(new Error('"key" required in creds'), prog);
    if (!creds.bucket)
        return upload.error(new Error('"bucket" required in creds'), prog);

    if (opts.stream) {
        if (!opts.stream instanceof stream) return upload.error(new Error('"stream" must be an stream object'), prog);
        var st = opts.stream;

        // if length isn't set progress-stream will not report progress
        if (opts.length) prog.setLength(opts.length)
        else st.on('length', prog.setLength);
    } else {
        if (!opts.file || typeof opts.file != 'string') return upload.error(new Error('"file" must be an string'), prog);
        var st = fs.createReadStream(opts.file)
            .on('error', function(err) {
                upload.error(err, prog);
            });
        prog.setLength(fs.statSync(opts.file).size);
    }

    prog.on('progress', function(p){
        prog.emit('stats', p);
    });
    // Set up read for file and start the upload.
    var client = new AWS.S3({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        region: "us-east-1"
    });
    // Set up read for file and start the upload.
    var mpu = new mpuUploader({
        s3Client: client
    }, {
        ACL: 'public-read',
        Bucket: creds.bucket,
        Key: creds.key // Amazon S3 object name
    },
    // Callback handler
    function(err, uploadStream) {
        if (err) console.log(err);

        uploadStream.on('uploaded', function (data) {
            // console.log('done', data);
            upload.putmap(opts, creds, prog, callback);
        });

        uploadStream.on('chunk', function (data) {
            // console.log('chunky', data);
        });
        st.pipe(prog).pipe(uploadStream)
    });
};

upload.putmap = function(opts, creds, prog, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, prog) }

    if (!creds.key)
        return upload.error(new Error('"key" required in creds'), prog);
    if (!creds.bucket)
        return upload.error(new Error('"bucket" required in creds'), prog);

    var uri = util.format('%s/api/Map/%s?access_token=%s', opts.mapbox, opts.mapid, opts.accesstoken);
    request.get({ uri: uri, proxy: opts.proxy }, function(err, res, body) {
        if (err)
            return upload.error(err, prog);
        if (res.statusCode !== 404 && res.statusCode !== 200) {
            var err = new Error(body && body.message || 'Map PUT failed: ' + res.statusCode);
            err.code = res.statusCode;
            return upload.error(err, prog);
        }

        try {
            var data = res.statusCode === 404 ? {} : JSON.parse(body);
        } catch(err) { return upload.error(err, prog) }

        data.id = opts.mapid;
        data._type = 'tileset';
        data.status = 'pending';
        data.url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
        data.created = +new Date;

        request.put({
            url: uri,
            json: data,
            proxy: opts.proxy
        }, function(err, res, body) {
            if (err)
                return upload.error(err, prog);
            if (res.statusCode !== 200) {
                var err = new Error(body && body.message || 'Map PUT failed: ' + res.statusCode);
                err.code = res.statusCode;
                return upload.error(err, prog);
            }
            prog.emit('finished');
            return callback && callback(null, body);
        });
    });
};

// Generate test-friendly upload credentials.
// Objects from the testing bucket are deleted via lifecycle rule daily.
upload.testcreds = function(callback) {
    if (!process.env.AWS_ACCESS_KEY_ID)
        return callback(new Error('env var AWS_ACCESS_KEY_ID required'));
    if (!process.env.AWS_SECRET_ACCESS_KEY)
        return callback(new Error('env var AWS_SECRET_ACCESS_KEY required'));
    var sts = new AWS.STS({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region:'us-east-1'
    });
    var md5 = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
    var key = '_pending/test/' + md5;
    sts.getFederationToken({
        Name: 'mapbox-upload',
        Policy: JSON.stringify({
            Statement: [{
                Action: ['s3:PutObject','s3:PutObjectAcl'],
                Effect: 'Allow',
                Resource: ['arn:aws:s3:::mapbox-upload-testing/' + key]
            }]
        }),
        DurationSeconds: 3600
    }, function(err, data) {
        if (err) return callback(err);
        callback(null, {
            bucket: 'mapbox-upload-testing',
            key: key,
            accessKeyId: data.Credentials.AccessKeyId,
            secretAccessKey: data.Credentials.SecretAccessKey,
            sessionToken: data.Credentials.SessionToken
        });
    });
};

