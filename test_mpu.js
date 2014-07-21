var fs = require('fs');
var stream = require('stream');
var AWS = require('aws-sdk');
var progress = require('progress-stream');
var mpuUploader = require('s3-upload-stream').Uploader;

var prog = progress({
        time: 100
    });

var st = fs.createReadStream('./test/test.mbtiles')
    .on('error', function(err) {
        upload.error(err, prog);
    });
    prog.setLength(fs.statSync('./test/test.mbtiles').size);

prog.on('progress', function(p){
    console.log('PROGRESS:', p)
});

var client = new AWS.S3({
    accessKeyId: process.env.AWS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
    // sessionToken: ,
    region: "us-east-1"
});

// Set up read for file and start the upload.
var mpu = new mpuUploader({
        s3Client: client
    }, {
        Bucket: 'mapbox-upload-testing',
        Key: '_pending/test/badad68cc541a9b339565c1eb74d28cf' // Amazon S3 object name
    },
    // Callback handler
    function(err, uploadStream) {
        if (err) console.log(err);

        uploadStream.on('uploaded', function (data) {
            console.log('done', data);
        });

        uploadStream.on('chunk', function (data) {
            console.log('chunky', data);
        });
    st.pipe(prog).pipe(uploadStream)
    });