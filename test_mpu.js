var knox = require('knox');
var mpu = require('knox-mpu');
var stream = require('stream');
var fs = require('fs');
var progress = require('progress-stream');

var prog = progress({
        time: 50
    });

var st = fs.createReadStream('./test/test.mbtiles')
    .on('error', function(err) {
        upload.error(err, prog);
    });
    prog.setLength(fs.statSync('./test/test.mbtiles').size);

prog.on('progress', function(p){
    console.log(p)
});

var client = knox.createClient({
    // token: creds.sessionToken,
    key: '***REMOVED***',
    secret: '***REMOVED***',
    bucket: 'mapbox-upload-testing',
    style: 'path'
});


// Set up read for file and start the upload.
var mpuUp = new mpu({
        client: client,
        objectName: '_pending/test/badad68cc541a9b339565c1eb74d28cf', // Amazon S3 object name
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