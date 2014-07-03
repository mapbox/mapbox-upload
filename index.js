var request = require('request');
var crypto = require('crypto');
var util = require('util');
var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');
var progress = require('progress-stream');

module.exports = upload;

// Returns a progress stream immediately
function upload(opts) {
    var prog = progress({
        time: 100,
        length: fs.statSync(opts.file).size
    });

    try { opts = upload.opts(opts) }
    catch(err) { return upload.err(err, prog) }

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
        if (err) return upload.error(err, task, callback);
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

    var st = fs.createReadStream(opts.file)
        // data is piped through progress-stream first
        .pipe(prog)
        .on('error', function(err) {
            upload.error(err, prog);
        });
    prog
        .on('progress', function(p){
            prog.emit('stats', p);
        });

    // Set up read for file and start the upload.
    var req = request({
        method: 'POST',
        uri: 'http://' + creds.bucket + '.s3.amazonaws.com',
        path: '/'
        }
    );
    // send credentials
    var multipart = req.form();
    Object.keys(creds).forEach(function(c){
        if (c === 'filename' || c === 'bucket') return;
        multipart.append(c, creds[c]);
    });
    // pass file in as a readstream
    multipart.append('file', st);
    // request/form-data doesn't set content-length header to size of stream
    req.setHeader('content-length', fs.statSync(opts.file).size + multipart.getLengthSync());

    req.on('response', function(resp) {
        var data = '';
        var done = function(err) {
            if (err) {
                return upload.error(err, prog);
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
                return upload.error(new Error(message), prog);
            }
            if (callback) return callback && callback();
            upload.putmap(opts, creds, prog, callback);
        };
        resp.on('data', function(chunk) { chunk += data; });
        resp.on('close', done);
        resp.on('end', done);
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
                return upload.error(err, task, callback);
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
