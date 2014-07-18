var MPU =  require('./mpu');
var fs = require('fs');

var testFile = fs.createReadStream('./test/test.mbtiles');

var mpu = new MPU({
    creds:require('./test/test.creds'),
    objectName: '_pending/test/badad68cc541a9b339565c1eb74d28cf',
    stream:testFile,
    noDisk: true
});
