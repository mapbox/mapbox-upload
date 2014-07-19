var request = require('request');
var FormData = require('form-data');
var crypto = require('crypto');
var util = require('util');
var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');
var progress = require('progress-stream');
var knox = require('knox');
var mpu = require('knox-mpu');
var stream = require('stream');

module.exports = upload;

// Returns a progress stream immediately
function upload(opts) {
    var prog = progress({
        time: 100
    });

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
    if (!opts.file)
        throw new Error('"file" option required');
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
        uri: util.format('%s/api/upload/%s?access_token=%s', opts.mapbox, opts.account, opts.accesstoken),
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
        st.on('length', prog.setLength);
    } else {
        if (!opts.file || typeof opts.file != 'string') return upload.error(new Error('"file" must be an string'), prog);
        var st = fs.createReadStream(opts.file)
            .on('error', function(err) {
                upload.error(err, prog);
            });
        prog.setLength(fs.statSync(opts.file).size);
    }

    var client = knox.createClient({
        // token: creds.sessionToken,
        key: creds.AWSAccessKeyId,
        secret: creds.secret,
        bucket: creds.bucket,
        style: 'path'
    });

    prog.on('progress', function(p){
        prog.emit('stats', p);
    });
    // Set up read for file and start the upload.
    var mpuUp = new mpu({
        client: client,
        objectName: creds.key, // Amazon S3 object name
        stream: st.pipe(prog),
        batchSize: 1,
        maxRetries: 2
    },
    // Callback handler
    function(err, body) {
        console.log('RESPONSE', body)
        // If successful, will return body, containing Location, Bucket, Key, ETag and size of the object
        /*
          {
              Location: 'http://Example-Bucket.s3.amazonaws.com/destination.txt',
              Bucket: 'Example-Bucket',
              Key: 'destination.txt',
              ETag: '"3858f62230ac3c915f300c664312c11f-9"',
              size: 7242880
          }
        */
    });
    mpuUp.on('initiated', function(id){
        console.log("upload ID", id);
    })
    mpuUp.on('uploading', function(id){
        console.log('begin uploading part', id);
    })
    mpuUp.on('uploaded', function(id){
            console.log('finish uploading', id);
    })
    mpuUp.on('error', function(err){
            console.log(err, err.message);
    })
    mpuUp.on('completed', function(info){
             console.log('finished Uploading!', info);
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
