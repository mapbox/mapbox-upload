var test = require('tape');
var http = require('http');
var url = require('url');
var fs = require('fs');
var progress = require('progress-stream');
var request = require('request');
var AWS = require('aws-sdk');
var exec = require('child_process').exec;
var upload = require(__dirname + '/../index.js');
upload.MAPBOX = 'http://localhost:3000';

var server;

function opts(extend) {
    extend = extend || {};
    var options = {
        file: __dirname + '/test.mbtiles',
        account: 'test',
        accesstoken: 'validtoken',
        mapid: 'test.upload'
    };
    for (var key in extend) options[key] = extend[key];
    return options;
}

test('setup', function(t) {
    function error(res, statusCode, message) {
        res.writeHead(statusCode);
        res.end(JSON.stringify({message:message}));
    }

    var credsCache = {};

    server = http.createServer(function(req, res) {
        var uri = url.parse(req.url, true);
        if (uri.query.access_token !== 'validtoken') {
            if (req.method !== 'POST') {
                return error(res, 404, 'Not found');
            } else {
                return error(res, 401, 'Unauthorized');
            }
        }

        switch (uri.pathname) {
        case '/badjson/uploads/v1/test/credentials':
            res.writeHead(200);
            res.end('hello world');
            break;
        case '/nokey/uploads/v1/test/credentials':
            res.writeHead(200);
            res.end(JSON.stringify({bucket:'bar'}));
            break;
        case '/nobucket/uploads/v1/test/credentials':
            res.writeHead(200);
            res.end(JSON.stringify({key:'bar'}));
            break;
        // Force a cached response. In practice this should be extremely
        // difficult to reproduce because of the decache querystring.
        case '/cached/uploads/v1/test/credentials':
            upload.testcreds(function(err, data) {
                if (err) throw err;
                res.writeHead(200, { 'X-Cache': 'Hit from cloudfront' });
                res.end(JSON.stringify(data));
            });
            break;
        // Simulates cloudfront cache. If a request using an entirely identical
        // url is used will send identical response with cache hit header.
        case '/uploads/v1/test/credentials':
            if (credsCache[req.url]) {
                res.writeHead(200, { 'X-Cache': 'Hit from cloudfront' });
                res.end(JSON.stringify(credsCache[req.url]));
            } else {
                upload.testcreds(function(err, data) {
                    if (err) throw err;
                    credsCache[req.url] = data;
                    res.writeHead(200, { 'X-Cache': 'Miss from cloudfront' });
                    res.end(JSON.stringify(data));
                });
            }
            break;
        case '/uploads/v1/test':
            if (req.method !== 'POST') return error(res, 404, 'Not Found');
            if (!req.headers['content-type'] ||
                req.headers['content-type'] !== 'application/json')
                return error(res, 400, 'Invalid content-type header');

            var body = '';
            req.on('data', function(chunk) {
                body += chunk.toString();
            });

            req.on('end', function() {
                try {
                    body = JSON.parse(body);
                } catch (e) {
                    return error(res, 400, 'Invalid JSON in body');
                }

                var schema = ['url', 'tileset'];
                var optional = ['name'];
                for (var k in schema) if (!(schema[k] in body)) {
                    return error(res, 422, 'Missing property "' + schema[k] + '"');
                }
                for (var j in body) if (schema.concat(optional).indexOf(j) === -1) {
                    return error(res, 422, 'Invalid property "' + j + '"');
                }

                res.writeHead(201);
                res.end(JSON.stringify({
                    id: 'd51e4a022c4eda48ce6d1932fda36189',
                    progress: 0,
                    complete: false,
                    error: null,
                    created: '2014-11-27T18:47:30.065Z',
                    modified: '2014-11-27T18:47:30.065Z',
                    tileset: body.tileset,
                    owner: 'test'
                }));
            });
            break;
        case '/errorvalidjson/uploads/v1/test':
            if (req.method !== 'POST') return error(res, 404, 'Not found');
            error(res, 400, 'Bad Request');
            break;
        case '/errorinvalidjson/uploads/v1/test':
            if (req.method !== 'POST') return error(res, 404, 'Not found');
            res.writeHead(400);
            res.end('Bad Request');
            break;
        default:
            error(res, 404, 'Not found');
            break;
        }
    }).listen(3000);
    t.end()
});

test('upload.opts', function(t) {
    t.plan(6);
    t.throws(function() { upload.opts({}) }, /"file" or "stream" option required/);
    t.throws(function() { upload.opts({ file:'somepath' }) }, /"account" option required/);
    t.throws(function() { upload.opts({ file:'somepath', account:'test' }) }, /"accesstoken" option required/);
    t.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken' }) }, /"mapid" option required/);
    t.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'wrong.account' }) }, / Invalid mapid "wrong.account" for account "test"/);
    t.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'test.upload', name: '../../name.file' }) }, 'opts.name: invalid characters');
    t.doesNotThrow(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'test.upload' }) });
});

test('upload from file', function(t) {
    var prog = upload(opts());
    prog.on('error', function(err) {
        t.ifError(err);
    });
    prog.on('finished', function() {
        t.end();
    });
    prog.on('progress', function(p) {
        if (p.percentage === 100) {
            t.equal(100, p.percentage);
            t.equal(69632, p.length);
            t.equal(69632, p.transferred);
            t.equal(0, p.remaining);
            t.equal(0, p.eta);
        }
    })
});

test('upload from stream', function(t) {
    var options = opts();
    options.stream = fs.createReadStream(options.file)
    options.length = fs.statSync(options.file).size;
    options.file = null;
    var prog = upload(options);
    prog.on('error', function(err) {
        t.ifError(err);
    });
    prog.on('finished', function() {
        t.end();
    });
    prog.on('progress', function(p) {
        if (p.percentage === 100) {
            t.equal(100, p.percentage);
            t.equal(69632, p.length);
            t.equal(69632, p.transferred);
            t.equal(0, p.remaining);
            t.equal(0, p.eta);
        }
    })
});

test('upload.getcreds failed req', function(t) {
    upload.getcreds(opts({ mapbox: 'http://doesnotexist:9999' }), function cb(err) {
        t.ok(/getaddrinfo ENOTFOUND/.test(err.message));
        t.end();
    });
});

test('upload.getcreds failed status', function(t) {
    upload.getcreds(opts({ mapbox: 'http://example.com' }), function cb(err) {
        t.equal('Invalid JSON returned from Mapbox API: Unexpected token <', err.message);
        t.end();
    });
});

test('upload.getcreds failed badjson', function(t) {
    upload.getcreds(opts({ mapbox: 'http://localhost:3000/badjson' }), function cb(err) {
        t.equal('Invalid JSON returned from Mapbox API: Unexpected token h', err.message);
        t.end();
    });
});

test('upload.getcreds failed no key', function(t) {
    upload.getcreds(opts({ mapbox: 'http://localhost:3000/nokey' }), function cb(err) {
        t.equal('Invalid creds', err.message);
        t.end();
    });
});

test('upload.getcreds failed no bucket', function(t) {
    upload.getcreds(opts({ mapbox: 'http://localhost:3000/nobucket' }), function cb(err) {
        t.equal('Invalid creds', err.message);
        t.end();
    });
});

test('upload.getcreds failed cached response', function(t) {
    upload.getcreds(opts({ mapbox: 'http://localhost:3000/cached' }), function cb(err) {
        t.equal('Received cached credentials, retry upload', err.message);
        t.end();
    });
});

test('upload.getcreds good creds', function(t) {
    upload.getcreds(opts(), function cb(err, a) {
        t.ifError(err);
        t.equal(a.bucket, 'mapbox-upload-testing');
        t.equal(typeof a.bucket, 'string');
        t.equal(typeof a.key, 'string');
        t.equal(typeof a.accessKeyId, 'string');
        t.equal(typeof a.secretAccessKey, 'string');

        // Call getcreds again to ensure unique credentials on each call.
        upload.getcreds(opts(), function cb(err, b) {
            t.ifError(err);
            t.equal(b.bucket, 'mapbox-upload-testing');
            t.equal(typeof b.bucket, 'string');
            t.equal(typeof b.key, 'string');
            t.equal(typeof b.accessKeyId, 'string');
            t.equal(typeof b.secretAccessKey, 'string');
            t.ok(a.key !== b.key, 'unique creds.key between calls');
            t.end();
        });
    });
});

test('upload.getcreds bad creds', function(t) {
    upload.getcreds(opts({ accesstoken: 'invalid' }), function cb(err) {
        t.equal(404, err.code);
        t.equal('Not found', err.message);
        t.end();
    });
});

test('upload.putfile failed no key', function(t) {
    function cb(err) {
        t.equal('"key" required in creds', err.message);
        t.end();
    }
    var prog = progress();
    prog.once('error', cb);
    upload.putfile(opts(), {}, prog);
});

test('upload.putfile failed no bucket', function(t) {
    function cb(err) {
        t.equal('"bucket" required in creds', err.message);
        t.end();
    }
    var prog = progress();
    prog.once('error', cb);
    upload.putfile(opts(), { key: '_pending' }, prog, cb);
});

test('upload.putfile good creds (file) - file cannot be accessed by unauthenticated request', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        function check() {
            request.head({
                uri: 'http://mapbox-upload-testing.s3.amazonaws.com/' + creds.key
            }, function(err, res) {
                t.ifError(err);
                t.equal(res.statusCode, 403);
                prog.called = true;
                t.end();
            });
        }
        var prog = progress();
        prog.on('finished', check);
        upload.putfile(opts(), creds, prog);
    });
});

test('upload.putfile good creds (file) - file can be accessed by authorized request', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        function check() {
            var client = new AWS.S3({
                accessKeyId: creds.accessKeyId,
                secretAccessKey: creds.secretAccessKey,
                sessionToken: creds.sessionToken,
                region: 'us-east-1'
            });

            client.headObject({
                Bucket: creds.bucket,
                Key: creds.key
            }, function(err, data) {
                t.ifError(err);
                t.equal('69632', data.ContentLength);
                t.ok(+new Date(data.LastModified) > +new Date - 60e3);
                prog.called = true;
                t.end();
            });
        }
        var prog = progress();
        prog.on('finished', check);
        upload.putfile(opts(), creds, prog);
    });
});

test('upload.putfile good creds (file) - object has correct access ACL information', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        function check() {
            var client = new AWS.S3({
                accessKeyId: creds.accessKeyId,
                secretAccessKey: creds.secretAccessKey,
                sessionToken: creds.sessionToken,
                region: 'us-east-1'
            });

            client.getObjectAcl({
                Bucket: creds.bucket,
                Key: creds.key
            }, function(err, data) {
                t.ifError(err);
                var publicGrants = data.Grants.filter(function(grant) {
                    return (grant.Permission === 'READ' &&
                            grant.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers');
                });
                t.equal(publicGrants.length, 0);
                t.end();
            });
        }
        var prog = progress();
        prog.on('finished', check);
        upload.putfile(opts(), creds, prog);
    });
});

test('upload.createupload good creds', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        var url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
        upload.createupload(url, opts(), function cb(err, body) {
            t.ifError(err);
            t.deepEqual(body, {
                id: 'd51e4a022c4eda48ce6d1932fda36189',
                progress: 0,
                complete: false,
                error: null,
                created: '2014-11-27T18:47:30.065Z',
                modified: '2014-11-27T18:47:30.065Z',
                tileset: 'test.upload',
                owner: 'test'
            });
            t.end();
        });
    });
});

test('upload.createupload bad creds', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        var url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
        upload.createupload(url, opts({accesstoken:'invalid'}), function cb(err) {
            t.equal(401, err.code);
            t.equal('Unauthorized', err.message);
            t.end();
        });
    });
});

test('upload.createupload error - valid json', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        var url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
        upload.createupload(url, opts({mapbox: 'http://localhost:3000/errorvalidjson'}), function cb(err) {
            t.equal(400, err.code);
            t.equal('Bad Request', err.message);
            t.end();
        });
    });
});

test('upload.createupload error - bad json', function(t) {
    upload.testcreds(function(err, creds) {
        t.ifError(err);
        var url = 'http://' + creds.bucket + '.s3.amazonaws.com/' + creds.key;
        upload.createupload(url, opts({mapbox: 'http://localhost:3000/errorinvalidjson'}), function cb(err) {
            t.equal(err.message, 'Invalid JSON returned from Mapbox API: Unexpected token B');
            t.end();
        });
    });
});

test('cli', function(t) {
    var options = opts({mapbox: 'http://localhost:3000'});
    process.env.MapboxAPI = options.mapbox;
    process.env.MapboxAccessToken = options.accesstoken;
    exec([__dirname + '/../bin/upload.js', options.mapid, options.file].join(' '), {
        env: process.env,
        timeout: 2000
    }, function(err, stdout, stderr) {
        t.ifError(err);
        console.log(stdout);
        console.error(stderr);
        t.end();
    });
});

test('cli - patch should fail since user doesnt have patch flag', function(t) {
    var options = opts({mapbox: 'http://localhost:3000'});
    process.env.MapboxAPI = options.mapbox;
    process.env.MapboxAccessToken = options.accesstoken;
    exec([__dirname + '/../bin/upload.js', options.mapid, options.file, '--patch'].join(' '), {
        env: process.env,
        timeout: 2000
    }, function(err) {
        t.ok(/Error: Invalid property "patch"/.test(err.message));
        t.end();
    });
});

test('cli - empty name should fail', function(t) {
    var options = opts({mapbox: 'http://localhost:3000'});
    process.env.MapboxAPI = options.mapbox;
    process.env.MapboxAccessToken = options.accesstoken;
    exec([__dirname + '/../bin/upload.js', options.mapid, options.file, '--name'].join(' '), {
        env: process.env,
        timeout: 2000
    }, function(err, stdout) {
        t.ok(stdout.indexOf('please provide a name') !== -1);
        t.end();
    });
});

test('cli - invalid characters --name should fail', function(t) {
    var options = opts({mapbox: 'http://localhost:3000'});
    process.env.MapboxAccessToken = options.accesstoken;
    exec([__dirname + '/../bin/upload.js', options.mapid, options.file, '--name "../../file.geojson"'].join(' '), {
        env: process.env,
        timeout: 2000
    }, function(err, stdout, stderr) {
        t.ok(stderr.indexOf('contains invalid characters') !== -1, 'invalid characters');
        t.end();
    });
});

test('teardown', function(t) {
    server.close(t.end);
});
