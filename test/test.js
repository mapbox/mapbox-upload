var http = require('http');
var fs = require('fs');
var assert = require('assert');
var progress = require('progress-stream');
var request = require('request');
var upload = require(__dirname + '/../index.js');
upload.MAPBOX = 'http://localhost:3000';

function Server() {
    return http.createServer(function(req, res) {
        switch (req.url) {
        case '/badjson/uploads/v1/test/credentials?access_token=validtoken':
            res.writeHead(200);
            res.end("hello world");
            break;
        case '/nokey/uploads/v1/test/credentials?access_token=validtoken':
            res.writeHead(200);
            res.end(JSON.stringify({bucket:'bar'}));
            break;
        case '/nobucket/uploads/v1/test/credentials?access_token=validtoken':
            res.writeHead(200);
            res.end(JSON.stringify({key:'bar'}));
            break;
        case '/uploads/v1/test/credentials?access_token=validtoken':
            upload.testcreds(function(err, data) {
                if (err) throw err;
                res.writeHead(200);
                res.end(JSON.stringify(data));
            });
            break;
        case '/uploads/v1/test?access_token=validtoken':
            if (req.method !== 'POST') return notFound(res);
            if (!req.headers['content-type'] ||
                req.headers['content-type'] !== 'application/json')
                return badRequest(res, 'Invalid content-type header');

            var body = '';
            req.on('data', function(chunk) {
                body += chunk.toString();
            });

            req.on('end', function() {
                var json;
                try {
                    json = JSON.parse(body);
                } catch (e) {
                    return badRequest(res, 'Invalid JSON in body');
                }

                if (!json.data || !json.url) return badRequest(res, 'Missing attributes in body');

                res.writeHead(201);
                res.end(JSON.stringify({
                    id: 'd51e4a022c4eda48ce6d1932fda36189',
                    progress: 0,
                    complete: false,
                    error: null,
                    created: 1417114050065,
                    modified: 1417114050065,
                    data: json.data,
                    owner: 'test'
                }));
            });
            break;
        case '/uploads/v1/test?access_token=invalid':
            if (req.method !== 'POST') return notFound(res);
            res.writeHead(401);
            res.end(JSON.stringify({
                message: 'Unauthorized'
            }));
            break;
        case '/errorvalidjson/uploads/v1/test?access_token=validtoken':
            if (req.method !== 'POST') return notFound(res);
            res.writeHead(400);
            res.end(JSON.stringify({message:'Bad Request'}));
            break;
        case '/errorinvalidjson/uploads/v1/test?access_token=validtoken':
            if (req.method !== 'POST') return notFound(res);
            res.writeHead(400);
            res.end('Bad Request');
            break;
        default:
            res.writeHead(404);
            res.end(JSON.stringify({message:'Not found'}));
            break;
        }
    }).listen(3000);

    function notFound(res) {
        res.writeHead(404);
        res.end(JSON.stringify({message:'Not found'}));
    }

    function badRequest(res, message) {
        res.writeHead(400);
        res.end(JSON.stringify({message:message}));
    }
};

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
};

describe('options', function() {
    it('upload.opts', function() {
        assert.throws(function() { upload.opts({}) }, /"file" or "stream" option required/);
        assert.throws(function() { upload.opts({ file:'somepath' }) }, /"account" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test' }) }, /"accesstoken" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken' }) }, /"mapid" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'wrong.account' }) }, / Invalid mapid "wrong.account" for account "test"/);
        assert.doesNotThrow(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'test.upload' }) });
    });
});

describe('upload from file', function() {
    var server;
    before(function(done) {
        server = Server();
        done();
    });
    after(function(done) {
        server.close(done);
    });
    it('progress reporting', function(done) {
        var prog = upload(opts());
        this.timeout(0);
        prog.on('error', function(err){
            assert.ifError(err);
        })
        prog.on('finished', function(){
            done();
        })
        prog.on('progress', function(p){
            if (p.percentage === 100) {
                assert.equal(100, p.percentage);
                assert.equal(69632, p.length);
                assert.equal(69632, p.transferred);
                assert.equal(0, p.remaining);
                assert.equal(0, p.eta);
            }
        })
    });
});

describe('upload from stream', function() {
    var server;
    before(function(done) {
        server = Server();
        done();
    });
    after(function(done) {
        server.close(done);
    });
    it('progress reporting', function(done) {
        var options = opts();
        options.stream = fs.createReadStream(options.file)
        options.length = fs.statSync(options.file).size;
        options.file = null;
        var prog = upload(options);
        this.timeout(0);
        prog.on('error', function(err){
            assert.ifError(err);
        })
        prog.on('finished', function(){
            done();
        })
        prog.on('progress', function(p){
            if (p.percentage === 100) {
                assert.equal(100, p.percentage);
                assert.equal(69632, p.length);
                assert.equal(69632, p.transferred);
                assert.equal(0, p.remaining);
                assert.equal(0, p.eta);
            }
        })
    });
});

describe('upload.getcreds', function() {
    var server;
    before(function(done) {
        server = Server();
        done();
    });
    after(function(done) {
        server.close(done);
    });
    it('failed req', function(done) {
        function cb(err, creds) {
            assert.equal('getaddrinfo ENOTFOUND', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.on('error', cb);
        upload.getcreds(opts({ mapbox: 'http://doesnotexist:9999' }), prog, cb);
    });
    it('failed status', function(done) {
        function cb(err, creds) {
            assert.equal('Unexpected token <', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.getcreds(opts({ mapbox: 'http://example.com' }), prog, cb);
    });
    it('failed badjson', function(done) {
        function cb(err, creds) {
            assert.equal('Unexpected token h', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.getcreds(opts({ mapbox: 'http://localhost:3000/badjson' }), prog, cb);
    });
    it('failed no key', function(done) {
        function cb(err, creds) {
            assert.equal('Invalid creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.getcreds(opts({ mapbox: 'http://localhost:3000/nokey' }), prog, cb);
    });
    it('failed no bucket', function(done) {
        function cb(err, creds) {
            assert.equal('Invalid creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.getcreds(opts({ mapbox: 'http://localhost:3000/nobucket' }), prog, cb);
    });
    it('good creds', function(done) {
        var prog = progress();
        function cb(err, c){
            assert.ifError(err);
            assert.equal(c.bucket, 'mapbox-upload-testing');
            var keys = Object.keys(c);
            assert.ok(keys.indexOf('bucket') > -1);
            assert.ok(keys.indexOf('key') > -1);
            assert.ok(keys.indexOf('accessKeyId') > -1);
            assert.ok(keys.indexOf('secretAccessKey') > -1);
            done && done() || (done = false);
        };
        upload.getcreds(opts(), prog, cb);
    });
    it('bad creds', function(done) {
        function cb(err) {
            assert.equal(404, err.code);
            assert.equal('Not found', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.getcreds(opts({ accesstoken: 'invalid' }), prog, cb);
    });
});

describe('upload.putfile', function() {
    var server;
    before(function(done) {
        server = Server();
        done();
    });
    after(function(done) {
        server.close(done);
    });
    it('failed no key', function(done) {
        function cb(err) {
            assert.equal('"key" required in creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.putfile(opts(), {}, prog, cb);
    });
    it('failed no bucket', function(done) {
        function cb(err) {
            assert.equal('"bucket" required in creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.putfile(opts(), { key: '_pending' }, prog, cb);
    });
    it('good creds (file)', function(done) {
        this.timeout(0);
        upload.testcreds(function(err, creds) {
            assert.ifError(err);
            function check(err) {
                assert.ifError(err);
                request.head({
                    uri: 'http://mapbox-upload-testing.s3.amazonaws.com/' + creds.key
                }, function(err, res, body) {
                    assert.ifError(err);
                    assert.equal(200, res.statusCode);
                    assert.equal(69632, res.headers['content-length']);
                    assert.ok(+new Date(res.headers['last-modified']) > +new Date - 60e3);
                    prog.called = true;
                    done && done() || (done = false);
                });
            };
            var prog = progress();
            upload.putfile(opts(), creds, prog, check);
        });
    });
});

describe('upload.createUpload', function() {
    var server;
    before(function(done) {
        server = Server();
        done();
    });
    after(function(done) {
        server.close(done);
    });
    it('failed no key', function(done) {
        function cb(err) {
            assert.equal('"key" required in creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.createUpload(opts(), {}, prog, cb);
    });
    it('failed no bucket', function(done) {
        function cb(err) {
            assert.equal('"bucket" required in creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.createUpload(opts(), { key: '_pending' }, prog, cb);
    });
    it('good creds', function(done) {
        upload.testcreds(function(err, params) {
            assert.ifError(err);
            function cb(err, body) {
                assert.ifError(err);
                assert.deepEqual(body, {
                    id: 'd51e4a022c4eda48ce6d1932fda36189',
                    progress: 0,
                    complete: false,
                    error: null,
                    created: 1417114050065,
                    modified: 1417114050065,
                    data: 'test.upload',
                    owner: 'test'
                });
                done && done() || (done = false);
            };
            var prog = progress();
            prog.once('finished', function(body) {
                assert.deepEqual(body, {
                    id: 'd51e4a022c4eda48ce6d1932fda36189',
                    progress: 0,
                    complete: false,
                    error: null,
                    created: 1417114050065,
                    modified: 1417114050065,
                    data: 'test.upload',
                    owner: 'test'
                });
                done && done() || (done = false);
            });
            upload.createUpload(opts(), params, prog, cb);
        });
    });
    it('bad creds', function(done) {
        upload.testcreds(function(err, params) {
            assert.ifError(err);
            function cb(err) {
                assert.equal(401, err.code);
                assert.equal('Unauthorized', err.message);
                done && done() || (done = false);
            };
            var prog = progress();
            prog.on('error', cb);
            upload.createUpload(opts({accesstoken:'invalid'}), params, prog, cb);
        });
    });
    it('error - valid json', function(done) {
        upload.testcreds(function(err, params) {
            assert.ifError(err);
            function cb(err) {
                assert.equal(400, err.code);
                assert.equal('Bad Request', err.message);
                done && done() || (done = false);
            };
            var prog = progress();
            prog.on('error', cb);
            upload.createUpload(opts({mapbox: 'http://localhost:3000/errorvalidjson'}), params, prog, cb);
        });
    });
    it('error - bad json', function(done) {
        upload.testcreds(function(err, params) {
            assert.ifError(err);
            function cb(err) {
                assert.equal(400, err.code);
                assert.equal('Bad Request', err.message);
                done && done() || (done = false);
            };
            var prog = progress();
            prog.on('error', cb);
            upload.createUpload(opts({mapbox: 'http://localhost:3000/errorinvalidjson'}), params, prog, cb);
        });
    });
});
