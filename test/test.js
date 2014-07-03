var http = require('http');
var assert = require('assert');
var progress = require('progress-stream');
var request = require('request');
var upload = require(__dirname + '/../index.js');
var creds = require('./test.creds.js');
upload.MAPBOX = 'http://localhost:3000';

function Server() {
    return http.createServer(function (req, res) {
        switch (req.url) {
        case '/badjson/api/upload/test?access_token=validtoken':
            res.writeHead(200);
            res.end("hello world");
            break;
        case '/nokey/api/upload/test?access_token=validtoken':
            res.writeHead(200);
            res.end(JSON.stringify({bucket:'bar'}));
            break;
        case '/nobucket/api/upload/test?access_token=validtoken':
            res.writeHead(200);
            res.end(JSON.stringify({key:'bar'}));
            break;
        case '/api/upload/test?access_token=validtoken':
            res.writeHead(200);
            res.end(JSON.stringify(creds));
            break;
        case '/api/Map/test.upload?access_token=validtoken':
            if (req.method === 'GET') {
                res.writeHead(404);
                res.end(JSON.stringify({message:'Not found'}));
            } else if (req.method === 'PUT') {
                res.writeHead(200);
                res.end(JSON.stringify({}));
            }
            break;
        default:
            res.writeHead(404);
            res.end(JSON.stringify({message:'Not found'}));
            break;
        }
    }).listen(3000);
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
        assert.throws(function() { upload.opts({}) }, /"file" option required/);
        assert.throws(function() { upload.opts({ file:'somepath' }) }, /"account" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test' }) }, /"accesstoken" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken' }) }, /"mapid" option required/);
        assert.throws(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'wrong.account' }) }, / Invalid mapid "wrong.account" for account "test"/);
        assert.doesNotThrow(function() { upload.opts({ file:'somepath', account:'test', accesstoken:'validtoken', mapid:'test.upload' }) });
    });
});

describe('upload', function() {
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
        prog.once('progress', function(p){
            assert.equal(100, p.percentage);
            assert.equal(69632, p.transferred);
            assert.equal(0, p.remaining);
            assert.equal(0, p.eta);
            done();
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
            assert.deepEqual(creds, c);
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
    it('good creds', function(done) {
        function cb(err) {
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
        upload.putfile(opts(), creds, prog, cb);
    });
});

describe('upload.putmap', function() {
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
        upload.putmap(opts(), {}, prog, cb);
    });
    it('failed no bucket', function(done) {
        function cb(err) {
            assert.equal('"bucket" required in creds', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('error', cb);
        upload.putmap(opts(), { key: '_pending' }, prog, cb);
    });
    it('good creds', function(done) {
        function cb(err, body) {
            assert.ifError(err);
            assert.deepEqual(body, {});
            done && done() || (done = false);
        };
        var prog = progress();
        prog.once('putmap', function(body) {
            assert.deepEqual(body, {});
            done && done() || (done = false);
        });
        upload.putmap(opts(), creds, prog, cb);
    });
    it('bad creds', function(done) {
        function cb(err) {
            assert.equal(404, err.code);
            assert.equal('Not found', err.message);
            done && done() || (done = false);
        };
        var prog = progress();
        prog.on('error', cb);
        upload.putmap(opts({accesstoken:'invalid'}), creds, prog, cb);
    });
});
