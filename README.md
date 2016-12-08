[![travis](https://travis-ci.org/mapbox/mapbox-upload.svg?branch=master)](https://travis-ci.org/mapbox/mapbox-upload)

mapbox-upload
-------------
Library for interfacing with the Mapbox upload API.

## Authentication

A Mapbox API token is required for authentication. Generate a **secret** token
with the `uploads:write` scope enabled by following
[these steps](https://www.mapbox.com/help/create-api-access-token/).

## JavaScript Usage

```
$ npm install --save mapbox-upload
```

```javascript
var upload = require('mapbox-upload');

// creates a progress-stream object to track status of
// upload while upload continues in background
var progress = upload({
    file: __dirname + '/test.mbtiles', // Path to mbtiles file on disk.
    account: 'test', // Mapbox user account.
    accesstoken: 'validtoken', // A valid Mapbox API secret token with the uploads:write scope enabled.
    mapid: 'test.upload', // The identifier of the map to create or update.
    name: 'My upload' // Optional name to set, otherwise a default such as original.geojson will be used.
});

progress.on('error', function(err){
	if (err) throw err;
});

progress.on('progress', function(p){
	// Do something with progress-stream object, like display upload status
});

progress.once('finished', function(){
	// Upload has completed but is likely queued for processing and not yet available on Mapbox.
});

```

### Options

#### stream
A [`stream`](http://nodejs.org/api/stream.html) object can be passed in instead of `{file: filepath}`.
`length` option is recommended for accurate progress-stream reporting. If length is unknown, it can be updated after upload has begun by emitting a `length` event from the `stream` object.


## CLI Usage

Using the CLI will also require [generating a secret token](https://www.mapbox.com/help/create-api-access-token/) with the `uploads:write` scope enabled.

```
$ npm install --global mapbox-upload
$ export MapboxAccessToken=<access token with uploads:write scope enabled>
$ mapbox-upload username.dataid /path/to/file
```

CLI usage follows the following pattern:

```
mapbox-upload <dataset> [<filepath> | <url>]
```

- `dataset` refers to the id of the dataset or map being created or replaced.
- `file` or `url` refers to either:
  - a local file
  - a remote file on S3

**Creating** a new file might look like:

```
mapbox-upload <your-username>.create example.tif
```

**Updating** an existing file would look the same, except that you would pass
in an existing `id`.

## Tests

```
npm test
```

tests require env variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to generate test credentials
