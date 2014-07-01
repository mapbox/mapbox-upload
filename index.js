var request = require('request');
var events = require('events');
var crypto = require('crypto');
var util = require('util');
var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');
var progress = require('progress-stream');

module.exports = upload;

// Returns a task eventEmitter immediately.
function upload(opts, callback) {
    callback = callback || function(){};
    // if task is set to a readstream,
    // map doesn't make it to s3
    // var task = fs.createReadStream(opts.file);

    var task = new events.EventEmitter();

    try { opts = upload.opts(opts) }
    catch(err) { return callback(err) }
    callback(null, task);

    // fs.stat(opts.file, function(err, data){
    //     task.emit('length', data.size);
    //     task.length = data.size;
    // });

    upload.getcreds(opts, task);
    var creds;
    task.once('creds', function(c) {
        creds = c;
        upload.putfile(opts, creds, task);
    });
    task.once('putfile', function() {
        upload.putmap(opts, creds, task);
    });
    task.once('putmap', function() {
        task.emit('end');
    });
};
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

upload.error = function(err, task, callback) {
    task.emit('error', err);
    return callback && callback(err);
};

upload.getcreds = function(opts, task, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, task, callback) }

    request.get({
        uri: util.format('%s/api/upload/%s?access_token=%s', opts.mapbox, opts.account, opts.accesstoken),
        headers: { 'Host': url.parse(opts.mapbox).host },
        proxy: opts.proxy
    }, function(err, resp, body) {
        if (!err && resp.statusCode !== 200)
            err = new Error('MapBox is not available. Status ' + resp.statusCode);
        if (err) return upload.error(err, task, callback);
        try {
            var creds = JSON.parse(body);
            if (!creds.key || !creds.bucket) {
                return upload.error(new Error('Invalid creds'), task, callback);
            } else {
                task.emit('creds', creds);
                return callback && callback(null, creds);
            }
        } catch(err) { return upload.error(err, task, callback) }
    });
};

upload.putfile = function(opts, creds, task, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, task, callback) }

    if (!creds.key)
        return upload.error(new Error('"key" required in creds'), task, callback);
    if (!creds.bucket)
        return upload.error(new Error('"bucket" required in creds'), task, callback);

    fs.stat(opts.file, function(err, stat) {
        if (err) return upload.error(err, task, callback);

        var boundary = '----TileMill' + crypto.createHash('md5').update(+new Date + '').digest('hex').substring(0,6);
        var filename = path.basename(opts.file);
        var multipartBody = new Buffer(
            Object.keys(creds).reduce(function(memo, key) {
                if (key === 'bucket') return memo;
                if (key === 'filename') return memo;
                memo.push('--' + boundary + '\r\n'
                    + 'Content-Disposition: form-data; name="' + key + '"\r\n'
                    + '\r\n' + creds[key] + '\r\n');
                return memo;
            },[])
            .concat(['--' + boundary + '\r\n'
                + 'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n'
                + 'Content-Type: application/octet-stream\r\n\r\n'])
            .join('')
        );
        var terminate = new Buffer('\r\n--' + boundary + '--', 'ascii');
        var reqopts = {
            method: 'POST',
            headers: {
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'Content-Length': stat.size + multipartBody.length + terminate.length,
                'X_FILE_NAME': filename
            }
        };
        if (opts.proxy) {
            var parsed = url.parse(opts.proxy);
            reqopts.host = parsed.hostname;
            reqopts.port = parsed.port;
            reqopts.path = 'http://' + creds.bucket + '.s3.amazonaws.com';
            reqopts.headers.Host = creds.bucket + '.s3.amazonaws.com';
            if (parsed.auth) {
                opts.headers['proxy-authorization'] = 'Basic ' + new Buffer(parsed.auth).toString('base64')
            }
        } else {
            reqopts.host = creds.bucket + '.s3.amazonaws.com';
            reqopts.path = '/';
        }
        var req = http.request(reqopts);

        req.on('response', function(resp) {
            var data = '';
            var done = function(err) {
                if (err) {
                    return upload.error(err, task, callback);
                } else if ([200, 201, 204, 303].indexOf(resp.statusCode) === -1) {
                    var parsed = [
                        {key:'code', pattern:new RegExp('[^>]+(?=<\\/Code>)', 'g')},
                        {key:'message', pattern:new RegExp('[^>]+(?=<\\/Message>)', 'g')}
                    ].reduce(function(memo, pair) {
                        memo[pair.key] = data.match(pair.pattern) || [];
                        return memo;
                    }, {});
                    var message = 'Error: S3 upload failed. Status: ' + resp.statusCode;
                    if (parsed.code[0] && parsed.message[0])
                        message += ' (' + parsed.code[0] + ' - ' + parsed.message[0] + ')';
                    return upload.error(new Error(message), task, callback);
                }
                task.emit('putfile');
                return callback && callback();
            };
            resp.on('data', function(chunk) { chunk += data; });
            resp.on('close', done);
            resp.on('end', done);
        });

        // Write multipart values from memory.
        req.write(multipartBody, 'ascii');

        // Set up read for file and start the upload.
        var prog = progress({
            // objectMode: true,
            time: 300,
            length: stat.size
        });
        // task
        fs.createReadStream(opts.file)
            .on('data', function(chunk) {
               console.log(chunk.length)
            })
            .on('end', function() {
                req.write(terminate);
                req.end();
            })
            .on('error', function(err) {
                upload.error(err, task, callback);
            })
            .on('length', function(d){prog.setLength(d)})
            // data is piped through progress-stream first
            .pipe(prog).pipe(req, {end:false})

        // logs progress statistics to console
        prog.on('progress', function(p){
            console.log(p)
        });
    });
};

upload.putmap = function(opts, creds, task, callback) {
    try { opts = upload.opts(opts) }
    catch(err) { return upload.error(err, task, callback) }

    if (!creds.key)
        return upload.error(new Error('"key" required in creds'), task, callback);
    if (!creds.bucket)
        return upload.error(new Error('"bucket" required in creds'), task, callback);

    var uri = util.format('%s/api/Map/%s?access_token=%s', opts.mapbox, opts.mapid, opts.accesstoken);
    request.get({ uri: uri, proxy: opts.proxy }, function(err, res, body) {
        if (err)
            return upload.error(err, task, callback);
        if (res.statusCode !== 404 && res.statusCode !== 200)
            return upload.error(new Error('Map PUT failed: ' + res.statusCode), task, callback);

        try {
            var data = res.statusCode === 404 ? {} : JSON.parse(body);
        } catch(err) { return upload.error(err, task, callback) }

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
                return upload.error(err, task, callback);
            if (res.statusCode !== 200)
                return upload.error(new Error('Map PUT failed: ' + res.statusCode), task, callback);
            task.emit('putmap', body);
            return callback && callback(null, body);
        });
    });
};

